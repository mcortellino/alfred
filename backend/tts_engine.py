from __future__ import annotations

import io
import os
import threading
import urllib.request
import wave
from pathlib import Path
from typing import Any


class LocalTTSEngine:
    """Local/offline TTS wrapper based on open-source Kokoro ONNX voices."""

    _MODEL_FILE = "kokoro-v1.0.onnx"
    _VOICES_FILE = "voices-v1.0.bin"
    _MODEL_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx"
    _VOICES_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin"

    def __init__(self) -> None:
        self.enabled = False
        self.reason = "tts not initialized"
        self._lock = threading.Lock()
        self._voice_preference = "male"
        self._voice_id_override = ""
        self._kokoro = None

        self._models_root = Path(
            os.getenv("ALFRED_TTS_MODELS_DIR", Path(__file__).parent / "models" / "tts" / "kokoro")
        )
        self._auto_download = os.getenv("ALFRED_TTS_AUTO_DOWNLOAD", "1").strip().lower() not in (
            "0",
            "false",
            "no",
        )

        try:
            from kokoro_onnx import Kokoro

            self._kokoro_cls = Kokoro
            self.enabled = True
            self.reason = "ok"
        except Exception as exc:  # pragma: no cover - runtime environment specific
            self._kokoro_cls = None
            self.reason = f"kokoro init failed: {exc}"

    def status(self) -> dict[str, Any]:
        selected = self._resolve_selected_voice()
        return {
            "enabled": self.enabled,
            "reason": self.reason,
            "engine": "kokoro-onnx",
            "voice_preference": self._voice_preference,
            "voice_id_override": self._voice_id_override,
            "selected_voice": selected,
        }

    def list_voices(self) -> list[dict[str, Any]]:
        model_path, voices_path = self._asset_paths()
        installed = model_path.exists() and voices_path.exists()

        voices = self._get_available_voices()
        out: list[dict[str, Any]] = []
        for voice_id in voices:
            lang, gender = self._guess_voice_meta(voice_id)
            out.append(
                {
                    "id": voice_id,
                    "name": voice_id,
                    "languages": [lang],
                    "gender": gender,
                    "installed": installed,
                }
            )
        return out

    def configure(self, voice_preference: str | None = None, voice_id: str | None = None) -> dict[str, Any]:
        if voice_preference:
            pref = voice_preference.strip().lower()
            if pref not in ("auto", "female", "male"):
                raise ValueError("voice_preference must be one of: auto, female, male")
            self._voice_preference = pref

        if voice_id is not None:
            normalized = voice_id.strip()
            if normalized and normalized not in self._get_available_voices():
                raise ValueError(f"Unknown voice_id: {normalized}")
            self._voice_id_override = normalized

        return self.status()

    def _resolve_selected_voice(self) -> dict[str, Any] | None:
        if not self.enabled:
            return None
        selected_id = self._choose_voice_id("it") or self._choose_voice_id("en")
        if not selected_id:
            return None

        model_path, voices_path = self._asset_paths()
        lang, gender = self._guess_voice_meta(selected_id)
        return {
            "id": selected_id,
            "name": selected_id,
            "languages": [lang],
            "gender": gender,
            "installed": model_path.exists() and voices_path.exists(),
        }

    def _choose_voice_id(self, lang: str) -> str | None:
        if not self.enabled:
            return None

        voices = self._get_available_voices()
        if not voices:
            return None

        if self._voice_id_override:
            if self._voice_id_override not in voices:
                raise ValueError(f"Unknown voice_id: {self._voice_id_override}")
            return self._voice_id_override

        lang_key = "it" if (lang or "").lower().startswith("it") else "en"
        pref = self._voice_preference if self._voice_preference in ("auto", "female", "male") else "auto"
        if lang_key == "it":
            female_prefixes = ("if_",)
            male_prefixes = ("im_",)
            any_prefixes = ("if_", "im_")
        else:
            female_prefixes = ("af_", "bf_")
            male_prefixes = ("am_", "bm_")
            any_prefixes = ("af_", "am_", "bf_", "bm_")

        lang_voices = [v for v in voices if v.startswith(any_prefixes)]
        if not lang_voices:
            lang_voices = voices

        if pref == "female":
            gender_voices = [v for v in lang_voices if v.startswith(female_prefixes)]
        elif pref == "male":
            gender_voices = [v for v in lang_voices if v.startswith(male_prefixes)]
        else:
            gender_voices = lang_voices

        return (gender_voices or lang_voices or voices)[0]

    @staticmethod
    def _guess_voice_meta(voice_id: str) -> tuple[str, str]:
        if voice_id.startswith(("if_", "im_")):
            lang = "it-IT"
        elif voice_id.startswith(("af_", "am_")):
            lang = "en-US"
        elif voice_id.startswith(("bf_", "bm_")):
            lang = "en-GB"
        else:
            lang = "en-US"

        if voice_id.startswith(("if_", "af_", "bf_")):
            gender = "female"
        elif voice_id.startswith(("im_", "am_", "bm_")):
            gender = "male"
        else:
            gender = ""
        return lang, gender

    def _asset_paths(self) -> tuple[Path, Path]:
        return self._models_root / self._MODEL_FILE, self._models_root / self._VOICES_FILE

    def _ensure_assets(self) -> tuple[Path, Path]:
        model_path, voices_path = self._asset_paths()
        if model_path.exists() and voices_path.exists():
            return model_path, voices_path

        if not self._auto_download:
            raise RuntimeError(
                "Kokoro model assets missing. Set ALFRED_TTS_AUTO_DOWNLOAD=1 or place files in "
                f"{self._models_root}"
            )

        self._models_root.mkdir(parents=True, exist_ok=True)

        try:
            urllib.request.urlretrieve(self._MODEL_URL, model_path)
            urllib.request.urlretrieve(self._VOICES_URL, voices_path)
        except Exception as urllib_exc:
            # Fallback for environments with custom TLS interception/certs.
            try:
                from curl_cffi import requests as curl_requests

                model_resp = curl_requests.get(
                    self._MODEL_URL,
                    impersonate="chrome120",
                    timeout=30,
                    verify=False,
                )
                if model_resp.status_code >= 400:
                    raise RuntimeError(f"Model download HTTP {model_resp.status_code}")
                model_path.write_bytes(model_resp.content)

                voices_resp = curl_requests.get(
                    self._VOICES_URL,
                    impersonate="chrome120",
                    timeout=30,
                    verify=False,
                )
                if voices_resp.status_code >= 400:
                    raise RuntimeError(f"Voices download HTTP {voices_resp.status_code}")
                voices_path.write_bytes(voices_resp.content)
            except Exception as curl_exc:
                raise RuntimeError(
                    f"Failed to download Kokoro assets: urllib={urllib_exc}; curl_cffi={curl_exc}"
                ) from curl_exc

        return model_path, voices_path

    def _load_kokoro(self):
        if self._kokoro is not None:
            return self._kokoro
        if not self._kokoro_cls:
            raise RuntimeError(self.reason)

        model_path, voices_path = self._ensure_assets()
        self._kokoro = self._kokoro_cls(str(model_path), str(voices_path))
        return self._kokoro

    def _get_available_voices(self) -> list[str]:
        try:
            kokoro = self._load_kokoro()
            return kokoro.get_voices()
        except Exception:
            # Provide conservative defaults before assets are downloaded.
            return ["if_sara", "im_nicola", "af_bella", "am_adam"]

    def synthesize(self, text: str, lang: str = "en") -> bytes:
        if not self.enabled:
            raise RuntimeError(self.reason)

        with self._lock:
            voice_id = self._choose_voice_id(lang)
            if not voice_id:
                raise RuntimeError("No Kokoro voice selected")

            kokoro = self._load_kokoro()
            lang_code = "it" if (lang or "").lower().startswith("it") else "en-us"
            audio, sample_rate = kokoro.create(text, voice=voice_id, lang=lang_code)

            pcm16 = (audio.clip(-1.0, 1.0) * 32767.0).astype("<i2")
            with io.BytesIO() as buffer:
                with wave.open(buffer, "wb") as wav_file:
                    wav_file.setnchannels(1)
                    wav_file.setsampwidth(2)
                    wav_file.setframerate(sample_rate)
                    wav_file.writeframes(pcm16.tobytes())
                return buffer.getvalue()

class PiperTTSEngine:
    """Local/offline TTS wrapper using Piper TTS."""

    _DEFAULT_VOICE = "en_US-lessac-medium"
    _DEFAULT_VOICE_PATH = "en_US-lessac-medium.onnx"

    def __init__(self) -> None:
        self.enabled = False
        self.reason = "tts not initialized"
        self._lock = threading.Lock()
        self._voice_preference = "auto"
        self._voice_id_override = ""
        self._voice_name = os.getenv("ALFRED_TTS_MODEL", self._DEFAULT_VOICE).strip()
        self._voice_path_override = os.getenv("ALFRED_TTS_VOICE_PATH", "").strip()
        print(f"Piper TTS voice: {self._voice_name}, path override: {self._voice_path_override}")
        self._piper_voice = None

        try:
            from piper import PiperVoice

            self._piper_voice_cls = PiperVoice
            self.enabled = True
            self.reason = "ok"
        except Exception as exc:  # pragma: no cover - runtime environment specific
            self._piper_voice_cls = None
            self.reason = f"piper init failed: {exc}"

    def status(self) -> dict[str, Any]:
        return {
            "enabled": self.enabled,
            "reason": self.reason,
            "engine": "piper",
            "voice": self._voice_name,
            "voice_preference": self._voice_preference,
            "voice_id_override": self._voice_id_override,
            "selected_voice": {"id": self._voice_name, "name": self._voice_name, "languages": ["en-US"], "gender": ""},
        }

    def list_voices(self) -> list[dict[str, Any]]:
        return [
            {
                "id": self._voice_name,
                "name": self._voice_name,
                "languages": ["en-US"],
                "gender": "",
                "installed": self.enabled,
            }
        ]

    def configure(self, voice_preference: str | None = None, voice_id: str | None = None) -> dict[str, Any]:
        if voice_preference:
            pref = voice_preference.strip().lower()
            if pref not in ("auto", "female", "male"):
                raise ValueError("voice_preference must be one of: auto, female, male")
            self._voice_preference = pref

        if voice_id is not None:
            normalized = voice_id.strip()
            if normalized and normalized != self._voice_name:
                raise ValueError(f"Unknown voice_id: {normalized}")
            self._voice_id_override = normalized

        return self.status()

    def _get_voice_path(self) -> Path:
        """Get the path to the voice model file."""
        voice_path = None
        
        # If override is set, check if it's a file or directory
        if self._voice_path_override:
            override_path = Path(self._voice_path_override)
            if override_path.is_file():
                voice_path = override_path
            elif override_path.is_dir():
                # Look for .onnx file in the directory
                voice_path = override_path / f"{self._voice_name}.onnx"
            else:
                # Assume it's meant to be a file path
                voice_path = override_path
        
        if not voice_path or not voice_path.exists():
            # Try common locations for Piper voice models
            piper_models_dir = Path.home() / ".local" / "share" / "piper" / "voices"
            voice_path = piper_models_dir / f"{self._voice_name}.onnx"
        
        if not voice_path.exists():
            # Try current directory fallback
            voice_path = Path(self._DEFAULT_VOICE_PATH)
        
        if not voice_path.exists():
            raise RuntimeError(
                f"Voice model not found: {voice_path}. "
                f"Download with: python3 -m piper.download_voices {self._voice_name}"
            )
        
        # Check for required metadata file (.json or .onnx.json)
        json_path = voice_path.with_suffix(".json")
        if not json_path.exists():
            json_path = Path(str(voice_path) + ".json")
        
        if not json_path.exists():
            raise RuntimeError(
                f"Voice metadata file not found. Expected {voice_path.with_suffix('.json')} or {voice_path}.json. "
                f"Download with: python3 -m piper.download_voices {self._voice_name}"
            )
        
        return voice_path

    def _load_voice(self) -> Any:
        """Load the Piper voice model."""
        if self._piper_voice is not None:
            return self._piper_voice
        if not self._piper_voice_cls:
            raise RuntimeError(self.reason)

        voice_path = self._get_voice_path()
        self._piper_voice = self._piper_voice_cls.load(str(voice_path))
        return self._piper_voice

    def synthesize(self, text: str, lang: str = "en") -> bytes:
        if not self.enabled:
            raise RuntimeError(self.reason)

        with self._lock:
            voice = self._load_voice()
            with io.BytesIO() as buffer:
                with wave.open(buffer, "wb") as wav_file:
                    voice.synthesize_wav(text, wav_file)
                return buffer.getvalue()


def create_tts_engine() -> Any:
    engine_name = os.getenv("ALFRED_TTS_ENGINE", "kokoro").strip().lower()
    if engine_name in ("pipertts", "piper"):
        return PiperTTSEngine()
    return LocalTTSEngine()