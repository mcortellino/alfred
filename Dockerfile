FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        curl \
        libgomp1 \
        libsndfile1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY backend/requirements.txt /tmp/requirements.txt

RUN python -m pip install --upgrade pip \
    && python -m pip install -r /tmp/requirements.txt

COPY backend /app/backend
COPY frontend /app/frontend

RUN mkdir -p /app/backend/logs /app/backend/data /app/backend/models

WORKDIR /app/backend

# Runtime defaults for Linux/container deployment.
ENV ALFRED_WAKEWORD_NAME=alfred \
    ALFRED_WAKE_MODEL=/app/backend/models/wakewords/alfred.onnx \
    ALFRED_VOSK_MODEL=/app/backend/models/vosk-model-it-0.22 \
    ALFRED_TTS_MODELS_DIR=/app/backend/models/tts/kokoro \
    ALFRED_TTS_AUTO_DOWNLOAD=1 \
    ALFRED_TV_EPG_URLS=https://epgshare01.online/epgshare01/epg_ripper_IT1.xml.gz \
    ALFRED_RADIO_M3U_URL=https://raw.githubusercontent.com/Tundrak/IPTV-Italia/main/ipradioita.m3u \
    ALFRED_RADIO_LOGO_API_URL=https://all.api.radio-browser.info/json/stations/bycountrycodeexact/IT?hidebroken=true&order=clickcount&reverse=true&limit=1500

EXPOSE 8000

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]