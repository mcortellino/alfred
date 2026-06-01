// @ts-nocheck
import { React, html } from "../lib.js";

export function Overlays() {
  return html`
    <${React.Fragment}>
      <div id="settings-overlay" class="hidden" role="dialog" aria-modal="true" aria-label="Settings">
        <div id="settings-dialog">
          <div class="settings-header">
            <span>Settings</span>
            <button id="settings-close-btn" type="button">Close</button>
          </div>
          <div class="settings-row">
            <label for="settings-lang-select">Language</label>
            <select id="settings-lang-select">
              <option value="en">English</option>
              <option value="it">Italiano</option>
            </select>
          </div>
        </div>
      </div>

      <div id="diag-overlay" class="hidden" role="dialog" aria-modal="true" aria-label="Diagnostics">
        <div id="voice-diagnostics" aria-live="polite">
          <div class="diag-header">
            <span>Logs</span>
            <div class="diag-actions">
              <button id="diag-close-btn" type="button">Close</button>
            </div>
          </div>
          <pre id="diag-log"></pre>
        </div>
      </div>
    </${React.Fragment}>
  `;
}
