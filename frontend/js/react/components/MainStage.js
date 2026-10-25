// @ts-nocheck
import { html } from "../lib.js";
export function MainStage() {
    return html `
    <main id="main-stage" aria-live="polite">
      <section id="main-canvas" data-state="idle" data-view="idle">
        <div id="idle-canvas">
          <div class="halloween-decorations" aria-hidden="true">
            <span class="halloween-bat">
              <svg viewBox="0 0 96 56" focusable="false">
                <path d="M48 19 38 7 35 21C26 13 17 12 7 14l8 9L2 21l8 17 15-8 7 16 12-9 4 11 4-11 12 9 7-16 15 8 8-17-13 2 8-9c-10-2-19-1-28 7L61 7 48 19Z" fill="#29213d" stroke="#bd79dc" stroke-linejoin="round" stroke-width="2.5"/>
                <path d="m38 25 5 2-4 4-4-3Zm20 0-5 2 4 4 4-3Z" fill="#ffb347"/>
              </svg>
            </span>
            <span class="halloween-pumpkin halloween-pumpkin-left">
              <svg viewBox="0 0 64 64" focusable="false">
                <path d="M31 17c-3-5 0-10 7-12 1 6-1 10-7 12Z" fill="#6b9d3b" stroke="#9bc45b" stroke-width="2"/>
                <path d="M32 18c-8-7-18-1-21 10-4 15 4 28 14 27 4 0 6-2 8-4 2 2 5 4 9 4 10 1 18-12 14-27-3-11-13-17-21-10-1-1-2-1-3 0Z" fill="#f07824" stroke="#ffad42" stroke-width="2"/>
                <path d="M32 19c-4 10-4 25 0 32m-8-31c-4 8-4 21 0 29m16-29c4 8 4 21 0 29" fill="none" stroke="#c34e1d" stroke-linecap="round" stroke-width="2"/>
                <path d="m22 34 5 5 5-5 5 5 5-5 3 12H19Z" fill="#30213a" stroke="#ffd071" stroke-linejoin="round" stroke-width="1.5"/>
              </svg>
            </span>
            <span class="halloween-pumpkin halloween-pumpkin-right">
              <svg viewBox="0 0 64 64" focusable="false">
                <path d="M31 17c-3-5 0-10 7-12 1 6-1 10-7 12Z" fill="#6b9d3b" stroke="#9bc45b" stroke-width="2"/>
                <path d="M32 18c-8-7-18-1-21 10-4 15 4 28 14 27 4 0 6-2 8-4 2 2 5 4 9 4 10 1 18-12 14-27-3-11-13-17-21-10-1-1-2-1-3 0Z" fill="#f07824" stroke="#ffad42" stroke-width="2"/>
                <path d="M32 19c-4 10-4 25 0 32m-8-31c-4 8-4 21 0 29m16-29c4 8 4 21 0 29" fill="none" stroke="#c34e1d" stroke-linecap="round" stroke-width="2"/>
                <path d="m22 35 5-5 5 5 5-5 5 5-2 10H24Z" fill="#30213a" stroke="#ffd071" stroke-linejoin="round" stroke-width="1.5"/>
              </svg>
            </span>
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
