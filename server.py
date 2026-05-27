import sqlite3
import random
import smtplib
import json
import base64
import hashlib
import shutil
import os
import csv
import io
import re
import openpyxl
import requests
from werkzeug.utils import secure_filename
from datetime import datetime, timedelta
from email.mime.text import MIMEText
from functools import wraps
from flask import Flask, request, jsonify, send_from_directory, session, redirect, render_template_string, url_for
from werkzeug.security import generate_password_hash, check_password_hash
from werkzeug.middleware.proxy_fix import ProxyFix
from flask_login import current_user
from dotenv import load_dotenv
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

load_dotenv()

app = Flask(__name__, static_folder='.', static_url_path='')

# Учим Flask доверять заголовкам прокси-серверов (Cloudflare, Nginx)
# Цифра 1 означает, что мы доверяем одному слою прокси перед нами
app.wsgi_app = ProxyFix(
    app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1
)

# === НАСТРОЙКИ БЕЗОПАСНОСТИ FLASK ===

# 1. Ограничение размера загружаемого файла (например, 10 Мегабайт)
# Защитит сервер от зависания при загрузке огромных файлов
app.config['MAX_CONTENT_LENGTH'] = 10 * 1024 * 1024

# 2. Безопасность сессионных Cookie
app.config['SESSION_COOKIE_HTTPONLY'] = True # Запрещает JavaScript читать куки (защита от XSS)
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax' # Защита от CSRF-атак (межсайтовой подделки запросов)
app.config['SESSION_COOKIE_SECURE'] = True

# Инициализация защиты от спама (Limiter)
limiter = Limiter(
    get_remote_address,
    app=app,
    default_limits=["500 per day", "100 per hour"], # Базовый лимит для всех страниц (чтобы не парсили сайт)
    storage_uri="memory://" # Храним счетчики в оперативной памяти
)

# ЗАГОЛОВКИ БЕЗОПАСНОСТИ
@app.after_request
def add_security_headers(response):
    # Защита от Clickjacking: разрешает встраивать сайт в iframe только на том же домене
    response.headers['X-Frame-Options'] = 'SAMEORIGIN'

    # Запрещает браузеру "угадывать" тип файла (защита от подмены скриптов под видом картинок)
    response.headers['X-Content-Type-Options'] = 'nosniff'

    # Базовая защита от XSS на уровне браузера
    response.headers['X-XSS-Protection'] = '1; mode=block'

    # Строгая политика Referrer (чтобы не передавать чужим сайтам полные URL твоей админки)
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'

    return response

# === СЛОВАРЬ ДЛЯ ИСПРАВЛЕНИЯ РАСКЛАДКИ (QWERTY -> ЙЦУКЕН) ===
ENG_TO_RUS_MAP = {
    "q":"й", "w":"ц", "e":"у", "r":"к", "t":"е", "y":"н", "u":"г", "i":"ш", "o":"щ", "p":"з", "[":"х", "]":"ъ",
    "a":"ф", "s":"ы", "d":"в", "f":"а", "g":"п", "h":"р", "j":"о", "k":"л", "l":"д", ";":"ж", "'":"э",
    "z":"я", "x":"ч", "c":"с", "v":"м", "b":"и", "n":"т", "m":"ь", ",":"б", ".":"ю", "/":".", "`": "ё",
    "Q":"Й", "W":"Ц", "E":"У", "R":"К", "T":"Е", "Y":"Н", "U":"Г", "I":"Ш", "O":"Щ", "P":"З", "{":"Х", "}":"Ъ",
    "A":"Ф", "S":"Ы", "D":"В", "F":"А", "G":"П", "H":"Р", "J":"О", "K":"Л", "L":"Д", ":":"Ж", '"':"Э",
    "Z":"Я", "X":"Ч", "C":"С", "V":"М", "B":"И", "N":"Т", "M":"Ь", "<":"Б", ">":"Ю", "?":",", "~":"Ё",
    "@": "\"" # Иногда бывает полезно
}

# Словарь для расшифровки кодов оплаты
PAYMENT_MAP = {
    'cod': 'Наложенный платеж (Післяплата)',
    'card_online': 'Картой на сайте (LiqPay/WayForPay)',
    'seller_privat': 'На карту ФОП/Приват',
    'seller_cashless': 'Безналичный расчет (Счет)'
}

# Словарь для расшифровки доставки
DELIVERY_MAP = {
    'np': 'Новая Почта',
    'up': 'Укрпочта Стандарт',
    'upe': 'Укрпочта Экспресс',
    'meest': 'Meest Почта',
    'self': 'Самовывоз'
}


# Новый маппинг этапов заказа согласно списку CRM
CRM_STAGE_MAP = {
    1: {"ru": "Необработанные", "ua": "Необроблені"},
    2: {"ru": "Принятие решения", "ua": "Прийняття рішення"},
    3: {"ru": "Первый контакт", "ua": "Перший контакт"},
    4: {"ru": "Переговоры", "ua": "Переговори"},
    5: {"ru": "Договор", "ua": "Договір"},
    6: {"ru": "Выполнение", "ua": "Виконання"},
    8: {"ru": "Оплачено", "ua": "Оплачено"},
    7: {"ru": "Отменен", "ua": "Скасовано"},
    99: {"ru": "Планируется повторный звонок", "ua": "Планується повторний дзвінок"}
}

def fix_layout(text):
    """Меняет английские буквы на русские/украинские по раскладке"""
    return "".join([ENG_TO_RUS_MAP.get(char, char) for char in text])

# ==================================================
# НАСТРОЙКИ ПОЧТЫ И СЕКРЕТЫ
# ==================================================
SMTP_SERVER = os.getenv("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", 587))
EMAIL_SENDER = os.getenv("EMAIL_SENDER", "")
EMAIL_PASSWORD = os.getenv("EMAIL_PASSWORD", "")
# ==================================================

DB_NAME = "radiobox.db"
# Берем ключ из .env, а если его там нет — генерируем случайный (для безопасности)
app.secret_key = os.getenv("SECRET_KEY", os.urandom(24))

def cleanup_deleted_products():
    """Удаляет товары из корзины старше 30 дней"""
    try:
        with sqlite3.connect(DB_NAME) as conn:
            month_ago = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d %H:%M:%S")
            conn.execute("DELETE FROM products WHERE deleted_at IS NOT NULL AND deleted_at < ?", (month_ago,))
            conn.commit()
    except: pass

def init_db():
    make_daily_backup()

    with sqlite3.connect(DB_NAME) as conn:
        cursor = conn.cursor()

        cursor.execute('''
                    CREATE TABLE IF NOT EXISTS users (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        name TEXT NOT NULL,
                        surname TEXT NOT NULL,
                        email TEXT UNIQUE NOT NULL,
                        phone TEXT,
                        password TEXT NOT NULL,
                        role TEXT DEFAULT 'client'  -- 'client', 'manager', 'superadmin'
                    )
                ''')

        # Создаем таблицу КАТЕГОРИЙ (если её нет)
        cursor.execute('''
                    CREATE TABLE IF NOT EXISTS categories (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        slug TEXT UNIQUE,
                        parent_slug TEXT,
                        title_ru TEXT,
                        title_ua TEXT,
                        position INTEGER DEFAULT 0
                    )
                ''')

        # 2. Заказы
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_name TEXT, user_surname TEXT, user_phone TEXT, user_email TEXT,
                delivery_method TEXT, delivery_address TEXT,
                payment_method TEXT, payment_status TEXT DEFAULT 'unpaid', 
                comment TEXT, total_price REAL, status TEXT DEFAULT 'Новый',
                items_json TEXT, created_at TEXT, ttn TEXT
            )
        ''')

        # 4. Товары
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS products (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sku TEXT, title_ru TEXT, title_ua TEXT, price REAL,
                in_stock INTEGER DEFAULT 1, qty_stock INTEGER DEFAULT 0,
                category TEXT, subcategory TEXT, images_json TEXT,
                on_index INTEGER DEFAULT 0, is_visible INTEGER DEFAULT 1,
                created_at TEXT
            )
        ''')

        # 5. ОТЗЫВЫ (Вернул на место)
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS reviews (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id INTEGER, 
                author TEXT,
                rating INTEGER,
                comment TEXT,
                date TEXT,
                reply TEXT, 
                is_visible INTEGER DEFAULT 1,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            )
        ''')

        # 6. БАННЕРЫ (Добавляем новую таблицу)
        cursor.execute('''
                    CREATE TABLE IF NOT EXISTS banners (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        filename TEXT NOT NULL,
                        file_type TEXT DEFAULT 'image', -- 'image' или 'video'
                        position INTEGER DEFAULT 0,
                        is_visible INTEGER DEFAULT 1,
                        created_at TEXT
                    )
                ''')

        # 7. НАСТРОЙКИ (Ключ-Значение)
        cursor.execute('''
                    CREATE TABLE IF NOT EXISTS settings (
                        key TEXT PRIMARY KEY,
                        value TEXT
                    )
                ''')

        cursor.execute('''
            CREATE TABLE IF NOT EXISTS order_logs (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                order_id INTEGER,
                message_ru TEXT,
                message_ua TEXT,
                created_at TEXT
            )
        ''')

        # Заполним дефолтными, если пусто
        default_settings = {
            'site_url': 'https://radiobox.in.ua',
            'google_verification': '',
            'robots_txt': 'User-agent: *\nDisallow: /admin\nDisallow: /superadmin\nDisallow: /cart\nDisallow: /api\nDisallow: *?search=\nAllow: /',
            'crm_api_key': '',
            'nova_poshta_api_key': 'ВАШ_ТЕКУЩИЙ_КЛЮЧ_ИЗ_КОДА',  # Перенесите сюда ключ из кода
            'privatbank_merchant_id': '',
            'privatbank_password': '',
            'iban_details': 'UA000000000000000000000000000',
            'mfo_details': '300001',
            'edrpou_details': '12345678',
            'beneficiary_details': 'ФОП Олещенко Микита'
        }

        for k, v in default_settings.items():
            cursor.execute("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)", (k, v))

        # === ВАЖНЫЕ МИГРАЦИИ ===
        # Этот блок спасет твою админку. Он добавляет колонки в старую таблицу orders.
        columns_to_add = [
            ("orders", "ttn", "TEXT DEFAULT ''"),
            ("orders", "comment", "TEXT DEFAULT ''"),
            ("orders", "delivery_address", "TEXT DEFAULT ''"),
            ("orders", "delivery_method", "TEXT DEFAULT ''"),
            ("orders", "payment_method", "TEXT DEFAULT ''"),
            ("orders", "payment_status", "TEXT DEFAULT 'unpaid'"),
            ("orders", "crm_id", "INTEGER DEFAULT 1"),
            ("orders", "status_ua", "TEXT DEFAULT ''")
        ]

        # === МИГРАЦИЯ ДЛЯ ТОВАРОВ (добавляем новые поля) ===
        product_cols = [
            ("products", "description_ru", "TEXT DEFAULT ''"),
            ("products", "description_ua", "TEXT DEFAULT ''"),
            ("products", "position", "INTEGER DEFAULT 0"),
            ("products", "deleted_at", "TEXT"),
            ("products", "created_at", "TEXT DEFAULT CURRENT_TIMESTAMP"),
            ("products", "on_index", "INTEGER DEFAULT 0"),
            ("products", "seo_title", "TEXT DEFAULT ''"),
            ("products", "seo_description", "TEXT DEFAULT ''")
        ]

        new_columns = [
            ("products", "position", "INTEGER DEFAULT 0"),
            ("products", "subcategory", "TEXT DEFAULT ''"),
            ("products", "seo_title", "TEXT DEFAULT ''"),
            ("products", "seo_description", "TEXT DEFAULT ''"),
            ("products", "seo_title_ua", "TEXT DEFAULT ''"),
            ("products", "seo_description_ua", "TEXT DEFAULT ''"),
            ("products", "unit_type", "TEXT DEFAULT 'pcs'"),
            ("products", "on_index", "INTEGER DEFAULT 0"),
            ("products", "is_visible", "INTEGER DEFAULT 1"),
            ("products", "deleted_at", "TEXT"),
            ("products", "quantity", "INTEGER DEFAULT 0"),
            # Добавьте сюда другие, если вдруг чего-то не хватает
        ]

        for table, col, dtype in new_columns:
            try:
                cursor.execute(f"ALTER TABLE {table} ADD COLUMN {col} {dtype}")
            except:
                pass

        for table, col, dtype in product_cols:
            try:
                cursor.execute(f"ALTER TABLE {table} ADD COLUMN {col} {dtype}")
            except sqlite3.OperationalError:
                # Ошибка возникает, если колонка уже есть. Это нормально, просто пропускаем.
                pass

            # === ДОБАВИТЬ ВОТ ЭТО (ЛЕЧЕНИЕ NULL) ===
        try:
            cursor.execute("UPDATE products SET on_index = 0 WHERE on_index IS NULL")
            conn.commit()
        except:
            pass

        cleanup_deleted_products()  # Запуск очистки при старте

        # --- Вставь это в init_db() или в начало запуска ---
        # Проверяем, есть ли колонка css_style в таблице banners
        with sqlite3.connect(DB_NAME) as conn:
            cursor = conn.cursor()
            try:
                cursor.execute("ALTER TABLE banners ADD COLUMN css_style TEXT DEFAULT ''")
                print("✅ Added css_style column to banners")
            except sqlite3.OperationalError:
                pass  # Колонка уже есть

            try:
                cursor.execute("ALTER TABLE banners ADD COLUMN target_lang TEXT DEFAULT 'all'")
                print("✅ Added target_lang column to banners")
            except sqlite3.OperationalError:
                pass  # Колонка уже есть

        for table, col, dtype in columns_to_add:
            try:
                cursor.execute(f"ALTER TABLE {table} ADD COLUMN {col} {dtype}")
                print(f"[Migration] Добавлена колонка {col} в таблицу {table}")
            except sqlite3.OperationalError:
                pass # Колонка уже есть, идем дальше

        # Создаем дефолтного админа, если нет
        cursor.execute("SELECT count(*) FROM admins")
        if cursor.fetchone()[0] == 0:
            pw_hash = generate_password_hash("admin123")
            cursor.execute("INSERT INTO admins (login, password) VALUES (?, ?)", ("admin", pw_hash))
            print("[Init] Создан админ по умолчанию: admin / admin123")

        # === МАССОВОЕ ОБНОВЛЕНИЕ СТАТУСОВ ===
        # Если заказ оплачен, но статус не "Оплаченный" — исправляем
        try:
            cursor.execute(
                "UPDATE orders SET status = 'Оплаченный' WHERE payment_status = 'paid' AND status != 'Оплаченный'")
            print("[Init] Статусы оплаченных заказов обновлены.")
        except:
            pass

            # 4. ЛЕЧЕНИЕ ПОРЯДКА: Если у товаров position везде 0, сортировка глючит.
            # Проставим им position равный их ID, чтобы был хоть какой-то стартовый порядок.
            cursor.execute("SELECT count(*) FROM products WHERE position != 0")
            has_positions = cursor.fetchone()[0]

            if has_positions == 0:
                print("🔧 Исправляем пустые позиции товаров...")
                cursor.execute("UPDATE products SET position = id")
                conn.commit()

        cleanup_deleted_products()  # Запуск очистки при старте
        conn.commit()


# === БЭКАПЫ ===
def make_daily_backup():
    if not os.path.exists('backups'):
        os.makedirs('backups')

    date_str = datetime.now().strftime("%Y-%m-%d")
    backup_name = f"backups/radiobox_{date_str}.db"

    # Делаем бэкап, если его еще нет за сегодня
    if not os.path.exists(backup_name) and os.path.exists(DB_NAME):
        shutil.copy(DB_NAME, backup_name)
        print(f"[Backup] Создана копия: {backup_name}")

    # Удаление старых бэкапов (оставляем 5 последних)
    files = sorted(os.listdir('backups'))
    if len(files) > 5:
        for f in files[:-5]:
            os.remove(os.path.join('backups', f))
            print(f"[Backup] Удален старый файл: {f}")

# === ДЕКОРАТОР ДЛЯ ЗАЩИТЫ АДМИНКИ ===
def role_required(*allowed_roles):
    def decorator(f):
        @wraps(f)
        def decorated_function(*args, **kwargs):
            user_role = session.get('role')

            if not user_role:
                # Если пытаются зайти в /superadmin
                if request.path.startswith('/superadmin'):
                    return redirect('/superadmin/login')
                # Если пытаются зайти в /admin
                if request.path.startswith('/admin'):
                    # По умолчанию редиректим на RU версию логина
                    return redirect('/admin/ru/login')
                return jsonify({"success": False, "error": "Нужна авторизация"}), 401

            # Супер-админ проходит везде, остальные — по списку ролей
            if user_role == 'superadmin' or user_role in allowed_roles:
                return f(*args, **kwargs)

            return "Доступ запрещен: недостаточно прав", 403

        return decorated_function

    return decorator

# === ФУНКЦИЯ ОТПРАВКИ ПИСЬМА ===
def send_email_real(to_email, subject, body):
    try:
        msg = MIMEText(body)
        msg['Subject'] = subject
        msg['From'] = EMAIL_SENDER
        msg['To'] = to_email

        print(f"[*] Подключение к Gmail для отправки на {to_email}...")

        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls()
            server.login(EMAIL_SENDER, EMAIL_PASSWORD)
            server.sendmail(EMAIL_SENDER, to_email, msg.as_string())

        print("[+] Письмо успешно отправлено!")
        return True
    except Exception as e:
        print(f"[-] Ошибка отправки Email: {e}")
        return False


# === РОУТЫ ===

@app.route('/')
def index():
    return redirect('/ru/index.html')


@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory('.', path)


@app.route('/api/register', methods=['POST'])
def register():
    data = request.json
    hashed_pw = generate_password_hash(data['password'])
    role = 'client'  # По умолчанию все новые - клиенты

    try:
        with sqlite3.connect(DB_NAME) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO users (name, surname, email, phone, password, role)
                VALUES (?, ?, ?, ?, ?, ?)
            ''', (data['name'], data['surname'], data['email'], data['phone'], hashed_pw, role))
            conn.commit()
            user_id = cursor.lastrowid

            # Сразу записываем в сессию
            session['user_id'] = user_id
            session['email'] = data['email']
            session['role'] = role

            return jsonify({
                "success": True,
                "user": {
                    "id": user_id,
                    "name": data['name'],
                    "surname": data['surname'],
                    "phone": data['phone'],
                    "email": data['email'],
                    "role": role
                }
            })
    except sqlite3.IntegrityError:
        return jsonify({"success": False, "error": "Пользователь с таким Email уже существует!"})


@app.route('/api/login', methods=['POST'])
@limiter.limit("3 per minute")
def login():
    data = request.json
    session.clear()

    with sqlite3.connect(DB_NAME) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute('SELECT * FROM users WHERE email = ?', (data['email'],))
        user = cursor.fetchone()

        if user and check_password_hash(user['password'], data['password']):
            # Сохраняем всё необходимое в сессию
            session['user_id'] = user['id']
            session['email'] = user['email']
            session['role'] = user['role'] # Теперь роль 'superadmin' или 'manager' сохранится
            session.permanent = True

            return jsonify({
                "success": True,
                "user": {
                    "id": user['id'],
                    "name": user['name'],
                    "surname": user['surname'],
                    "phone": user['phone'],
                    "email": user['email'],
                    "role": user['role']
                }
            })
        else:
            return jsonify({"success": False, "error": "Неверный Email или пароль"})


# ОТПРАВКА КОДА (ТОЛЬКО EMAIL)
@app.route('/api/recover/send-code', methods=['POST'])
@limiter.limit("3 per minute") # Не больше 3 писем в минуту
def send_code():
    data = request.json
    email = data.get('email')  # Теперь ждем только email

    # 1. Ищем пользователя
    with sqlite3.connect(DB_NAME) as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT id, name FROM users WHERE email = ?', (email,))
        user = cursor.fetchone()

    if not user:
        return jsonify({"success": False, "error": "Пользователь с таким Email не найден"})

    # 2. Генерируем код
    code = str(random.randint(1000, 9999))

    # 3. Отправляем письмо
    subject = "Код восстановления пароля | RadioBox"
    body = f"Здравствуйте, {user[1]}!\n\nВаш код для смены пароля: {code}\n\nНикому не сообщайте его."

    email_success = send_email_real(email, subject, body)

    if not email_success:
        return jsonify({"success": False, "error": "Ошибка отправки письма (см. консоль)"})

    # Возвращаем код для отладки
    return jsonify({"success": True, "debug_code": code})


@app.route('/api/recover/change-password', methods=['POST'])
def change_password():
    data = request.json
    email = data.get('email')
    new_pass = data.get('new_pass')

    hashed_pw = generate_password_hash(new_pass)  # <-- Хэшируем

    with sqlite3.connect(DB_NAME) as conn:
        cursor = conn.cursor()
        cursor.execute('UPDATE users SET password = ? WHERE email = ?', (hashed_pw, email))
        conn.commit()

    return jsonify({"success": True})


@app.route('/api/user/orders', methods=['GET'])
@role_required('client', 'manager', 'superadmin')
def get_user_orders():
    email = session['email']
    referer = request.referrer or ""
    is_ukrainian = '/ua/' in referer
    status_col = "status_ua" if is_ukrainian else "status"

    try:
        with sqlite3.connect(DB_NAME) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()

            # Сначала убедимся, что таблица логов существует (на всякий случай)
            cursor.execute('''CREATE TABLE IF NOT EXISTS order_logs 
                (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id INTEGER, 
                message_ru TEXT, message_ua TEXT, created_at TEXT)''')

            # Загружаем фото товаров (безопасно)
            cursor.execute("SELECT id, images_json FROM products")
            products_map = {}
            for p in cursor.fetchall():
                try:
                    imgs = json.loads(p['images_json']) if p['images_json'] else []
                    products_map[p['id']] = imgs[0] if imgs else None
                except:
                    products_map[p['id']] = None

            # Выбираем ВСЕ данные заказа
            cursor.execute(f'''
                SELECT id, created_at, {status_col} as status, total_price, items_json, 
                       delivery_method, delivery_address, payment_method, payment_status, ttn 
                FROM orders WHERE user_email = ? ORDER BY created_at DESC
            ''', (email,))

            rows = cursor.fetchall()
            orders = []
            for row in rows:
                # Тянем историю для каждого заказа
                cursor.execute(
                    "SELECT message_ru, message_ua, created_at FROM order_logs WHERE order_id = ? ORDER BY created_at DESC",
                    (row['id'],))
                logs = [dict(l) for l in cursor.fetchall()]

                items = []
                if row["items_json"]:
                    try:
                        items = json.loads(row["items_json"])
                    except:
                        items = []
                    for item in items:
                        prod_id = int(item.get('id', 0))
                        if prod_id in products_map:
                            item['image'] = products_map[prod_id]

                orders.append({
                    "id": row["id"],
                    "created_at": row["created_at"],
                    "status": row["status"],
                    "total_price": row["total_price"],
                    "items": items,
                    "delivery": row["delivery_method"],
                    "address": row["delivery_address"],
                    "payment_method": row["payment_method"],
                    "payment_status": row["payment_status"],
                    "ttn": row["ttn"],
                    "logs": logs
                })
        return jsonify({"success": True, "orders": orders})
    except Exception as e:
        print(f"Ошибка в get_user_orders: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/update_db_qty')
def update_db_structure():
    with sqlite3.connect(DB_NAME) as conn:
        try:
            conn.execute("ALTER TABLE products ADD COLUMN quantity INTEGER DEFAULT 0")
            return "Колонка quantity добавлена!"
        except:
            return "Колонка уже есть или ошибка."


@app.route('/create_order', methods=['POST'])
@limiter.limit("2 per hour") # Максимум 2 заказа в час с одного IP
def create_order():
    # 1. Получаем данные из формы (Вернул как в GitHub)
    phone = request.form.get('phone')
    name = request.form.get('name')
    surname = request.form.get('surname')
    address = request.form.get('full_address') or request.form.get('address')
    cart_json = request.form.get('cart_json')
    comment = request.form.get('comment')

    pay_status_raw = request.form.get('payment_status', 'unpaid')
    payment_status_human = "Оплачено" if pay_status_raw == 'paid' else "Не оплачено"

    raw_payment = request.form.get('payment')
    raw_delivery = request.form.get('delivery')
    delivery_method = request.form.get('delivery')

    delivery_labels = {'np': 'Нова Пошта', 'up': 'Укрпошта Стандарт', 'upe': 'Укрпошта Експрес', 'meest': 'Meest ПОШТА',
                       'self': 'Самовивіз'}
    delivery_display = delivery_labels.get(delivery_method, delivery_method)

    payment_labels = {'cod': 'Післяплата', 'seller_cashless': 'Безготівковий розрахунок',
                      'seller_privat': 'Оплата на рахунок ФОП', 'card_online': 'Оплата карткою Online'}
    payment_display = payment_labels.get(raw_payment, raw_payment)

    # Сбор города и отделения (Вернул логику GitHub)
    city = ""
    city_ref = ""
    point = ""
    point_ref = ""

    if delivery_method == 'np':
        city = request.form.get('city_np', '')
        city_ref = request.form.get('city_ref_np', '')
        point = next((val for val in request.form.getlist('point_np') if val.strip()), '')
        point_ref = request.form.get('point_ref_np', '')
    elif delivery_method in ['up', 'upe', 'meest']:
        city = request.form.get(f'city_{delivery_method}', '')
        city_ref = request.form.get(f'city_ref_{delivery_method}', '')
        point = request.form.get(f'{delivery_method}_branch_text', '')

    full_delivery_info = f"{delivery_display}: {address}"
    order_id = random.randint(100000000, 999999999)
    user_email = session.get('email', '')

    total_sum = 0
    items = []
    try:
        items = json.loads(cart_json)
        for item in items:
            total_sum += float(item.get('price', 0)) * int(item.get('qty', 0))
    except:
        pass

    try:
        with sqlite3.connect(DB_NAME) as conn:
            cursor = conn.cursor()
            initial_order_status = "Оплаченный" if pay_status_raw == 'paid' else "Новый"

            # ИСПРАВЛЕНО: Добавил delivery_method в INSERT, чтобы подтягивалось в профиль
            cursor.execute('''
                INSERT INTO orders (
                    id, user_name, user_surname, user_phone, user_email,
                    delivery_method, delivery_address, payment_method, payment_status, 
                    comment, items_json, created_at, status, total_price, ttn
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                order_id, name, surname, phone, user_email,
                delivery_display, full_delivery_info, payment_display, payment_status_human,
                comment, cart_json, datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                initial_order_status, total_sum, ""
            ))

            # ПУНКТ 5: Логируем создание заказа
            cursor.execute("INSERT INTO order_logs (order_id, message_ru, message_ua, created_at) VALUES (?, ?, ?, ?)",
                           (order_id, "Заказ создан", "Замовлення створено",
                            datetime.now().strftime("%Y-%m-%d %H:%M:%S")))

            # Списание со склада (твоя логика из GitHub)
            for item in items:
                cursor.execute(
                    "UPDATE products SET quantity = MAX(0, quantity - ?), qty_stock = MAX(0, qty_stock - ?), in_stock = CASE WHEN (quantity - ?) <= 0 THEN 0 ELSE 1 END WHERE id = ?",
                    (int(item.get('qty', 0)), int(item.get('qty', 0)), int(item.get('qty', 0)), item.get('id')))
            conn.commit()

            # Интеграция CRM (Вернул переменные как были)
            crm_data = {
                'name': f"{name} {surname}", 'phone': phone, 'delivery': delivery_display,
                'address': address, 'city': city, 'point': point,
                'city_ref': city_ref, 'point_ref': point_ref,
                'payment': payment_display, 'comment': comment, 'email': user_email
            }

            crm_id_from_api = send_to_keepincrm(order_id, crm_data, items, total_sum)
            if crm_id_from_api:
                cursor.execute("UPDATE orders SET crm_id = ? WHERE id = ?", (crm_id_from_api, order_id))
                conn.commit()

    except sqlite3.IntegrityError:
        return create_order()
    except Exception as e:
        return f"Ошибка: {e}", 500

    referer = request.referrer or ""
    lang = '/ua/' if '/ua/' in referer else '/ru/'
    return redirect(f'{lang}order-success.html?order_id={order_id}')

# === API: ОПЛАТА ЗАКАЗА (ОБНОВЛЕНИЕ СТАТУСА) ===
@app.route('/api/pay_order', methods=['POST'])
def pay_order_api():
    data = request.json
    order_id = data.get('order_id')

    if not order_id:
        return jsonify({"success": False, "error": "No ID"})

    try:
        with sqlite3.connect(DB_NAME) as conn:
            cursor = conn.cursor()
            # Просто проверяем, успел ли уже выполниться фоновый callback от серверов банка
            cursor.execute("SELECT payment_status FROM orders WHERE id = ?", (order_id,))
            row = cursor.fetchone()

            if row and row[0] in ['paid', 'Оплачено']:
                return jsonify({"success": True, "message": "Payment verified by server"})
            else:
                # Если сервер еще не получил callback от банка, возвращаем статус ожидания
                return jsonify({"success": False, "error": "Payment pending confirmation"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

# === API: ОТМЕНА ЗАКАЗА ===
@app.route('/api/cancel_order', methods=['POST'])
def cancel_order_api():
    data = request.json
    order_id = data.get('order_id')
    if not order_id:
        return jsonify({"success": False, "error": "No ID"})

    try:
        with sqlite3.connect(DB_NAME) as conn:
            cursor = conn.cursor()
            # 1. Получаем crm_id заказа из новой колонки
            cursor.execute('SELECT crm_id, items_json, status FROM orders WHERE id = ?', (order_id,))
            row = cursor.fetchone()
            if not row or row[2] == "Отменен":
                return jsonify({"success": True, "message": "Order not found or already cancelled"})

            crm_id, items_json = row[0], row[1]
            current_status = row[2]

            # === ЛОГИКА ВОЗВРАТА НА СКЛАД ===
            if items_json:
                try:
                    items = json.loads(items_json)
                    for item in items:
                        prod_id = item.get('id')
                        qty_to_return = int(item.get('qty', 0))

                        # Прибавляем товар обратно и восстанавливаем флаг наличия
                        cursor.execute("""
                                        UPDATE products 
                                        SET quantity = quantity + ?, 
                                            qty_stock = qty_stock + ?,
                                            in_stock = 1
                                        WHERE id = ?
                                    """, (qty_to_return, qty_to_return, prod_id))
                except Exception as e:
                    print(f"Ошибка парсинга товаров при отмене: {e}")

            # Обновляем статус в локальной БД (обе колонки: RU и UA)
            cursor.execute('UPDATE orders SET status = ?, status_ua = ? WHERE id = ?',
                           ("Отменен", "Скасовано", order_id))
            conn.commit()

        # 3. Синхронизация с KeepinCRM
        if crm_id:
            api_token = get_setting('crm_api_key')
            if api_token:
                # Используем crm_id для формирования URL
                url = f'https://api.keepincrm.com/v1/agreements/{crm_id}'
                headers = {
                    'X-Auth-Token': api_token.strip(),
                    'Content-Type': 'application/json'
                }

                # Используем stage_id вместо status_id
                payload = {'stage_id': 7}

                # Отправляем PATCH запрос для частичного обновления сделки
                crm_res = requests.patch(url, json=payload, headers=headers, timeout=10)
                if crm_res.status_code == 200:
                    print(f"✅ Статус заказа {order_id} в CRM изменен на этап 8 (stage_id)")
                else:
                    print(f"⚠️ Ошибка CRM при отмене: {crm_res.text}")

        return jsonify({"success": True})
    except Exception as e:
        print(f"Ошибка отмены: {e}")
        return jsonify({"success": False, "error": str(e)})


# === РОУТЫ АДМИНКИ ===

# 1. Корневой редирект (если зашли просто на /admin)
@app.route('/admin')
def admin_root():
    # Проверяем роль вместо старого флага
    if session.get('role') in ['manager', 'superadmin']:
        return redirect('/admin/ru/dashboard')
    return redirect('/admin/ru/login')


# 2. Универсальный ВХОД (Логин)
@app.route('/admin/<lang>/login', methods=['GET', 'POST'])
@limiter.limit("3 per minute") # Сюда тоже ставим лимит
def admin_login_lang(lang):
    if lang not in ['ru', 'ua']: return redirect('/admin/ru/login')
    error = None
    if request.method == 'POST':
        session.clear()
        email = request.form.get('login') # В форме это поле называется 'login'
        password = request.form.get('password')

        with sqlite3.connect(DB_NAME) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            # Ищем только тех, кто имеет право заходить в админку
            cursor.execute("SELECT * FROM users WHERE email = ? AND role IN ('manager', 'superadmin')", (email,))
            user = cursor.fetchone()

            if user and check_password_hash(user['password'], password):
                session['user_id'] = user['id']
                session['email'] = user['email']
                session['role'] = user['role']
                session.permanent = True
                return redirect(f'/admin/{lang}/dashboard')
            else:
                error = "Невірний логін або пароль" if lang == 'ua' else "Неверный логин или пароль"

    try:
        with open(f'admin/{lang}/admin_login.html', 'r', encoding='utf-8') as f:
            return render_template_string(f.read(), error=error)
    except FileNotFoundError:
        return f"Error: File admin/{lang}/admin_login.html not found!"

@app.route('/admin/<path:filename>')
def serve_admin_static_files(filename):
    return send_from_directory('admin', filename)

# 3. Выход
@app.route('/admin/logout')
def admin_logout():
    session.clear() # Очистит и role, и user_id, и email
    return redirect('/admin/ru/login')

# === АДМИНКА: СТРАНИЦЫ И API ===

# ДАШБОРД (с учетом языка)
@app.route('/admin/<lang>/dashboard')
@role_required('manager', 'superadmin')
def admin_dashboard(lang):
    if lang not in ['ru', 'ua']: return redirect('/admin/ru/dashboard')

    try:
        with open(f'admin/{lang}/dashboard.html', 'r', encoding='utf-8') as f:
            return render_template_string(f.read())
    except FileNotFoundError:
        return f"Error: File admin/{lang}/dashboard.html not found!"


# === API: АДМИНКА - СПИСОК ЗАКАЗОВ С ФИЛЬТРАМИ ===
@app.route('/api/admin/orders', methods=['GET'])
@role_required('manager', 'superadmin')
def admin_get_orders():

    # 1. Получаем параметры фильтрации
    search = request.args.get('search', '').strip()
    status_filter = request.args.get('status', '')
    date_from = request.args.get('date_from', '')
    date_to = request.args.get('date_to', '')

    # 2. Параметры сортировки
    sort_by = request.args.get('sort_by', 'date')  # id, date, client, total, status
    sort_dir = request.args.get('sort_dir', 'desc')

    # 3. Строим SQL запрос
    query = "SELECT * FROM orders WHERE 1=1"
    params = []

    # -- Поиск (ID, Имя, Фамилия, Телефон, ТТН) --
    if search:
        query += """ AND (
            id LIKE ? OR 
            user_name LIKE ? OR 
            user_surname LIKE ? OR 
            user_phone LIKE ? OR 
            ttn LIKE ?
        )"""
        term = f"%{search}%"
        params.extend([term, term, term, term, term])

    # -- Фильтр по статусу --
    if status_filter:
        query += " AND status = ?"
        params.append(status_filter)

    # -- Фильтр по дате --
    if date_from:
        query += " AND created_at >= ?"
        params.append(date_from + " 00:00:00")
    if date_to:
        query += " AND created_at <= ?"
        params.append(date_to + " 23:59:59")

    # -- Сортировка --
    direction = "DESC" if sort_dir == 'desc' else "ASC"

    if sort_by == 'id':
        query += f" ORDER BY id {direction}"
    elif sort_by == 'client':
        query += f" ORDER BY user_name {direction}, user_surname {direction}"
    elif sort_by == 'total':
        query += f" ORDER BY total_price {direction}"
    elif sort_by == 'status':
        query += f" ORDER BY status {direction}"
    else:
        # По умолчанию - по дате
        query += f" ORDER BY created_at {direction}"

    with sqlite3.connect(DB_NAME) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # Собираем данные о товарах (артикулы и фото)
        cursor.execute("SELECT id, sku, images_json FROM products")
        products_map = {
            p['id']: {'sku': p['sku'], 'image': (json.loads(p['images_json'])[0] if p['images_json'] else None)} for p
            in cursor.fetchall()}

        cursor.execute(query, tuple(params))  # 'query' и 'params' должны быть сформированы выше
        rows = cursor.fetchall()

        orders = []
        for row in rows:
            items = []
            if row["items_json"]:
                try:
                    items = json.loads(row["items_json"])
                    for item in items:
                        p_info = products_map.get(int(item.get('id', 0)), {})
                        item['sku'] = p_info.get('sku', '')
                        item['image'] = p_info.get('image', '')
                except:
                    pass

            orders.append({
                "id": row["id"],
                "name": f"{row['user_name']} {row['user_surname']}",
                "phone": row["user_phone"],
                "total": row["total_price"],
                # Используем прямое обращение по ключу, БЕЗ .get()
                "status": row["status"],
                "status_ua": row["status_ua"] if "status_ua" in row.keys() else "",
                "date": row["created_at"],
                "payment": row["payment_method"],
                "pay_status": row["payment_status"],
                "delivery": row["delivery_method"] or "",
                "address": row["delivery_address"] or "",
                "ttn": row["ttn"] or "",
                "comment": row["comment"] or "",
                "items": items
            })

    return jsonify({"success": True, "orders": orders})

# === API: АДМИНКА - СОХРАНИТЬ ТТН ===
@app.route('/api/admin/order/ttn', methods=['POST'])
@role_required('manager', 'superadmin')
def admin_save_ttn():

    data = request.json
    order_id = data.get('id')
    ttn_value = data.get('ttn')

    with sqlite3.connect(DB_NAME) as conn:
        cursor = conn.cursor()

        # 1. Запись в историю изменений (чтобы появилось в профиле)
        log_ru = f"Добавлен ТТН: {ttn_value}"
        log_ua = f"Додано ТТН: {ttn_value}"
        cursor.execute("INSERT INTO order_logs (order_id, message_ru, message_ua, created_at) VALUES (?, ?, ?, ?)",
                       (order_id, log_ru, log_ua, datetime.now().strftime("%Y-%m-%d %H:%M:%S")))

        # 2. Обновление ТТН в основной таблице заказов
        cursor.execute("UPDATE orders SET ttn = ? WHERE id = ?", (ttn_value, order_id))
        conn.commit()

    return jsonify({"success": True})


@app.route('/api/admin/order/status', methods=['POST'])
@role_required('manager', 'superadmin')
def admin_update_status():

    data = request.json
    order_id = data.get('id')
    new_status_ru = data.get('status')

    # Находим украинский перевод статуса
    new_status_ua = new_status_ru
    for stage in CRM_STAGE_MAP.values():
        if stage['ru'] == new_status_ru:
            new_status_ua = stage['ua']
            break

    with sqlite3.connect(DB_NAME) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # 1. Получаем email для уведомления
        cursor.execute("SELECT user_email FROM orders WHERE id = ?", (order_id,))
        row = cursor.fetchone()
        if not row:
            return jsonify({"success": False, "error": "Order not found"}), 404

        user_email = row['user_email']

        # 2. ПУНКТ 5: Запись изменения статуса в историю
        log_msg_ru = f"Статус изменен на: {new_status_ru}"
        log_msg_ua = f"Статус змінено на: {new_status_ua}"
        cursor.execute("INSERT INTO order_logs (order_id, message_ru, message_ua, created_at) VALUES (?, ?, ?, ?)",
                       (order_id, log_msg_ru, log_msg_ua, datetime.now().strftime("%Y-%m-%d %H:%M:%S")))

        # 3. Обновление статусов (RU и UA) в заказе
        cursor.execute("UPDATE orders SET status = ?, status_ua = ? WHERE id = ?",
                       (new_status_ru, new_status_ua, order_id))
        conn.commit()

    # 4. Отправка письма (твоя логика)
    if new_status_ru == "Планируется повторный звонок" and user_email:
        subject = "Підтвердження замовлення"
        body = (
            "Добрий день! Наш менеджер не зміг додзвонитися до Вас для підтвердження замовлення. "
            "Будь ласка зателефонуйте нам по номеру: +380930728887, або зв'яжіться з нами через Viber.\n\n"
            "RadioBox"
        )
        send_email_real(user_email, subject, body)

    return jsonify({"success": True})

# === API: ПОЛУЧИТЬ НАСТРОЙКИ ===
@app.route('/api/admin/settings', methods=['GET'])
@role_required('superadmin')
def admin_get_settings():
    with sqlite3.connect(DB_NAME) as conn:
        conn.row_factory = sqlite3.Row
        rows = conn.execute("SELECT * FROM settings").fetchall()
        # Превращаем в объект {key: value}
        settings = {row['key']: row['value'] for row in rows}
    return jsonify({"success": True, "settings": settings})


# === API: СОХРАНИТЬ НАСТРОЙКИ ===
@app.route('/api/admin/settings', methods=['POST'])
@role_required('superadmin')
def admin_save_settings():
    data = request.json
    with sqlite3.connect(DB_NAME) as conn:
        for key, value in data.items():
            conn.execute("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)", (key, value))
        conn.commit()
    return jsonify({"success": True})


# === API: СПИСОК БЭКАПОВ ===
@app.route('/api/admin/backups', methods=['GET'])
@role_required('superadmin')
def admin_list_backups():
    if not os.path.exists('backups'):
        return jsonify({"success": True, "backups": []})

    files = sorted(os.listdir('backups'), reverse=True)  # Новые сверху
    return jsonify({"success": True, "backups": files})


# === API: ВОССТАНОВИТЬ БЭКАП ===
@app.route('/api/admin/backup/restore', methods=['POST'])
@role_required('superadmin')
def admin_restore_backup():
    filename = request.json.get('filename')
    backup_path = os.path.join('backups', filename)

    if os.path.exists(backup_path):
        try:
            # Копируем бэкап поверх основной базы
            # ВАЖНО: Это сработает, если SQLite не залочена жестко. В Flask обычно ок.
            shutil.copy(backup_path, DB_NAME)
            print(f"[Restore] База восстановлена из {filename}")
            return jsonify({"success": True})
        except Exception as e:
            return jsonify({"success": False, "error": str(e)})

    return jsonify({"success": False, "error": "File not found"})


# === РОУТ ДЛЯ robots.txt (ПУБЛИЧНЫЙ) ===
@app.route('/robots.txt')
def serve_robots():
    with sqlite3.connect(DB_NAME) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT value FROM settings WHERE key='robots_txt'")
        row = cursor.fetchone()
        content = row[0] if row else "User-agent: *\nDisallow: /admin"

    from flask import Response
    return Response(content, mimetype='text/plain')


# === СТРАНИЦА НАСТРОЕК ===
@app.route('/admin/<lang>/settings')
@role_required('superadmin')
def admin_settings_page(lang):
    if lang not in ['ru', 'ua']: return redirect('/admin/ru/settings')
    return send_from_directory(f'admin/{lang}', 'settings.html')


# === НАСТРОЙКИ ЗАГРУЗКИ ===
UPLOAD_FOLDER = 'assets/products'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp', 'mp4', 'webm', 'mov', 'avi', 'mkv'}
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


# === РОУТ: СТРАНИЦА ТОВАРОВ ===
@app.route('/admin/<lang>/products')
@role_required('manager', 'superadmin')
def admin_products(lang):
    if lang not in ['ru', 'ua']: return redirect('/admin/ru/products')

    try:
        with open(f'admin/{lang}/products.html', 'r', encoding='utf-8') as f:
            return render_template_string(f.read())
    except FileNotFoundError:
        return f"Error: File admin/{lang}/products.html not found!"


# === API: СПИСОК ТОВАРОВ С ФИЛЬТРАМИ И СОРТИРОВКОЙ ===
@app.route('/api/admin/products', methods=['GET'])
@role_required('manager', 'superadmin')
def admin_get_products_api():

    # Параметры из URL
    show_deleted = request.args.get('show_deleted') == '1'
    cat_filter = request.args.get('category', '')
    date_from = request.args.get('date_from', '')
    date_to = request.args.get('date_to', '')

    # Сортировка: def (по умолчанию/позиции), price, date, name, sku, stock
    sort_by = request.args.get('sort_by', 'def')
    sort_dir = request.args.get('sort_dir', 'asc')  # asc / desc

    # Базовый запрос
    query = "SELECT * FROM products WHERE "
    params = []

    # 1. Условие удаленности
    if show_deleted:
        query += "deleted_at IS NOT NULL"
    else:
        query += "deleted_at IS NULL"

    if cat_filter:
        # 1. Получаем список всех дочерних категорий (включая саму выбранную)
        with sqlite3.connect(DB_NAME) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            all_cats = cursor.execute("SELECT slug, parent_slug FROM categories").fetchall()

            # Рекурсивная функция для поиска всех "потомков"
            def get_all_descendants(target_slug):
                descendants = [target_slug]
                for cat in all_cats:
                    if cat['parent_slug'] == target_slug:
                        descendants.extend(get_all_descendants(cat['slug']))
                return list(set(descendants))  # Убираем дубликаты

            relevant_slugs = get_all_descendants(cat_filter)

        # 2. Формируем запрос с оператором IN
        placeholders = ', '.join(['?'] * len(relevant_slugs))
        query += f" AND category IN ({placeholders})"
        params.extend(relevant_slugs)

    if date_from:
        query += " AND created_at >= ?"
        params.append(date_from + " 00:00:00")

    if date_to:
        query += " AND created_at <= ?"
        params.append(date_to + " 23:59:59")

    # 3. Сортировка
    if show_deleted:
        # В корзине сортируем просто по дате удаления
        query += " ORDER BY deleted_at DESC"
    else:
        # Валидация направления сортировки во избежание инъекций
        direction = "DESC" if sort_dir == 'desc' else "ASC"

        if sort_by == 'price':
            query += f" ORDER BY price {direction}"
        elif sort_by == 'date':
            query += f" ORDER BY created_at {direction}"
        elif sort_by == 'name':
            query += f" ORDER BY title_ru {direction}"
        elif sort_by == 'sku':
            query += f" ORDER BY sku {direction}"
        elif sort_by == 'stock':
            query += f" ORDER BY in_stock {direction}"
        else:
            # Сначала группируем по Категории, потом сортируем по Позиции
            # Это важно, чтобы заголовки не дублировались!
            query += f" ORDER BY category ASC, position ASC"

    with sqlite3.connect(DB_NAME) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute(query, tuple(params))
        rows = cursor.fetchall()

        products = []
        for row in rows:
            p = dict(row)
            try:
                p['images'] = json.loads(row['images_json'])
                p['image'] = p['images'][0] if p['images'] else ''
            except:
                p['images'] = []
                p['image'] = ''
            products.append(p)

    return jsonify({"success": True, "products": products})

# === API: ДОБАВИТЬ / ОБНОВИТЬ ТОВАР ===
@app.route('/api/admin/product/save', methods=['POST'])
@role_required('manager', 'superadmin')
def admin_save_product_api():
    data = request.json

    pid = data.get('id')
    created_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    # Основные поля
    sku = data.get('sku')
    title_ru = data.get('title_ru')
    title_ua = data.get('title_ua') or title_ru
    desc_ru = data.get('description_ru', '')
    desc_ua = data.get('description_ua', '')
    price = float(data.get('price', 0))
    in_stock = int(data.get('in_stock', 1))

    # --- ИСПРАВЛЕНИЕ: Получаем количество из фронтенда ---
    qty = int(data.get('qty_stock', 0))

    unit_type = data.get('unit_type', 'pcs')
    category = data.get('category')
    subcategory = data.get('subcategory', '')
    images = json.dumps(data.get('images', []))
    on_index = int(data.get('on_index', 0))

    seo_title = data.get('seo_title', '')
    seo_desc = data.get('seo_description', '')

    with sqlite3.connect(DB_NAME) as conn:
        cursor = conn.cursor()
        if pid:
            # Обновляем и quantity, и qty_stock, чтобы данные везде были актуальны
            cursor.execute('''
                UPDATE products SET 
                sku=?, title_ru=?, title_ua=?, description_ru=?, description_ua=?, 
                price=?, in_stock=?, quantity=?, qty_stock=?, category=?, subcategory=?, 
                images_json=?, on_index=?, seo_title=?, seo_description=?, 
                seo_title_ua=?, seo_description_ua=?, unit_type=?
                WHERE id=?
            ''', (
                sku, title_ru, title_ua, desc_ru, desc_ua,
                price, in_stock, qty, qty, category, subcategory,
                images, on_index, seo_title, seo_desc,
                data.get('seo_title_ua'), data.get('seo_description_ua'),
                unit_type, pid
            ))
        else:
            # При создании нового товара
            cursor.execute("SELECT MAX(position) FROM products WHERE category=?", (category,))
            res = cursor.fetchone()
            max_pos = res[0] if res and res[0] is not None else 0
            pos = max_pos + 1

            cursor.execute('''
                INSERT INTO products (
                    sku, title_ru, title_ua, description_ru, description_ua, 
                    price, in_stock, quantity, qty_stock, category, subcategory, 
                    images_json, on_index, position, created_at, seo_title, 
                    seo_description, unit_type
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                sku, title_ru, title_ua, desc_ru, desc_ua,
                price, in_stock, qty, qty, category, subcategory,
                images, on_index, pos, created_at, seo_title,
                seo_desc, unit_type
            ))

        conn.commit()
    return jsonify({"success": True})

# === API: ПРИНУДИТЕЛЬНОЕ ВОССТАНОВЛЕНИЕ КАТЕГОРИЙ И ПОДКАТЕГОРИЙ ===
@app.route('/api/admin/fix_categories', methods=['GET'])
@role_required('superadmin')
def fix_categories_route():
    with sqlite3.connect(DB_NAME) as conn:
        cursor = conn.cursor()

        # 1. Очищаем таблицу (чтобы создать структуру начисто)
        cursor.execute("DELETE FROM categories")

        # 2. ОСНОВНЫЕ КАТЕГОРИИ
        # (slug, ru, ua)
        main_cats = [
            ('solder', 'Паяльное оборудование', 'Паяльне обладнання'),
            ('meas', 'Измерительные приборы', 'Вимірювальні прилади'),
            ('osc', 'Осциллографы', 'Осцилографи'),
            ('prog', 'Программаторы', 'Програматори'),
            ('repair', 'Инструменты', 'Інструменти'),
            ('consum', 'Расходные материалы', 'Витратні матеріали'),
            ('rmods', 'Модули', 'Модулі'),
            ('rparts', 'Радиодетали', 'Радіодеталі'),
            ('psu', 'Источники питания', 'Джерела живлення'),
            ('cables', 'Кабели', 'Кабелі')
        ]

        # Вставляем основные
        for idx, (slug, ru, ua) in enumerate(main_cats):
            cursor.execute("INSERT INTO categories (slug, title_ru, title_ua, position) VALUES (?, ?, ?, ?)",
                           (slug, ru, ua, idx))

        # 3. ПОДКАТЕГОРИИ
        # (slug, parent_slug, ru, ua)
        sub_cats = [
            # Радиомодули (rmods)
            ('converters', 'rmods', 'Преобразователи напряжения', 'Перетворювачі напруги'),

            # Радиодетали (rparts)
            ('resistors', 'rparts', 'Резисторы', 'Резистори'),
            ('potentiometers', 'rparts', 'Потенциометры', 'Потенціометри'),
            ('capacitors', 'rparts', 'Конденсаторы', 'Конденсатори'),
            ('transistors', 'rparts', 'Транзисторы', 'Транзистори'),
            ('leds', 'rparts', 'Светодиоды', 'Світлодіоди'),
            ('diodes', 'rparts', 'Диоды', 'Діоди'),
            ('zener', 'rparts', 'Стабилитроны', 'Стабілітрони'),
            ('ics', 'rparts', 'Интегральные микросхемы', 'Інтегральні мікросхеми'),
            ('switches', 'rparts', 'Переключатели', 'Перемикачі'),
            ('quartz', 'rparts', 'Кварцевые резонаторы', 'Кварцові резонатори')
        ]

        # Вставляем подкатегории
        for idx, (slug, parent, ru, ua) in enumerate(sub_cats):
            cursor.execute(
                "INSERT INTO categories (slug, parent_slug, title_ru, title_ua, position) VALUES (?, ?, ?, ?, ?)",
                (slug, parent, ru, ua, idx))

        conn.commit()

    return "Структура категорий и подкатегорий успешно создана! Обновите админку."

# === API: ЗАГРУЗКА КАРТИНКИ ===
@app.route('/api/admin/upload', methods=['POST'])
@role_required('manager', 'superadmin')
def admin_upload_file():
    if 'file' not in request.files:
        return jsonify({"success": False, "error": "No file part"})

    file = request.files['file']
    if file.filename == '':
        return jsonify({"success": False, "error": "No selected file"})

    if file and allowed_file(file.filename):
        # Создаем папку, если нет
        if not os.path.exists(app.config['UPLOAD_FOLDER']):
            os.makedirs(app.config['UPLOAD_FOLDER'])

        filename = secure_filename(file.filename)
        # Добавляем timestamp, чтобы имена не совпадали
        ts = int(datetime.now().timestamp())
        filename = f"{ts}_{filename}"

        # Сохраняем
        file.save(os.path.join(app.config['UPLOAD_FOLDER'], filename))

        # Возвращаем путь для веба (assets/products/...)
        web_path = f"/assets/products/{filename}"
        return jsonify({"success": True, "path": web_path})

    return jsonify({"success": False, "error": "Invalid file type"})


# === API: СКРЫТЬ / ПОКАЗАТЬ ТОВАР ===
@app.route('/api/admin/product/visibility', methods=['POST'])
@role_required('manager', 'superadmin')
def admin_product_visibility():
    data = request.json
    pid = data.get('id')
    is_visible = data.get('is_visible')  # 1 или 0

    with sqlite3.connect(DB_NAME) as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE products SET is_visible = ? WHERE id = ?", (is_visible, pid))
        conn.commit()

    return jsonify({"success": True})


# === API: ПУБЛИЧНЫЙ СПИСОК ТОВАРОВ (ДЛЯ МАГАЗИНА) ===
@app.route('/api/products', methods=['GET'])
def get_public_products():
    with sqlite3.connect(DB_NAME) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # Мы добавляем LEFT JOIN, чтобы подтянуть названия категорий прямо из таблицы categories
        # Мы связываем их по полю p.category (где лежит 'solder', 'consum' и т.д.)
        # и полю c.slug в таблице категорий.
        cursor.execute("""
            SELECT p.*, c.title_ru as cat_title_ru, c.title_ua as cat_title_ua
            FROM products p
            LEFT JOIN categories c ON p.category = c.slug
            WHERE p.is_visible = 1 AND p.deleted_at IS NULL 
            ORDER BY p.position ASC, p.id DESC
        """)
        rows = cursor.fetchall()

        products = []
        for row in rows:
            p = dict(row)
            try:
                p['images'] = json.loads(row['images_json'])
                p['image'] = p['images'][0] if p['images'] else ''
            except:
                p['images'] = []
                p['image'] = ''

            products.append(p)

    return jsonify({"success": True, "items": products})

# Мягкое удаление (в корзину)
@app.route('/api/admin/product/delete', methods=['POST'])
@role_required('manager', 'superadmin')
def admin_delete_product():
    data = request.json
    deleted_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with sqlite3.connect(DB_NAME) as conn:
        conn.execute("UPDATE products SET deleted_at = ? WHERE id = ?", (deleted_at, data.get('id')))
        conn.commit()
    return jsonify({"success": True})


# Восстановление из корзины
@app.route('/api/admin/product/restore', methods=['POST'])
@role_required('manager', 'superadmin')
def admin_restore_product():
    data = request.json
    with sqlite3.connect(DB_NAME) as conn:
        conn.execute("UPDATE products SET deleted_at = NULL WHERE id = ?", (data.get('id'),))
        conn.commit()
    return jsonify({"success": True})


# Сортировка (Вверх/Вниз)
@app.route('/api/admin/product/move', methods=['POST'])
@role_required('manager', 'superadmin')
def admin_move_product():
    data = request.json
    pid = data.get('id')
    direction = data.get('direction')  # 'up' or 'down'

    with sqlite3.connect(DB_NAME) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # 1. Получаем текущий товар
        curr = cursor.execute("SELECT id, category, position FROM products WHERE id=?", (pid,)).fetchone()
        if not curr: return jsonify({"success": False})

        cat = curr['category']
        pos = curr['position']

        # 2. Ищем соседа
        if direction == 'up':
            neighbor = cursor.execute(
                "SELECT id, position FROM products WHERE category=? AND position < ? ORDER BY position DESC LIMIT 1",
                (cat, pos)).fetchone()
        else:
            neighbor = cursor.execute(
                "SELECT id, position FROM products WHERE category=? AND position > ? ORDER BY position ASC LIMIT 1",
                (cat, pos)).fetchone()

        # 3. ЕСЛИ СОСЕД НЕ НАЙДЕН (или позиции сломаны/дублируются), запускаем "ЛЕЧЕНИЕ" нумерации
        if not neighbor:
            # Пересчитываем позиции для ВСЕЙ категории по порядку ID
            products = cursor.execute("SELECT id FROM products WHERE category=? ORDER BY position ASC, id ASC",
                                      (cat,)).fetchall()
            for index, prod in enumerate(products):
                cursor.execute("UPDATE products SET position = ? WHERE id = ?", (index * 10, prod['id']))
            conn.commit()

            # После лечения пробуем найти соседа еще раз (рекурсивно, но 1 раз)
            # Но проще просто вернуть success=True, чтобы фронт обновился и подтянул новые позиции
            return jsonify({"success": True, "message": "Positions fixed"})

        # 4. Если сосед найден, меняемся местами
        if neighbor:
            cursor.execute("UPDATE products SET position=? WHERE id=?", (neighbor['position'], curr['id']))
            cursor.execute("UPDATE products SET position=? WHERE id=?", (curr['position'], neighbor['id']))
            conn.commit()

    return jsonify({"success": True})

@app.route('/api/admin/product/index', methods=['POST'])
@role_required('manager', 'superadmin')
def admin_product_index_toggle():
    data = request.json
    with sqlite3.connect(DB_NAME) as conn:
        conn.execute("UPDATE products SET on_index = ? WHERE id = ?", (data['on_index'], data['id']))
        conn.commit()
    return jsonify({"success": True})


# === API: УНИВЕРСАЛЬНАЯ СОРТИРОВКА (DRAG-AND-DROP) ===
@app.route('/api/admin/reorder', methods=['POST'])
@role_required('manager', 'superadmin')
def admin_reorder_general():
    data = request.json
    items = data.get('items', [])

    if not items:
        # Поддержка старого формата (если вдруг придет просто ids)
        if 'ids' in data:
            old_ids = data['ids']
            with sqlite3.connect(DB_NAME) as conn:
                for idx, pid in enumerate(old_ids):
                    conn.execute("UPDATE products SET position = ? WHERE id = ?", (idx, pid))
                conn.commit() # <--- ДОБАВИТЬ ЯВНЫЙ КОММИТ
            return jsonify({"success": True})
        return jsonify({"success": True})

    with sqlite3.connect(DB_NAME) as conn:
        cursor = conn.cursor()

        for index, item in enumerate(items):
            pid = item.get('id')
            new_cat = item.get('cat')

            if new_cat:
                cursor.execute("UPDATE products SET position = ?, category = ? WHERE id = ?", (index, new_cat, pid))
            else:
                cursor.execute("UPDATE products SET position = ? WHERE id = ?", (index, pid))

        conn.commit()

    return jsonify({"success": True})

# === API: ПОЛУЧИТЬ КАТЕГОРИИ (ДЕРЕВОМ) ===
@app.route('/api/categories', methods=['GET'])
def get_categories_api():
    with sqlite3.connect(DB_NAME) as conn:
        conn.row_factory = sqlite3.Row
        # Берем все, сортируем по позиции
        rows = conn.execute("SELECT * FROM categories ORDER BY position ASC").fetchall()

        cats = [dict(r) for r in rows]
        return jsonify({"success": True, "categories": cats})


# === API: СОХРАНИТЬ КАТЕГОРИЮ ===
@app.route('/api/admin/category/save', methods=['POST'])
@role_required('manager', 'superadmin')
def save_category_api():
    data = request.json

    cat_id = data.get('id')
    slug = data.get('slug')
    parent = data.get('parent_slug') or None
    ru = data.get('title_ru')
    ua = data.get('title_ua')
    image_url = data.get('image_url', '')

    with sqlite3.connect(DB_NAME) as conn:
        cursor = conn.cursor()
        if cat_id:
            cursor.execute("""
                UPDATE categories 
                SET slug=?, parent_slug=?, title_ru=?, title_ua=?, image_url=? 
                WHERE id=?
            """, (slug, parent, ru, ua, image_url, cat_id)) #
        else:
            cursor.execute("SELECT MAX(position) FROM categories WHERE parent_slug IS ?", (parent,))
            res = cursor.fetchone()
            pos = (res[0] + 1) if (res and res[0] is not None) else 0
            cursor.execute("""
                INSERT INTO categories (slug, parent_slug, title_ru, title_ua, image_url, position) 
                VALUES (?, ?, ?, ?, ?, ?)
            """, (slug, parent, ru, ua, image_url, pos)) #
        conn.commit()
    return jsonify({"success": True})


# === API: УДАЛИТЬ КАТЕГОРИЮ ===
@app.route('/api/admin/category/delete', methods=['POST'])
@role_required('manager', 'superadmin')
def delete_category_api():
    data = request.json
    cat_id = data.get('id')

    with sqlite3.connect(DB_NAME) as conn:
        # Удаляем категорию. (В идеале надо проверять, есть ли в ней товары, но пока просто удалим)
        conn.execute("DELETE FROM categories WHERE id=?", (cat_id,))
        conn.commit()
    return jsonify({"success": True})


# === API: СОРТИРОВКА КАТЕГОРИЙ ===
@app.route('/api/admin/category/reorder', methods=['POST'])
@role_required('manager', 'superadmin')
def reorder_categories_api():
    ids = request.json.get('ids', [])

    with sqlite3.connect(DB_NAME) as conn:
        for idx, cid in enumerate(ids):
            conn.execute("UPDATE categories SET position=? WHERE id=?", (idx, cid))
        conn.commit()
    return jsonify({"success": True})


# === API: ПОИСК ТОВАРОВ (ПУБЛИЧНЫЙ) ===
@app.route('/api/search', methods=['GET'])
def public_search_api():
    query = request.args.get('q', '').strip()

    if len(query) < 2:
        return jsonify({"success": True, "results": []})

    # 1. Оригинальный запрос (например "gfzkmybr" или "Паяльник")
    term_orig = f"%{query.lower()}%"

    # 2. Исправленный запрос (например "паяльник")
    fixed_query = fix_layout(query)
    term_fixed = f"%{fixed_query.lower()}%"

    with sqlite3.connect(DB_NAME) as conn:
        # Учим SQLite понимать нижний регистр для кириллицы
        conn.create_function("LOWER", 1, lambda s: s.lower() if s else s)

        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # SQL: Ищем совпадение ИЛИ по оригиналу, ИЛИ по исправленной раскладке
        sql = """
            SELECT * FROM products 
            WHERE (
                LOWER(title_ru) LIKE ? OR 
                LOWER(title_ua) LIKE ? OR 
                LOWER(sku) LIKE ? OR

                LOWER(title_ru) LIKE ? OR 
                LOWER(title_ua) LIKE ? 
            )
            AND is_visible = 1 
            AND deleted_at IS NULL
            ORDER BY in_stock DESC, position ASC
        """

        # Передаем параметры: 3 раза оригинал, 2 раза исправленный (для названий)
        cursor.execute(sql, (term_orig, term_orig, term_orig, term_fixed, term_fixed))
        rows = cursor.fetchall()

        results = []
        for row in rows:
            p = dict(row)
            try:
                p['images'] = json.loads(row['images_json'])
                p['image'] = p['images'][0] if p['images'] else ''
            except:
                p['images'] = []
                p['image'] = ''

            results.append(p)

    return jsonify({"success": True, "results": results})


# === СТРАНИЦА БАННЕРОВ ===
@app.route('/admin/<lang>/banners')
@role_required('manager', 'superadmin')
def admin_banners_page(lang):
    if lang not in ['ru', 'ua']: return redirect('/admin/ru/banners')
    try:
        # Мы создадим этот файл на Шаге 2
        with open(f'admin/{lang}/banners.html', 'r', encoding='utf-8') as f:
            return render_template_string(f.read())
    except FileNotFoundError:
        return f"Error: File admin/{lang}/banners.html not found!"


# === API: СПИСОК БАННЕРОВ (АДМИН) ===
@app.route('/api/admin/banners', methods=['GET'])
@role_required('manager', 'superadmin')
def admin_get_banners():
    with sqlite3.connect(DB_NAME) as conn:
        conn.row_factory = sqlite3.Row
        # Сортируем по позиции
        rows = conn.execute("SELECT * FROM banners ORDER BY position ASC").fetchall()
        banners = [dict(r) for r in rows]
    return jsonify({"success": True, "banners": banners})


# === API: ЗАГРУЗКА БАННЕРА ===
@app.route('/api/admin/banner/upload', methods=['POST'])
@role_required('manager', 'superadmin')
def admin_upload_banner():
    if 'file' not in request.files: return jsonify({"success": False, "error": "No file"})
    file = request.files['file']
    # ПРИНИМАЕМ ТИП УСТРОЙСТВА И СТИЛЬ
    device_type = request.form.get('device_type', 'pc')
    css_style = request.form.get('css_style', '')
    target_lang = request.form.get('target_lang', 'all')

    if file.filename == '': return jsonify({"success": False, "error": "Empty filename"})

    ALLOWED_BANNERS = {'png', 'jpg', 'jpeg', 'webp', 'mp4', 'webm'}
    ext = file.filename.rsplit('.', 1)[1].lower() if '.' in file.filename else ''

    if ext not in ALLOWED_BANNERS:
        return jsonify({"success": False, "error": "Invalid file type"})

    file_type = 'video' if ext in ['mp4', 'webm'] else 'image'
    BANNER_FOLDER = 'assets/banners'
    if not os.path.exists(BANNER_FOLDER): os.makedirs(BANNER_FOLDER)

    filename = secure_filename(file.filename)
    ts = int(datetime.now().timestamp())
    filename = f"{ts}_{filename}"

    file.save(os.path.join(BANNER_FOLDER, filename))
    web_path = f"/assets/banners/{filename}"

    with sqlite3.connect(DB_NAME) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT MAX(position) FROM banners")
        res = cursor.fetchone()
        pos = (res[0] + 1) if (res and res[0] is not None) else 0

        # Сохраняем css_style и target_lang
        cursor.execute(
            "INSERT INTO banners (filename, file_type, position, is_visible, created_at, css_style, device_type, target_lang) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (web_path, 'video' if filename.endswith(('mp4', 'webm')) else 'image', pos, 1, datetime.now().strftime("%Y-%m-%d %H:%M:%S"), css_style, device_type, target_lang))
        conn.commit()

    return jsonify({"success": True})

@app.route('/api/admin/banner/update_style', methods=['POST'])
@role_required('manager', 'superadmin')
def admin_banner_update_style():
    data = request.json
    with sqlite3.connect(DB_NAME) as conn:
        conn.execute("""
                    UPDATE banners 
                    SET css_style = ?, device_type = ?, target_lang = ? 
                    WHERE id = ?
                """, (data['css_style'], data.get('device_type', 'pc'), data.get('target_lang', 'all'), data['id']))
        conn.commit()
    return jsonify({"success": True})

# === API: УДАЛЕНИЕ БАННЕРА ===
@app.route('/api/admin/banner/delete', methods=['POST'])
@role_required('manager', 'superadmin')
def admin_delete_banner():
    data = request.json
    bid = data.get('id')

    with sqlite3.connect(DB_NAME) as conn:
        cursor = conn.cursor()
        # Сначала получаем имя файла, чтобы удалить с диска
        cursor.execute("SELECT filename FROM banners WHERE id=?", (bid,))
        row = cursor.fetchone()
        if row:
            # Путь в базе начинается с /, убираем его для os.remove
            file_path = row[0].lstrip('/')
            if os.path.exists(file_path):
                try:
                    os.remove(file_path)
                except:
                    pass

            cursor.execute("DELETE FROM banners WHERE id=?", (bid,))
            conn.commit()

    return jsonify({"success": True})

# === API: ВИДИМОСТЬ БАННЕРА ===
@app.route('/api/admin/banner/visibility', methods=['POST'])
@role_required('manager', 'superadmin')
def admin_banner_visibility():
    data = request.json
    with sqlite3.connect(DB_NAME) as conn:
        conn.execute("UPDATE banners SET is_visible = ? WHERE id = ?", (data['is_visible'], data['id']))
        conn.commit()
    return jsonify({"success": True})


# === API: СОРТИРОВКА БАННЕРОВ ===
@app.route('/api/admin/banner/reorder', methods=['POST'])
@role_required('manager', 'superadmin')
def admin_banner_reorder():
    ids = request.json.get('ids', [])
    with sqlite3.connect(DB_NAME) as conn:
        for idx, bid in enumerate(ids):
            conn.execute("UPDATE banners SET position = ? WHERE id = ?", (idx, bid))
        conn.commit()
    return jsonify({"success": True})


# === ПУБЛИЧНЫЙ API ДЛЯ ГЛАВНОЙ СТРАНИЦЫ ===
@app.route('/api/banners', methods=['GET'])
def public_get_banners():
    with sqlite3.connect(DB_NAME) as conn:
        conn.row_factory = sqlite3.Row
        # ДОБАВИЛИ device_type и target_lang В SELECT
        rows = conn.execute("""
                    SELECT filename, file_type, css_style, device_type, target_lang 
                    FROM banners 
                    WHERE is_visible = 1 
                    ORDER BY position ASC
                """).fetchall()
        banners = [dict(r) for r in rows]
    return jsonify({"success": True, "banners": banners})

# === API: ОТЗЫВЫ (ПУБЛИЧНЫЕ) ===
@app.route('/api/reviews', methods=['GET'])
@limiter.limit("5 per hour") # Не больше 5 отзывов в час с одного IP
@role_required('client', 'manager', 'superadmin')
def get_public_reviews():
    # Получаем список видимых отзывов
    with sqlite3.connect(DB_NAME) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM reviews WHERE is_visible = 1 ORDER BY id DESC")
        rows = cursor.fetchall()
        reviews = [dict(r) for r in rows]
    return jsonify({"success": True, "reviews": reviews})

@app.route('/api/reviews/count', methods=['GET'])
def get_reviews_count():
    # Легкий запрос только для шапки (число)
    with sqlite3.connect(DB_NAME) as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT count(*) FROM reviews WHERE is_visible = 1")
        count = cursor.fetchone()[0]
    return jsonify({"success": True, "count": count})

@app.route('/api/reviews/add', methods=['POST'])
def add_public_review():
    data = request.json
    author = data.get('author')
    rating = int(data.get('rating', 5))
    comment = data.get('comment')
    # Формируем дату как DD.MM.YYYY
    date_str = datetime.now().strftime("%d.%m.%Y %H:%M")

    with sqlite3.connect(DB_NAME) as conn:
        cursor = conn.cursor()
        cursor.execute("""
                    INSERT INTO reviews (product_id, author, rating, comment, date, is_visible) 
                    VALUES (0, ?, ?, ?, ?, 1) 
                """, (author, rating, comment, date_str))
        conn.commit()
    return jsonify({"success": True})


# === API: ОТЗЫВЫ (АДМИН) ===
@app.route('/api/admin/reviews', methods=['GET'])
@role_required('manager', 'superadmin')
def admin_get_reviews():
    with sqlite3.connect(DB_NAME) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM reviews ORDER BY id DESC")
        rows = cursor.fetchall()
        reviews = [dict(r) for r in rows]
    return jsonify({"success": True, "reviews": reviews})

@app.route('/api/admin/review/delete', methods=['POST'])
@role_required('manager', 'superadmin')
def admin_delete_review():
    data = request.json
    with sqlite3.connect(DB_NAME) as conn:
        # Полное удаление (или можно делать is_visible=0)
        conn.execute("DELETE FROM reviews WHERE id = ?", (data['id'],))
        conn.commit()
    return jsonify({"success": True})

@app.route('/api/admin/review/reply', methods=['POST'])
@role_required('manager', 'superadmin')
def admin_reply_review():
    data = request.json
    with sqlite3.connect(DB_NAME) as conn:
        conn.execute("UPDATE reviews SET reply = ? WHERE id = ?", (data['reply'], data['id']))
        conn.commit()
    return jsonify({"success": True})

@app.route('/admin/ru/reviews')
@role_required('manager', 'superadmin')
def admin_reviews_page():
    # Отдаем файл reviews.html из папки admin/ru
    return send_from_directory('admin/ru', 'reviews.html')

@app.route('/api/admin/review/visibility', methods=['POST'])
@role_required('manager', 'superadmin')
def admin_review_vis():
    data = request.json
    try:
        with sqlite3.connect(DB_NAME) as conn:
            # Обновляем статус is_visible
            conn.execute("UPDATE reviews SET is_visible = ? WHERE id = ?", (data['is_visible'], data['id']))
            conn.commit()
        return jsonify({"success": True})
    except Exception as e:
        print(f"Error in visibility: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@app.route('/api/admin/reviews/count_all', methods=['GET'])
@role_required('manager', 'superadmin')
def admin_reviews_count_all():
    with sqlite3.connect(DB_NAME) as conn:
        cursor = conn.cursor()
        # Считаем ВСЕ отзывы (и видимые, и скрытые)
        cursor.execute("SELECT count(*) FROM reviews")
        count = cursor.fetchone()[0]
    return jsonify({"success": True, "count": count})

@app.route('/admin/ua/reviews')
@role_required('manager', 'superadmin')
def admin_reviews_page_ua():
    return send_from_directory('admin/ua', 'reviews.html')


# Функция для получения настройки из БД
def get_setting(key_name):
    try:
        with sqlite3.connect(DB_NAME) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT value FROM settings WHERE key = ?", (key_name,))
            row = cursor.fetchone()
            return row[0] if row else None
    except Exception as e:
        print(f"Ошибка чтения настройки {key_name}: {e}")
        return None


def send_to_keepincrm(order_id, crm_data, items, total_sum):
    api_token = get_setting('crm_api_key')
    if api_token:
        api_token = api_token.strip()

    if not api_token:
        print("⚠️ Ошибка: API ключ не найден!")
        return

    url = 'https://api.keepincrm.com/v1/agreements'

    headers = {
        'X-Auth-Token': api_token,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    }

    site_url = get_setting('site_url') or "https://radiobox.in.ua"

    products_list = []
    for item in items:
        p_title = item.get('title') or 'Товар'
        p_sku = str(item.get('sku') or '').strip()  # Берем sku из корзины

        # Склеиваем полный путь к фото
        raw_image = item.get('image') or ''
        image_url = f"{site_url.rstrip('/')}/{raw_image.lstrip('/')}" if raw_image else ""

        products_list.append({
            'amount': int(item.get('qty', 1)),
            'title': p_title,
            'product_attributes': {
                'sku': p_sku,
                'title': p_title,
                'price': float(item.get('price', 0)),
                'currency': 'UAH',
                'image_url': image_url
            }
        })

    payload = {
        'title': str(order_id),
        'source_id': 7,
        'status_id': 5,
        'main_responsible_id': 1,
        'delivery': {
            'city': crm_data.get('city'),
            'point': crm_data.get('point'),
            'city_ref': crm_data.get('city_ref'),
            'point_ref': crm_data.get('point_ref')
        },
        'client_attributes': {
            'person': f"{crm_data.get('name', '')} {crm_data.get('surname', '')}".strip() or "Клієнт",
            'email': crm_data.get('email', ''),
            'phones': [crm_data.get('phone', '')],
            'lead': True
        },
        # Основной комментарий можно оставить или убрать
        'comment': crm_data.get('comment', ''),

        # ДОБАВЛЯЕМ ЭТОТ БЛОК:
        'custom_fields': [
            {'name': 'sluzhba_dostavki_335', 'value': crm_data.get('delivery')},
            {'name': 'oplata_334', 'value': crm_data.get('payment')},
            # Замените эти алиасы на ваши реальные из CRM:
            {'name': 'misto_dostavki_338', 'value': crm_data.get('city')},
            {'name': 'viddiliennia_339', 'value': crm_data.get('point')}
        ],

        'jobs_attributes': products_list
    }

    try:
        r = requests.post(url, json=payload, headers=headers, timeout=10)
        if r.status_code in [200, 201]:
            crm_id = r.json().get('id')  # Получаем ID из CRM
            print(f"✅ Успіх! Угода створена в KeepinCRM. ID: {crm_id}")
            return crm_id  # Возвращаем его
        return None
    except Exception as e:
        print(f"❌ Критична помилка: {e}")
        return None

@app.route('/api/admin/import_prom', methods=['POST'])
@role_required('manager', 'superadmin')
def admin_import_prom():
    if 'file' not in request.files:
        return jsonify({"success": False, "error": "Нет файла"})

    file = request.files['file']
    if not file:
        return jsonify({"success": False, "error": "Пустой файл"})

    try:
        # Читаем CSV (Prom.ua обычно в кодировке utf-8 или cp1251)
        # Попробуем прочитать как текст
        stream = io.StringIO(file.stream.read().decode("UTF8"), newline=None)
        csv_input = csv.DictReader(stream)

        with sqlite3.connect(DB_NAME) as conn:
            cursor = conn.cursor()

            count = 0
            for row in csv_input:
                # Маппинг полей из CSV Прома
                # Названия колонок должны совпадать с твоим файлом!
                # Проверь первую строку CSV файла.

                code = row.get('Код_товару') or row.get('Идентификатор_товару')
                title = row.get('Назва_позиції')
                price = row.get('Ціна')
                desc = row.get('Опис')  # Тут HTML
                image = row.get('Посилання_зображення')
                cat_name = row.get('Назва_групи')
                qty_str = row.get('Кількість', '0')

                # Очистка цены (убрать пробелы)
                try:
                    price = float(price.replace(' ', '').replace(',', '.'))
                except:
                    price = 0

                # Очистка количества
                try:
                    qty = int(float(qty_str.replace(' ', '').replace(',', '.')))
                except:
                    qty = 0

                # Генерируем slug (id)
                pid = f"p_{random.randint(10000, 99999)}"
                if code: pid = code  # Если есть артикул, используем его как ID

                # Простейшая обработка категорий (сохраняем строку,
                # в идеале нужно создавать категорию в таблице categories)
                category = "general"
                # Можно дописать логику поиска category_id по названию cat_name

                # Вставляем или Обновляем (UPSERT)
                # Если товар с таким ID (code) уже есть -> обновим цену и остаток
                cursor.execute("SELECT id FROM products WHERE id = ?", (pid,))
                exists = cursor.fetchone()

                if exists:
                    cursor.execute("""
                        UPDATE products SET 
                        price=?, quantity=?, title_ru=?, description_ru=?, image=?
                        WHERE id=?
                    """, (price, qty, title, desc, image, pid))
                else:
                    cursor.execute("""
                        INSERT INTO products (id, category, title_ru, price, image, description_ru, quantity, date)
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                    """, (pid, category, title, price, image, desc, qty, datetime.now()))

                count += 1

            conn.commit()

        return jsonify({"success": True, "message": f"Обработано {count} товаров"})

    except Exception as e:
        print(f"Import Error: {e}")
        return jsonify({"success": False, "error": str(e)})


# Не забудь, что в начале файла должно быть: import openpyxl

# Простая функция транслитерации для создания slug (ссылок)
def simple_slugify(text):
    if not text: return ""
    # Словарь замен
    translit = {
        'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo', 'ж': 'zh',
        'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm', 'н': 'n', 'о': 'o',
        'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'kh', 'ц': 'ts',
        'ч': 'ch', 'ш': 'sh', 'щ': 'sch', 'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu',
        'я': 'ya', 'і': 'i', 'ї': 'yi', 'є': 'ye', 'ґ': 'g', ' ': '-', '/': '-', '\\': '-'
    }
    text = text.lower()
    res = []
    for char in text:
        if char in translit:
            res.append(translit[char])
        elif char.isalnum() or char == '-':
            res.append(char)
    # Убираем лишние дефисы
    return re.sub(r'-+', '-', "".join(res)).strip('-')


@app.route('/api/admin/import_keepincrm_xlsx', methods=['POST'])
@role_required('manager', 'superadmin')
def admin_import_keepincrm_xlsx():
    if 'file' not in request.files: return jsonify({"success": False, "error": "Нет файла"})

    file = request.files['file']
    if not file: return jsonify({"success": False, "error": "Пустой файл"})

    try:
        wb = openpyxl.load_workbook(file, data_only=True)

        # Поиск листов
        sheet_products = None
        sheet_groups = None

        for name in wb.sheetnames:
            lower = name.lower()
            if any(x in lower for x in ["products", "товар", "export products"]):
                sheet_products = wb[name]
            if any(x in lower for x in ["groups", "груп", "export groups"]):
                sheet_groups = wb[name]

        if not sheet_products and len(wb.sheetnames) > 0: sheet_products = wb.worksheets[0]
        if not sheet_groups and len(wb.sheetnames) > 1: sheet_groups = wb.worksheets[1]

        if not sheet_products:
            return jsonify({"success": False, "error": "Не найден лист с товарами"})

        # === 1. ГРУППЫ ===
        crm_group_map = {}
        if sheet_groups:
            rows_g = list(sheet_groups.iter_rows(values_only=True))
            if rows_g and len(rows_g) > 0:
                # replace('\ufeff', '') убирает невидимые символы в начале
                headers_g = {str(h).replace('\ufeff', '').strip().lower(): i for i, h in enumerate(rows_g[0]) if
                             h is not None}

                def get_g(row, names):
                    for n in names:
                        key = n.lower()
                        if key in headers_g: return row[headers_g[key]]
                    return None

                with sqlite3.connect(DB_NAME) as conn:
                    cursor = conn.cursor()
                    for row in rows_g[1:]:
                        ext_id = get_g(row, ['Номер_групи', 'Номер_группы', 'GroupId', 'ID'])
                        if not ext_id: continue
                        ext_id = str(ext_id).strip()

                        title = get_g(row, ['Назва_групи', 'Название_группы', 'GroupName', 'Name'])
                        title = str(title).strip() if title else "Без названия"

                        title_ua = get_g(row, ['Назва_групи_укр', 'Название_группы_укр'])
                        title_ua = str(title_ua).strip() if title_ua else title

                        parent_ext_id = get_g(row, ['Номер_батьківської_групи', 'ParentId'])
                        parent_ext_id = str(parent_ext_id).strip() if parent_ext_id else None

                        slug = get_g(row, ['Ідентифікатор_групи', 'Slug'])
                        if not slug:
                            slug = simple_slugify(title)
                        else:
                            slug = str(slug).strip()

                        crm_group_map[ext_id] = slug

                        cursor.execute("SELECT id FROM categories WHERE slug = ?", (slug,))
                        if cursor.fetchone():
                            cursor.execute("UPDATE categories SET title_ru=?, title_ua=? WHERE slug=?",
                                           (title, title_ua, slug))
                        else:
                            parent_slug = crm_group_map.get(parent_ext_id)
                            cursor.execute(
                                "INSERT INTO categories (slug, parent_slug, title_ru, title_ua, position) VALUES (?, ?, ?, ?, 0)",
                                (slug, parent_slug, title, title_ua))
                    conn.commit()

        # === 2. ТОВАРЫ ===
        rows_p = list(sheet_products.iter_rows(values_only=True))
        if not rows_p: return jsonify({"success": False, "error": "Лист пуст"})

        # Чистим заголовки от мусора
        headers_p = {str(h).replace('\ufeff', '').strip().lower(): i for i, h in enumerate(rows_p[0]) if h is not None}

        def get_p(row, names):
            for n in names:
                key = n.lower().strip()
                if key in headers_p:
                    val = row[headers_p[key]]
                    if val is not None: return val
            return None

        updated_count = 0
        created_count = 0

        with sqlite3.connect(DB_NAME) as conn:
            cursor = conn.cursor()

            for idx, row in enumerate(rows_p[1:]):
                sku = get_p(row, ['Код_товару', 'Код товара', 'Артикул', 'Article', 'sku'])
                if not sku: continue
                sku = str(sku).strip()

                # Названия
                title_ru = str(get_p(row, ['Назва_позиції', 'Название_позиции', 'Title']) or "")
                title_ua = str(get_p(row, ['Назва_позиції_укр', 'Название_позиции_укр', 'Title_ua']) or title_ru)

                # Описания
                desc_ru = str(get_p(row, ['Опис', 'Описание', 'Description']) or "")
                desc_ua = str(get_p(row, ['Опис_укр', 'Описание_укр', 'Description_ua']) or desc_ru)

                # 1. Считываем "сырые" данные из файла (ищем по всем возможным названиям)
                raw_seo_t_ru = str(get_p(row, ['HTML_заголовок', 'SEO Title', 'html_заголовок']) or "").strip()
                raw_seo_t_ua = str(
                    get_p(row, ['HTML_заголовок_укр', 'SEO Title UA', 'html_заголовок_укр']) or "").strip()

                raw_seo_d_ru = str(get_p(row, ['HTML_описание', 'SEO Description', 'html_описание']) or "").strip()
                raw_seo_d_ua = str(
                    get_p(row, ['HTML_описание_укр', 'SEO Description UA', 'html_описание_укр']) or "").strip()

                # 2. ПЕРЕКРЕСТНОЕ ЗАПОЛНЕНИЕ (Если одно пустое, берем у соседа)
                # Пример: Если нет RU заголовка, но есть UA -> копируем UA в RU
                if not raw_seo_t_ru and raw_seo_t_ua:
                    raw_seo_t_ru = raw_seo_t_ua
                if not raw_seo_t_ua and raw_seo_t_ru:
                    raw_seo_t_ua = raw_seo_t_ru

                # То же самое для описания
                if not raw_seo_d_ru and raw_seo_d_ua:
                    raw_seo_d_ru = raw_seo_d_ua
                if not raw_seo_d_ua and raw_seo_d_ru:
                    raw_seo_d_ua = raw_seo_d_ru

                # 3. ФИНАЛЬНАЯ ПОДСТРАХОВКА (Если всё равно пусто — берем название товара)
                # Заполняем переменную seo_title (для базы)
                if raw_seo_t_ru:
                    seo_title = raw_seo_t_ru
                else:
                    seo_title = title_ru  # Совсем пусто -> берем имя товара

                # Заполняем переменную seo_title_ua (для базы)
                if raw_seo_t_ua:
                    seo_title_ua = raw_seo_t_ua
                else:
                    # Если есть укр название - берем его, если нет - ру название
                    seo_title_ua = title_ua if title_ua else title_ru

                # Описания просто присваиваем (тут названием товара заменять не надо)
                seo_desc = raw_seo_d_ru
                seo_desc_ua = raw_seo_d_ua

                # Цена и кол-во
                try:
                    price = float(str(get_p(row, ['Ціна', 'Цена', 'Price'])).replace(',', '.').replace(' ', ''))
                except:
                    price = 0.0

                try:
                    qty = int(float(
                        str(get_p(row, ['Кількість', 'Количество', 'Залишок', 'Остаток'])).replace(',', '.').replace(
                            ' ', '')))
                except:
                    qty = 0

                stock_status = str(get_p(row, ['Наявність', 'Наличие', 'Stock']) or "").lower()
                is_available = stock_status in ['+', '!', 'true', 'yes', 'есть', 'в наличии']
                in_stock = 1 if (qty > 0 or is_available) else 0

                # Единицы
                unit_raw = str(get_p(row, ['Одиниця_виміру', 'Единица измерения', 'Unit']) or "").lower()
                unit_type = 'set' if any(x in unit_raw for x in ['комплект', 'набір', 'set']) else 'pcs'

                # Категория
                cat_slug = "general"
                group_id = str(get_p(row, ['Номер_групи', 'Номер_группы', 'GroupId']) or "").strip()
                if group_id in crm_group_map:
                    cat_slug = crm_group_map[group_id]

                # Картинки
                image_url = get_p(row, ['Посилання_зображення', 'Ссылка_изображения', 'Ссылка_на_изображение', 'Image'])
                images = []
                if image_url:
                    images = [p.strip() for p in str(image_url).replace(';', ',').split(',') if p.strip()]
                images_json = json.dumps(images)

                cursor.execute("SELECT id FROM products WHERE sku = ?", (sku,))
                if cursor.fetchone():
                    cursor.execute("""
                        UPDATE products SET 
                        title_ru=?, title_ua=?, description_ru=?, description_ua=?,
                        price=?, quantity=?, qty_stock=?, in_stock=?, images_json=?, category=?,
                        unit_type=?, 
                        seo_title=?, seo_description=?,
                        seo_title_ua=?, seo_description_ua=?
                        WHERE sku=?
                    """, (
                    title_ru, title_ua, desc_ru, desc_ua, price, qty, qty, in_stock, images_json, cat_slug, unit_type,
                    seo_title, seo_desc, seo_title_ua, seo_desc_ua, sku))
                    updated_count += 1
                else:
                    cursor.execute("""
                        INSERT INTO products (
                            sku, title_ru, title_ua, description_ru, description_ua, 
                            price, quantity, qty_stock, in_stock, images_json, 
                            category, unit_type, created_at, on_index, is_visible,
                            seo_title, seo_description, seo_title_ua, seo_description_ua
                        )
                        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?, ?)
                    """, (sku, title_ru, title_ua, desc_ru, desc_ua, price, qty, qty, in_stock, images_json, cat_slug,
                          unit_type, datetime.now(),
                          seo_title, seo_desc, seo_title_ua, seo_desc_ua))
                    created_count += 1

            conn.commit()

        return jsonify(
            {"success": True, "message": f"Импорт завершен!\nОбновлено: {updated_count}\nСоздано: {created_count}"})

    except Exception as e:
        return jsonify({"success": False, "error": f"Ошибка: {str(e)}"})


# === СПЕЦИАЛЬНАЯ КОМАНДА: УБРАТЬ ВСЁ С ВИТРИНЫ ===
@app.route('/api/admin/reset_vitrine')
@role_required('superadmin')
def reset_vitrine_all():
    with sqlite3.connect(DB_NAME) as conn:
        # Ставим 0 (выкл) для всех товаров
        conn.execute("UPDATE products SET on_index = 0")
        conn.commit()

    return "✅ Готово! Со всех товаров снята галочка 'На витрине'. Теперь добавь вручную только нужные."


@app.route('/api/admin/sync_keepincrm', methods=['POST'])
@role_required('manager', 'superadmin')
def admin_sync_keepincrm():
    api_token = get_setting('crm_api_key')
    office_id = "40620"

    if not api_token:
        return jsonify({"success": False, "error": "API ключ не найден"})

    headers = {'X-Auth-Token': api_token.strip(), 'Accept': 'application/json'}

    updated_count = 0
    total_crm_items = 0
    page = 1

    try:
        with sqlite3.connect(DB_NAME) as conn:
            cursor = conn.cursor()

            while True:
                url = f"https://api.keepincrm.com/v1/materials?per_page=50&page={page}&office_id={office_id}"
                r = requests.get(url, headers=headers, timeout=15)

                if r.status_code != 200:
                    break

                data = r.json()
                items = data.get('items') or []

                if not items:
                    break

                for item in items:
                    total_crm_items += 1
                    crm_sku = str(item.get('sku', '')).strip()
                    if not crm_sku:
                        continue

                    new_price = item.get('price_amount') or 0
                    new_stock = item.get('stock_available') or 0

                    # Логика определения типа единицы измерения
                    crm_unit = str(item.get('unit', '')).lower().strip()
                    # Если в CRM написано "комплект", "набір" или "set" — ставим 'set', иначе 'pcs'
                    new_unit_type = 'set' if any(x in crm_unit for x in ['комплект', 'набір', 'set']) else 'pcs'

                    stock_status = 1 if float(new_stock) > 0 else 0

                    # Обновляем цену, остатки и тип единицы измерения (unit_type)
                    cursor.execute("""
                        UPDATE products 
                        SET price = ?, quantity = ?, qty_stock = ?, in_stock = ?, unit_type = ?
                        WHERE sku = ? OR sku = ?
                    """, (new_price, new_stock, new_stock, stock_status, new_unit_type, crm_sku, crm_sku.lstrip('0')))

                    if cursor.rowcount > 0:
                        updated_count += 1

                page += 1

            conn.commit()

        return jsonify({
            "success": True,
            "message": f"Синхронизация завершена!\nОбновлено: {updated_count}\nПроверено в CRM: {total_crm_items}"
        })

    except Exception as e:
        return jsonify({"success": False, "error": f"Ошибка: {str(e)}"})


@app.route('/api/webhooks/keepincrm', methods=['POST'])
def keepincrm_webhook():
    data = request.json
    if not data:
        return jsonify({"success": False, "error": "No data"}), 400

    print(f"[*] Получен вебхук из CRM: {data}")

    # Проверка источника (игнорируем чужие заказы)
    incoming_source = str(data.get('source') or data.get('source_id') or "")
    if incoming_source not in ['7', '311362']:
        return jsonify({"success": True, "message": f"Ignored: source {incoming_source}"}), 200

    crm_id = data.get('deal_id') or data.get('id')
    order_id = data.get('order_id')
    incoming_products = data.get('products', [])

    # Обработка ТТН
    raw_ttn = data.get('ttn') or data.get('delivery_ttn')
    new_ttn = str(raw_ttn[0] if isinstance(raw_ttn, list) and raw_ttn else raw_ttn or "").strip()

    try:
        with sqlite3.connect(DB_NAME) as conn:
            conn.row_factory = sqlite3.Row  # Для удобного обращения к полям
            cursor = conn.cursor()

            # Поиск заказа в локальной БД
            if not order_id and crm_id:
                cursor.execute("SELECT id FROM orders WHERE crm_id = ?", (crm_id,))
                row = cursor.fetchone()
                if row: order_id = row['id']

            if not order_id:
                return jsonify({"success": False, "error": "Order ID not found"}), 404

            # --- 1. ЛОГИКА ТОВАРОВ И ИНВЕНТАРИЗАЦИИ ---
            cursor.execute("SELECT items_json FROM orders WHERE id = ?", (order_id,))
            order_row = cursor.fetchone()

            # В базе сайта товары обычно хранятся с ID и SKU
            old_items_list = json.loads(order_row['items_json']) if order_row and order_row['items_json'] else []

            # Создаем карту текущего заказа: {sku: {qty, id, price, title}}
            # Используем SKU как ключ, так как CRM присылает SKU
            local_items_map = {str(item.get('sku')): item for item in old_items_list if item.get('sku')}

            new_items_for_json = []
            processed_skus = set()

            for p in incoming_products:
                sku = str(p.get('sku', '')).strip()
                if not sku: continue

                new_qty = int(float(p.get('amount', 0)))
                # Ищем товар в старом составе заказа по SKU
                old_item_data = local_items_map.get(sku, {})
                old_qty = int(old_item_data.get('qty', 0))

                diff = new_qty - old_qty

                if diff != 0:
                    # Обновляем обе колонки остатков: quantity и qty_stock
                    cursor.execute("""
                        UPDATE products 
                        SET qty_stock = MAX(0, qty_stock - ?), 
                            quantity = MAX(0, quantity - ?),
                            in_stock = CASE WHEN (quantity - ?) <= 0 THEN 0 ELSE 1 END
                        WHERE sku = ?
                    """, (diff, diff, diff, sku))

                    # Логируем изменение в историю заказа
                    log_ru = f"Обновлено кол-во SKU {sku} (CRM): {old_qty} -> {new_qty}"
                    log_ua = f"Оновлено к-сть SKU {sku} (CRM): {old_qty} -> {new_qty}"
                    cursor.execute(
                        "INSERT INTO order_logs (order_id, message_ru, message_ua, created_at) VALUES (?, ?, ?, ?)",
                        (order_id, log_ru, log_ua, datetime.now().strftime("%Y-%m-%d %H:%M:%S")))

                # Формируем новый объект товара.
                # Если товара не было в заказе раньше, пытаемся подтянуть его ID и цену из таблицы products
                if not old_item_data:
                    cursor.execute("SELECT id, price, title_ru FROM products WHERE sku = ?", (sku,))
                    p_info = cursor.fetchone()
                    item_to_save = {
                        "id": p_info['id'] if p_info else 0,
                        "sku": sku,
                        "qty": new_qty,
                        "price": p_info['price'] if p_info else 0,
                        "title": p_info['title_ru'] if p_info else f"SKU: {sku}"
                    }
                else:
                    item_to_save = old_item_data.copy()
                    item_to_save['qty'] = new_qty

                new_items_for_json.append(item_to_save)
                processed_skus.add(sku)

            # Проверка удаленных товаров (были в заказе, но пропали в CRM)
            for sku, old_item in local_items_map.items():
                if sku not in processed_skus:
                    return_qty = int(old_item.get('qty', 0))
                    cursor.execute(
                        "UPDATE products SET qty_stock = qty_stock + ?, quantity = quantity + ?, in_stock = 1 WHERE sku = ?",
                        (return_qty, return_qty, sku))

                    log_msg = f"Товар SKU {sku} удален из заказа в CRM. Возвращено на склад: {return_qty}"
                    cursor.execute(
                        "INSERT INTO order_logs (order_id, message_ru, message_ua, created_at) VALUES (?, ?, ?, ?)",
                        (order_id, log_msg, log_msg, datetime.now().strftime("%Y-%m-%d %H:%M:%S")))

            # Сохраняем обновленный JSON и пересчитываем общую сумму заказа
            total_price = sum(float(i.get('price', 0)) * int(i.get('qty', 0)) for i in new_items_for_json)
            cursor.execute("UPDATE orders SET items_json = ?, total_price = ? WHERE id = ?",
                           (json.dumps(new_items_for_json), total_price, order_id))

            # --- 2. ЛОГИКА ТТН ---
            if new_ttn:
                cursor.execute("SELECT ttn FROM orders WHERE id = ?", (order_id,))
                db_ttn = cursor.fetchone()
                if db_ttn and str(db_ttn['ttn']) != new_ttn:
                    cursor.execute("UPDATE orders SET ttn = ? WHERE id = ?", (new_ttn, order_id))
                    cursor.execute(
                        "INSERT INTO order_logs (order_id, message_ru, message_ua, created_at) VALUES (?, ?, ?, ?)",
                        (order_id, f"Добавлен ТТН: {new_ttn}", f"Додано ТТН: {new_ttn}",
                         datetime.now().strftime("%Y-%m-%d %H:%M:%S")))

            # --- 3. ЛОГИКА СТАТУСА ---
            status_text = data.get('new_status')
            if status_text:
                for sid, names in CRM_STAGE_MAP.items():  #
                    if names['ua'] == status_text or names['ru'] == status_text:
                        cursor.execute("SELECT status FROM orders WHERE id = ?", (order_id,))
                        curr_status = cursor.fetchone()
                        if curr_status and curr_status['status'] != names['ru']:
                            cursor.execute("UPDATE orders SET status = ?, status_ua = ? WHERE id = ?",
                                           (names['ru'], names['ua'], order_id))
                            cursor.execute(
                                "INSERT INTO order_logs (order_id, message_ru, message_ua, created_at) VALUES (?, ?, ?, ?)",
                                (order_id, f"Статус: {names['ru']}", f"Статус: {names['ua']}",
                                 datetime.now().strftime("%Y-%m-%d %H:%M:%S")))

                            if sid == 7:  # Оплачено
                                cursor.execute("UPDATE orders SET payment_status = 'Оплачено' WHERE id = ?",
                                               (order_id,))
                        break

            conn.commit()
            return jsonify({"success": True}), 200

    except Exception as e:
        print(f"[-] Ошибка вебхука: {e}")
        return jsonify({"success": False, "error": str(e)}), 500


@app.route('/api/admin/order/update_item', methods=['POST'])
@role_required('manager', 'superadmin')
def admin_update_order_item():
    data = request.json
    order_id = data.get('order_id')
    product_id = int(data.get('product_id'))
    new_qty = int(data.get('qty'))

    if new_qty < 1:
        return jsonify({"success": False, "error": "Количество не может быть меньше 1"})

    with sqlite3.connect(DB_NAME) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # 1. Получаем текущие данные заказа
        cursor.execute("SELECT items_json, total_price FROM orders WHERE id=?", (order_id,))
        row = cursor.fetchone()
        if not row:
            return jsonify({"success": False, "error": "Order not found"})

        items = json.loads(row['items_json'])
        total_price = 0
        old_qty = 0
        product_title = ""
        found = False

        # 2. Обновляем количество у конкретного товара и считаем новую сумму
        for item in items:
            if int(item.get('id')) == product_id:
                old_qty = int(item.get('qty', 0))
                item['qty'] = new_qty
                product_title = item.get('title', 'Товар')
                found = True
            total_price += float(item.get('price', 0)) * int(item.get('qty', 0))

        if not found:
            return jsonify({"success": False, "error": "Product not found in order"})

        # 3. Сохраняем обновленный заказ
        cursor.execute("UPDATE orders SET items_json=?, total_price=? WHERE id=?",
                       (json.dumps(items), total_price, order_id))

        # 4. Логируем изменение для профиля клиента
        log_ru = f"Изменено кол-во '{product_title}': {old_qty} -> {new_qty}"
        log_ua = f"Змінено к-сть '{product_title}': {old_qty} -> {new_qty}"
        cursor.execute("INSERT INTO order_logs (order_id, message_ru, message_ua, created_at) VALUES (?, ?, ?, ?)",
                       (order_id, log_ru, log_ua, datetime.now().strftime("%Y-%m-%d %H:%M:%S")))

        # 5. (Опционально) Корректируем остаток на складе
        diff = new_qty - old_qty
        if diff != 0:
            cursor.execute("UPDATE products SET qty_stock = qty_stock - ?, quantity = quantity - ? WHERE id = ?",
                           (diff, diff, product_id))

        conn.commit()
    return jsonify({"success": True})

@app.route('/api/liqpay/generate', methods=['POST'])
def liqpay_generate():
    data_req = request.json
    order_id = data_req.get('order_id')

    # Пробуем достать ключи по имени из init_db или по ID из settings.html
    LIQPAY_PUBLIC_KEY = get_setting('privatbank_merchant_id') or get_setting('pb_id')
    LIQPAY_PRIVATE_KEY = get_setting('privatbank_password') or get_setting('pb_pass')

    if not LIQPAY_PUBLIC_KEY or not LIQPAY_PRIVATE_KEY:
        return jsonify({"success": False, "error": "Ключи LiqPay не настроены в базе данных"})

    try:
        with sqlite3.connect(DB_NAME) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT total_price FROM orders WHERE id = ?", (order_id,))
            row = cursor.fetchone()

        if not row:
            return jsonify({"success": False, "error": "Заказ не найден"})

        total_price = row[0]

        # 1. Формируем JSON с параметрами платежа
        liqpay_params = {
            "public_key": LIQPAY_PUBLIC_KEY,
            "version": 3,
            "action": "pay",
            "amount": float(total_price),
            "currency": "UAH",
            "description": f"Оплата заказа №{order_id}",
            "order_id": str(order_id),
            "language": "ru",
            "server_url": "https://radio-box.com.ua/api/liqpay/callback"
        }

        # Выводим в консоль сервера для проверки (поможет понять, есть ли ключ)
        print("LIQPAY PARAMS TO ENCODE:", json.dumps(liqpay_params))

        # 2. Кодируем параметры в base64
        json_bytes = json.dumps(liqpay_params).encode('utf-8')
        data_str = base64.b64encode(json_bytes).decode('utf-8')

        # 3. Создаем подпись (signature)
        sign_str = LIQPAY_PRIVATE_KEY + data_str + LIQPAY_PRIVATE_KEY
        signature = base64.b64encode(hashlib.sha1(sign_str.encode('utf-8')).digest()).decode('utf-8')

        return jsonify({"success": True, "data": data_str, "signature": signature})

    except Exception as e:
        return jsonify({"success": False, "error": str(e)})


@app.route('/api/liqpay/callback', methods=['POST'])
def liqpay_callback():
    # 1. Получаем зашифрованные данные и подпись от серверов LiqPay
    incoming_data = request.form.get('data')
    incoming_signature = request.form.get('signature')

    if not incoming_data or not incoming_signature:
        print("[-] Критично: Callback от LiqPay не содержит data или signature")
        return "Missing data or signature", 400

    # 2. Получаем секретный приватный ключ из настроек базы данных
    LIQPAY_PRIVATE_KEY = get_setting('privatbank_password') or get_setting('pb_pass')
    if not LIQPAY_PRIVATE_KEY:
        print("[-] Критично: Приватный ключ LiqPay не найден в настройках БД")
        return "Server configuration error", 500

    # 3. Валидация подписи (Проверяем, что запрос пришел именно от LiqPay)
    # Формула LiqPay: base64(sha1(private_key + data + private_key))
    sign_str = LIQPAY_PRIVATE_KEY + incoming_data + LIQPAY_PRIVATE_KEY
    expected_signature = base64.b64encode(hashlib.sha1(sign_str.encode('utf-8')).digest()).decode('utf-8')

    if incoming_signature != expected_signature:
        print("[-] Предупреждение: Невалидная подпись в callback LiqPay!")
        return "Invalid signature", 400

    try:
        # 4. Расшифровываем payload
        decoded_bytes = base64.b64decode(incoming_data)
        payment_info = json.loads(decoded_bytes.decode('utf-8'))

        status = payment_info.get('status')
        order_id = payment_info.get('order_id')

        print(f"[*] Callback обработан для заказа №{order_id}. Статус платежа: {status}")

        # 5. Проверяем успешность платежа
        # success - успешная оплата, wait_secure - платеж на проверке в банке (тоже обрабатываем как успех)
        # sandbox - для тестового режима (если будете тестировать)
        if status in ['success', 'wait_secure', 'sandbox']:
            with sqlite3.connect(DB_NAME) as conn:
                cursor = conn.cursor()

                # Проверяем текущий статус оплаты заказа в базе, чтобы не дублировать логи
                cursor.execute("SELECT payment_status, crm_id FROM orders WHERE id = ?", (order_id,))
                order_row = cursor.fetchone()

                if order_row and order_row[0] != 'Оплачено':
                    crm_id = order_row[1]

                    # Обновляем статусы локально
                    cursor.execute(
                        "UPDATE orders SET payment_status = 'paid', status = 'Оплаченный', status_ua = 'Оплачено' WHERE id = ?",
                        (order_id,)
                    )

                    # Фиксируем операцию в логах заказа
                    log_msg = f"Оплата успешно подтверждена сервером LiqPay (Статус: {status})"
                    cursor.execute(
                        "INSERT INTO order_logs (order_id, message_ru, message_ua, created_at) VALUES (?, ?, ?, ?)",
                        (order_id, log_msg, log_msg, datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
                    )
                    conn.commit()

                    # 6. Синхронизация статуса с KeepinCRM (перевод на этап 8 - "Оплачено")
                    if crm_id:
                        api_token = get_setting('crm_api_key')
                        if api_token:
                            url = f'https://api.keepincrm.com/v1/agreements/{crm_id}'
                            headers = {
                                'X-Auth-Token': api_token.strip(),
                                'Content-Type': 'application/json'
                            }
                            payload = {'stage_id': 8}  # Этап "Оплачено"
                            try:
                                requests.patch(url, json=payload, headers=headers, timeout=10)
                                print(f"[+] Статус сделки {crm_id} в KeepinCRM успешно обновлен на этап Оплачено")
                            except Exception as crm_err:
                                print(f"[-] Ошибка отправки статуса в CRM: {crm_err}")

        # Возвращаем LiqPay статус 200 OK, чтобы он знал, что уведомление доставлено успешно
        return "OK", 200

    except Exception as e:
        print(f"[-] Ошибка внутри liqpay_callback: {e}")
        return "Internal server error", 500

@app.route('/superadmin')
@role_required('superadmin')
def superadmin_main_page():
    return send_from_directory('superadmin', 'superadmin.html')

@app.route('/superadmin/login')
def superadmin_login_page():
    return send_from_directory('superadmin', 'login.html')

# 1. Получение всех пользователей для таблицы
@app.route('/api/superadmin/users', methods=['GET'])
@role_required('superadmin')
def superadmin_get_users():
    search = request.args.get('search', '').strip()
    query = "SELECT id, name, surname, email, phone, role FROM users"
    params = []

    if search:
        query += " WHERE email LIKE ? OR name LIKE ? OR surname LIKE ?"
        term = f"%{search}%"
        params = [term, term, term]

    try:
        with sqlite3.connect(DB_NAME) as conn:
            conn.row_factory = sqlite3.Row
            cursor = conn.cursor()
            rows = cursor.execute(query, params).fetchall()
            users_list = [dict(row) for row in rows]
            return jsonify({"success": True, "users": users_list})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})


# 2. Сохранение изменений (или создание нового)
@app.route('/api/superadmin/user/save', methods=['POST'])
@role_required('superadmin')
def superadmin_save_user():
    data = request.json
    user_id = data.get('id')
    name = data.get('name')
    surname = data.get('surname')
    email = data.get('email')
    phone = data.get('phone')
    role = data.get('role')  # 'client', 'manager', 'superadmin'
    new_password = data.get('password')

    try:
        with sqlite3.connect(DB_NAME) as conn:
            cursor = conn.cursor()
            if user_id:
                # Обновляем существующего
                if new_password and len(new_password.strip()) > 0:
                    pw_hash = generate_password_hash(new_password)
                    cursor.execute('''
                        UPDATE users SET name=?, surname=?, email=?, phone=?, role=?, password=?
                        WHERE id=?
                    ''', (name, surname, email, phone, role, pw_hash, user_id))
                else:
                    cursor.execute('''
                        UPDATE users SET name=?, surname=?, email=?, phone=?, role=?
                        WHERE id=?
                    ''', (name, surname, email, phone, role, user_id))
            else:
                # Создаем нового пользователя
                pw_hash = generate_password_hash(new_password or "123456")
                cursor.execute('''
                    INSERT INTO users (name, surname, email, phone, role, password)
                    VALUES (?, ?, ?, ?, ?, ?)
                ''', (name, surname, email, phone, role, pw_hash))

            conn.commit()
            return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})


# 3. Удаление аккаунта
@app.route('/api/superadmin/user/delete', methods=['POST'])
@role_required('superadmin')
def superadmin_delete_user():
    user_id = request.json.get('id')

    # Защита от удаления самого себя
    if 'user_id' in session and int(user_id) == int(session['user_id']):
        return jsonify({"success": False, "error": "Вы не можете удалить свою собственную учетную запись!"})

    try:
        with sqlite3.connect(DB_NAME) as conn:
            conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
            conn.commit()
            return jsonify({"success": True})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})

@app.route('/api/user/status')
def get_user_status():
    if 'user_id' in session:
        return jsonify({
            "is_logged_in": True,
            "user": {
                "id": session.get('user_id'),
                "email": session.get('email'),
                "role": session.get('role')
            }
        })
    return jsonify({"is_logged_in": False})


@app.route('/api/public/contacts', methods=['GET'])
def get_public_contacts():
    phones_json = get_setting('site_phones')
    # Достаем адреса из базы (или ставим значения по умолчанию)
    address_ru = get_setting('site_address_ru') or "г. Шостка, Украина"
    address_ua = get_setting('site_address_ua') or "м. Шостка, Україна"

    try:
        phones = json.loads(phones_json) if phones_json else []
    except:
        phones = []

    return jsonify({
        "success": True,
        "phones": phones,
        "address_ru": address_ru,
        "address_ua": address_ua
    })

init_db()

if __name__ == '__main__':
    print("Сервер запущен. Админка: http://127.0.0.1:5000/admin")

    # Читаем режим отладки из .env. Если там True - будет True, иначе False.
    is_debug = os.getenv("FLASK_DEBUG", "False").lower() in ("true", "1", "t")
    app.run(debug=is_debug, port=5000)