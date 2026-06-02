#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"

# Load .env file if it exists, stripping CRLF line endings for Linux compatibility
if [[ -f "$ROOT_DIR/.env" ]]; then
    set -a
    source <(sed 's/\r$//' "$ROOT_DIR/.env")
    set +a
fi

cd "$BACKEND_DIR"

export ALFRED_WAKEWORD_NAME="${ALFRED_WAKEWORD_NAME:-alfred}"

WAKE_ONNX="$BACKEND_DIR/models/wakewords/alfred.onnx"
WAKE_TFLITE="$BACKEND_DIR/models/wakewords/alfred.tflite"

if [[ -z "${ALFRED_WAKE_MODEL:-}" ]]; then
  if [[ -f "$WAKE_ONNX" ]]; then
    export ALFRED_WAKE_MODEL="$WAKE_ONNX"
  elif [[ -f "$WAKE_TFLITE" ]]; then
    export ALFRED_WAKE_MODEL="$WAKE_TFLITE"
  fi
fi

if [[ -z "${ALFRED_VOSK_MODEL:-}" ]]; then
  if [[ -d "$BACKEND_DIR/models/vosk-model-small-it-0.22" ]]; then
    export ALFRED_VOSK_MODEL="$BACKEND_DIR/models/vosk-model-small-it-0.22"
  else
    CANDIDATE="$(find "$BACKEND_DIR/models" -maxdepth 1 -type d -name 'vosk-model*' | head -n 1 || true)"
    if [[ -n "$CANDIDATE" ]]; then
      export ALFRED_VOSK_MODEL="$CANDIDATE"
    fi
  fi
fi

mkdir -p "$BACKEND_DIR/logs"
LOG_FILE="$BACKEND_DIR/logs/backend.log"

if [[ ! -d venv ]]; then
  python3 -m venv venv
fi

source venv/bin/activate
python -m pip install --upgrade pip >/dev/null
python -m pip install -r requirements.txt

echo "Alfred is starting on http://0.0.0.0:8000"
echo "If you connect from another machine, use http://<HOST_IP>:8000"
echo "ALFRED_TTS_ENGINE=${ALFRED_TTS_ENGINE:-kokoro}"
echo "ALFRED_TTS_MODEL=${ALFRED_TTS_MODEL:-xlow}"
echo "ALFRED_NO_VOICE=${ALFRED_NO_VOICE:-0}"
echo "Log file: $LOG_FILE"

python -u main.py 2>&1 | tee "$LOG_FILE"