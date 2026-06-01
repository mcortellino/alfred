// @ts-nocheck
import { html } from "./lib.js";
import { MainStage } from "./components/MainStage.js";
import { SkillRail } from "./components/SkillRail.js";
import { Overlays } from "./components/Overlays.js";

export function AlfredApp() {
  return html`
    <div id="app">
      <div id="workspace">
        <${MainStage} />
        <${SkillRail} />
      </div>
      <${Overlays} />
    </div>
  `;
}
