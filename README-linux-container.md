# Alfred on Linux (Containerized)

This setup runs backend + frontend in one container on port `8000`.

## 1) Prerequisites

- Linux board with Docker and Docker Compose plugin installed
- Project files present on the board (including `backend/models`)

## 2) Run with Docker Compose (recommended)

From the project root:

```bash
docker compose up -d --build
```

Open:

`http://<BOARD_IP>:8000`

Check logs:

```bash
docker compose logs -f alfred
```

Stop:

```bash
docker compose down
```

## 3) Volumes and persistence

`docker-compose.yml` mounts these folders into the container:

- `./backend/models` -> `/app/backend/models`
- `./backend/data` -> `/app/backend/data`
- `./backend/logs` -> `/app/backend/logs`

This keeps downloaded TTS assets, shopping data, and logs on the host.

## 4) Optional environment overrides

Edit `docker-compose.yml` and adjust:

- `ALFRED_WAKE_MODEL`
- `ALFRED_VOSK_MODEL`
- `ALFRED_TTS_ENGINE` (kokoro or pipertts)
- `ALFRED_TTS_MODEL` (for `pipertts`, e.g. `xlow`)
- `ALFRED_TTS_SAMPLE_RATE` (audio sample rate for pipertts output, default `24000`)
- `ALFRED_TTS_MODELS_DIR`
- `ALFRED_TTS_AUTO_DOWNLOAD`
- `ALFRED_TV_EPG_URLS` (comma-separated XMLTV/XMLTV.GZ URLs)
- `ALFRED_RADIO_M3U_URL` (radio stations M3U source)
- `ALFRED_RADIO_LOGO_API_URL` (Radio Browser API endpoint for logo enrichment)

To use the optional `pipertts` TTS backend, set `ALFRED_TTS_ENGINE=pipertts` and
`ALFRED_TTS_MODEL=xlow`, then install it with:

```bash
python -m pip install -r backend/requirements-pipertts.txt
```

The TV list UI now supports open-source schedule preview (Now/Next) when one of
the configured XMLTV feeds is reachable.

## 5) Direct Docker (without Compose)

```bash
docker build -t alfred:linux .
docker run --rm -p 8000:8000 \
  -v "$PWD/backend/models:/app/backend/models" \
  -v "$PWD/backend/data:/app/backend/data" \
  -v "$PWD/backend/logs:/app/backend/logs" \
  alfred:linux
```