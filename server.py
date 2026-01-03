import sqlite3
import random
import smtplib
import json
import shutil
import os
from werkzeug.utils import secure_filename
from datetime import datetime, timedelta
from email.mime.text import MIMEText
from functools import wraps
from flask import Flask, request, jsonify, send_from_directory, session, redirect, render_template_string, url_for
from werkzeug.security import generate_password_hash, check_password_hash
from flask_login import current_user

app = Flask(__name__, static_folder='.', static_url_path='')

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

def fix_layout(text):
    """Меняет английские буквы на русские/украинские по раскладке"""
    return "".join([ENG_TO_RUS_MAP.get(char, char) for char in text])

# ==================================================
# НАСТРОЙКИ ПОЧТЫ (ЗАПОЛНИ ЗАНОВО!)
# ==================================================
SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587
EMAIL_SENDER = "oleshchenko.nikita@gmail.com"
EMAIL_PASSWORD = "test"
# ==================================================

DB_NAME = "radiobox.db"
app.secret_key = 'super_secret_key_radiobox_123'

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

        # 1. Пользователи
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                surname TEXT NOT NULL,
                email TEXT UNIQUE NOT NULL,
                phone TEXT,
                password TEXT NOT NULL
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

        # 3. Админы
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS admins (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                login TEXT UNIQUE NOT NULL,
                password TEXT NOT NULL
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
                is_visible INTEGER DEFAULT 1
            )
        ''')

        # === ВАЖНЫЕ МИГРАЦИИ ===
        # Этот блок спасет твою админку. Он добавляет колонки в старую таблицу orders.
        columns_to_add = [
            ("orders", "ttn", "TEXT DEFAULT ''"),
            ("orders", "comment", "TEXT DEFAULT ''"),
            ("orders", "delivery_address", "TEXT DEFAULT ''"),
            ("orders", "delivery_method", "TEXT DEFAULT ''"),
            ("orders", "payment_method", "TEXT DEFAULT ''"),
            ("orders", "payment_status", "TEXT DEFAULT 'unpaid'")
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
            ("products", "on_index", "INTEGER DEFAULT 0"),
            ("products", "is_visible", "INTEGER DEFAULT 1"),
            ("products", "deleted_at", "TEXT"),
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

            # 5. ЗАПОЛНЕНИЕ КАТЕГОРИЙ (Только если таблица пустая)
            cursor.execute("SELECT count(*) FROM categories")
            if cursor.fetchone()[0] == 0:
                print("📦 База категорий пуста. Загружаем стандартные...")
                default_cats = [
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
                for idx, (slug, ru, ua) in enumerate(default_cats):
                    cursor.execute("INSERT INTO categories (slug, title_ru, title_ua, position) VALUES (?, ?, ?, ?)",
                                   (slug, ru, ua, idx))

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
def admin_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'admin_logged_in' not in session:
            return redirect('/admin/login')
        return f(*args, **kwargs)
    return decorated_function

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

    try:
        with sqlite3.connect(DB_NAME) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO users (name, surname, email, phone, password)
                VALUES (?, ?, ?, ?, ?)
            ''', (data['name'], data['surname'], data['email'], data['phone'], hashed_pw))
            conn.commit()
            user_id = cursor.lastrowid
            # ОБНОВЛЕНИЕ: Возвращаем также phone и email
            return jsonify({
                "success": True,
                "user": {
                    "id": user_id,
                    "name": data['name'],
                    "surname": data['surname'],
                    "phone": data['phone'],
                    "email": data['email']
                }
            })
    except sqlite3.IntegrityError:
        return jsonify({"success": False, "error": "Пользователь с таким Email уже существует!"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})


@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    with sqlite3.connect(DB_NAME) as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT id, name, surname, password, phone, email FROM users WHERE email = ?', (data['email'],))
        user = cursor.fetchone()

        if user and check_password_hash(user[3], data['password']):
            # === ГЛАВНОЕ ИСПРАВЛЕНИЕ ===
            # Сохраняем email в сессию, чтобы видеть его в create_order
            session['email'] = user[5]
            session.permanent = True  # (Опционально) чтобы сессия жила долго
            # ===========================

            return jsonify({
                "success": True,
                "user": {
                    "id": user[0],
                    "name": user[1],
                    "surname": user[2],
                    "phone": user[4],
                    "email": user[5]
                }
            })
        else:
            return jsonify({"success": False, "error": "Неверный Email или пароль"})


# ОТПРАВКА КОДА (ТОЛЬКО EMAIL)
@app.route('/api/recover/send-code', methods=['POST'])
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
def get_user_orders():
    if 'email' not in session:
        return jsonify({"success": False, "error": "Не авторизован"}), 401

    email = session['email']

    with sqlite3.connect(DB_NAME) as conn:
        conn.row_factory = sqlite3.Row
        cursor = conn.cursor()

        # 1. Сначала загружаем карту картинок товаров (id -> картинка)
        cursor.execute("SELECT id, sku, images_json FROM products")
        products_map = {}
        for p in cursor.fetchall():
            try:
                imgs = json.loads(p['images_json'])
                # Берем первую картинку или None
                image = imgs[0] if imgs else None
            except:
                image = None
            products_map[p['id']] = image

        # 2. Загружаем заказы
        cursor.execute('''
            SELECT id, created_at, status, total_price, items_json, 
                   delivery_method, payment_method, payment_status 
            FROM orders 
            WHERE user_email = ? 
            ORDER BY created_at DESC
        ''', (email,))

        rows = cursor.fetchall()
        orders = []
        for row in rows:
            # Разбираем товары заказа
            items = []
            if row["items_json"]:
                try:
                    raw_items = json.loads(row["items_json"])
                    for item in raw_items:
                        # Подставляем актуальную картинку из базы товаров
                        prod_id = int(item.get('id', 0))

                        # Если в базе товаров есть картинка для этого ID — берем её
                        if prod_id in products_map and products_map[prod_id]:
                            item['image'] = products_map[prod_id]

                        items.append(item)
                except:
                    items = []

            orders.append({
                "id": row["id"],
                "created_at": row["created_at"],
                "status": row["status"],
                "total_price": row["total_price"],
                "items": items,
                "delivery": row["delivery_method"],
                "payment_method": row["payment_method"],
                "payment_status": row["payment_status"]
            })

    return jsonify({"success": True, "orders": orders})

@app.route('/create_order', methods=['POST'])
def create_order():
    # 1. Получаем данные
    phone = request.form.get('phone')
    name = request.form.get('name')
    surname = request.form.get('surname')
    pay_status = request.form.get('payment_status', 'unpaid')
    address = request.form.get('full_address')
    cart_json = request.form.get('cart_json')
    payment_method = request.form.get('payment')
    comment = request.form.get('comment')

    # 2. Генерируем 9-значный номер
    order_id = random.randint(100000000, 999999999)

    # 3. Проверяем Email
    user_email = session.get('email')

    # 4. Сохраняем в БД
    # Считаем сумму заказа из JSON (если там есть цены)
    total_sum = 0
    try:
        items = json.loads(cart_json)
        for item in items:
            # Если фронтенд передал цену, используем её
            price = float(item.get('price', 0))
            qty = int(item.get('qty', 0))
            total_sum += price * qty
    except:
        total_sum = 0

    try:
        with sqlite3.connect(DB_NAME) as conn:
            cursor = conn.cursor()
            # ОБНОВЛЕННЫЙ ЗАПРОС INSERT (Добавлено payment_status)

            initial_status = "Оплаченный" if pay_status == 'paid' else "Новый"

            cursor.execute('''
                                    INSERT INTO orders (
                                        id, 
                                        user_name, user_surname, user_phone, user_email,
                                        delivery_address, payment_method, payment_status, 
                                        comment, items_json, 
                                        created_at, status, total_price, ttn
                                    )
                                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                                ''', (
                order_id,
                name, surname, phone, user_email,
                address, payment_method, pay_status,
                comment, cart_json,
                datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
                initial_status,  # <--- БЫЛО "Новый", СТАЛО initial_status
                total_sum,
                ""  # ttn (пустой при создании)
            ))
            conn.commit()

    except sqlite3.IntegrityError:
        print("Совпадение номеров, рекурсия...")
        return create_order()
    except Exception as e:
        print(f"Ошибка БД: {e}")
        return f"Ошибка при сохранении: {e}", 500

    # 5. Определяем язык и отправляем письмо (закомментировано, т.к. в СРМ есть отправка писем)
    # Смотрим, откуда пришел пользователь (оставил для логики после отправки письма)
    referer = request.referrer or ""
    is_ukrainian = '/ua/' in referer

#     if user_email:
#         if is_ukrainian:
#             # === УКРАИНСКАЯ ВЕРСИЯ ===
#             profile_link = "https://radiobox.in.ua/ua/profile.html"
#             subject = "Підтвердження вашого замовлення в RadioBox"
#             body = f"""Вітаємо, {name}!
#
# Замовлення прийнято! Номер замовлення: {order_id}
# Дякуємо Вам за інтерес до товарів radiobox.in.ua.
#
# Деталі замовлення ви можете переглянути за посиланням:
# {profile_link}
# """
#         else:
#             # === РУССКАЯ ВЕРСИЯ ===
#             profile_link = "https://radiobox.in.ua/ru/profile.html"
#             subject = "Подтверждение вашего заказа в RadioBox"
#             body = f"""Здравствуйте, {name}!
#
# Заказ принят! Номер заказа: {order_id}
# Благодарим Вас за интерес к товарам radiobox.in.ua.
#
# Детали заказа вы можете увидеть по ссылке:
# {profile_link}
# """
#
#         # Отправляем сформированное письмо
#         send_email_real(user_email, subject, body)

    # 6. Редирект на страницу успеха (с учетом языка)
    if is_ukrainian:
        return redirect(f'/ua/order-success.html?order_id={order_id}')
    else:
        return redirect(f'/ru/order-success.html?order_id={order_id}')

# === API: ОПЛАТА ЗАКАЗА (ОБНОВЛЕНИЕ СТАТУСА) ===
@app.route('/api/pay_order', methods=['POST'])
def pay_order_api():
    data = request.json
    order_id = data.get('order_id')

    if not order_id: return jsonify({"success": False, "error": "No ID"})

    try:
        with sqlite3.connect(DB_NAME) as conn:
            cursor = conn.cursor()
            # Обновляем И статус оплаты, И статус заказа
            cursor.execute("UPDATE orders SET payment_status = 'paid', status = 'Оплаченный' WHERE id = ?", (order_id,))
            conn.commit()
        return jsonify({"success": True})
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
        user_email = None
        user_name = "Покупатель"

        with sqlite3.connect(DB_NAME) as conn:
            cursor = conn.cursor()

            # 1. Сначала получаем Email и Имя из заказа, чтобы знать, куда слать письмо
            cursor.execute('SELECT user_email, user_name FROM orders WHERE id = ?', (order_id,))
            row = cursor.fetchone()

            if row:
                user_email = row[0]
                if row[1]:
                    user_name = row[1]

            # 2. Обновляем статус на "Отменен"
            cursor.execute('UPDATE orders SET status = ? WHERE id = ?', ("Отменен", order_id))
            conn.commit()

        # 3. Отправляем письмо об отмене (если нашли email)
#         if user_email:
#             # Пытаемся определить язык по Referer (откуда пришел запрос)
#             referer = request.referrer or ""
#             is_ukrainian = '/ua/' in referer
#
#             if is_ukrainian:
#                 subject = f"Скасування замовлення №{order_id}"
#                 body = f"""Вітаємо, {user_name}!
#
# Ваше замовлення скасовано.
# Номер замовлення: {order_id}
# """
#             else:
#                 # Текст, который вы просили
#                 subject = f"Отмена заказа №{order_id}"
#                 body = f"""Здравствуйте, {user_name}!
#
# Ваш заказ отменён.
# Номер заказа: {order_id}
# """
#
#             send_email_real(user_email, subject, body)

        return jsonify({"success": True})

    except Exception as e:
        print(f"Ошибка отмены: {e}")
        return jsonify({"success": False, "error": str(e)})


# === РОУТЫ АДМИНКИ ===

# 1. Корневой редирект (если зашли просто на /admin)
@app.route('/admin')
def admin_root():
    # Если залогинен -> на дашборд RU, иначе -> на логин RU
    if session.get('admin_logged_in'):
        return redirect('/admin/ru/dashboard')
    else:
        return redirect('/admin/ru/login')


# 2. Универсальный ВХОД (Логин)
@app.route('/admin/<lang>/login', methods=['GET', 'POST'])
def admin_login_lang(lang):
    # Защита: если язык не ru/ua, кидаем на ru
    if lang not in ['ru', 'ua']: return redirect('/admin/ru/login')

    error = None
    if request.method == 'POST':
        login = request.form.get('login')
        password = request.form.get('password')

        with sqlite3.connect(DB_NAME) as conn:
            cursor = conn.cursor()
            cursor.execute("SELECT password FROM admins WHERE login = ?", (login,))
            row = cursor.fetchone()

            if row and check_password_hash(row[0], password):
                session['admin_logged_in'] = True
                return redirect(f'/admin/{lang}/dashboard')
            else:
                error = "Невірний логін або пароль" if lang == 'ua' else "Неверный логин или пароль"

    # Открываем файл из папки admin/ru/ или admin/ua/
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
    session.pop('admin_logged_in', None)
    return redirect('/admin/ru/login')

# === АДМИНКА: СТРАНИЦЫ И API ===

# ДАШБОРД (с учетом языка)
@app.route('/admin/<lang>/dashboard')
def admin_dashboard(lang):
    if lang not in ['ru', 'ua']: return redirect('/admin/ru/dashboard')

    if not session.get('admin_logged_in'):
        return redirect(f'/admin/{lang}/login')

    try:
        with open(f'admin/{lang}/dashboard.html', 'r', encoding='utf-8') as f:
            return render_template_string(f.read())
    except FileNotFoundError:
        return f"Error: File admin/{lang}/dashboard.html not found!"


# === API: АДМИНКА - СПИСОК ЗАКАЗОВ С ФИЛЬТРАМИ ===
@app.route('/api/admin/orders', methods=['GET'])
def admin_get_orders():
    if not session.get('admin_logged_in'):
        return jsonify({"success": False, "error": "Auth required"}), 403

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

        # 4. Сначала загружаем словарь товаров (для фото)
        cursor.execute("SELECT id, sku, images_json FROM products")
        products_map = {}
        for p in cursor.fetchall():
            try:
                imgs = json.loads(p['images_json'])
                image = imgs[0] if imgs else None
            except:
                image = None
            products_map[p['id']] = {'sku': p['sku'], 'image': image}

        # 5. Выполняем главный запрос заказов
        cursor.execute(query, tuple(params))
        rows = cursor.fetchall()

        orders = []
        for row in rows:
            # Разбираем товары
            items = []
            if row["items_json"]:
                try:
                    raw_items = json.loads(row["items_json"])
                    for item in raw_items:
                        prod_id = int(item.get('id', 0))
                        prod_info = products_map.get(prod_id, {})
                        item['sku'] = prod_info.get('sku', '')
                        item['image'] = prod_info.get('image', '')
                        items.append(item)
                except:
                    pass

            orders.append({
                "id": row["id"],
                "name": f"{row['user_name']} {row['user_surname']}",
                "phone": row["user_phone"],
                "total": row["total_price"],
                "status": row["status"],
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
def admin_save_ttn():
    if not session.get('admin_logged_in'): return jsonify({"success": False}), 403
    data = request.json
    with sqlite3.connect(DB_NAME) as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE orders SET ttn = ? WHERE id = ?", (data['ttn'], data['id']))
        conn.commit()
    return jsonify({"success": True})

@app.route('/api/admin/order/status', methods=['POST'])
def admin_update_status():
    if not session.get('admin_logged_in'):
        return jsonify({"success": False, "error": "Auth required"}), 403

    data = request.json
    order_id = data.get('id')
    new_status = data.get('status')

    with sqlite3.connect(DB_NAME) as conn:
        cursor = conn.cursor()
        cursor.execute("UPDATE orders SET status = ? WHERE id = ?", (new_status, order_id))
        conn.commit()

    return jsonify({"success": True})


# === НАСТРОЙКИ ЗАГРУЗКИ ===
UPLOAD_FOLDER = 'assets/products'
ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'webp'}
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER


def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS


# === РОУТ: СТРАНИЦА ТОВАРОВ ===
@app.route('/admin/<lang>/products')
def admin_products(lang):
    if lang not in ['ru', 'ua']: return redirect('/admin/ru/products')

    if not session.get('admin_logged_in'):
        return redirect(f'/admin/{lang}/login')

    try:
        with open(f'admin/{lang}/products.html', 'r', encoding='utf-8') as f:
            return render_template_string(f.read())
    except FileNotFoundError:
        return f"Error: File admin/{lang}/products.html not found!"


# === API: СПИСОК ТОВАРОВ С ФИЛЬТРАМИ И СОРТИРОВКОЙ ===
@app.route('/api/admin/products', methods=['GET'])
def admin_get_products_api():
    if not session.get('admin_logged_in'): return jsonify({"success": False}), 403

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
        # Ищем совпадение ИЛИ в основной категории, ИЛИ в подкатегории
        query += " AND (category = ? OR subcategory = ?)"

        # Используем extend, чтобы добавить два значения в общий список
        params.extend([cat_filter, cat_filter])

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
def admin_save_product_api():
    if not session.get('admin_logged_in'): return jsonify({"success": False}), 403
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
    category = data.get('category')
    subcategory = data.get('subcategory', '')
    images = json.dumps(data.get('images', []))
    on_index = int(data.get('on_index', 0))

    # === НОВЫЕ SEO ПОЛЯ ===
    seo_title = data.get('seo_title', '')
    seo_desc = data.get('seo_description', '')

    with sqlite3.connect(DB_NAME) as conn:
        cursor = conn.cursor()
        if pid:
            # ОБНОВЛЕНИЕ
            cursor.execute('''
                UPDATE products SET 
                sku=?, title_ru=?, title_ua=?, description_ru=?, description_ua=?, 
                price=?, in_stock=?, category=?, subcategory=?, images_json=?, on_index=?,
                seo_title=?, seo_description=?
                WHERE id=?
            ''', (sku, title_ru, title_ua, desc_ru, desc_ua, price, in_stock, category, subcategory, images, on_index,
                  seo_title, seo_desc, pid))
        else:
            # СОЗДАНИЕ
            cursor.execute("SELECT MAX(position) FROM products WHERE category=?", (category,))
            res = cursor.fetchone()
            max_pos = res[0] if res and res[0] is not None else 0
            pos = max_pos + 1

            cursor.execute('''
                INSERT INTO products (sku, title_ru, title_ua, description_ru, description_ua, price, in_stock, category, subcategory, images_json, on_index, position, created_at, seo_title, seo_description)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
            sku, title_ru, title_ua, desc_ru, desc_ua, price, in_stock, category, subcategory, images, on_index, pos,
            created_at, seo_title, seo_desc))

        conn.commit()
    return jsonify({"success": True})

# === API: ПРИНУДИТЕЛЬНОЕ ВОССТАНОВЛЕНИЕ КАТЕГОРИЙ И ПОДКАТЕГОРИЙ ===
@app.route('/api/admin/fix_categories', methods=['GET'])
def fix_categories_route():
    if not session.get('admin_logged_in'): return "Access denied", 403

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
def admin_upload_file():
    if not session.get('admin_logged_in'): return jsonify({"success": False}), 403

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
def admin_product_visibility():
    if not session.get('admin_logged_in'): return jsonify({"success": False}), 403

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
        # Берем только видимые товары
        cursor.execute("SELECT * FROM products WHERE is_visible = 1 AND deleted_at IS NULL ORDER BY position ASC, id DESC")
        rows = cursor.fetchall()

        products = []
        for row in rows:
            p = dict(row)
            try:
                # Распаковываем картинки
                p['images'] = json.loads(row['images_json'])
                # Берем первую картинку как главную
                p['image'] = p['images'][0] if p['images'] else ''
            except:
                p['images'] = []
                p['image'] = ''

            # Удаляем технические поля, если нужно, или оставляем как есть
            products.append(p)

    return jsonify({"success": True, "items": products})


# Мягкое удаление (в корзину)
@app.route('/api/admin/product/delete', methods=['POST'])
def admin_delete_product():
    if not session.get('admin_logged_in'): return jsonify({"success": False}), 403
    data = request.json
    deleted_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with sqlite3.connect(DB_NAME) as conn:
        conn.execute("UPDATE products SET deleted_at = ? WHERE id = ?", (deleted_at, data.get('id')))
        conn.commit()
    return jsonify({"success": True})


# Восстановление из корзины
@app.route('/api/admin/product/restore', methods=['POST'])
def admin_restore_product():
    if not session.get('admin_logged_in'): return jsonify({"success": False}), 403
    data = request.json
    with sqlite3.connect(DB_NAME) as conn:
        conn.execute("UPDATE products SET deleted_at = NULL WHERE id = ?", (data.get('id'),))
        conn.commit()
    return jsonify({"success": True})


# Сортировка (Вверх/Вниз)
@app.route('/api/admin/product/move', methods=['POST'])
def admin_move_product():
    if not session.get('admin_logged_in'): return jsonify({"success": False}), 403
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
def admin_product_index_toggle():
    if not session.get('admin_logged_in'): return jsonify({"success": False}), 403
    data = request.json
    with sqlite3.connect(DB_NAME) as conn:
        conn.execute("UPDATE products SET on_index = ? WHERE id = ?", (data['on_index'], data['id']))
        conn.commit()
    return jsonify({"success": True})


# === API: УНИВЕРСАЛЬНАЯ СОРТИРОВКА (DRAG-AND-DROP) ===
@app.route('/api/admin/reorder', methods=['POST'])
def admin_reorder_general():
    if not session.get('admin_logged_in'): return jsonify({"success": False}), 403

    data = request.json
    # Фронт пришлет нам: items = [{ 'id': 10, 'cat': 'meas' }, { 'id': 5, 'cat': 'solder' } ...]
    items = data.get('items', [])

    if not items:
        # Поддержка старого формата (если вдруг придет просто ids)
        if 'ids' in data:
            old_ids = data['ids']
            with sqlite3.connect(DB_NAME) as conn:
                for idx, pid in enumerate(old_ids):
                    conn.execute("UPDATE products SET position = ? WHERE id = ?", (idx, pid))
            return jsonify({"success": True})
        return jsonify({"success": True})

    with sqlite3.connect(DB_NAME) as conn:
        cursor = conn.cursor()

        for index, item in enumerate(items):
            pid = item.get('id')
            new_cat = item.get('cat')  # Новая категория (slug)

            # Обновляем позицию И категорию
            # Если категория пустая (товар улетел выше всех заголовков), не меняем её (Coalesce или логика питона)
            if new_cat:
                cursor.execute("UPDATE products SET position = ?, category = ? WHERE id = ?", (index, new_cat, pid))
            else:
                # Если вдруг не определили категорию, обновляем только позицию
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
def save_category_api():
    if not session.get('admin_logged_in'): return jsonify({"success": False}), 403
    data = request.json

    cat_id = data.get('id')  # Если есть ID - редактируем, нет - создаем
    slug = data.get('slug')
    parent = data.get('parent_slug') or None  # Может быть None
    ru = data.get('title_ru')
    ua = data.get('title_ua')

    with sqlite3.connect(DB_NAME) as conn:
        cursor = conn.cursor()

        if cat_id:
            cursor.execute("UPDATE categories SET slug=?, parent_slug=?, title_ru=?, title_ua=? WHERE id=?",
                           (slug, parent, ru, ua, cat_id))
        else:
            # Новая - ставим в конец
            cursor.execute("SELECT MAX(position) FROM categories WHERE parent_slug IS ?", (parent,))
            res = cursor.fetchone()
            pos = (res[0] + 1) if (res and res[0] is not None) else 0

            cursor.execute(
                "INSERT INTO categories (slug, parent_slug, title_ru, title_ua, position) VALUES (?, ?, ?, ?, ?)",
                (slug, parent, ru, ua, pos))

        conn.commit()
    return jsonify({"success": True})


# === API: УДАЛИТЬ КАТЕГОРИЮ ===
@app.route('/api/admin/category/delete', methods=['POST'])
def delete_category_api():
    if not session.get('admin_logged_in'): return jsonify({"success": False}), 403
    data = request.json
    cat_id = data.get('id')

    with sqlite3.connect(DB_NAME) as conn:
        # Удаляем категорию. (В идеале надо проверять, есть ли в ней товары, но пока просто удалим)
        conn.execute("DELETE FROM categories WHERE id=?", (cat_id,))
        conn.commit()
    return jsonify({"success": True})


# === API: СОРТИРОВКА КАТЕГОРИЙ ===
@app.route('/api/admin/category/reorder', methods=['POST'])
def reorder_categories_api():
    if not session.get('admin_logged_in'): return jsonify({"success": False}), 403
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

if __name__ == '__main__':
    init_db() # Это создаст новые таблицы и бэкап
    print("Сервер запущен. Админка: http://127.0.0.1:5000/admin")
    app.run(debug=True, port=5000)