import sqlite3
import random
import smtplib
import json
from datetime import datetime
from email.mime.text import MIMEText
from flask import Flask, request, jsonify, send_from_directory, session, redirect
from werkzeug.security import generate_password_hash, check_password_hash
from flask_login import current_user

app = Flask(__name__, static_folder='.', static_url_path='')

# ==================================================
# НАСТРОЙКИ ПОЧТЫ (ЗАПОЛНИ ЗАНОВО!)
# ==================================================
SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587
EMAIL_SENDER = "oleshchenko.nikita@gmail.com"  # <--- ВСТАВЬ СЮДА СВОЙ GMAIL
EMAIL_PASSWORD = "bndj lvjw rmuj qiop"  # <--- ВСТАВЬ СЮДА 16-ЗНАЧНЫЙ ПАРОЛЬ ПРИЛОЖЕНИЯ
# ==================================================

DB_NAME = "radiobox.db"
app.secret_key = 'super_secret_key_radiobox_123'

def init_db():
    with sqlite3.connect(DB_NAME) as conn:
        cursor = conn.cursor()
        # Таблица пользователей (уже была)
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

        # --- НОВАЯ ТАБЛИЦА ЗАКАЗОВ ---
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS orders (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_name TEXT,
                user_surname TEXT,
                user_phone TEXT,
                user_email TEXT,
                delivery_method TEXT,
                delivery_address TEXT,
                payment_method TEXT,
                comment TEXT,
                total_price TEXT,
                items_json TEXT,
                created_at TEXT
            )
        ''')
        conn.commit()


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


@app.route('/create_order', methods=['POST'])
def create_order():
    # 1. Получаем данные
    phone = request.form.get('phone')
    name = request.form.get('name')
    surname = request.form.get('surname')

    address = request.form.get('full_address')
    cart_json = request.form.get('cart_json')
    payment_method = request.form.get('payment')
    comment = request.form.get('comment')

    # 2. Генерируем 9-значный номер
    order_id = random.randint(100000000, 999999999)

    # 3. Проверяем Email
    user_email = session.get('email')

    # 4. Сохраняем в БД
    try:
        with sqlite3.connect(DB_NAME) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO orders (
                    id, 
                    user_name, user_surname, user_phone, user_email,
                    delivery_address, payment_method, comment, items_json, created_at
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                order_id,
                name, surname, phone, user_email,
                address, payment_method, comment, cart_json,
                datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            ))
            conn.commit()

    except sqlite3.IntegrityError:
        print("Совпадение номеров, рекурсия...")
        return create_order()
    except Exception as e:
        print(f"Ошибка БД: {e}")
        return f"Ошибка при сохранении: {e}", 500

    # 5. Определяем язык и отправляем письмо
    # Смотрим, откуда пришел пользователь
    referer = request.referrer or ""
    is_ukrainian = '/ua/' in referer

    if user_email:
        if is_ukrainian:
            # === УКРАИНСКАЯ ВЕРСИЯ ===
            profile_link = "https://radiobox.in.ua/ua/profile.html"
            subject = "Підтвердження вашого замовлення в RadioBox"
            body = f"""Вітаємо, {name}!

Замовлення прийнято! Номер замовлення: {order_id}
Дякуємо Вам за інтерес до товарів radiobox.in.ua.

Деталі замовлення ви можете переглянути за посиланням:
{profile_link}
"""
        else:
            # === РУССКАЯ ВЕРСИЯ ===
            profile_link = "https://radiobox.in.ua/ru/profile.html"
            subject = "Подтверждение вашего заказа в RadioBox"
            body = f"""Здравствуйте, {name}!

Заказ принят! Номер заказа: {order_id}
Благодарим Вас за интерес к товарам radiobox.in.ua.

Детали заказа вы можете увидеть по ссылке:
{profile_link}
"""

        # Отправляем сформированное письмо
        send_email_real(user_email, subject, body)

    # 6. Редирект на страницу успеха (с учетом языка)
    if is_ukrainian:
        return redirect(f'/ua/order-success.html?order_id={order_id}')
    else:
        return redirect(f'/ru/order-success.html?order_id={order_id}')

if __name__ == '__main__':
    init_db()
    print("Сервер запущен (только Email). http://127.0.0.1:5000")
    app.run(debug=True, port=5000)