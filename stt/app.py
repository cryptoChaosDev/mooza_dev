# -*- coding: utf-8 -*-
# Мини-сервис распознавания речи: POST /transcribe (multipart file) -> { text }.
# Любой аудио-контейнер (webm/opus, m4a, mp3...) конвертируется ffmpeg'ом
# в 16кГц моно WAV и прогоняется через Vosk (русская малая модель).
import json
import os
import subprocess
import tempfile
import wave

from flask import Flask, jsonify, request
from vosk import Model, KaldiRecognizer, SetLogLevel

SetLogLevel(-1)
app = Flask(__name__)
model = Model('/opt/model')

MAX_SECONDS = 330  # предохранитель: голосовые ограничены ~5 минутами


@app.route('/health')
def health():
    return 'ok'


@app.route('/transcribe', methods=['POST'])
def transcribe():
    f = request.files.get('file')
    if not f:
        return jsonify({'error': 'no file'}), 400
    with tempfile.TemporaryDirectory() as td:
        src = os.path.join(td, 'src')
        wav = os.path.join(td, 'audio.wav')
        f.save(src)
        r = subprocess.run(
            ['ffmpeg', '-y', '-i', src, '-t', str(MAX_SECONDS),
             '-ar', '16000', '-ac', '1', '-f', 'wav', wav],
            capture_output=True, timeout=180,
        )
        if r.returncode != 0 or not os.path.exists(wav):
            return jsonify({'error': 'ffmpeg failed'}), 422

        wf = wave.open(wav, 'rb')
        rec = KaldiRecognizer(model, wf.getframerate())
        parts = []
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
        return jsonify({'text': ' '.join(parts).strip()})


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5005, threaded=True)
