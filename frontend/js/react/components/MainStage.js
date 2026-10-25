// @ts-nocheck
import { html } from "../lib.js";
export function MainStage() {
    return html `
    <main id="main-stage" aria-live="polite">
      <section id="main-canvas" data-state="idle" data-view="idle">
        <div id="idle-canvas">
          <div class="halloween-decorations" aria-hidden="true">
            <span class="halloween-bat">🦇</span>
            <span class="halloween-pumpkin halloween-pumpkin-left">🎃</span>
            <span class="halloween-pumpkin halloween-pumpkin-right">🎃</span>
          </div>
          <div id="idle-datetime" aria-live="off">
            <div id="idle-clock">--:--:--</div>
            <div id="idle-analog-clock" role="img" aria-label="Analog clock">
              <div class="clock-face" aria-hidden="true">
                <span class="clock-number">12</span>
                <span class="clock-number">1</span>
                <span class="clock-number">2</span>
                <span class="clock-number">3</span>
                <span class="clock-number">4</span>
                <span class="clock-number">5</span>
                <span class="clock-number">6</span>
                <span class="clock-number">7</span>
                <span class="clock-number">8</span>
                <span class="clock-number">9</span>
                <span class="clock-number">10</span>
                <span class="clock-number">11</span>
                <span class="clock-hand clock-hour-hand"></span>
                <span class="clock-hand clock-minute-hand"></span>
                <span class="clock-hand clock-second-hand"></span>
                <span class="clock-center"></span>
              </div>
            </div>
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
