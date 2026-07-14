# STT-сервис: Vosk (офлайн-распознавание речи, русская модель) + ffmpeg.
# Только внутренняя docker-сеть, наружу не публикуется.
FROM python:3.11-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends ffmpeg wget unzip \
 && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir vosk==0.3.45 flask==3.0.3

# Малая русская модель (~45МБ) — качается на этапе сборки образа
RUN wget -q https://alphacephei.com/vosk/models/vosk-model-small-ru-0.22.zip -O /tmp/model.zip \
 && unzip -q /tmp/model.zip -d /opt \
 && mv /opt/vosk-model-small-ru-0.22 /opt/model \
 && rm /tmp/model.zip

COPY app.py /app/app.py
WORKDIR /app
EXPOSE 5005
CMD ["python", "app.py"]
