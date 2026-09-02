// Screenshot the running app in headless Chrome, driven over the DevTools
// protocol so MapLibre's GeoJSON layers have real time to tile.
//
//   node scripts/screenshot.mjs <url> <out.png> [width] [height] [waitMs]
//
// Chrome's own --screenshot flag fires on virtual time and misses the map's
// worker-tiled layers; the Claude-in-Chrome extension tab is often hidden,
// which suspends requestAnimationFrame entirely. This does neither.
import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const [url, out, width = "1400", height = "900", waitMs = "15000"] = process.argv.slice(2);
if (!url || !out) {
  console.error("usage: node scripts/screenshot.mjs <url> <out.png> [width] [height] [waitMs]");
  process.exit(2);
}
const chrome = process.env.CHROME ?? "C:/Program Files/Google/Chrome/Application/chrome.exe";
const port = 9333;
const proc = spawn(
  chrome,
  [
    "--headless=new",
    "--disable-gpu",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
    "--hide-scrollbars",
    `--window-size=${width},${height}`,
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${join(tmpdir(), "walk-screenshot-profile")}`,
    "about:blank",
  ],
  { stdio: "ignore" },
);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

let targets = [];
for (let i = 0; i < 40 && targets.length === 0; i++) {
  try {
    targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
  } catch {
    await sleep(250);
  }
}
const page = targets.find((target) => target.type === "page");
if (!page) {
  proc.kill();
  throw new Error("Chrome did not expose a page target");
}

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve) => ws.addEventListener("open", resolve, { once: true }));
let nextId = 0;
const pending = new Map();
ws.addEventListener("message", (event) => {
  const message = JSON.parse(event.data);
  if (message.id && pending.has(message.id)) {
    pending.get(message.id)(message.result);
    pending.delete(message.id);
  }
});
const send = (method, params = {}) =>
  new Promise((resolve) => {
    const id = ++nextId;
    pending.set(id, resolve);
    ws.send(JSON.stringify({ id, method, params }));
  });

await send("Page.enable");
await send("Emulation.setDeviceMetricsOverride", {
  width: Number(width),
  height: Number(height),
  deviceScaleFactor: 1,
  mobile: Number(width) < 900,
});
await send("Page.navigate", { url });
await sleep(Number(waitMs));
const shot = await send("Page.captureScreenshot", { format: "png" });
writeFileSync(out, Buffer.from(shot.data, "base64"));
ws.close();
proc.kill();
console.log(`wrote ${out}`);
