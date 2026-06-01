@echo off
title Alfred – Home Assistant
echo.
echo  ================================================
echo   A L F R E D  –  Home Assistant
echo  ================================================
echo.

cd /d "%~dp0backend"

:: Configure offline voice model environment variables
set "ALFRED_WAKEWORD_NAME=alfred"

set "WAKE_ONNX=%CD%\models\wakewords\alfred.onnx"
set "WAKE_TFLITE=%CD%\models\wakewords\alfred.tflite"
set "ALFRED_WAKE_MODEL="

if exist "%WAKE_ONNX%" (
    set "ALFRED_WAKE_MODEL=%WAKE_ONNX%"
) else if exist "%WAKE_TFLITE%" (
    set "ALFRED_WAKE_MODEL=%WAKE_TFLITE%"
) else (
    echo  WARNING: Alfred wake-word model not found.
    echo           Expected one of:
    echo           - %WAKE_ONNX%
    echo           - %WAKE_TFLITE%
)

set "ALFRED_VOSK_MODEL=%CD%\models\vosk-model-it-0.22"
if not exist "%ALFRED_VOSK_MODEL%" (
    set "ALFRED_VOSK_MODEL="
    for /d %%D in ("%CD%\models\vosk-model*") do (
        set "ALFRED_VOSK_MODEL=%%~fD"
        goto :vosk_found
    )
)

:vosk_found
if "%ALFRED_VOSK_MODEL%"=="" (
    echo  WARNING: Vosk model not found under %CD%\models\
    echo           Offline wake-word/STT is disabled and browser fallback will be used.
    echo           Install a Vosk model folder, for example:
    echo           %CD%\models\vosk-model-small-it-0.22
    echo           or set ALFRED_VOSK_MODEL to your model path.
) else (
    echo  Offline voice configuration:
    echo   - WAKE MODEL: %ALFRED_WAKE_MODEL%
    echo   - WAKE WORD : %ALFRED_WAKEWORD_NAME%
    echo   - VOSK MODEL: %ALFRED_VOSK_MODEL%
)
echo.

:: Create virtual environment on first run
if not exist venv (
    echo  [1/3] Creating Python virtual environment...
    python -m venv venv
    if errorlevel 1 (
        echo  ERROR: Python not found. Please install Python 3.10+
        pause & exit /b 1
    )
)

:: Activate and install dependencies
call venv\Scripts\activate.bat

echo  [2/3] Installing dependencies...
pip install -r requirements.txt --quiet

echo  [3/3] Starting Alfred on http://localhost:8000
echo.
echo  Open your browser at: http://localhost:8000
echo  Press Ctrl+C to stop.
echo.

if not exist logs mkdir logs
set "ALFRED_LOG_FILE=%CD%\logs\backend.log"
echo  Live backend log: %ALFRED_LOG_FILE%
echo.

:: Open browser after a short delay
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:8000"

:: Start the backend server
python -u main.py 2>&1 | powershell -NoProfile -Command "$input | Tee-Object -FilePath '%ALFRED_LOG_FILE%'"
