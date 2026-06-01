// @ts-nocheck
import ReactDOM from "https://esm.sh/react-dom@18.3.1/client";
import { React, html } from "./lib.js";
import { AlfredApp } from "./AlfredApp.js";

const rootEl = document.getElementById("app-root");
if (rootEl) {
  const root = ReactDOM.createRoot(rootEl);
  root.render(html`<${React.StrictMode}><${AlfredApp} /></${React.StrictMode}>`);
  requestAnimationFrame(() => {
    document.dispatchEvent(new CustomEvent("alfred:ui-ready"));
  });
}
