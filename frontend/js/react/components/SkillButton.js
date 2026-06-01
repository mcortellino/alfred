// @ts-nocheck
import { html } from "../lib.js";
export function SkillButton({ id, className = "", title, label, icon, hidden = false }) {
    const classes = `${className}`.trim();
    return html `
    <button id=${id} class=${classes} title=${title} aria-label=${label} hidden=${hidden}>
      <span class="rail-icon" aria-hidden="true">${icon}</span>
    </button>
  `;
}
