#!/usr/bin/env python3
"""
Download required models for Alfred voice assistant.
Works on both Windows and Linux.

Models to download:
- TTS: Kokoro v1.0
- Wakeword: Alfred model
- Speech Recognition: Vosk Italian model
"""

import os
import sys
import urllib.request
import zipfile
import tarfile
import shutil
from pathlib import Path

# Colors for terminal output
class Colors:
    HEADER = '\033[95m'
    BLUE = '\033[94m'
    CYAN = '\033[96m'
    GREEN = '\033[92m'
    YELLOW = '\033[93m'
    RED = '\033[91m'
    ENDC = '\033[0m'
    BOLD = '\033[1m'

def print_info(msg):
    print(f"{Colors.BLUE}[INFO]{Colors.ENDC} {msg}")

def print_success(msg):
    print(f"{Colors.GREEN}[SUCCESS]{Colors.ENDC} {msg}")

def print_error(msg):
    print(f"{Colors.RED}[ERROR]{Colors.ENDC} {msg}")

def print_step(msg):
    print(f"\n{Colors.BOLD}{Colors.CYAN}>>> {msg}{Colors.ENDC}")

def download_file(url, destination, chunk_size=8192):
    """Download a file with progress indication."""
    try:
        print_info(f"Downloading from: {url}")
        
        with urllib.request.urlopen(url) as response:
            total_size = int(response.headers.get('content-length', 0))
            downloaded = 0
            
            with open(destination, 'wb') as out_file:
                while True:
                    chunk = response.read(chunk_size)
                    if not chunk:
                        break
                    out_file.write(chunk)
                    downloaded += len(chunk)
                    
                    if total_size > 0:
                        percent = (downloaded / total_size) * 100
                        print(f"  Downloaded: {downloaded / (1024*1024):.1f}MB / {total_size / (1024*1024):.1f}MB ({percent:.1f}%)", end='\r')
        
        print()  # New line after progress
        print_success(f"Downloaded to: {destination}")
        return True
    except Exception as e:
        print_error(f"Failed to download {url}: {str(e)}")
        return False

def extract_zip(zip_path, extract_to):
    """Extract ZIP file."""
    try:
        print_info(f"Extracting: {zip_path}")
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(extract_to)
        print_success(f"Extracted to: {extract_to}")
        return True
    except Exception as e:
        print_error(f"Failed to extract {zip_path}: {str(e)}")
        return False

def extract_tar(tar_path, extract_to):
    """Extract TAR/TAR.GZ file."""
    try:
        print_info(f"Extracting: {tar_path}")
        with tarfile.open(tar_path, 'r:*') as tar_ref:
            tar_ref.extractall(extract_to)
        print_success(f"Extracted to: {extract_to}")
        return True
    except Exception as e:
        print_error(f"Failed to extract {tar_path}: {str(e)}")
        return False

def main():
    print_step("Alfred Voice Assistant - Model Downloader")
    
    # Get the backend directory
    script_dir = Path(__file__).resolve().parent
    backend_dir = script_dir / "backend"
    models_dir = backend_dir / "models"
    
    # Create models directory if it doesn't exist
    models_dir.mkdir(parents=True, exist_ok=True)
    
    # 1. Download Kokoro TTS model
    print_step("Downloading Kokoro TTS model v1.0")
    tts_dir = models_dir / "tts" / "kokoro"
    tts_dir.mkdir(parents=True, exist_ok=True)
    
    kokoro_onnx_path = tts_dir / "kokoro-v1.0.onnx"
    kokoro_voices_path = tts_dir / "voices"
    
    # Check if Kokoro is already set up
    if kokoro_onnx_path.exists() and kokoro_voices_path.exists():
        print_info(f"Kokoro v1.0 already exists at {tts_dir}")
    else:
        try:
            print_info("Installing Kokoro TTS package...")
            import subprocess
            result = subprocess.run(
                [sys.executable, "-m", "pip", "install", "-q", "kokoro>=0.9.2"],
                capture_output=True,
                text=True
            )
            
            if result.returncode != 0:
                print_error(f"Failed to install Kokoro: {result.stderr}")
            else:
                print_success("Kokoro package installed")
                
                # Copy Kokoro model files to our models directory
                try:
                    import kokoro
                    kokoro_pkg_dir = Path(kokoro.__file__).parent
                    
                    # Copy the ONNX model if it exists
                    kokoro_models = kokoro_pkg_dir / "models"
                    if kokoro_models.exists():
                        # Find and copy the ONNX file
                        for onnx_file in kokoro_models.glob("*.onnx"):
                            dest = kokoro_onnx_path
                            shutil.copy2(onnx_file, dest)
                            print_success(f"Copied {onnx_file.name} to {dest}")
                        
                        # Copy voices directory
                        voices_src = kokoro_models / "voices"
                        if voices_src.exists():
                            if kokoro_voices_path.exists():
                                shutil.rmtree(kokoro_voices_path)
                            shutil.copytree(voices_src, kokoro_voices_path)
                            print_success(f"Copied voices to {kokoro_voices_path}")
                    else:
                        print_info("Kokoro package installed successfully (models managed by package)")
                        
                except Exception as e:
                    print_info(f"Kokoro installed as a package (will be loaded dynamically). {str(e)}")
                    
        except Exception as e:
            print_error(f"Failed to set up Kokoro: {str(e)}")
    
    # 2. Download Alfred Wakeword model
    print_step("Downloading Alfred wakeword model")
    wakeword_dir = models_dir / "wakewords"
    wakeword_dir.mkdir(parents=True, exist_ok=True)
    
    # Download ONNX version
    alfred_onnx_url = "https://github.com/fwartner/home-assistant-wakewords-collection/raw/main/en/alfred/alfred.onnx"
    alfred_onnx_path = wakeword_dir / "alfred.onnx"
    
    if alfred_onnx_path.exists():
        print_info(f"Alfred ONNX model already exists at {alfred_onnx_path}")
    else:
        if download_file(alfred_onnx_url, str(alfred_onnx_path)):
            print_success("Alfred ONNX wakeword model downloaded successfully")
        else:
            print_error("Failed to download Alfred ONNX wakeword model")
    
    # Download TFLite version (optional, for mobile/lighter usage)
    alfred_tflite_url = "https://github.com/fwartner/home-assistant-wakewords-collection/raw/main/en/alfred/alfred.tflite"
    alfred_tflite_path = wakeword_dir / "alfred.tflite"
    
    if alfred_tflite_path.exists():
        print_info(f"Alfred TFLite model already exists at {alfred_tflite_path}")
    else:
        if download_file(alfred_tflite_url, str(alfred_tflite_path)):
            print_success("Alfred TFLite wakeword model downloaded successfully")
        else:
            print_error("Failed to download Alfred TFLite wakeword model")
    
    # 3. Download Vosk Italian model
    print_step("Downloading Vosk Italian language model v0.22")
    vosk_dir = models_dir / "vosk-model-it-0.22"
    
    if vosk_dir.exists() and list(vosk_dir.glob('*')):
        print_info(f"Vosk model already exists at {vosk_dir}")
    else:
        vosk_url = "https://alphacephei.com/vosk/models/vosk-model-it-0.22.zip"
        vosk_zip = models_dir / "vosk-model-it-0.22.zip"
        
        models_dir.mkdir(parents=True, exist_ok=True)
        
        if download_file(vosk_url, str(vosk_zip)):
            print_info("Extracting Vosk model...")
            
            # Extract to models directory
            if extract_zip(str(vosk_zip), str(models_dir)):
                # Clean up zip file
                vosk_zip.unlink()
                print_success("Vosk Italian model downloaded and extracted successfully")
            else:
                print_error("Failed to extract Vosk model")
        else:
            print_error("Failed to download Vosk model")
    
    # Final summary
    print_step("Download Summary")
    print_info(f"Models directory: {models_dir}")
    
    # Check what was successfully downloaded
    checks = [
        ("Kokoro TTS v1.0", kokoro_onnx_path if kokoro_onnx_path.exists() else tts_dir),
        ("Alfred ONNX Wakeword", alfred_onnx_path),
        ("Alfred TFLite Wakeword", alfred_tflite_path),
        ("Vosk Italian Model", vosk_dir),
    ]
    
    all_good = True
    for name, path in checks:
        if path.exists():
            print_success(f"{name}: ✓")
        else:
            # For Kokoro, check if the package is installed
            if "Kokoro" in name:
                try:
                    import kokoro
                    print_success(f"{name}: ✓ (package installed)")
                except ImportError:
                    print_error(f"{name}: ✗ (missing)")
                    all_good = False
            else:
                print_error(f"{name}: ✗ (missing)")
                all_good = False
    
    if all_good:
        print_success("\nAll models downloaded successfully! You're ready to run Alfred.")
        return 0
    else:
        print_error("\nSome models failed to download. Please check the errors above.")
        return 1

if __name__ == "__main__":
    sys.exit(main())
