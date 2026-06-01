# Download Models for Alfred

This directory contains scripts to automatically download and set up the required models for Alfred voice assistant.

## Models Downloaded

1. **Kokoro TTS v1.0** - Text-to-speech engine
   - Source: Hugging Face (hexgrad/Kokoro-82M)
   - Location: `backend/models/tts/kokoro/kokoro-v1.0.onnx`

2. **Alfred Wakeword Models** - Voice activation detection
   - Source: GitHub (fwartner/home-assistant-wakewords-collection)
   - Formats:
     - ONNX: `backend/models/wakewords/alfred.onnx`
     - TFLite: `backend/models/wakewords/alfred.tflite`

3. **Vosk Italian Model v0.22** - Speech recognition (Italian language)
   - Source: AlphaCephei Vosk Models
   - Location: `backend/models/vosk-model-it-0.22/`

## Usage

### Windows

```bash
download-models.bat
```

or directly with Python:

```bash
python download_models.py
```

### Linux / macOS

```bash
./download-models.sh
```

or directly with Python:

```bash
python3 download_models.py
```

## Requirements

- **Python 3.8+** (already used by the backend)
- **Internet connection** for downloading models
- **~500MB disk space** for all models

## What the Script Does

1. Creates necessary directories under `backend/models/`
2. Downloads each model from its source
3. Extracts archive files (zip, tar.gz) to the correct locations
4. Verifies all models were downloaded successfully
5. Provides detailed progress information

## Troubleshooting

### Python not found
- **Windows**: Install Python from https://www.python.org
- **Linux**: `sudo apt-get install python3` (Debian/Ubuntu) or `sudo dnf install python3` (Fedora)
- **macOS**: `brew install python3`

### Download fails
- Check your internet connection
- The download URLs might have changed - verify the GitHub/Hugging Face sources
- Try running the script again

### Disk space issues
- Ensure you have at least 500MB free disk space
- The script downloads to a temporary location and extracts, so peak usage may be higher

### Slow downloads
- Some models are large (especially Vosk). Consider running overnight.
- Check your internet connection speed
- The script shows download progress

## Manual Download

If you prefer to download models manually:

1. **Kokoro TTS**: https://huggingface.co/hexgrad/Kokoro-82M/resolve/main/kokoro-v1.0.onnx
   - Place in: `backend/models/tts/kokoro/`

2. **Alfred Wakeword**:
   - ONNX: https://github.com/fwartner/home-assistant-wakewords-collection/raw/main/en/alfred/alfred.onnx
   - TFLite: https://github.com/fwartner/home-assistant-wakewords-collection/raw/main/en/alfred/alfred.tflite
   - Place in: `backend/models/wakewords/`

3. **Vosk Model**: https://alphacephei.com/vosk/models/vosk-model-it-0.22.zip
   - Extract the zip to: `backend/models/`
   - This will create: `backend/models/vosk-model-it-0.22/`

## Notes

- The script is safe to run multiple times - it won't re-download existing models
- The TFLite version of Alfred wakeword is optional (mainly for mobile/embedded use)
- All downloads use standard HTTPS connections
- No authentication or API keys are required
