# Используем легкую версию Python 3.11
FROM python:3.11-slim

# Устанавливаем рабочую директорию внутри контейнера
WORKDIR /app

# Копируем зависимости и устанавливаем их
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Копируем весь остальной код проекта
COPY . .

# Создаем папки для данных, если их нет, чтобы не было ошибок прав доступа
RUN mkdir -p assets/products assets/banners backups

# Открываем порт 5000
EXPOSE 5000

# Запускаем приложение через Gunicorn (4 воркера для лучшей производительности)
CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:5000", "server:app"]