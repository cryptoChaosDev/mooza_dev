# -*- coding: utf-8 -*-
# Мини-сервис распознавания речи: POST /transcribe (multipart file) -> { text }.
# Любой аудио-контейнер (webm/opus, m4a, mp3...) конвертируется ffmpeg'ом
# в 16кГц моно WAV и прогоняется через Vosk (русская малая модель).
import json
import os
import subprocess
import tempfile
import threading
import wave

from flask import Flask, jsonify, request
from vosk import Model, KaldiRecognizer, SetLogLevel

SetLogLevel(-1)
app = Flask(__name__)
# Вложения чата ограничены 20 МБ — больше не принимаем (запас на multipart)
app.config['MAX_CONTENT_LENGTH'] = 25 * 1024 * 1024
model = Model('/opt/model')

MAX_SECONDS = 330  # предохранитель: голосовые ограничены ~5 минутами

# Не больше 2 распознаваний одновременно: ffmpeg + Vosk грузят CPU/память,
# параллельный наплыв запросов клал контейнер. Остальные ждут до 60с, потом 503.
MAX_PARALLEL = int(os.environ.get('STT_MAX_PARALLEL', '2'))
QUEUE_WAIT_SECONDS = 60
_slots = threading.BoundedSemaphore(MAX_PARALLEL)


@app.route('/health')
def health():
    return 'ok'


def _limit_seconds():
    # Необязательное поле max_seconds (голосовой ввод — 30 с): длиннее — 413,
    # без распознавания. Без поля — прежний предел MAX_SECONDS.
    try:
        v = float(request.form.get('max_seconds') or 0)
    except ValueError:
        v = 0
    return min(v, MAX_SECONDS) if v > 0 else None


@app.route('/transcribe', methods=['POST'])
def transcribe():
    f = request.files.get('file')
    if not f:
        return jsonify({'error': 'no file'}), 400
    limit = _limit_seconds()
    if not _slots.acquire(timeout=QUEUE_WAIT_SECONDS):
        return jsonify({'error': 'busy'}), 503
    try:
        return _transcribe_file(f, limit)
    finally:
        _slots.release()


def _transcribe_file(f, limit=None):
    with tempfile.TemporaryDirectory() as td:
        src = os.path.join(td, 'src')
        wav = os.path.join(td, 'audio.wav')
        f.save(src)
        # С пределом декодируем на секунду больше: так видно, что запись длиннее.
        max_t = min(limit + 1, MAX_SECONDS) if limit else MAX_SECONDS
        try:
            r = subprocess.run(
                ['ffmpeg', '-y', '-i', src, '-t', str(max_t),
                 '-ar', '16000', '-ac', '1', '-f', 'wav', wav],
                capture_output=True, timeout=180,
            )
        except subprocess.TimeoutExpired:
            return jsonify({'error': 'ffmpeg timeout'}), 422
        if r.returncode != 0 or not os.path.exists(wav):
            return jsonify({'error': 'ffmpeg failed'}), 422

        parts = []
        with wave.open(wav, 'rb') as wf:
            duration = round(wf.getnframes() / float(wf.getframerate() or 16000), 2)
            if limit and duration > limit + 0.5:
                return jsonify({'error': 'too long', 'duration': duration}), 413
            rec = KaldiRecognizer(model, wf.getframerate())
            while True:
                data = wf.readframes(4000)
                if len(data) == 0:
                    break
                if rec.AcceptWaveform(data):
                    res = json.loads(rec.Result())
                    if res.get('text'):
                        parts.append(res['text'])
        final = json.loads(rec.FinalResult())
        if final.get('text'):
            parts.append(final['text'])
        return jsonify({'text': ' '.join(parts).strip(), 'duration': duration})


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5005, threaded=True)
