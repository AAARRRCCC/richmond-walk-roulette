import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "maplibre-gl/dist/maplibre-gl.css";
import "./styles.css";

// Cloudflare Web Analytics drop-in. Cookie-free; only injected when
// VITE_CF_ANALYTICS_TOKEN is set in the build env (so dev builds and
// PR previews don't double-count). Vite inlines the env var at build
// time, so the conditional has zero runtime cost when disabled.
const cfToken = import.meta.env.VITE_CF_ANALYTICS_TOKEN;
if (cfToken) {
  const s = document.createElement("script");
  s.defer = true;
  s.src = "https://static.cloudflareinsights.com/beacon.min.js";
  s.dataset.cfBeacon = JSON.stringify({ token: cfToken });
  document.head.appendChild(s);
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
