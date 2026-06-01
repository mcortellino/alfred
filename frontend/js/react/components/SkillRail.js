// @ts-nocheck
import { html } from "../lib.js";
import { SkillButton } from "./SkillButton.js";
export function SkillRail() {
    return html `
    <aside id="skill-rail" aria-label="Skills">
      <${SkillButton}
        id="btn-home"
        className="rail-btn"
        title="Home"
        label="Home"
        icon=${html `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M6 10.5V20h12v-9.5"/><path d="M10 20v-5h4v5"/></svg>`}
      />
      <${SkillButton}
        id="mic-button"
        className="rail-btn rail-mic state-idle"
        title="Say Alfred or click to speak"
        label="Microphone"
        icon=${html `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.91-3c-.49 0-.9.36-.98.85C16.52 14.2 14.47 16 12 16s-4.52-1.8-4.93-4.15c-.08-.49-.49-.85-.98-.85-.61 0-1.09.54-1 1.14.49 3 2.89 5.35 5.91 5.78V20c0 .55.45 1 1 1s1-.45 1-1v-2.08c3.02-.43 5.42-2.78 5.91-5.78.1-.6-.39-1.14-1-1.14z"/></svg>`}
      />
      <${SkillButton}
        id="btn-stop"
        className="rail-btn rail-stop hidden"
        title="Stop all"
        label="Stop all"
        icon=${html `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><rect x="9" y="9" width="6" height="6" rx="1"/></svg>`}
      />
      <${SkillButton}
        id="btn-radio"
        className="rail-btn"
        title="Play radio"
        label="Radio"
        icon=${html `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8h14v11H5z"/><path d="M8 8 19 3"/><circle cx="9" cy="13.5" r="1.8"/><path d="M14 12h3M14 15h3"/></svg>`}
      />
      <${SkillButton}
        id="btn-tv"
        className="rail-btn"
        title="Show TV"
        label="TV"
        icon=${html `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="13" rx="2"/><path d="M8 21h8M10 18v3M14 18v3"/></svg>`}
      />
      <${SkillButton}
        id="btn-shopping"
        className="rail-btn"
        title="Shopping list"
        label="Shopping"
        icon=${html `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6h15l-1.4 7H8z"/><path d="M6 6 5 3H3"/><circle cx="9" cy="19" r="1.2"/><circle cx="18" cy="19" r="1.2"/></svg>`}
      />
      <${SkillButton}
        id="btn-timer"
        className="rail-btn"
        title="Set timer"
        label="Timer"
        icon=${html `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="13" r="7"/><path d="M12 13 15 11M9 3h6"/></svg>`}
      />
      <${SkillButton}
        id="btn-calendar"
        className="rail-btn"
        title="Open calendar"
        label="Calendar"
        icon=${html `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18"/><path d="M8 3v4M16 3v4"/><path d="M7 13h3M14 13h3M7 17h3M14 17h3"/></svg>`}
      />
      <${SkillButton}
        id="btn-settings"
        className="rail-btn rail-settings"
        title="Open settings"
        label="Settings"
        icon=${html `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2.8l1.2 1.4 1.9-.2.8 1.8 1.8.8-.2 1.9 1.4 1.2-1.4 1.2.2 1.9-1.8.8-.8 1.8-1.9-.2-1.2 1.4-1.2-1.4-1.9.2-.8-1.8-1.8-.8.2-1.9-1.4-1.2 1.4-1.2-.2-1.9 1.8-.8.8-1.8 1.9.2z"/><circle cx="12" cy="12" r="2.8"/></svg>`}
      />
      <${SkillButton}
        id="btn-logs"
        className="rail-btn rail-diagnostic"
        title="Open logs"
        label="Logs"
        icon=${html `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="16" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>`}
      />
    </aside>
  `;
}
