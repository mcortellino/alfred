// @ts-nocheck
import { html } from "../lib.js";

export function MainStage() {
  return html`
    <main id="main-stage" aria-live="polite">
      <section id="main-canvas" data-state="idle" data-view="idle">
        <div id="idle-canvas">
          <div id="idle-datetime" aria-live="off">
            <div id="idle-clock">--:--:--</div>
            <div id="idle-date">--</div>
          </div>
          <div id="alfred-face-container"></div>
          <p id="status-text">Say "Alfred" to begin</p>
          <p id="live-transcript">Waiting for wake word...</p>
        </div>
        <div id="content-area" class="hidden"></div>
      </section>

      <p id="response-text" class="hidden" aria-hidden="true">Good day, sir. I await your command.</p>

      <section id="command-row" class="text-input-row hidden">
        <input
          type="text"
          id="text-command"
          placeholder="Type a command or say &quot;Alfred...&quot;"
          autocomplete="off"
          spellcheck="false"
        />
        <button id="send-btn">Send</button>
      </section>
    </main>
  `;
}
