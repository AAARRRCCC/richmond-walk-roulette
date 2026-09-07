import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/nunito";
import "@fontsource/fira-code/400.css";
import "@fontsource/fira-code/600.css";
import "maplibre-gl/dist/maplibre-gl.css";
import "./styles/app.css";
import { App } from "./app/App";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
