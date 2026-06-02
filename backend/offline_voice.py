from __future__ import annotations

import importlib.util
import json
import os
import time
from enum import EnumMeta
from pathlib import Path
from typing import Any

import numpy as np


class OfflineVoiceEngine:
    """Offline wake-word + speech engine.

    - Wake word: openWakeWord
    - STT: Vosk

    Both dependencies are optional at runtime. If unavailable, the engine stays
    disabled and exposes a reason through status().
    """

    def __init__(self) -> None:
        self.enabled = False
        self.reason = "offline voice engine not initialized"

        self.wakeword_name = os.getenv("ALFRED_WAKEWORD_NAME", "hey_jarvis")
        self.wakeword_threshold = float(os.getenv("ALFRED_WAKEWORD_THRESHOLD", "0.45"))
        self.command_timeout_s = float(os.getenv("ALFRED_COMMAND_TIMEOUT", "8"))

        self._oww_model = None
        self._vosk_model = None
        self.vosk_model_path = ""
        self._oww_framework = "none"
        self._wakeword_mode = "none"
        self._oww_error = ""
        OpenWakeWordModel = None
        # Only support the upstream `openwakeword` package. No fallbacks.
        try:
            import openwakeword
            if hasattr(openwakeword, "model") and hasattr(openwakeword.model, "Model"):
                OpenWakeWordModel = openwakeword.model.Model
            elif hasattr(openwakeword, "Model"):
                OpenWakeWordModel = openwakeword.Model
            elif hasattr(openwakeword, "OpenWakeWord"):
                OpenWakeWordModel = openwakeword.OpenWakeWord
        except Exception as exc:  # pragma: no cover - environment-specific
            self._oww_error = f"openwakeword import failed: {exc}"

        try:
            from vosk import Model as VoskModel
            from vosk import SetLogLevel

            SetLogLevel(-1)
        except Exception as exc:  # pragma: no cover - environment-specific
            self.reason = f"vosk import failed: {exc}"
            return

        if OpenWakeWordModel is not None:
            try:
                wake_model_path = os.getenv("ALFRED_WAKE_MODEL", "").strip()
                model_kwargs = {}
                if wake_model_path:
                    if not Path(wake_model_path).exists():
                        self._oww_error = f"wake model file missing: {wake_model_path}"
                    else:
                        model_kwargs["wakeword_models"] = [wake_model_path]

                if not self._oww_error:
                    if wake_model_path.lower().endswith(".onnx"):
                        print("Using ONNX wake word model from ALFRED_WAKE_MODEL: %s", wake_model_path)
                        self._oww_model = OpenWakeWordModel(inference_framework="onnx", **model_kwargs)
                        self._oww_framework = "onnx"
                    else:
                        try:
                            print("Using TFLite wake word model from ALFRED_WAKE_MODEL: %s", wake_model_path)
                            self._oww_model = OpenWakeWordModel(**model_kwargs)
                            self._oww_framework = "tflite"
                        except Exception:
                            print("Failed to load ALFRED_WAKE_MODEL as TFLite, trying ONNX: %s", wake_model_path)
                            self._oww_model = OpenWakeWordModel(inference_framework="onnx", **model_kwargs)
                            self._oww_framework = "onnx"
            except Exception as exc:  # pragma: no cover - environment-specific
                self._oww_error = f"openwakeword model init failed: {exc}"

        self.vosk_model_path = self._resolve_vosk_model_path()
        if not self.vosk_model_path or not Path(self.vosk_model_path).exists():
            default_hint = str(Path(__file__).parent / "models" / "vosk-model-small-en-us-0.15")
            self.reason = (
                "vosk model folder missing. Set ALFRED_VOSK_MODEL or place a model in "
                f"{default_hint}"
            )
            return

        try:
            self._vosk_model = VoskModel(self.vosk_model_path)
        except Exception as exc:  # pragma: no cover - environment-specific
            self.reason = f"vosk model init failed: {exc}"
            return

        if self._oww_model is not None:
            self._wakeword_mode = "openwakeword"
            self.reason = "ok"
            self.enabled = True
        else:
            # No wakeword engine available — disable offline voice engine.
            self._wakeword_mode = "none"
            self._oww_framework = "none"
            self.reason = f"openwakeword unavailable: {self._oww_error or 'not configured'}"
            return

    def status(self) -> dict[str, Any]:
        return {
            "enabled": self.enabled,
            "reason": self.reason,
            "vosk_model_path": self.vosk_model_path,
            "wakeword_name": self.wakeword_name,
            "wakeword_mode": self._wakeword_mode,
            "wakeword_framework": self._oww_framework,
            "wakeword_threshold": self.wakeword_threshold,
            "command_timeout_s": self.command_timeout_s,
        }

    def _resolve_vosk_model_path(self) -> str:
        env_path = os.getenv("ALFRED_VOSK_MODEL", "").strip()
        if env_path:
            return env_path

        models_dir = Path(__file__).parent / "models"
        candidates = sorted(
            p for p in models_dir.glob("vosk-model*") if p.is_dir()
        )
        if candidates:
            return str(candidates[0])

        return str(models_dir / "vosk-model-small-en-us-0.15")

    def new_session(self) -> "OfflineVoiceSession":
        if not self.enabled:
            raise RuntimeError(self.reason)
        return OfflineVoiceSession(self)


class OfflineVoiceSession:
    """Per-connection streaming session."""

    def __init__(self, engine: OfflineVoiceEngine) -> None:
        from vosk import KaldiRecognizer

        self.engine = engine
        self.source_sample_rate = 16000
        self._wake_buffer = np.zeros(0, dtype=np.int16)
        self._listening_for_command = False
        self._command_deadline = 0.0

        self._KaldiRecognizer = KaldiRecognizer
        self._recognizer = self._new_recognizer()
        self._last_cmd_partial = ""

    def _new_recognizer(self):
        rec = self._KaldiRecognizer(self.engine._vosk_model, 16000)
        rec.SetWords(False)
        return rec

    def configure(self, sample_rate: int | None = None) -> dict[str, Any]:
        if sample_rate and sample_rate > 0:
            self.source_sample_rate = int(sample_rate)
        return {
            "type": "configured",
            "sample_rate": self.source_sample_rate,
        }

    def _resample_to_16k(self, pcm16: np.ndarray) -> np.ndarray:
        """Resample mono int16 PCM from source_sample_rate to 16 kHz."""
        if self.source_sample_rate == 16000 or pcm16.size == 0:
            return pcm16

        src_len = pcm16.shape[0]
        dst_len = max(1, int(round(src_len * 16000 / self.source_sample_rate)))

        src_pos = np.linspace(0, src_len - 1, num=src_len, dtype=np.float32)
        dst_pos = np.linspace(0, src_len - 1, num=dst_len, dtype=np.float32)
        resampled = np.interp(dst_pos, src_pos, pcm16.astype(np.float32))
        return np.clip(resampled, -32768, 32767).astype(np.int16)

    def force_listen(self) -> dict[str, Any]:
        self._listening_for_command = True
        self._command_deadline = time.monotonic() + self.engine.command_timeout_s
        self._recognizer = self._new_recognizer()
        return {"type": "wake", "source": "manual", "score": 1.0}

    def process_audio(self, payload: bytes) -> list[dict[str, Any]]:
        events: list[dict[str, Any]] = []
        if not payload:
            return events

        pcm16 = np.frombuffer(payload, dtype=np.int16)
        if self.source_sample_rate != 16000:
            pcm16 = self._resample_to_16k(pcm16)
        pcm16_bytes = pcm16.tobytes()

        if not self._listening_for_command:
            wake_event = self._check_wakeword(pcm16, pcm16_bytes)
            if wake_event:
                events.append(wake_event)

        if self._listening_for_command:
            events.extend(self._decode_command(pcm16_bytes))

        return events

    def _check_wakeword(self, pcm16: np.ndarray, pcm16_bytes: bytes) -> dict[str, Any] | None:
        # If openwakeword isn't available, don't attempt any fallback.
        if self.engine._oww_model is None:
            return None

        # Buffer incoming audio and run the openwakeword model on fixed-size frames.
        self._wake_buffer = np.concatenate((self._wake_buffer, pcm16))

        frame_size = 1280  # 80 ms @ 16 kHz
        while self._wake_buffer.shape[0] >= frame_size:
            frame = self._wake_buffer[:frame_size]
            self._wake_buffer = self._wake_buffer[frame_size:]

            score = self._wake_score(frame)
            if score >= self.engine.wakeword_threshold:
                self._listening_for_command = True
                self._command_deadline = time.monotonic() + self.engine.command_timeout_s
                self._recognizer = self._new_recognizer()
                return {
                    "type": "wake",
                    "source": "wakeword",
                    "name": self.engine.wakeword_name,
                    "score": round(score, 3),
                }

        return None

    def _wake_score(self, frame: np.ndarray) -> float:
        data = frame.astype(np.float32) / 32768.0
        scores = self.engine._oww_model.predict(data)

        if isinstance(scores, dict):
            if self.engine.wakeword_name in scores:
                return float(scores[self.engine.wakeword_name])
            if scores:
                return float(max(scores.values()))
            return 0.0

        try:
            return float(scores)
        except Exception:
            return 0.0

    def _decode_command(self, pcm16_bytes: bytes) -> list[dict[str, Any]]:
        events: list[dict[str, Any]] = []

        now = time.monotonic()
        if now > self._command_deadline:
            self._listening_for_command = False
            self._recognizer = self._new_recognizer()
            self._last_cmd_partial = ""
            events.append({"type": "idle", "reason": "timeout"})
            return events

        if self._recognizer.AcceptWaveform(pcm16_bytes):
            text = ""
            try:
                result = json.loads(self._recognizer.Result())
                text = (result.get("text") or "").strip()
            except Exception:
                text = ""

            if text:
                print(f"[CMD FINAL] {text}", flush=True)

            self._listening_for_command = False
            self._recognizer = self._new_recognizer()
            self._last_cmd_partial = ""

            if text:
                events.append({"type": "command", "text": text})
            events.append({"type": "idle", "reason": "complete"})
            return events

        try:
            partial = json.loads(self._recognizer.PartialResult()).get("partial", "").strip()
            if partial:
                if partial != self._last_cmd_partial:
                    self._last_cmd_partial = partial
                    print(f"[CMD PARTIAL] {partial}", flush=True)
                self._command_deadline = time.monotonic() + self.engine.command_timeout_s
        except Exception:
            pass

        return events
