import sqlite3
import random
import smtplib
from email.mime.text import MIMEText
from flask import Flask, request, jsonify, send_from_directory, redirect
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__, static_folder='.', static_url_path='')

# ==================================================
# НАСТРОЙКИ ПОЧТЫ (ЗАПОЛНИ ЗАНОВО!)
# ==================================================
SMTP_SERVER = "smtp.gmail.com"
SMTP_PORT = 587
EMAIL_SENDER = "oleshchenko.nikita@gmail.com" 
EMAIL_PASSWORD = "testing"
# ==================================================

DB_NAME = "radiobox.db"


def init_db():
    with sqlite3.connect(DB_NAME) as conn:
        cursor = conn.cursor()
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
    # Хэшируем пароль перед записью
    hashed_pw = generate_password_hash(data['password'])

    try:
        with sqlite3.connect(DB_NAME) as conn:
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO users (name, surname, email, phone, password)
                VALUES (?, ?, ?, ?, ?)
            ''', (data['name'], data['surname'], data['email'], data['phone'], hashed_pw))  # <-- Пишем хэш
            conn.commit()
            user_id = cursor.lastrowid
            return jsonify({"success": True, "user": {"id": user_id, "name": data['name'], "surname": data['surname']}})
    except sqlite3.IntegrityError:
        return jsonify({"success": False, "error": "Пользователь с таким Email уже существует!"})
    except Exception as e:
        return jsonify({"success": False, "error": str(e)})


@app.route('/api/login', methods=['POST'])
def login():
    data = request.json
    with sqlite3.connect(DB_NAME) as conn:
        cursor = conn.cursor()
        cursor.execute('SELECT id, name, surname, password FROM users WHERE email = ?', (data['email'],))
        user = cursor.fetchone()

        # user[3] - это хэш из базы. data['password'] - это то, что ввел юзер.
        if user and check_password_hash(user[3], data['password']):
            return jsonify({"success": True, "user": {"id": user[0], "name": user[1], "surname": user[2]}})
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


if __name__ == '__main__':
    init_db()
    print("Сервер запущен (только Email). http://127.0.0.1:5000")
    app.run(debug=True, port=5000)
