// @ts-nocheck
/**
 * speech.js - Offline-first wake-word + command capture for Alfred.
 *
 * Primary path:
 *   Browser mic capture -> websocket binary stream -> Python pyopen-wakeword + Vosk
 * Fallback path:
 *   Browser SpeechRecognition (previous behavior)
 */
class AlfredSpeech {
    constructor() {
        this.onWakeWord = null;
        this.onCommand = null;
        this.onStateChange = null;
        this.onDiagnostic = null;
        this.recognitionLang = "en-GB";
        this._ttsAudio = new Audio();
        this._ttsAbortController = null;
        this._ttsObjectUrl = null;
        this._active = false;
        this._useFallback = false;
        this._ws = null;
        this._stream = null;
        this._audioContext = null;
        this._sourceNode = null;
        this._workletNode = null;
        this._reconnectHandle = null;
        this._offlineSupported = Boolean(window.WebSocket &&
            navigator.mediaDevices &&
            navigator.mediaDevices.getUserMedia &&
            (window.AudioContext || window.webkitAudioContext));
        this._fallback = new BrowserSpeechFallback();
        this.supported = this._offlineSupported || this._fallback.supported;
    }
    setLanguage(bcp47) {
        this.recognitionLang = bcp47;
        this._fallback.setLanguage(bcp47);
    }
    async start() {
        if (!this.supported)
            return;
        this._active = true;
        this._emitDiag("speech.start", "Speech service started");
        if (this._offlineSupported) {
            try {
                await this._startOffline();
                return;
            }
            catch (err) {
                console.warn("Offline voice unavailable, falling back:", err);
                this._emitDiag("offline.error", `Offline start failed: ${err?.message || err}`);
            }
        }
        this._startFallback();
    }
    stop() {
        this._active = false;
        this._stopFallback();
        this._stopOffline();
    }
    triggerManualListen() {
        if (!this._active)
            return;
        if (!this._useFallback && this._ws && this._ws.readyState === WebSocket.OPEN) {
            this._ws.send(JSON.stringify({ action: "listen_once" }));
            this._emitDiag("manual.listen", "Manual listen sent to backend");
            return;
        }
        this._fallback.triggerManualListen();
        this._emitDiag("manual.listen", "Manual listen via browser fallback");
    }
    speak(text, onStart, onEnd) {
        this.cancelSpeech();
        const lang = this.recognitionLang.startsWith("it") ? "it" : "en";
        const controller = new AbortController();
        this._ttsAbortController = controller;
        fetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, lang }),
            signal: controller.signal,
        })
            .then((res) => {
            if (!res.ok)
                throw new Error(`TTS HTTP ${res.status}`);
            return res.blob();
        })
            .then((blob) => {
            if (controller.signal.aborted)
                return;
            this._ttsObjectUrl = URL.createObjectURL(blob);
            this._ttsAudio.src = this._ttsObjectUrl;
            this._ttsAudio.onplaying = () => {
                this._emitDiag("tts.play", "Local TTS playback started");
                if (onStart)
                    onStart();
            };
            this._ttsAudio.onended = () => {
                this._cleanupTtsAudio();
                if (onEnd)
                    onEnd();
            };
            this._ttsAudio.onerror = () => {
                this._emitDiag("tts.error", "Local TTS playback error");
                this._cleanupTtsAudio();
                if (onEnd)
                    onEnd();
            };
            this._ttsAudio.play().catch((err) => {
                this._emitDiag("tts.error", `Local TTS play failed: ${err?.message || err}`);
                this._cleanupTtsAudio();
                if (onEnd)
                    onEnd();
            });
        })
            .catch((err) => {
            if (controller.signal.aborted)
                return;
            this._emitDiag("tts.error", `Local TTS request failed: ${err?.message || err}`);
            if (onEnd)
                onEnd();
        });
    }
    cancelSpeech() {
        if (this._ttsAbortController) {
            this._ttsAbortController.abort();
            this._ttsAbortController = null;
        }
        try {
            this._ttsAudio.pause();
        }
        catch (_) { }
        this._cleanupTtsAudio();
    }
    _cleanupTtsAudio() {
        this._ttsAudio.onplaying = null;
        this._ttsAudio.onended = null;
        this._ttsAudio.onerror = null;
        this._ttsAudio.removeAttribute("src");
        this._ttsAudio.load();
        if (this._ttsObjectUrl) {
            URL.revokeObjectURL(this._ttsObjectUrl);
            this._ttsObjectUrl = null;
        }
    }
    async _startOffline() {
        if (!this._active)
            return;
        this._useFallback = false;
        this._emitDiag("offline.init", "Starting offline websocket audio pipeline");
        this._stream = await navigator.mediaDevices.getUserMedia({
            audio: {
                channelCount: 1,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
            },
        });
        const Ctx = window.AudioContext || window.webkitAudioContext;
        this._audioContext = new Ctx({ sampleRate: 16000 });
        await this._audioContext.audioWorklet.addModule("js/mic-worklet.js");
        this._sourceNode = this._audioContext.createMediaStreamSource(this._stream);
        this._workletNode = new AudioWorkletNode(this._audioContext, "pcm16-worklet", {
            numberOfInputs: 1,
            numberOfOutputs: 0,
            channelCount: 1,
        });
        this._workletNode.port.onmessage = (evt) => {
            if (!this._ws || this._ws.readyState !== WebSocket.OPEN)
                return;
            if (!(evt.data instanceof ArrayBuffer))
                return;
            this._ws.send(evt.data);
        };
        this._sourceNode.connect(this._workletNode);
        const wsProto = window.location.protocol === "https:" ? "wss" : "ws";
        this._ws = new WebSocket(`${wsProto}://${window.location.host}/ws/voice`);
        this._ws.binaryType = "arraybuffer";
        this._ws.onopen = () => {
            this._ws.send(JSON.stringify({
                action: "configure",
                sample_rate: this._audioContext.sampleRate,
            }));
            this._emitDiag("offline.ws", `Connected to /ws/voice at ${this._audioContext.sampleRate}Hz`);
            if (this.onStateChange)
                this.onStateChange("idle", { reason: "connected" });
        };
        this._ws.onmessage = (evt) => {
            let msg;
            try {
                msg = JSON.parse(evt.data);
            }
            catch (_) {
                return;
            }
            if (msg.type === "wake") {
                this._emitDiag("wake", `Wake detected (${msg.source || "unknown"})`);
                if (this.onWakeWord)
                    this.onWakeWord();
                return;
            }
            if (msg.type === "command") {
                const text = String(msg.text || "").trim();
                this._emitDiag("command", `Command: ${text || "<empty>"}`);
                if (text && this.onCommand)
                    this.onCommand(text);
                return;
            }
            if (msg.type === "idle") {
                this._emitDiag("idle", `Idle: ${msg.reason || "ready"}`);
                if (this.onStateChange)
                    this.onStateChange("idle", { reason: msg.reason || "ready" });
                return;
            }
            if (msg.type === "configured") {
                this._emitDiag("offline.configured", `Backend configured (${msg.sample_rate}Hz input)`);
                return;
            }
            if (msg.type === "error") {
                console.warn("Offline voice server error:", msg.message || "unknown");
                this._emitDiag("offline.error", msg.message || "Unknown backend error");
                this._startFallback();
            }
        };
        this._ws.onclose = () => {
            this._emitDiag("offline.ws", "Voice websocket closed");
            if (!this._active || this._useFallback)
                return;
            clearTimeout(this._reconnectHandle);
            this._reconnectHandle = setTimeout(() => {
                if (!this._active || this._useFallback)
                    return;
                this._emitDiag("offline.ws", "Switching to browser fallback");
                this._startFallback();
            }, 600);
        };
    }
    _stopOffline() {
        clearTimeout(this._reconnectHandle);
        if (this._ws) {
            try {
                this._ws.close();
            }
            catch (_) { }
            this._ws = null;
        }
        if (this._workletNode) {
            try {
                this._workletNode.disconnect();
            }
            catch (_) { }
            this._workletNode = null;
        }
        if (this._sourceNode) {
            try {
                this._sourceNode.disconnect();
            }
            catch (_) { }
            this._sourceNode = null;
        }
        if (this._audioContext) {
            try {
                this._audioContext.close();
            }
            catch (_) { }
            this._audioContext = null;
        }
        if (this._stream) {
            this._stream.getTracks().forEach((t) => t.stop());
            this._stream = null;
        }
    }
    _startFallback() {
        if (!this._fallback.supported) {
            this._emitDiag("fallback.unavailable", "No browser fallback recognition available");
            if (this.onStateChange)
                this.onStateChange("denied");
            return;
        }
        this._useFallback = true;
        this._emitDiag("fallback.start", "Using browser SpeechRecognition fallback");
        this._stopOffline();
        this._fallback.onWakeWord = () => { if (this.onWakeWord)
            this.onWakeWord(); };
        this._fallback.onCommand = (text) => { if (this.onCommand)
            this.onCommand(text); };
        this._fallback.onStateChange = (state) => {
            if (this.onStateChange)
                this.onStateChange(state, { reason: "fallback" });
        };
        this._fallback.start();
    }
    _stopFallback() {
        this._useFallback = false;
        this._fallback.stop();
    }
    _emitDiag(tag, message) {
        if (this.onDiagnostic)
            this.onDiagnostic({
                ts: new Date().toISOString(),
                tag,
                message,
            });
    }
}
class BrowserSpeechFallback {
    constructor() {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        this.supported = !!SR;
        this.onWakeWord = null;
        this.onCommand = null;
        this.onStateChange = null;
        this._active = false;
        this._commandMode = false;
        this._silenceHandle = null;
        this._recognition = null;
        this.recognitionLang = "en-GB";
        if (this.supported)
            this._initRecognition(SR);
    }
    setLanguage(bcp47) {
        this.recognitionLang = bcp47;
        if (!this._recognition)
            return;
        const wasActive = this._active;
        if (wasActive) {
            this._active = false;
            this._recognition.abort();
        }
        this._recognition.lang = bcp47;
        if (wasActive) {
            this._active = true;
            setTimeout(() => this._safeStart(), 350);
        }
    }
    start() {
        if (!this.supported)
            return;
        this._active = true;
        this._safeStart();
    }
    stop() {
        this._active = false;
        if (this._recognition)
            this._recognition.abort();
    }
    triggerManualListen() {
        this._enterCommandMode();
    }
    _initRecognition(SR) {
        const rec = new SR();
        rec.continuous = true;
        rec.interimResults = true;
        rec.lang = this.recognitionLang;
        rec.maxAlternatives = 1;
        rec.onresult = (event) => {
            const result = event.results[event.results.length - 1];
            const transcript = result[0].transcript.trim().toLowerCase();
            const isFinal = result.isFinal;
            if (!this._commandMode) {
                if (transcript.includes("alfred")) {
                    this._enterCommandMode();
                    const afterWake = transcript.split("alfred").pop().trim();
                    if (afterWake.length > 2) {
                        this._exitCommandMode();
                        if (this.onCommand)
                            this.onCommand(afterWake);
                    }
                }
            }
            else if (isFinal) {
                const cmd = transcript.replace(/\balfred\b/g, "").trim();
                if (cmd.length > 1) {
                    this._exitCommandMode();
                    if (this.onCommand)
                        this.onCommand(cmd);
                }
            }
        };
        rec.onerror = (event) => {
            if (event.error === "no-speech")
                return;
            if (event.error === "not-allowed" || event.error === "service-not-allowed") {
                this._active = false;
                if (this.onStateChange)
                    this.onStateChange("denied");
            }
        };
        rec.onend = () => {
            if (this._active) {
                setTimeout(() => this._safeStart(), 300);
            }
        };
        this._recognition = rec;
    }
    _safeStart() {
        try {
            this._recognition.start();
        }
        catch (_) { }
    }
    _enterCommandMode() {
        this._commandMode = true;
        if (this.onWakeWord)
            this.onWakeWord();
        this._silenceHandle = setTimeout(() => {
            this._exitCommandMode();
            if (this.onStateChange)
                this.onStateChange("idle");
        }, 8000);
    }
    _exitCommandMode() {
        this._commandMode = false;
        clearTimeout(this._silenceHandle);
    }
}
