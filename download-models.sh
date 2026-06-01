#!/bin/bash

# Download models script for Alfred voice assistant (Linux/macOS)

echo ""
echo "==================================="
echo "Alfred - Model Downloader (Linux)"
echo "==================================="
echo ""

# Check if Python 3 is installed
if ! command -v python3 &> /dev/null; then
    echo "ERROR: Python 3 is not installed"
    echo "Please install Python 3.8+ using:"
    echo "  Ubuntu/Debian: sudo apt-get install python3 python3-pip"
    echo "  Fedora: sudo dnf install python3 python3-pip"
    echo "  macOS: brew install python3"
    exit 1
fi

# Get the directory where this script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Run the Python script
python3 "$SCRIPT_DIR/download_models.py" "$@"

EXIT_CODE=$?

if [ $EXIT_CODE -ne 0 ]; then
    echo ""
    echo "ERROR: Model download failed"
    exit 1
else
    echo ""
    echo "SUCCESS: Model download completed"
    exit 0
fi
