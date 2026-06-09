// @ts-nocheck
/**
 * app.js – Main Alfred application controller.
 *
 * Wires together AlfredFace, AlfredSpeech and the backend REST API.
 */

const API = "http://localhost:8000";

const alfred = {
  face:    null,
  speech:  null,
  audio:   new Audio(),
  lang:    "it",          // "en" | "it"
  _timer:  null,   // { interval, remaining }
  _diagLog: [],
  _isSpeaking: false,
  _isListeningForCommand: false,
  _speechToken: 0,
  _resumeContext: null,
  _commandAfterWake: false,
  _pendingMediaStart: null,
  _pendingConfirmAction: null,
  _confirmEscHandler: null,
  _timerAlarm: null,
  _idleClockInterval: null,
  _homeHiddenView: null,
  _activeRadioStation: null,
  _activeTvChannel: null,
  _activeStreamSkill: null,
  _calendarState: null,
  _mediaDucked: false,
  _duckedLevels: null,
  _duckLevel: 0.12,
  _skillPolicies: {
    radio: { streamGroup: "media-stream" },
    tv: { streamGroup: "media-stream" },
    shopping: {},
    timer: {},
  },

  // ── Bootstrap ────────────────────────────────────────────────────

  init() {
    this.face   = new AlfredFace("alfred-face-container");
    this.speech = new AlfredSpeech();

    this._wireSpeech();
    this._wireButtons();
    this._wireTextInput();
    this._wireSettings();
    this._wireDiagnostics();

    // Ensure TTS voices are loaded
    window.speechSynthesis.onvoiceschanged = () => {};

    this._applyLanguageUI();
    this._startIdleClock();
    this.setStatus("idle", this._idlePrompt());
    this._refreshVoiceStatus();
    this._refreshTtsStatus();
  },

  _isItalian() {
    return this.lang === "it";
  },

  _formatDateKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  },

  _parseDateKey(dateKey) {
    const parts = (dateKey || "").split("-");
    if (parts.length !== 3) return new Date(dateKey);
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  },

  _idlePrompt() {
    return this._isItalian() ? "Di' \u201CAlfred\u201D per iniziare" : 'Say \u201CAlfred\u201D to begin';
  },

  _listeningPrompt() {
    return this._isItalian() ? "Ti ascolto\u2026" : "Listening\u2026";
  },

  _applyLanguageUI() {
    const it = this._isItalian();

    const settingsLangSel = document.getElementById("settings-lang-select");
    if (settingsLangSel) settingsLangSel.value = this.lang;

    document.getElementById("status-text").textContent    = this._idlePrompt();
    document.getElementById("response-text").textContent  = it ? "Buongiorno, signore. Attendo i suoi ordini." : "Good day, sir. I await your command.";
    document.getElementById("text-command").placeholder   = it ? "Scrivi un comando o di' \u201CAlfred\u2026\u201D" : "Type a command or say \u201CAlfred\u2026\u201D";
    document.getElementById("send-btn").textContent       = it ? "Invia" : "Send";

    this.speech.setLanguage(it ? "it-IT" : "en-GB");
    this._updateIdleDateTime();
  },

  _startIdleClock() {
    this._updateIdleDateTime();
    if (this._idleClockInterval) return;
    this._idleClockInterval = setInterval(() => this._updateIdleDateTime(), 1000);
  },

  _updateIdleDateTime() {
    const clockEl = document.getElementById("idle-clock");
    const dateEl = document.getElementById("idle-date");
    if (!clockEl || !dateEl) return;

    const now = new Date();
    const locale = this._isItalian() ? "it-IT" : "en-GB";

    clockEl.textContent = now.toLocaleTimeString(locale, {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });

    dateEl.textContent = now.toLocaleDateString(locale, {
      weekday: "long",
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  },

  _wireDiagnostics() {
    this._diag("Logs ready");

    const diagCloseBtn = document.getElementById("diag-close-btn");
    if (diagCloseBtn) {
      diagCloseBtn.addEventListener("click", () => this._toggleDiagnostics(false));
    }

    const logsBtn = document.getElementById("btn-logs");
    if (logsBtn) {
      logsBtn.addEventListener("click", () => this._toggleDiagnostics(true));
    }

  },

  _diag(message) {
    const now = new Date();
    const stamp = now.toLocaleTimeString();
    this._diagLog.unshift(`[${stamp}] ${message}`);
    this._diagLog = this._diagLog.slice(0, 14);

    const log = document.getElementById("diag-log");
    if (log) log.textContent = this._diagLog.join("\n");
  },

  async _refreshVoiceStatus() {
    const summary = document.getElementById("diag-summary");
    if (summary) summary.textContent = "Checking backend voice status...";

    try {
      const res = await fetch(`${API}/api/voice/status`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const status = await res.json();

      const mode = status.wakeword_mode || "unknown";
      const framework = status.wakeword_framework || "n/a";
      if (summary) {
        if (status.enabled) {
          summary.textContent = `Voice backend: ONLINE (${mode} / ${framework})`;
        } else if ((status.reason || "").toLowerCase().includes("vosk model folder missing")) {
          summary.textContent = "Voice backend: OFFLINE (missing Vosk model). Browser fallback is active.";
        } else {
          summary.textContent = `Voice backend: OFFLINE - ${status.reason || "unknown reason"}. Browser fallback is active.`;
        }
      }
      this._diag(`voice.status enabled=${status.enabled} mode=${mode} framework=${framework}`);
      if (status.vosk_model_path) this._diag(`voice.vosk_path ${status.vosk_model_path}`);
      if (status.reason && status.reason !== "ok") this._diag(`voice.reason ${status.reason}`);
    } catch (err) {
      if (summary) summary.textContent = "Voice backend: UNREACHABLE";
      this._diag(`voice.status error ${err?.message || err}`);
    }
  },

  async _refreshTtsStatus() {
    const ttsSummary = document.getElementById("tts-summary");
    const prefSel = document.getElementById("tts-pref");
    if (ttsSummary) ttsSummary.textContent = "TTS: checking...";

    try {
      const [statusRes, voicesRes] = await Promise.all([
        fetch(`${API}/api/tts/status`, { cache: "no-store" }),
        fetch(`${API}/api/tts/voices`, { cache: "no-store" }),
      ]);

      if (!statusRes.ok) throw new Error(`TTS status HTTP ${statusRes.status}`);
      const status = await statusRes.json();

      let voiceCount = 0;
      if (voicesRes.ok) {
        const payload = await voicesRes.json();
        voiceCount = Array.isArray(payload.voices) ? payload.voices.length : 0;
      }

      if (prefSel && status.voice_preference) prefSel.value = status.voice_preference;

      const selected = status.selected_voice?.name || status.selected_voice?.id || "none";
      if (ttsSummary) {
        ttsSummary.textContent = status.enabled
          ? `TTS: ONLINE (${voiceCount} voices, pref=${status.voice_preference}, selected=${selected})`
          : `TTS: OFFLINE - ${status.reason || "unknown"}`;
      }
      this._diag(`tts.status enabled=${status.enabled} pref=${status.voice_preference || "n/a"}`);
      if (status.selected_voice?.id) this._diag(`tts.selected ${status.selected_voice.id}`);
    } catch (err) {
      if (ttsSummary) ttsSummary.textContent = "TTS: UNREACHABLE";
      this._diag(`tts.status error ${err?.message || err}`);
    }
  },

  async _applyTtsPreference() {
    const prefSel = document.getElementById("tts-pref");
    const pref = prefSel ? prefSel.value : "female";

    try {
      const res = await fetch(`${API}/api/tts/config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ voice_preference: pref }),
      });
      if (!res.ok) throw new Error(`TTS config HTTP ${res.status}`);

      this._diag(`tts.preference set to ${pref}`);
      await this._refreshTtsStatus();
    } catch (err) {
      this._diag(`tts.preference error ${err?.message || err}`);
    }
  },

  // ── Settings ─────────────────────────────────────────────────────

  _wireSettings() {
    const openBtn = document.getElementById("btn-settings");
    if (openBtn) {
      openBtn.addEventListener("click", () => this._toggleSettings(true));
    }

    const closeBtn = document.getElementById("settings-close-btn");
    if (closeBtn) {
      closeBtn.addEventListener("click", () => this._toggleSettings(false));
    }

    const langSel = document.getElementById("settings-lang-select");
    if (langSel) {
      langSel.addEventListener("change", (evt) => {
        const next = evt.target?.value;
        if (next === "en" || next === "it") {
          this.lang = next;
          this._applyLanguageUI();
        }
      });
    }

  },

  _toggleLang() {
    this.lang = this.lang === "en" ? "it" : "en";
    this._applyLanguageUI();
  },

  // ── Status helpers ───────────────────────────────────────────────

  setStatus(state, text) {
    this.face.setState(state);
    const micButton = document.getElementById("mic-button");
    if (micButton) {
      micButton.classList.remove("state-idle", "state-listen", "state-think", "state-speak", "state-error");
      micButton.classList.add(`state-${state}`);
    }
    const canvas = document.getElementById("main-canvas");
    if (canvas) canvas.dataset.state = state;
    const st = document.getElementById("status-text");
    if (st) st.textContent = text;
    this._updateStopVisibility();
  },

  respond(message, onDone = null) {
    const token = ++this._speechToken;
    this._isSpeaking = true;
    this._updateStopVisibility();
    let finished = false;
    let watchdogHandle = null;

    const clearWatchdog = () => {
      if (!watchdogHandle) return;
      clearTimeout(watchdogHandle);
      watchdogHandle = null;
    };

    const armWatchdog = () => {
      clearWatchdog();
      // Start watchdog only after TTS playback starts; avoids early restore due to fetch latency.
      const watchdogMs = Math.max(8000, Math.min(45000, 2600 + String(message || "").length * 95));
      watchdogHandle = setTimeout(() => finalize(), watchdogMs);
    };

    const finalize = () => {
      if (finished) return;
      finished = true;
      clearWatchdog();
      if (token !== this._speechToken) return;
      this._isSpeaking = false;
      this._restoreBackgroundMedia();
      this._updateStopVisibility();
      this.face.stopSpeaking();
      if (onDone) {
        // Small guard gap avoids clipping the tail of speech with media start.
        setTimeout(() => {
          if (token !== this._speechToken) return;
          onDone();
          this._flushPendingMediaStart();
        }, 160);
      } else {
        this._flushPendingMediaStart();
      }
      this.setStatus("idle", this._idlePrompt());
    };

    document.getElementById("response-text").textContent = message;
    this.setStatus("speak", this._isItalian() ? "Sto parlando\u2026" : "Speaking\u2026");
    this.face.startSpeaking();
    this.speech.speak(
      message,
      () => {
        if (token !== this._speechToken) return;
        this._duckBackgroundMedia();
        armWatchdog();
      },
      finalize
    );
  },

  // ── Speech wiring ────────────────────────────────────────────────

  _wireSpeech() {
    this.speech.onWakeWord = () => {
      this._diag("wake word detected");
      this._setTranscript(this._isItalian() ? "Wake rilevato - ascolto in corso (offline engine)..." : "Wake detected - listening with offline engine...");
      this._commandAfterWake = false;
      this._isListeningForCommand = true;
      this._speechToken++;
      this._isSpeaking = false;
      this._pendingMediaStart = null;
      this.speech.cancelSpeech();
      this._restoreBackgroundMedia();
      this.face.stopSpeaking();
      this._pauseActiveMediaForListening();
      this.setStatus("listen", this._listeningPrompt());
    };

    this.speech.onCommand = (cmd) => {
      this._diag(`command heard: ${cmd}`);
      this._setTranscript(cmd);
      this._commandAfterWake = true;
      this._isListeningForCommand = true;
      this._clearResumeContext();
      this.processCommand(cmd);
    };

    this.speech.onStateChange = (state, meta = null) => {
      if (state === "idle") {
        this._isListeningForCommand = false;
        this._diag("speech state: idle");
        if (!this._commandAfterWake && this._resumeContext) {
          const reason = meta?.reason || "no-command";
          this._diag(`no command recognized (${reason}), resuming previous media`);
          this._resumePreviousMedia();
        }
        this._flushPendingMediaStart();
        this.setStatus("idle", this._idlePrompt());
        this._updateStopVisibility();
      } else if (state === "denied") {
        this._isListeningForCommand = false;
        this._diag("speech state: denied (microphone permissions)");
        this.setStatus("idle", this._isItalian() ? "Accesso microfono negato - usa il testo" : "Microphone access denied - use text input");
      } else if (state === "unavailable") {
        this._isListeningForCommand = false;
        this._diag("speech state: unavailable");
        this.setStatus("idle", this._isItalian() ? "Voce offline non disponibile - uso testo" : "Offline voice unavailable - using text input");
      }
    };

    this.speech.onDiagnostic = (evt) => {
      const tag = evt?.tag ? `[${evt.tag}] ` : "";
      this._diag(`${tag}${evt?.message || "speech event"}`);
    };

    if (this.speech.supported) {
      this.speech.start();
      this._diag("speech engine start requested");
    } else {
      document.getElementById("mic-button").disabled = true;
      document.getElementById("mic-button").title = "Speech recognition not available in this browser";
      this._diag("speech unavailable in this browser");
    }

    // Manual mic button – click to enter command mode immediately
    document.getElementById("mic-button").addEventListener("click", () => {
      this._diag("manual mic button clicked");
      this._isListeningForCommand = true;
      this.setStatus("listen", this._listeningPrompt());
      if (!this.speech.supported) return;
      this.speech.triggerManualListen();
    });
  },

  // ── Button wiring ────────────────────────────────────────────────

  _wireButtons() {
    document.getElementById("btn-radio").addEventListener("click", () =>
      this._restoreHomeSkillView("radio") || this._reopenActiveRadio() || this.processCommand("play radio")
    );
    document.getElementById("btn-tv").addEventListener("click", () =>
      this._restoreHomeSkillView("tv") || this._reopenActiveTv() || this.processCommand("show tv")
    );
    document.getElementById("btn-shopping").addEventListener("click", () =>
      this.processCommand("show shopping list")
    );
    document.getElementById("btn-calendar").addEventListener("click", () =>
      this.processCommand("show calendar")
    );
    document.getElementById("btn-timer").addEventListener("click", () =>
      this._restoreHomeSkillView("timer") || this._showTimerSetup()
    );
    const homeBtn = document.getElementById("btn-home");
    if (homeBtn) homeBtn.addEventListener("click", () => this._goHomeView());
    const cmdBtn = document.getElementById("btn-command");
    if (cmdBtn) cmdBtn.addEventListener("click", () => this._toggleCommandRow());
    const stopBtn = document.getElementById("btn-stop");
    if (stopBtn) stopBtn.addEventListener("click", () => this._stopEverything(true));
  },

  _wireTextInput() {
    const input = document.getElementById("text-command");
    const btn   = document.getElementById("send-btn");

    const send = () => {
      const val = input.value.trim();
      if (!val) return;
      // Strip optional wake word typed by the user
      const cmd = val.replace(/^alfred[,\s]*/i, "").trim();
      if (cmd) this.processCommand(cmd);
      input.value = "";
      this._toggleCommandRow(false);
    };

    input.addEventListener("keydown", (e) => { if (e.key === "Enter") send(); });
    btn.addEventListener("click", send);
  },

  _isStopCommand(command) {
    const cmd = String(command || "").toLowerCase().trim();
    if (!cmd) return false;

    const stripped = cmd.replace(/^alfred[\s,]*/i, "").trim();
    const stopTerms = [
      "stop", "sop", "cancel", "halt", "basta", "ferma", "annulla", "stoppa",
    ];

    if (stopTerms.includes(stripped)) return true;
    return /\b(stop|sop|cancel|halt|basta|ferma|annulla|stoppa)\b/.test(stripped);
  },

  _stopEverything(showMessage = true) {
    this._diag("global stop triggered");

    this._speechToken++;
    this._isSpeaking = false;
    this._restoreBackgroundMedia();
    this.speech.cancelSpeech();
    this._pendingMediaStart = null;
    this._isListeningForCommand = false;
    this._clearResumeContext();
    this._activeRadioStation = null;
    this._activeTvChannel = null;
    this._activeStreamSkill = null;
    this._stopTimerAlarm();
    this._stopRadio(false);
    this._cancelTimer(false);
    this._hideContent();
    this._setTranscript(this._isItalian() ? "Tutte le attivita sono state fermate." : "All activities have been stopped.");

    if (showMessage) {
      document.getElementById("response-text").textContent = this._isItalian()
        ? "Mi fermo subito, signore."
        : "Stopping immediately, sir.";
    }
    this.setStatus("idle", this._idlePrompt());
    this._updateStopVisibility();
  },

  // ── Command dispatch ─────────────────────────────────────────────

  async processCommand(command) {
    if (this._isStopCommand(command)) {
      this._stopEverything(true);
      return;
    }

    this._commandAfterWake = true;
    this._isListeningForCommand = false;
    this._clearResumeContext();

    this.setStatus("think", this._isItalian() ? "Elaboro\u2026" : "Processing\u2026");
    document.getElementById("response-text").textContent =
      `\u201C${command}\u201D\u2026`;

    try {
      const res = await fetch(`${API}/api/command`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ command, lang: this.lang }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = await res.json();
      this._handleResult(result);
    } catch (err) {
      console.error("Alfred command error:", err);
      this.respond(this._isItalian()
        ? "Mi scusi, signore. Sto avendo difficolta di connessione."
        : "I apologise, sir. I seem to be having connectivity difficulties.");
      this.setStatus("error", this._isItalian() ? "Errore di connessione" : "Connection error");
    }
  },

  _handleResult(result) {
    const { action, message, data } = result;
    let afterSpeech = null;

    switch (action) {
      case "assistant_stop":   this._stopEverything(false);         break;
      case "radio_play":
        this._activeRadioStation = data ? { ...data } : null;
        this._showMediaLoader("radio", data?.name || "");
        afterSpeech = () => this._scheduleMediaStart(() => this._playRadio(data), "radio");
        break;
      case "radio_stop":
        this._activeRadioStation = null;
        this._stopRadio();
        break;
      case "radio_stations":   this._showStationPicker(data);       break;
      case "tv_show":
        this._activeTvChannel = data ? { ...data } : null;
        this._showMediaLoader("tv", data?.name || "");
        afterSpeech = () => this._scheduleMediaStart(() => this._showTV(data), "tv");
        break;
      case "tv_off":
        this._activeTvChannel = null;
        this._hideContent();
        break;
      case "tv_list":          this._showChannelPicker(data);       break;
      case "shopping_list":
      case "shopping_updated": this._showShopping(data);            break;
      case "calendar_open":
      case "calendar_updated": this._showCalendar(data);             break;
      case "timer_start":      this._startTimer(data);              break;
      case "timer_cancel":     this._cancelTimer();                 break;
      default: break;
    }

    this.respond(message, afterSpeech);
  },

  // ── Radio ────────────────────────────────────────────────────────

  _playRadio(station) {
    this._activateSkillStream("radio");
    this._activeRadioStation = station ? { ...station } : this._activeRadioStation;
    this._stopRadio(false);
    this.audio.src = station.url;
    this.audio.play().catch(() => {/* autoplay blocked – user will see the UI */});

    this._showRadioPlayer(station);
    this._updateStopVisibility();
  },

  _showRadioPlayer(station) {
    this._setContent(`
      <div class="radio-player">
        <div class="rp-now-playing">&#x1F4FB; ${this._isItalian() ? "In riproduzione" : "Now playing"}</div>
        <div class="rp-name">${this._esc(station.name)}</div>
        <div class="rp-genre">${this._esc(station.genre || "")}</div>
        <div class="radio-wave-wrap" aria-hidden="true">
          <div class="equalizer equalizer-lg">
            <span></span><span></span><span></span><span></span><span></span><span></span><span></span>
          </div>
        </div>
      </div>`, "radio");
  },

  _reopenActiveRadio() {
    if (!this._activeRadioStation) return false;
    this._showRadioPlayer(this._activeRadioStation);
    this._updateStopVisibility();
    return true;
  },

  _stopRadio(clearUI = true) {
    this.audio.pause();
    this.audio.src = "";
    this._releaseSkillStream("radio");
    if (clearUI) this._hideContent();
    this._updateStopVisibility();
  },

  _showStationPicker(stations) {
    const cards = stations.map(s => `
      <button class="station-card channel-card channel-row"
        onclick="alfred._runMediaSelectionCommand('play ${this._esc(s.name.toLowerCase())}', 'radio', '${this._esc(s.name)}')">
        <div class="channel-row-main">
          ${this._renderRadioStationLogo(s?.logo, s?.name)}
          <div class="channel-row-text">
            <strong class="channel-row-name">${this._esc(s.name)}</strong>
            <span class="channel-epg-inline"><b>${this._isItalian() ? "Genere" : "Genre"}:</b> ${this._esc(s.genre || (this._isItalian() ? "N/D" : "N/A"))}</span>
          </div>
        </div>
      </button>`).join("");

    const title = this._isItalian() ? "SCEGLI UNA STAZIONE" : "CHOOSE A STATION";
    this._setContent(`
      <div class="station-picker media-list-picker">
        <div class="panel-title">${title}</div>
        <div class="channel-list-vertical">${cards}</div>
      </div>`, "radio");
  },

  // ── TV ───────────────────────────────────────────────────────────

  _showTV(channel) {
    this._activateSkillStream("tv");
    this._activeTvChannel = channel ? { ...channel } : this._activeTvChannel;
    const canvas = document.getElementById("main-canvas");
    if (canvas) canvas.dataset.view = "tv";

    const type = channel.type || "youtube";

    if (type === "iframe") {
      this._setContent(`
        <div class="tv-shell tv-shell-full">
          <div class="tv-player" style="position:relative">
            <iframe id="channel-frame" src="${channel.url}"
              allow="autoplay; encrypted-media; fullscreen"
              style="width:100%;height:100%;border:0;display:block;background:#000;"
              referrerpolicy="no-referrer-when-downgrade"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
              onload="document.getElementById('frame-fallback').style.display='none'"
              onerror="document.getElementById('frame-fallback').style.display='block'"></iframe>
            <div id="frame-fallback" style="display:none;padding:16px;text-align:center">
              <p style="color:var(--text-dim);margin-bottom:12px">Il canale non è embeddabile. Aprilo su Mediaset Infinity.</p>
              <a href="${channel.url}" target="_blank" rel="noopener noreferrer"
                style="color:var(--gold);text-decoration:underline">${this._esc(channel.name)} → Mediaset Infinity</a>
            </div>
          </div>
        </div>`, "tv");
      return;
    }

    if (type === "link") {
      window.open(channel.url, "_blank", "noopener,noreferrer");
      this._setContent(`
        <div class="tv-shell tv-shell-full">
          <div style="padding:18px;text-align:center;font-style:italic;color:var(--text-dim)">
            Aperto nel browser &mdash; nessuno stream gratuito embeddabile disponibile.
          </div>
        </div>`, "tv");
      return;
    }

    if (type === "hls" || type === "hls-direct") {
      // hls      → route through backend CORS proxy (for RAI relinker)
      // hls-direct → load directly from CDN (Akamaized has CORS headers)
      const videoUrl = type === "hls"
        ? `${API}/api/hls-proxy?url=${encodeURIComponent(channel.url)}`
        : channel.url;

      this._setContent(`
        <div class="tv-shell tv-shell-full">
          <div class="tv-player" style="position:relative">
            <video id="hls-video" controls autoplay playsinline
              style="width:100%;height:100%;background:#000;display:block;"></video>
            <div id="tv-res-controls" style="position:absolute;top:12px;right:12px;z-index:20;">
              <select id="tv-res-select" aria-label="Resolution" style="background:rgba(0,0,0,0.6);color:#fff;border:1px solid rgba(255,255,255,0.08);padding:6px;border-radius:6px;"></select>
            </div>
          </div>
        </div>`, "tv");

      const video = document.getElementById("hls-video");
      if (typeof Hls !== "undefined" && Hls.isSupported()) {
        const hls = new Hls({ enableWorker: true });
        hls.loadSource(videoUrl);
        hls.attachMedia(video);
        // Populate resolution selector when manifest parsed
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          try {
            const sel = document.getElementById('tv-res-select') as HTMLSelectElement | null;
            if (!sel) return;
            sel.innerHTML = '';
            const autoOpt = document.createElement('option');
            autoOpt.value = 'auto';
            autoOpt.text = 'Auto';
            sel.appendChild(autoOpt);
            hls.levels.forEach((lvl: any, idx: number) => {
              const height = lvl.height || 0;
              const bitrateK = Math.round((lvl.bitrate || 0) / 1000);
              const title = (lvl.name || '').trim();
              let label = height
                ? `${idx + 1}: ${height}p ${bitrateK}kbps`
                : `${idx + 1}: ${bitrateK}kbps`;
              if (title) {
                label = `${idx + 1}: ${title} ${bitrateK}kbps`;
              }
              const opt = document.createElement('option');
              opt.value = String(idx);
              opt.text = label;
              sel.appendChild(opt);
            });
            sel.value = 'auto';
            sel.addEventListener('change', (e) => {
              const v = (e.target as HTMLSelectElement).value;
              if (v === 'auto') {
                hls.currentLevel = -1;
              } else {
                const levelIdx = parseInt(v, 10);
                if (!Number.isNaN(levelIdx)) hls.currentLevel = levelIdx;
              }
            });
          } catch (err) { }
        });
        hls.on(Hls.Events.ERROR, (_e, data) => {
          if (data.fatal) {
            video.insertAdjacentHTML("afterend",
              `<p style="color:var(--c-error);padding:8px;font-size:.85rem">
                Stream non disponibile (${data.type}).</p>`);
            hls.destroy();
          }
        });
        (video as any)._hls = hls;
      } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
        video.src = videoUrl;  // Native HLS – Safari
      } else {
        video.insertAdjacentHTML("afterend",
          `<p style="color:var(--c-error);padding:8px;font-size:.85rem">
            HLS non supportato da questo browser.</p>`);
      }
      if (video) {
        video.addEventListener("play", () => this._updateStopVisibility());
        video.addEventListener("pause", () => this._updateStopVisibility());
        video.addEventListener("ended", () => this._updateStopVisibility());
      }
      this._updateStopVisibility();
      return;
    }

    if (type === "dash" || type === "dash-direct") {
      const videoUrl = channel.url;

      this._setContent(`
        <div class="tv-shell tv-shell-full">
          <div class="tv-player" style="position:relative">
            <video id="hls-video" controls autoplay playsinline
              style="width:100%;height:100%;background:#000;display:block;"></video>
            <div id="tv-res-controls" style="position:absolute;top:12px;right:12px;z-index:20;">
              <select id="tv-res-select" aria-label="Resolution" style="background:rgba(0,0,0,0.6);color:#fff;border:1px solid rgba(255,255,255,0.08);padding:6px;border-radius:6px;"></select>
            </div>
          </div>
        </div>`, "tv");

      const video = document.getElementById("hls-video");
      if (typeof dashjs !== "undefined" && dashjs.MediaPlayer) {
        const player = dashjs.MediaPlayer().create();
        player.initialize(video, videoUrl, true);
        try {
          const sel = document.getElementById('tv-res-select') as HTMLSelectElement | null;
          if (sel) {
            sel.innerHTML = '';
            const autoOpt = document.createElement('option');
            autoOpt.value = 'auto';
            autoOpt.text = 'Auto';
            sel.appendChild(autoOpt);
            const infos = player.getBitrateInfoListFor('video') || [];
            infos.forEach((info: any, idx: number) => {
              const height = info.height || 0;
              const bitrateK = Math.round((info.bitrate || 0) / 1000);
              const label = height
                ? `${idx + 1}: ${height}p ${bitrateK}kbps`
                : `${idx + 1}: ${bitrateK}kbps`;
              const opt = document.createElement('option');
              opt.value = String(idx);
              opt.text = label;
              sel.appendChild(opt);
            });
            sel.value = 'auto';
            sel.addEventListener('change', (e) => {
              const v = (e.target as HTMLSelectElement).value;
              try {
                if (v === 'auto') {
                  player.setAutoSwitchQualityFor('video', true);
                } else {
                  const qualityIdx = parseInt(v, 10);
                  if (!Number.isNaN(qualityIdx)) {
                    player.setAutoSwitchQualityFor('video', false);
                    player.setQualityFor('video', qualityIdx);
                  }
                }
              } catch (_err) { }
            });
          }
        } catch (_e) { }
        player.on(dashjs.MediaPlayer.events.ERROR, () => {
          video.insertAdjacentHTML("afterend",
            `<p style="color:var(--c-error);padding:8px;font-size:.85rem">
              Stream DASH non disponibile.</p>`);
        });
        (video as any)._dash = player;
      } else {
        video.insertAdjacentHTML("afterend",
          `<p style="color:var(--c-error);padding:8px;font-size:.85rem">
            DASH non supportato da questo browser.</p>`);
      }
      if (video) {
        video.addEventListener("play", () => this._updateStopVisibility());
        video.addEventListener("pause", () => this._updateStopVisibility());
        video.addEventListener("ended", () => this._updateStopVisibility());
      }
      this._updateStopVisibility();
      return;
    }

    // Default: YouTube iframe
    this._setContent(`
      <div class="tv-shell tv-shell-full">
        <div class="tv-player">
          <iframe src="${channel.url}"
            allow="autoplay; encrypted-media" allowfullscreen></iframe>
        </div>
      </div>`, "tv");
      this._updateStopVisibility();
  },

  _reopenActiveTv() {
    if (!this._activeTvChannel) return false;
    this._showTV(this._activeTvChannel);
    return true;
  },

  _stopTvPlayback(clearUI = false) {
    const iframe = document.querySelector("#content-area iframe");
    if (iframe) iframe.src = "";

    const video = document.querySelector("#content-area #hls-video");
    if (video && video._hls) { video._hls.destroy(); }
    if (video && video._dash && typeof video._dash.reset === "function") { video._dash.reset(); }
    if (video) {
      video.pause();
      video.removeAttribute("src");
      try { video.load(); } catch (_) {}
    }

    this._releaseSkillStream("tv");

    if (clearUI) {
      const ca = document.getElementById("content-area");
      if (ca) {
        ca.innerHTML = "";
        ca.classList.add("hidden");
      }
      const canvas = document.getElementById("main-canvas");
      if (canvas) canvas.dataset.view = "idle";
      const idle = document.getElementById("idle-canvas");
      if (idle) idle.classList.remove("hidden");
    }

    this._updateStopVisibility();
  },

  _activateSkillStream(skill) {
    const policy = this._skillPolicies?.[skill];
    const group = policy?.streamGroup;
    if (!group) return;

    const current = this._activeStreamSkill;
    if (current && current !== skill) {
      this._stopSkillStream(current);
    }

    this._activeStreamSkill = skill;
  },

  _releaseSkillStream(skill) {
    if (this._activeStreamSkill === skill) {
      this._activeStreamSkill = null;
    }
  },

  _stopSkillStream(skill) {
    if (skill === "radio") {
      this._stopRadio(false);
      return;
    }
    if (skill === "tv") {
      this._stopTvPlayback(false);
    }
  },

  _showChannelPicker(channels) {
    const cards = channels.map(ch => {
      const onAir = ch?.epg?.on_air || null;
      const nextUp = ch?.epg?.next || null;
      const schedule = this._renderTvSchedulePreview(onAir, nextUp);
      const logo = this._renderTvChannelLogo(ch?.logo, ch?.name);
      return `
      <button class="channel-card channel-row"
        onclick="alfred._runMediaSelectionCommand('watch ${this._esc(ch.key)}', 'tv', '${this._esc(ch.name)}')">
        <div class="channel-row-main">
          ${logo}
          <div class="channel-row-text">
            <strong class="channel-row-name">${this._esc(ch.name)}</strong>
            ${schedule}
          </div>
        </div>
      </button>`;
    }).join("");

    const title = this._isItalian() ? "SCEGLI UN CANALE" : "CHOOSE A CHANNEL";
    this._setContent(`
      <div class="station-picker media-list-picker">
        <div class="panel-title">${title}</div>
        <div class="channel-list-vertical">${cards}</div>
      </div>`);
  },

  _renderTvSchedulePreview(onAir, nextUp) {
    const nowLabel = this._isItalian() ? "Ora" : "Now";
    const nextLabel = this._isItalian() ? "Dopo" : "Next";

    const nowText = onAir
      ? `${this._formatTvEpgTime(onAir.start)} ${this._esc(onAir.title || "")}`
      : (this._isItalian() ? "Dati non disponibili" : "No schedule data");

    const nextText = nextUp
      ? `${this._formatTvEpgTime(nextUp.start)} ${this._esc(nextUp.title || "")}`
      : (this._isItalian() ? "-" : "-");

    return `<span class="channel-epg-inline"><b>${nowLabel}:</b> ${nowText} <span class="channel-epg-sep">|</span> <b>${nextLabel}:</b> ${nextText}</span>`;
  },

  _renderTvChannelLogo(logoUrl, channelName) {
    if (logoUrl) {
      return `<img class="channel-row-logo" src="${this._esc(logoUrl)}" alt="${this._esc(channelName || "Channel")} logo" loading="lazy" referrerpolicy="no-referrer" onerror="this.outerHTML='&lt;span class=&quot;channel-row-icon&quot; aria-hidden=&quot;true&quot;&gt;&#x1F4FA;&lt;/span&gt;'"/>`;
    }
    return `<span class="channel-row-icon" aria-hidden="true">&#x1F4FA;</span>`;
  },

  _renderRadioStationLogo(logoUrl, stationName) {
    if (logoUrl) {
      return `<img class="channel-row-logo" src="${this._esc(logoUrl)}" alt="${this._esc(stationName || "Station")} logo" loading="lazy" referrerpolicy="no-referrer" onerror="this.outerHTML='&lt;span class=&quot;channel-row-icon&quot; aria-hidden=&quot;true&quot;&gt;&#x1F4FB;&lt;/span&gt;'"/>`;
    }
    return `<span class="channel-row-icon" aria-hidden="true">&#x1F4FB;</span>`;
  },

  _formatTvEpgTime(isoValue) {
    if (!isoValue) return "--:--";
    const date = new Date(isoValue);
    if (Number.isNaN(date.getTime())) return "--:--";

    const locale = this._isItalian() ? "it-IT" : "en-GB";
    return date.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
  },

  _runMediaSelectionCommand(command, mediaType, label) {
    this._showMediaLoader(mediaType, label || "");

    this.processCommand(command);
  },

  _showMediaLoader(mediaType, label) {
    const safeLabel = this._esc(label || "");
    const loadingText = mediaType === "tv"
      ? (this._isItalian() ? "Apro il canale..." : "Opening channel...")
      : (this._isItalian() ? "Sintonizzo la stazione..." : "Tuning station...");

    this._setContent(`
      <div class="media-loader-panel" aria-live="polite">
        <div class="media-loader-spinner" aria-hidden="true"></div>
        <div class="media-loader-title">${loadingText}</div>
        <div class="media-loader-subtitle">${safeLabel}</div>
      </div>`);
  },

  // ── Shopping ─────────────────────────────────────────────────────

  _showShopping(items) {
    const it = this._isItalian();
    const title = it ? "LISTA DELLA SPESA" : "SHOPPING LIST";
    const emptyMsg = it ? "La sua lista della spesa è vuota, signore." : "Your list is empty, sir.";
    const placeholder = it ? "Aggiungi un elemento..." : "Add an item...";
    const removeCmdTemplate = it
      ? "rimuovi {item} dalla lista"
      : "remove {item} from the list";

    const rows = items.length
      ? items.map(item => `
          <div class="shopping-item">
            <span>${this._esc(item)}</span>
            <button class="panel-btn panel-btn-danger panel-btn-icon"
              title="${it ? "Rimuovi" : "Remove"}"
              aria-label="${it ? "Rimuovi elemento" : "Remove item"}"
              onclick="alfred.processCommand('${this._esc(removeCmdTemplate.replace("{item}", item))}')">
              &#x2715;
            </button>
          </div>`).join("")
      : `<p class="empty-msg">${emptyMsg}</p>`;

    this._setContent(`
      <div class="shopping-panel">
        <div class="shopping-header">
          <div class="panel-title">${title}</div>
          <button class="panel-btn panel-btn-icon shopping-close" aria-label="${it ? "Chiudi lista" : "Close list"}" title="${it ? "Chiudi" : "Close"}" onclick="alfred._hideContent()">&#x2715;</button>
        </div>
        <div class="shopping-items" id="shopping-rows">${rows}</div>
        <div class="shopping-add">
          <input id="new-item" class="add-input" type="text"
            placeholder="${placeholder}" autocomplete="off"/>
          <button class="panel-btn panel-btn-icon shopping-action-icon"
            onclick="alfred._addItem()"
            title="${it ? "Aggiungi elemento" : "Add item"}"
            aria-label="${it ? "Aggiungi elemento" : "Add item"}">
            &#x2795;
          </button>
        </div>
        <div class="shopping-footer">
          <button class="panel-btn panel-btn-danger panel-btn-icon shopping-action-icon"
            onclick="alfred._confirmClearShopping()"
            title="${it ? "Svuota lista" : "Clear list"}"
            aria-label="${it ? "Svuota lista" : "Clear list"}">
            &#x1F5D1;
          </button>
        </div>
      </div>`);

    const inp = document.getElementById("new-item");
    if (inp) inp.addEventListener("keydown", (e) => {
      if (e.key === "Enter") this._addItem();
    });
  },

  _addItem() {
    const inp = document.getElementById("new-item");
    if (!inp || !inp.value.trim()) return;
    this.processCommand(`add ${inp.value.trim()} to the list`);
    inp.value = "";
  },

  _confirmClearShopping() {
    const it = this._isItalian();
    this._openConfirmDialog({
      title: it ? "Conferma" : "Confirmation",
      message: it
        ? "Vuole davvero svuotare tutta la lista della spesa?"
        : "Are you sure you want to clear the entire shopping list?",
      cancelLabel: it ? "Annulla" : "Cancel",
      confirmLabel: it ? "Svuota" : "Clear",
      danger: true,
      onConfirm: () => {
        this.processCommand(it ? "svuota lista della spesa" : "clear shopping list");
      },
    });
  },

  _showCalendar(payload) {
    const it = this._isItalian();
    const locale = it ? "it-IT" : "en-GB";
    const events = payload && Array.isArray(payload.events) ? payload.events : [];
    const view = (payload && payload.view) || (this._calendarState && this._calendarState.view) || "month";
    const now = new Date();
    const today = this._formatDateKey(now);
    let referenceDate = payload && payload.referenceDate ? this._parseDateKey(payload.referenceDate) : now;
    if (Number.isNaN(referenceDate.getTime())) {
      referenceDate = now;
    }
    const monthLabel = referenceDate.toLocaleDateString(locale, { month: "long", year: "numeric" });
    const selectedDate = view !== "day"
      ? (payload && payload.selectedDate) || (this._calendarState && this._calendarState.selectedDate) || null
      : null;
    const transitionDirection = (payload && payload.transitionDirection) || (this._calendarState && this._calendarState.transitionDirection) || "";
    this._calendarState = { events, view, referenceDate: this._formatDateKey(referenceDate), selectedDate, transitionDirection };
    const title = it ? "CALENDARIO" : "CALENDAR";
    const label = view === "day"
      ? (it ? "Vista Giornaliera" : "Daily view")
      : view === "week"
        ? (it ? "Vista Settimanale" : "Weekly view")
        : (it ? "Vista Mensile" : "Monthly view");
    this._setContent(`
      <div class="calendar-panel">
        <div class="calendar-header">
          <div class="calendar-header-main">
            <div class="panel-title">${title}</div>
            ${view === "month" ? `
            <div class="calendar-nav">
              <button class="panel-btn panel-btn-icon calendar-nav-btn" type="button" onclick="alfred._shiftCalendarMonth(-1)" aria-label="${it ? "Mese precedente" : "Previous month"}" title="${it ? "Mese precedente" : "Previous month"}">&#x25C0;</button>
              <div class="calendar-month-title">${monthLabel}</div>
              <button class="panel-btn panel-btn-icon calendar-nav-btn" type="button" onclick="alfred._shiftCalendarMonth(1)" aria-label="${it ? "Mese successivo" : "Next month"}" title="${it ? "Mese successivo" : "Next month"}">&#x25B6;</button>
            </div>` : ""}
          </div>
          <div class="calendar-view-switch">
            <button class="panel-btn${view === "month" ? " active" : ""}" type="button" onclick="alfred._setCalendarView('month')">${it ? "Mese" : "Month"}</button>
            <button class="panel-btn${view === "week" ? " active" : ""}" type="button" onclick="alfred._setCalendarView('week')">${it ? "Settimana" : "Week"}</button>
            <button class="panel-btn${view === "day" ? " active" : ""}" type="button" onclick="alfred._setCalendarView('day')">${it ? "Giorno" : "Day"}</button>
          </div>
        </div>
        <div class="calendar-subtitle">${label}</div>
        <div class="calendar-body${transitionDirection ? ` calendar-slide-${transitionDirection}` : ""}">
          ${this._renderCalendarView(view, referenceDate, events, transitionDirection)}
        </div>
      </div>`);
  },

  _setCalendarView(view) {
    if (!this._calendarState) {
      this._calendarState = { events: [], view: "month", referenceDate: this._formatDateKey(new Date()), selectedDate: null, transitionDirection: "" };
    }
    this._calendarState.view = view;
    this._calendarState.transitionDirection = "";
    if (!this._calendarState.referenceDate) {
      this._calendarState.referenceDate = this._formatDateKey(new Date());
    }
    if (view !== "month") {
      this._calendarState.selectedDate = null;
    }
    this._showCalendar(this._calendarState);
  },

  _shiftCalendarMonth(delta) {
    if (!this._calendarState) {
      this._calendarState = { events: [], view: "month", referenceDate: this._formatDateKey(new Date()), selectedDate: null, transitionDirection: "" };
    }
    let referenceDate = this._calendarState.referenceDate ? this._parseDateKey(this._calendarState.referenceDate) : new Date();
    if (Number.isNaN(referenceDate.getTime())) {
      referenceDate = new Date();
    }
    referenceDate.setDate(1);
    referenceDate.setMonth(referenceDate.getMonth() + delta);
    this._calendarState.referenceDate = this._formatDateKey(referenceDate);
    this._calendarState.transitionDirection = delta > 0 ? "left" : "right";
    this._showCalendar(this._calendarState);
  },

  _shiftCalendarWeek(delta) {
    if (!this._calendarState) {
      this._calendarState = { events: [], view: "week", referenceDate: this._formatDateKey(new Date()), selectedDate: null, transitionDirection: "" };
    }
    let referenceDate = this._calendarState.referenceDate ? this._parseDateKey(this._calendarState.referenceDate) : new Date();
    if (Number.isNaN(referenceDate.getTime())) {
      referenceDate = new Date();
    }
    referenceDate.setDate(referenceDate.getDate() + delta * 7);
    this._calendarState.referenceDate = this._formatDateKey(referenceDate);
    this._calendarState.transitionDirection = delta > 0 ? "left" : "right";
    this._showCalendar(this._calendarState);
  },

  _addCalendarEvent() {
    const titleInput = document.getElementById("calendar-event-title");
    const dateInput = document.getElementById("calendar-event-date");
    const timeInput = document.getElementById("calendar-event-time");
    if (!titleInput || !dateInput || !timeInput)
      return;
    const title = titleInput.value.trim();
    const date = dateInput.value;
    const time = timeInput.value || "09:00";
    if (!title || !date)
      return;
    const safeTitle = title.replace(/'/g, "\\'");
    this.processCommand(`add event ${safeTitle} on ${date} at ${time}`);
    titleInput.value = "";
  },

  _selectCalendarDay(dateKey) {
    if (this._calendarLongPressTriggered) {
      this._calendarLongPressTriggered = false;
      return;
    }
    if (this._calendarSwipeActive) {
      this._calendarSwipeActive = false;
      return;
    }
    if (!this._calendarState) {
      this._calendarState = { events: [], view: "month", referenceDate: this._formatDateKey(new Date()), selectedDate: null, transitionDirection: "" };
    }
    this._calendarState.selectedDate = dateKey;
    this._calendarState.transitionDirection = "";
    this._showCalendar(this._calendarState);
  },

  _openCalendarEventDialog(dateKey) {
    this._closeCalendarEventDialog();
    const it = this._isItalian();
    const locale = it ? "it-IT" : "en-GB";
    const dateLabel = new Date(dateKey).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" });

    const overlay = document.createElement("div");
    overlay.id = "calendar-event-overlay";
    overlay.innerHTML = `
      <div id="calendar-event-dialog" role="dialog" aria-modal="true" aria-labelledby="calendar-event-title">
        <div class="confirm-title" id="calendar-event-title">${this._esc(it ? "Nuovo evento" : "New event")}</div>
        <div class="calendar-event-dialog-subtitle">${this._esc(dateLabel)}</div>
        <input id="calendar-event-dialog-title" class="add-input" type="text" placeholder="${it ? "Titolo evento" : "Event title"}" autocomplete="off" />
        <div class="calendar-event-timer">
          <div class="timer-field">
            <label for="calendar-event-dialog-hour">${it ? "Ore" : "Hour"}</label>
            <div class="timer-spin">
              <button class="panel-btn panel-btn-icon timer-step-btn" type="button" aria-label="${it ? "Aumenta ore" : "Increase hour"}" onclick="alfred._stepCalendarEventTime('calendar-event-dialog-hour', 1, 0, 23)">&#x25B2;</button>
              <input id="calendar-event-dialog-hour" type="number" min="0" max="23" value="09" inputmode="numeric" />
              <button class="panel-btn panel-btn-icon timer-step-btn" type="button" aria-label="${it ? "Diminuisci ore" : "Decrease hour"}" onclick="alfred._stepCalendarEventTime('calendar-event-dialog-hour', -1, 0, 23)">&#x25BC;</button>
            </div>
          </div>
          <div class="timer-field">
            <label for="calendar-event-dialog-minute">${it ? "Minuti" : "Minute"}</label>
            <div class="timer-spin">
              <button class="panel-btn panel-btn-icon timer-step-btn" type="button" aria-label="${it ? "Aumenta minuti" : "Increase minute"}" onclick="alfred._stepCalendarEventTime('calendar-event-dialog-minute', 1, 0, 59)">&#x25B2;</button>
              <input id="calendar-event-dialog-minute" type="number" min="0" max="59" value="00" inputmode="numeric" />
              <button class="panel-btn panel-btn-icon timer-step-btn" type="button" aria-label="${it ? "Diminuisci minuti" : "Decrease minute"}" onclick="alfred._stepCalendarEventTime('calendar-event-dialog-minute', -1, 0, 59)">&#x25BC;</button>
            </div>
          </div>
        </div>
        <div class="confirm-actions">
          <button class="panel-btn" type="button" onclick="alfred._closeCalendarEventDialog()">
            ${this._esc(it ? "Annulla" : "Cancel")}
          </button>
          <button class="panel-btn panel-btn-success confirm-primary" type="button" onclick="alfred._submitCalendarEventDialog('${dateKey}')">
            ${this._esc(it ? "Aggiungi" : "Add")}
          </button>
        </div>
      </div>`;
    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) this._closeCalendarEventDialog();
    });

    document.body.appendChild(overlay);

    const titleInput = document.getElementById("calendar-event-dialog-title");
    const hourInput = document.getElementById("calendar-event-dialog-hour");
    const minuteInput = document.getElementById("calendar-event-dialog-minute");
    if (titleInput) {
      titleInput.focus();
      titleInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") this._submitCalendarEventDialog(dateKey);
      });
    }
    [hourInput, minuteInput].forEach(input => {
      if (input) {
        input.addEventListener("keydown", (e) => {
          if (e.key === "Enter") this._submitCalendarEventDialog(dateKey);
        });
      }
    });
  },

  _submitCalendarEventDialog(dateKey) {
    const titleInput = document.getElementById("calendar-event-dialog-title");
    const hourInput = document.getElementById("calendar-event-dialog-hour");
    const minuteInput = document.getElementById("calendar-event-dialog-minute");
    if (!titleInput || !hourInput || !minuteInput) return;
    const title = titleInput.value.trim();
    const hour = Math.min(23, Math.max(0, parseInt(hourInput.value || "0", 10) || 0));
    const minute = Math.min(59, Math.max(0, parseInt(minuteInput.value || "0", 10) || 0));
    if (!title) return;
    const hh = String(hour).padStart(2, "0");
    const mm = String(minute).padStart(2, "0");
    const safeTitle = title.replace(/'/g, "\\'");
    this._closeCalendarEventDialog();
    this.processCommand(`add event ${safeTitle} on ${dateKey} at ${hh}:${mm}`);
  },

  _closeCalendarEventDialog() {
    const overlay = document.getElementById("calendar-event-overlay");
    if (overlay) overlay.remove();
  },

  _stepCalendarEventTime(id, delta, min, max) {
    const input = document.getElementById(id);
    if (!input) return;
    const current = Math.min(max, Math.max(min, parseInt(input.value || "0", 10) || 0));
    const next = Math.min(max, Math.max(min, current + delta));
    input.value = String(next).padStart(2, "0");
    input.focus();
  },

  _isFestivityEvent(ev) {
    if (!ev || typeof ev !== "object") return false;
    if (ev.festivity || ev.holiday) return true;
    const title = (ev.title || "").toString().toLowerCase();
    return /festivity|festivo|holiday|natale|pasqua|capodanno|libero|festa/.test(title);
  },

  _isCommonHoliday(date) {
    if (!(date instanceof Date) || Number.isNaN(date.getTime())) return false;
    const monthDay = `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    return [
      "01-01", // New Year's Day
      "01-06", // Epiphany
      "04-25", // Liberation Day
      "05-01", // Labor Day
      "06-02", // Republic Day
      "08-15", // Assumption
      "11-01", // All Saints' Day
      "12-08", // Immaculate Conception
      "12-25", // Christmas
      "12-26", // St. Stephen's Day
      "12-31", // New Year's Eve
    ].includes(monthDay);
  },

  _calendarMonthPointerDown(event) {
    const cell = event.target.closest && event.target.closest(".calendar-day-cell, .calendar-week-day");
    if (!cell) return;
    event.preventDefault();
    this._calendarPointerState = {
      startX: event.clientX,
      startY: event.clientY,
      timer: null,
      moved: false,
      date: cell.dataset.date,
    };
    this._calendarLongPressTriggered = false;
    this._calendarSwipeActive = false;
    const timer = window.setTimeout(() => {
      if (this._calendarPointerState && !this._calendarPointerState.moved) {
        this._calendarLongPressTriggered = true;
        if (this._calendarPointerState.date) {
          this._openCalendarEventDialog(this._calendarPointerState.date);
        }
      }
    }, 500);
    this._calendarPointerState.timer = timer;
  },

  _calendarMonthPointerMove(event) {
    if (!this._calendarPointerState) return;
    const dx = event.clientX - this._calendarPointerState.startX;
    const dy = event.clientY - this._calendarPointerState.startY;
    if (Math.hypot(dx, dy) > 10) {
      if (this._calendarPointerState.timer) {
        clearTimeout(this._calendarPointerState.timer);
        this._calendarPointerState.timer = null;
      }
      this._calendarPointerState.moved = true;
    }
  },

  _calendarMonthPointerUp(event) {
    if (!this._calendarPointerState) return;
    const dx = event.clientX - this._calendarPointerState.startX;
    const dy = event.clientY - this._calendarPointerState.startY;
    if (this._calendarPointerState.timer) {
      clearTimeout(this._calendarPointerState.timer);
      this._calendarPointerState.timer = null;
    }
    if (!this._calendarLongPressTriggered && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
      this._calendarSwipeActive = true;
      if (this._calendarState && this._calendarState.view === "week") {
        this._shiftCalendarWeek(dx < 0 ? 1 : -1);
      } else {
        this._shiftCalendarMonth(dx < 0 ? 1 : -1);
      }
    }
    this._calendarPointerState = null;
  },

  _calendarMonthPointerCancel() {
    if (this._calendarPointerState && this._calendarPointerState.timer) {
      clearTimeout(this._calendarPointerState.timer);
    }
    this._calendarPointerState = null;
  },

  _renderCalendarView(view, referenceDate, events, transitionDirection = "") {
    const it = this._isItalian();
    const locale = it ? "it-IT" : "en-GB";
    const today = this._formatDateKey(referenceDate);
    const eventsByDate = events.reduce((acc, ev) => {
      const dateKey = ev.date || (ev.datetime && ev.datetime.slice(0, 10)) || today;
      (acc[dateKey] = acc[dateKey] || []).push(ev);
      return acc;
    }, {} as Record<string, any[]>);

    if (view === "day") {
      const rows = (eventsByDate[today] || []).map(ev => `
            <div class="calendar-event-row">
              <strong>${this._esc(ev.time || "")}</strong>
              <span>${this._esc(ev.title)}</span>
              <button class="panel-btn panel-btn-danger panel-btn-icon" title="${it ? "Rimuovi" : "Remove"}"
                onclick="alfred.processCommand('remove event ${this._esc(ev.title).replace(/'/g, "\\'")}')">&#x2715;</button>
            </div>`).join("");
      return `
          <div class="calendar-list">
            <div class="calendar-list-header">${it ? "Oggi" : "Today"} — ${referenceDate.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</div>
            ${rows || `<div class="calendar-empty">${it ? "Nessun evento programmato per oggi." : "No events scheduled for today."}</div>`}
          </div>`;
    }

    if (view === "week") {
      const weekStart = new Date(referenceDate);
      weekStart.setDate(referenceDate.getDate() - ((referenceDate.getDay() + 6) % 7));
      const selectedDate = this._calendarState && this._calendarState.selectedDate ? this._calendarState.selectedDate : null;
      const festivityDates = new Set(Object.keys(eventsByDate).filter(dateKey =>
        (eventsByDate[dateKey] || []).some(ev => this._isFestivityEvent(ev))
      ));
      const dayCards = [];
      for (let i = 0; i < 7; i++) {
        const day = new Date(weekStart);
        day.setDate(weekStart.getDate() + i);
        const dateKey = this._formatDateKey(day);
        const dayEvents = eventsByDate[dateKey] || [];
        const isHoliday = day.getDay() === 0 || this._isCommonHoliday(day) || festivityDates.has(dateKey);
        const selectedClass = selectedDate === dateKey ? " selected" : "";
        const festivityClass = isHoliday ? " festivity" : "";
        dayCards.push(`
              <div class="calendar-week-day${dateKey === today ? " today" : ""}${selectedClass}${festivityClass}" data-date="${dateKey}"
                onclick="alfred._selectCalendarDay('${dateKey}')"
                ondblclick="alfred._openCalendarEventDialog('${dateKey}')">
                <div class="calendar-week-label">${day.toLocaleDateString(locale, { weekday: "short" })}</div>
                <div class="calendar-week-number">${day.getDate()}</div>
                <div class="calendar-week-count">${dayEvents.length} ${it ? "evento" : "event"}${dayEvents.length !== 1 ? "s" : ""}</div>
              </div>`);
      }

      const rows = [];
      for (let i = 0; i < 7; i++) {
        const day = new Date(weekStart);
        day.setDate(weekStart.getDate() + i);
        const dateKey = this._formatDateKey(day);
        const dayEvents = eventsByDate[dateKey] || [];
        if (!dayEvents.length) continue;
        rows.push(`
              <div class="calendar-day-group">
                <div class="calendar-day-group-title">${day.toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "short" })}</div>
                ${dayEvents.map(ev => `
                  <div class="calendar-event-row">
                    <strong>${this._esc(ev.time || "")}</strong>
                    <span>${this._esc(ev.title)}</span>
                    <button class="panel-btn panel-btn-danger panel-btn-icon" title="${it ? "Rimuovi" : "Remove"}"
                      onclick="alfred.processCommand('remove event ${this._esc(ev.title).replace(/'/g, "\\'")}')">&#x2715;</button>
                  </div>`).join("")}
              </div>`);
      }

      const listHeader = selectedDate
        ? `${it ? "Eventi del giorno" : "Day events"} — ${new Date(selectedDate).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`
        : (it ? "Eventi di questa settimana" : "Weekly events");
      const selectedEvents = selectedDate ? eventsByDate[selectedDate] || [] : [];
      const rowsContent = selectedDate
        ? selectedEvents.map(ev => `
              <div class="calendar-event-row">
                <strong>${this._esc(ev.time || "")}</strong>
                <span>${this._esc(ev.title)}</span>
                <button class="panel-btn panel-btn-danger panel-btn-icon" title="${it ? "Rimuovi" : "Remove"}"
                  onclick="alfred.processCommand('remove event ${this._esc(ev.title).replace(/'/g, "\\'")}')">&#x2715;</button>
              </div>`)
        : rows;

      return `
          <div class="calendar-week-grid calendar-grid" onpointerdown="alfred._calendarMonthPointerDown(event)" onpointermove="alfred._calendarMonthPointerMove(event)" onpointerup="alfred._calendarMonthPointerUp(event)" onpointercancel="alfred._calendarMonthPointerCancel(event)">${dayCards.join("")}</div>
          <div class="calendar-day-hint">${selectedDate ? (it ? "Premi a lungo o fai doppio clic per aggiungere un evento a questo giorno." : "Long press or double click to add an event for this day.") : (it ? "Clicca un giorno per vedere gli eventi, scorri a sinistra/destra per cambiare settimana." : "Click a day to show events, swipe left/right to change week.")}</div>
          <div class="calendar-list">
            <div class="calendar-list-header">${listHeader}</div>
            ${rowsContent.join("") || `<div class="calendar-empty">${selectedDate ? (it ? "Nessun evento programmato per questo giorno." : "No events scheduled for this day.") : (it ? "Nessun evento programmato per questa settimana." : "No events scheduled this week.")}</div>`}
          </div>`;
    }

    const year = referenceDate.getFullYear();
    const month = referenceDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const selectedDate = this._calendarState && this._calendarState.selectedDate ? this._calendarState.selectedDate : null;
    const festivityDates = new Set(Object.keys(eventsByDate).filter(dateKey =>
      (eventsByDate[dateKey] || []).some(ev => this._isFestivityEvent(ev))
    ));
    const cells = [];
    const firstDay = new Date(year, month, 1).getDay();
    const leadingEmpty = (firstDay + 6) % 7; // Monday first
    for (let i = 0; i < leadingEmpty; i++) {
      cells.push(`<div class="calendar-day-cell calendar-day-placeholder"></div>`);
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const dateObj = new Date(year, month, day);
      const dateKey = this._formatDateKey(dateObj);
      const dayEvents = eventsByDate[dateKey] || [];
      const isHoliday = dateObj.getDay() === 0 || this._isCommonHoliday(dateObj) || festivityDates.has(dateKey);
      const selectedClass = selectedDate === dateKey ? " selected" : "";
      const festivityClass = isHoliday ? " festivity" : "";
      cells.push(`
            <div class="calendar-day-cell${dateKey === today ? " today" : ""}${selectedClass}${festivityClass}" data-date="${dateKey}"
              onclick="alfred._selectCalendarDay('${dateKey}')"
              ondblclick="alfred._openCalendarEventDialog('${dateKey}')">
              <div class="calendar-day-number">${day}</div>
              <div class="calendar-day-name">${dateObj.toLocaleDateString(locale, { weekday: "short" })}</div>
              <div class="calendar-day-meta">${dayEvents.length ? `${dayEvents.length} ${it ? "eventi" : "events"}` : ""}</div>
            </div>`);
    }

    const listDate = selectedDate ? selectedDate : null;
    const selectedEvents = listDate ? eventsByDate[listDate] || [] : [];
    const listHeader = listDate
      ? `${it ? "Eventi del giorno" : "Day events"} — ${new Date(listDate).toLocaleDateString(locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}`
      : (it ? "Eventi di questo mese" : "Monthly events");
    const rows = listDate
      ? selectedEvents.map(ev => `
            <div class="calendar-event-row">
              <strong>${this._esc(ev.time || "")}</strong>
              <span>${this._esc(ev.title)}</span>
              <button class="panel-btn panel-btn-danger panel-btn-icon" title="${it ? "Rimuovi" : "Remove"}"
                onclick="alfred.processCommand('remove event ${this._esc(ev.title).replace(/'/g, "\\'")}')">&#x2715;</button>
            </div>`)
      : events.map(ev => `
            <div class="calendar-event-row">
              <strong>${this._esc(ev.date)} ${this._esc(ev.time || "")}</strong>
              <span>${this._esc(ev.title)}</span>
              <button class="panel-btn panel-btn-danger panel-btn-icon" title="${it ? "Rimuovi" : "Remove"}"
                onclick="alfred.processCommand('remove event ${this._esc(ev.title).replace(/'/g, "\\'")}')">&#x2715;</button>
            </div>`);
    return `
          <div class="calendar-month-grid calendar-grid" onpointerdown="alfred._calendarMonthPointerDown(event)" onpointermove="alfred._calendarMonthPointerMove(event)" onpointerup="alfred._calendarMonthPointerUp(event)" onpointercancel="alfred._calendarMonthPointerCancel(event)">${cells.join("")}</div>
          <div class="calendar-day-hint">${selectedDate ? (it ? "Premi a lungo o fai doppio clic per aggiungere un evento a questo giorno." : "Long press or double click to add an event for this day.") : (it ? "Clicca un giorno per vedere gli eventi, scorri a sinistra/destra per cambiare mese." : "Click a day to show events, swipe left/right to change month.")}</div>
          <div class="calendar-list">
            <div class="calendar-list-header">${listHeader}</div>
            ${rows.join("") || `<div class="calendar-empty">${selectedDate ? (it ? "Nessun evento programmato per questo giorno." : "No events scheduled for this day.") : (it ? "Nessun evento programmato per questo mese." : "No events scheduled this month.")}</div>`}
          </div>`;
  },

  // ── Timer ────────────────────────────────────────────────────────

  _showTimerSetup() {
    const it = this._isItalian();
    const title = it ? "IMPOSTA TIMER" : "SET A TIMER";
    const minShort = it ? "1 min" : "1 min";
    const mins5 = it ? "5 min" : "5 min";
    const mins10 = it ? "10 min" : "10 min";
    const mins30 = it ? "30 min" : "30 min";
    const minLabel = it ? "Minuti" : "Minutes";
    const secLabel = it ? "Secondi" : "Seconds";
    const startLabel = it ? "Avvia timer" : "Start timer";

    this._setContent(`
      <div class="timer-setup">
        <div class="panel-title">${title}</div>
        <div class="preset-grid">
          <button class="panel-btn" onclick="alfred.processCommand('${it ? "imposta un timer di 1 minuto" : "set a timer for 1 minute"}')">${minShort}</button>
          <button class="panel-btn" onclick="alfred.processCommand('${it ? "imposta un timer di 5 minuti" : "set a timer for 5 minutes"}')">${mins5}</button>
          <button class="panel-btn" onclick="alfred.processCommand('${it ? "imposta un timer di 10 minuti" : "set a timer for 10 minutes"}')">${mins10}</button>
          <button class="panel-btn" onclick="alfred.processCommand('${it ? "imposta un timer di 30 minuti" : "set a timer for 30 minutes"}')">${mins30}</button>
        </div>
        <div class="custom-timer">
          <div class="timer-field">
            <label for="ct-min">${minLabel}</label>
            <div class="timer-spin">
              <button class="panel-btn panel-btn-icon timer-step-btn" type="button" aria-label="${it ? "Aumenta minuti" : "Increase minutes"}" onclick="alfred._stepTimerInput('ct-min', 1)">&#x25B2;</button>
              <input id="ct-min" type="number" min="0" max="99" placeholder="0" inputmode="numeric" />
              <button class="panel-btn panel-btn-icon timer-step-btn" type="button" aria-label="${it ? "Diminuisci minuti" : "Decrease minutes"}" onclick="alfred._stepTimerInput('ct-min', -1)">&#x25BC;</button>
            </div>
          </div>
          <div class="timer-field">
            <label for="ct-sec">${secLabel}</label>
            <div class="timer-spin">
              <button class="panel-btn panel-btn-icon timer-step-btn" type="button" aria-label="${it ? "Aumenta secondi" : "Increase seconds"}" onclick="alfred._stepTimerInput('ct-sec', 1)">&#x25B2;</button>
              <input id="ct-sec" type="number" min="0" max="59" placeholder="0" inputmode="numeric" />
              <button class="panel-btn panel-btn-icon timer-step-btn" type="button" aria-label="${it ? "Diminuisci secondi" : "Decrease seconds"}" onclick="alfred._stepTimerInput('ct-sec', -1)">&#x25BC;</button>
            </div>
          </div>
          <button class="panel-btn panel-btn-success panel-btn-icon timer-set-btn" type="button" onclick="alfred._startCustomTimer()" aria-label="${startLabel}" title="${startLabel}">&#x25B6;</button>
        </div>
        </div>`, "timer");
  },

  _stepTimerInput(id, delta) {
    const input = document.getElementById(id);
    if (!input) return;

    const min = parseInt(input.min || "0", 10);
    const max = parseInt(input.max || "999", 10);
    const current = parseInt(input.value || "0", 10) || 0;
    const next = Math.min(max, Math.max(min, current + delta));
    input.value = String(next);
    input.focus();
  },

  _startCustomTimer() {
    const it = this._isItalian();
    const m = parseInt(document.getElementById("ct-min")?.value || "0", 10) || 0;
    const s = parseInt(document.getElementById("ct-sec")?.value || "0", 10) || 0;
    if (m === 0 && s === 0) return;
    const parts = [];
    if (it) {
      if (m) parts.push(`${m} minut${m !== 1 ? "i" : "o"}`);
      if (s) parts.push(`${s} second${s !== 1 ? "i" : "o"}`);
      this.processCommand(`imposta un timer di ${parts.join(" e ")}`);
      return;
    }

    if (m) parts.push(`${m} minute${m !== 1 ? "s" : ""}`);
    if (s) parts.push(`${s} second${s !== 1 ? "s" : ""}`);
    this.processCommand(`set a timer for ${parts.join(" and ")}`);
  },

  _startTimer({ seconds, label }) {
    const it = this._isItalian();
    this._cancelTimer(false);
    let remaining = seconds;
    const totalSeconds = Math.max(1, seconds);

    this._setContent(`
      <div class="timer-live">
        <div class="panel-title">${it ? "TIMER ATTIVO" : "ACTIVE TIMER"}</div>
        <div class="timer-live-shell">
          <svg class="timer-ring" viewBox="0 0 140 140" aria-hidden="true">
            <circle class="timer-ring-track" cx="70" cy="70" r="54"></circle>
            <circle class="timer-ring-progress" id="timer-ring-progress" cx="70" cy="70" r="54"></circle>
          </svg>
          <div class="timer-live-center">
            <h2 id="main-timer-countdown">00:00</h2>
          </div>
        </div>
        <p id="main-timer-label">${this._esc(label || (it ? "Timer" : "Timer"))}</p>
        <div class="timer-live-actions" aria-label="${it ? "Azioni timer" : "Timer actions"}">
          <button class="panel-btn panel-btn-danger panel-btn-icon timer-cancel-btn" onclick="alfred._cancelTimer()" aria-label="${it ? "Annulla timer" : "Cancel timer"}" title="${it ? "Annulla" : "Cancel"}">&#x2715;</button>
        </div>
      </div>`, "timer");

    const countdown = document.getElementById("main-timer-countdown");
    const ring = document.getElementById("timer-ring-progress");
    this._updateCountdown(countdown, remaining);
    this._updateTimerProgress(ring, remaining, totalSeconds);

    this._timer = setInterval(() => {
      remaining--;
      this._updateCountdown(countdown, remaining);
      this._updateTimerProgress(ring, remaining, totalSeconds);
      if (remaining <= 0) {
        this._cancelTimer(false);
        this._timerDone(label);
      }
    }, 1000);
  },

  _cancelTimer(respond = true) {
    if (this._timer) { clearInterval(this._timer); this._timer = null; }
    this._stopTimerAlarm();
    const timerPanel = document.getElementById("main-timer-countdown");
    if (timerPanel) this._hideContent();
    if (respond) this.respond(this._isItalian() ? "Timer annullato, signore." : "Timer cancelled, sir.");
  },

  _timerDone(label) {
    const it = this._isItalian();
    this._hideContent();
    this._startTimerAlarm();
    const msg = it
      ? `${label || "Il timer"} è terminato, signore.`
      : `${label || "Your timer"} is complete, sir.`;
    this.respond(msg);
  },

  _updateCountdown(el, total) {
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    el.textContent = h > 0
      ? `${this._pad(h)}:${this._pad(m)}:${this._pad(s)}`
      : `${this._pad(m)}:${this._pad(s)}`;
  },

  _updateTimerProgress(el, remaining, total) {
    if (!el) return;
    const radius = 54;
    const circumference = 2 * Math.PI * radius;
    const progress = Math.min(1, Math.max(0, remaining / Math.max(1, total)));

    el.style.strokeDasharray = String(circumference);
    el.style.strokeDashoffset = String(circumference * (1 - progress));
  },

  _pad: (n) => String(n).padStart(2, "0"),

  // ── Audio beep (Web Audio API) ────────────────────────────────────

  _playBeep() {
    try {
      const ctx  = new (window.AudioContext || window.webkitAudioContext)();
      const osc  = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = "sine";
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.5, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.8);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + 1.8);
    } catch (_) { /* AudioContext blocked */ }
  },

  _duckBackgroundMedia() {
    if (this._mediaDucked) return;

    const levels = {
      radio: null,
      tv: null,
    };

    if (this.audio && this.audio.src) {
      levels.radio = this.audio.volume;
      this.audio.volume = Math.max(0, Math.min(1, this._duckLevel));
    }

    const video = document.querySelector("#content-area #hls-video");
    if (video && !video.muted) {
      levels.tv = video.volume;
      video.volume = Math.max(0, Math.min(1, this._duckLevel));
    }

    this._duckedLevels = levels;
    this._mediaDucked = true;
  },

  _restoreBackgroundMedia() {
    if (!this._mediaDucked) return;

    if (this.audio && this._duckedLevels && this._duckedLevels.radio !== null) {
      this.audio.volume = this._duckedLevels.radio;
    }

    const video = document.querySelector("#content-area #hls-video");
    if (video && this._duckedLevels && this._duckedLevels.tv !== null && !video.muted) {
      video.volume = this._duckedLevels.tv;
    }

    this._duckedLevels = null;
    this._mediaDucked = false;
  },

  _playTimerRing() {
    if (!this._timerAlarm?.ctx) return;
    const ctx = this._timerAlarm.ctx;
    const now = ctx.currentTime;
    const strikeOffsets = [0.0, 0.17];

    const playStrike = (when, baseFreq) => {
      const gain = ctx.createGain();
      gain.connect(ctx.destination);

      gain.gain.setValueAtTime(0.0001, when);
      gain.gain.exponentialRampToValueAtTime(0.18, when + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.62);

      const partials = [
        { type: "triangle", mult: 1.0, amp: 1.0 },
        { type: "sine", mult: 2.08, amp: 0.48 },
        { type: "sine", mult: 2.95, amp: 0.22 },
      ];

      for (const p of partials) {
        const osc = ctx.createOscillator();
        const mix = ctx.createGain();
        mix.gain.value = p.amp;
        osc.type = p.type;
        osc.frequency.setValueAtTime(baseFreq * p.mult, when);
        osc.frequency.exponentialRampToValueAtTime(baseFreq * p.mult * 0.985, when + 0.6);
        osc.connect(mix);
        mix.connect(gain);
        osc.start(when);
        osc.stop(when + 0.64);
      }
    };

    playStrike(now + strikeOffsets[0], 1510);
    playStrike(now + strikeOffsets[1], 1350);
  },

  _startTimerAlarm() {
    this._stopTimerAlarm();

    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const intervalMs = 1200;
      this._timerAlarm = {
        ctx,
        intervalId: null,
        timeoutId: null,
      };

      this._playTimerRing();
      this._timerAlarm.intervalId = setInterval(() => this._playTimerRing(), intervalMs);
      this._timerAlarm.timeoutId = setTimeout(() => this._stopTimerAlarm(), 30000);
      this._updateStopVisibility();
    } catch (_) {
      this._timerAlarm = null;
    }
  },

  _stopTimerAlarm() {
    if (!this._timerAlarm) return;

    if (this._timerAlarm.intervalId) clearInterval(this._timerAlarm.intervalId);
    if (this._timerAlarm.timeoutId) clearTimeout(this._timerAlarm.timeoutId);

    if (this._timerAlarm.ctx && typeof this._timerAlarm.ctx.close === "function") {
      this._timerAlarm.ctx.close().catch(() => {});
    }

    this._timerAlarm = null;
    this._updateStopVisibility();
  },

  // ── Content area helpers ─────────────────────────────────────────

  _setContent(html, view = "content") {
    if (view !== "tv" && this._activeStreamSkill === "tv") {
      this._stopTvPlayback(false);
    }

    const ca = document.getElementById("content-area");
    const canvas = document.getElementById("main-canvas");
    if (canvas) canvas.dataset.view = view;
    this._homeHiddenView = null;
    const idle = document.getElementById("idle-canvas");
    if (idle) idle.classList.add("hidden");
    ca.innerHTML = html;
    ca.classList.remove("hidden");
  },

  _hideContent() {
    this._stopTvPlayback(false);
    const ca = document.getElementById("content-area");
    ca.innerHTML = "";
    ca.classList.add("hidden");
    this._homeHiddenView = null;
    const canvas = document.getElementById("main-canvas");
    if (canvas) canvas.dataset.view = "idle";
    const idle = document.getElementById("idle-canvas");
    if (idle) idle.classList.remove("hidden");
    this._updateStopVisibility();
  },

  _goHomeView() {
    const ca = document.getElementById("content-area");
    const canvas = document.getElementById("main-canvas");
    const currentView = canvas?.dataset?.view || "content";

    if (ca && !ca.classList.contains("hidden") && ca.innerHTML.trim()) {
      this._homeHiddenView = currentView;
      ca.classList.add("hidden");
    }

    if (canvas) canvas.dataset.view = "idle";

    const idle = document.getElementById("idle-canvas");
    if (idle) idle.classList.remove("hidden");

    this._toggleCommandRow(false);
    this._updateStopVisibility();
  },

  _restoreHomeSkillView(view) {
    const ca = document.getElementById("content-area");
    const canvas = document.getElementById("main-canvas");
    const idle = document.getElementById("idle-canvas");

    if (!ca || !canvas) return false;
    if (!ca.classList.contains("hidden")) return false;
    if (this._homeHiddenView !== view) return false;
    if (!ca.innerHTML.trim()) return false;

    ca.classList.remove("hidden");
    if (idle) idle.classList.add("hidden");
    canvas.dataset.view = view;
    this._homeHiddenView = null;
    this._updateStopVisibility();
    return true;
  },

  _pauseActiveMediaForListening() {
    this._pendingMediaStart = null;
    this._resumeContext = null;

    if (!this.audio.paused) {
      this._resumeContext = {
        type: "radio",
        src: this.audio.src,
        currentTime: this.audio.currentTime || 0,
      };
      this.audio.pause();
      this._diag("media paused: radio audio");
      this._updateStopVisibility();
      return;
    }

    const video = document.querySelector("#content-area #hls-video");
    if (video && !video.paused) {
      this._resumeContext = {
        type: "stream-video",
      };
      video.pause();
      if (video._hls && typeof video._hls.stopLoad === "function") {
        video._hls.stopLoad();
      }
      this._diag("media paused: video stream");
      this._updateStopVisibility();
      return;
    }

    const iframe = document.querySelector("#content-area iframe");
    if (iframe && iframe.src) {
      this._resumeContext = {
        type: "iframe",
        src: iframe.src,
      };
      iframe.src = "";
      this._diag("media stopped: embedded stream iframe");
      this._updateStopVisibility();
    }
  },

  _resumePreviousMedia() {
    if (!this._resumeContext) return;

    const ctx = this._resumeContext;
    this._clearResumeContext();

    if (ctx.type === "radio" && ctx.src) {
      if (!this.audio.src) this.audio.src = ctx.src;
      try {
        this.audio.currentTime = ctx.currentTime || 0;
      } catch (_) {}
      this.audio.play().catch(() => {});
      this._diag("media resumed: radio audio");
      this._updateStopVisibility();
      return;
    }

    if (ctx.type === "stream-video") {
      const video = document.querySelector("#content-area #hls-video");
      if (video) {
        if (video._hls && typeof video._hls.startLoad === "function") {
          video._hls.startLoad();
        }
        video.play().catch(() => {});
        this._diag("media resumed: video stream");
        this._updateStopVisibility();
      }
      return;
    }

    if (ctx.type === "iframe" && ctx.src) {
      const iframe = document.querySelector("#content-area iframe");
      if (iframe) {
        iframe.src = ctx.src;
        this._diag("media resumed: embedded stream iframe");
        this._updateStopVisibility();
      }
    }
  },

  _clearResumeContext() {
    this._resumeContext = null;
  },

  _scheduleMediaStart(run, label) {
    if (this._isSpeaking || this._isListeningForCommand) {
      this._pendingMediaStart = { run, label };
      this._diag(`media start queued: ${label}`);
      return;
    }
    run();
  },

  _flushPendingMediaStart() {
    if (!this._pendingMediaStart) return;
    if (this._isSpeaking || this._isListeningForCommand) return;

    const pending = this._pendingMediaStart;
    this._pendingMediaStart = null;
    this._diag(`media start resumed: ${pending.label}`);
    pending.run();
  },

  _setTranscript(text) {
    const el = document.getElementById("live-transcript");
    if (el) el.textContent = text || "";
  },

  _toggleDiagnostics(open) {
    const overlay = document.getElementById("diag-overlay");
    if (!overlay) return;
    overlay.classList.toggle("hidden", !open);
  },

  _toggleSettings(open) {
    const overlay = document.getElementById("settings-overlay");
    if (!overlay) return;
    overlay.classList.toggle("hidden", !open);
  },

  _openConfirmDialog({ title, message, cancelLabel, confirmLabel, danger = false, onConfirm = null }) {
    this._closeConfirmDialog();
    this._pendingConfirmAction = typeof onConfirm === "function" ? onConfirm : null;

    const overlay = document.createElement("div");
    overlay.id = "confirm-overlay";
    overlay.innerHTML = `
      <div id="confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <div class="confirm-title" id="confirm-title">${this._esc(title || "Confirmation")}</div>
        <p class="confirm-message">${this._esc(message || "")}</p>
        <div class="confirm-actions">
          <button class="panel-btn" type="button" onclick="alfred._resolveConfirmDialog(false)">
            ${this._esc(cancelLabel || "Cancel")}
          </button>
          <button class="panel-btn ${danger ? "panel-btn-danger" : ""} confirm-primary" type="button" onclick="alfred._resolveConfirmDialog(true)">
            ${this._esc(confirmLabel || "Confirm")}
          </button>
        </div>
      </div>`;

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) this._resolveConfirmDialog(false);
    });

    document.body.appendChild(overlay);

    this._confirmEscHandler = (event) => {
      if (event.key === "Escape") this._resolveConfirmDialog(false);
    };
    document.addEventListener("keydown", this._confirmEscHandler);

    const primary = overlay.querySelector(".confirm-primary");
    if (primary) primary.focus();
  },

  _resolveConfirmDialog(confirmed) {
    const action = this._pendingConfirmAction;
    this._pendingConfirmAction = null;
    this._closeConfirmDialog();
    if (confirmed && typeof action === "function") action();
  },

  _closeConfirmDialog() {
    const overlay = document.getElementById("confirm-overlay");
    if (overlay) overlay.remove();
    if (this._confirmEscHandler) {
      document.removeEventListener("keydown", this._confirmEscHandler);
      this._confirmEscHandler = null;
    }
  },

  _isMediaRunning() {
    if (this.audio && this.audio.src && !this.audio.paused) return true;

    const video = document.querySelector("#content-area #hls-video");
    if (video && !video.paused && !video.ended) return true;

    const iframe = document.querySelector("#content-area iframe");
    if (iframe && iframe.src) return true;

    return false;
  },

  _isStreamSkillRunning() {
    return Boolean(this._activeStreamSkill);
  },

  _isTimerAlarmRunning() {
    return Boolean(this._timerAlarm?.ctx);
  },

  _updateStopVisibility() {
    const btn = document.getElementById("btn-stop");
    if (!btn) return;
    const active = this._isSpeaking || this._isMediaRunning() || this._isTimerAlarmRunning() || this._isStreamSkillRunning();
    btn.classList.toggle("hidden", !active);
  },

  _toggleCommandRow(forceOpen = null) {
    const row = document.getElementById("command-row");
    const input = document.getElementById("text-command");
    if (!row || !input) return;

    const open = forceOpen === null ? row.classList.contains("hidden") : Boolean(forceOpen);
    row.classList.toggle("hidden", !open);
    if (open) {
      setTimeout(() => input.focus(), 30);
    }
  },

  // ── Utility ──────────────────────────────────────────────────────

  _esc(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  },
};

window.alfred = alfred;

function bootstrapAlfred() {
  if (alfred.face) return true;
  if (!document.getElementById("alfred-face-container")) return false;
  if (typeof AlfredFace === "undefined" || typeof AlfredSpeech === "undefined") return false;
  alfred.init();
  return true;
}

if (!bootstrapAlfred()) {
  const tryBootstrap = () => {
    if (bootstrapAlfred()) return;
    setTimeout(tryBootstrap, 40);
  };
  document.addEventListener("DOMContentLoaded", tryBootstrap, { once: true });
  document.addEventListener("alfred:ui-ready", tryBootstrap, { once: true });
}
