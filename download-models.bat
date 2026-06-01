@echo off
REM Download models script for Alfred voice assistant (Windows)

echo.
echo ===================================
echo Alfred - Model Downloader (Windows)
echo ===================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo ERROR: Python is not installed or not in PATH
    echo Please install Python 3.8+ from https://www.python.org
    exit /b 1
)

REM Run the Python script
python "%~dp0download_models.py" %*

if errorlevel 1 (
    echo.
    echo ERROR: Model download failed
    exit /b 1
) else (
    echo.
    echo SUCCESS: Model download completed
    exit /b 0
)
