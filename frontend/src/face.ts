// @ts-nocheck
/**
 * face.js – Butler face SVG renderer + animator for Alfred.
 *
 * Exports a global `AlfredFace` class.
 * States: idle | listen | think | speak | error
 */

class AlfredFace {
  constructor(containerId) {
    this._container = document.getElementById(containerId);
    this._state = "idle";
    this._blinkTimer = null;
    this._speakTimer = null;
    this._render();
    this._scheduleNextBlink();
  }

  // ── Public API ──────────────────────────────────────────────────

  setState(state) {
    this._state = state;
    // Swap CSS class on container (used for drop-shadow tinting)
    this._container.className = `state-${state}`;
    this._updateGlow(state);
    if (state !== "speak") this._setMouthSmile();
  }

  startSpeaking() {
    this._animateMouth(true);
  }

  stopSpeaking() {
    this._animateMouth(false);
  }

  // ── SVG construction ────────────────────────────────────────────

  _render() {
    this._container.innerHTML = this._buildSVG();
    this._container.className = "state-idle";
  }

  _buildSVG() {
    return /* html */`
<svg id="alfred-svg" viewBox="0 0 200 280" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Alfred butler face">
  <defs>
    <linearGradient id="hat-grad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#3a4a61"/>
      <stop offset="52%" stop-color="#1d2a3c"/>
      <stop offset="100%" stop-color="#0d1520"/>
    </linearGradient>
    <linearGradient id="brim-grad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#2f3e55"/>
      <stop offset="100%" stop-color="#0b111a"/>
    </linearGradient>
    <radialGradient id="face-grad" cx="34%" cy="26%" r="80%">
      <stop offset="0%" stop-color="#f9edd8"/>
      <stop offset="65%" stop-color="#e6d3b1"/>
      <stop offset="100%" stop-color="#ccb58f"/>
    </radialGradient>
    <radialGradient id="cheek-grad" cx="50%" cy="50%" r="56%">
      <stop offset="0%" stop-color="rgba(210,120,95,.24)"/>
      <stop offset="100%" stop-color="rgba(210,120,95,0)"/>
    </radialGradient>
    <radialGradient id="monocle-glass" cx="36%" cy="30%" r="72%">
      <stop offset="0%" stop-color="rgba(215,245,255,.35)"/>
      <stop offset="100%" stop-color="rgba(120,170,210,.1)"/>
    </radialGradient>
    <filter id="face-shadow" x="-30%" y="-30%" width="160%" height="180%">
      <feDropShadow dx="0" dy="5" stdDeviation="4" flood-color="#000000" flood-opacity="0.34"/>
    </filter>
    <filter id="hat-shadow" x="-30%" y="-40%" width="160%" height="200%">
      <feDropShadow dx="0" dy="3" stdDeviation="2.4" flood-color="#000000" flood-opacity="0.4"/>
    </filter>
  </defs>

  <g filter="url(#face-shadow)">
    <ellipse cx="100" cy="158" rx="54" ry="68" fill="url(#face-grad)"/>
    <path d="M47,100 Q100,86 153,100 Q145,110 130,114 Q100,118 70,114 Q55,110 47,100 Z" fill="rgba(0,0,0,.16)"/>
    <path d="M52,102 Q100,90 148,102 Q135,105 121,108 Q100,111 79,108 Q65,105 52,102 Z" fill="rgba(255,255,255,.1)"/>
    <path d="M50,150 Q58,188 85,207" fill="none" stroke="rgba(0,0,0,.16)" stroke-width="2.2"/>
    <path d="M150,150 Q142,188 115,207" fill="none" stroke="rgba(0,0,0,.14)" stroke-width="2"/>
    <ellipse cx="74" cy="172" rx="13" ry="8" fill="url(#cheek-grad)"/>
    <ellipse cx="126" cy="172" rx="13" ry="8" fill="url(#cheek-grad)"/>
    <path d="M90,150 Q100,172 110,150" stroke="rgba(130,90,66,.35)" stroke-width="1.3" fill="none"/>
    <ellipse cx="95" cy="160" rx="3.2" ry="2.4" fill="rgba(181,131,95,.36)"/>
    <ellipse cx="105" cy="160" rx="3.2" ry="2.4" fill="rgba(181,131,95,.28)"/>
  </g>

  <g filter="url(#hat-shadow)">
    <path d="M66,84 L66,46 Q100,26 134,46 L134,84 Z" fill="url(#hat-grad)" stroke="#a1b6cc" stroke-width="1.2"/>
    <path d="M72,80 L72,49 Q100,34 128,49 L128,80 Z" fill="rgba(255,255,255,.06)"/>
    <rect x="66" y="70" width="68" height="12" fill="#53d9b3" opacity="0.95"/>
    <ellipse cx="100" cy="90" rx="58" ry="9.8" fill="url(#brim-grad)" stroke="#9eb2c9" stroke-width="1"/>
    <ellipse cx="100" cy="92.8" rx="49" ry="5.8" fill="rgba(0,0,0,.3)"/>
  </g>

  <path d="M62,110 Q76,101 91,109" stroke="#3b2516" stroke-width="4" stroke-linecap="round" fill="none"/>
  <path d="M109,109 Q123,104 138,109" stroke="#3b2516" stroke-width="4" stroke-linecap="round" fill="none"/>

  <ellipse cx="76" cy="128" rx="13" ry="10" fill="#ffffff"/>
  <ellipse cx="124" cy="128" rx="13" ry="10" fill="#ffffff"/>
  <circle cx="78" cy="128" r="6" fill="#2d1e15"/>
  <circle cx="122" cy="128" r="6" fill="#2d1e15"/>
  <circle cx="80" cy="126" r="1.4" fill="#ffffff"/>
  <circle cx="124" cy="126" r="1.4" fill="#ffffff"/>

  <ellipse id="lid-left" cx="76" cy="128" rx="15" ry="0" fill="#ecdfc6"/>
  <ellipse id="lid-right" cx="124" cy="128" rx="15" ry="0" fill="#ecdfc6"/>

  <circle cx="124" cy="128" r="16" fill="url(#monocle-glass)" stroke="#53d9b3" stroke-width="2.2"/>
  <circle cx="124" cy="128" r="13" fill="none" stroke="rgba(83,217,179,.28)" stroke-width="1.2"/>
  <path d="M138,139 C144,149 147,159 152,169" stroke="#53d9b3" stroke-width="1.3" fill="none" opacity="0.65"/>

  <path d="M70,170 C80,162 92,162 100,167 C108,162 120,162 130,170
           C121,176 109,173 100,170 C91,173 79,176 70,170 Z"
        fill="#402719"/>

  <path id="alfred-mouth" d="M88,184 Q100,193 112,184" stroke="#8b5a42" stroke-width="2.4" fill="none" stroke-linecap="round"/>

  <path d="M58,220 L80,272 L100,248 L120,272 L142,220" fill="#f4f5f6"/>
  <path d="M58,220 L80,272 L100,248" fill="#101722"/>
  <path d="M142,220 L120,272 L100,248" fill="#101722"/>

  <path d="M82,224 L96,231 L82,238 Z" fill="#0c1118"/>
  <path d="M118,224 L104,231 L118,238 Z" fill="#0c1118"/>
  <ellipse cx="100" cy="231" rx="5.8" ry="7.5" fill="#53d9b3"/>
</svg>`;
  }

  // ── Glow ring colour ────────────────────────────────────────────

  _updateGlow(state) {
    void state;
  }

  // ── Blink animation ─────────────────────────────────────────────

  _scheduleNextBlink() {
    const delay = 3000 + Math.random() * 4500;
    this._blinkTimer = setTimeout(() => {
      this._blink();
      this._scheduleNextBlink();
    }, delay);
  }

  _blink() {
    const ll = document.getElementById("lid-left");
    const rl = document.getElementById("lid-right");
    if (!ll || !rl) return;

    // Close
    ll.setAttribute("ry", "11");
    rl.setAttribute("ry", "11");
    // Open after ~130 ms
    setTimeout(() => {
      ll.setAttribute("ry", "0");
      rl.setAttribute("ry", "0");
    }, 130);
  }

  // ── Mouth animation ─────────────────────────────────────────────

  _setMouthSmile() {
    const m = document.getElementById("alfred-mouth");
    if (m) m.setAttribute("d", "M88,184 Q100,193 112,184");
  }

  _animateMouth(active) {
    const m = document.getElementById("alfred-mouth");
    if (!m) return;

    if (active) {
      let open = false;
      this._speakTimer = setInterval(() => {
        open = !open;
        m.setAttribute(
          "d",
          open
            ? "M90,184 Q100,200 110,184 Q100,203 90,184"
            : "M88,184 Q100,193 112,184"
        );
      }, 220);
    } else {
      clearInterval(this._speakTimer);
      this._setMouthSmile();
    }
  }
}
