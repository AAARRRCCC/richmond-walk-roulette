import type { Json } from "../lib/json";
import { clockOffsetMs, setClockOffset } from "./conditions";
import { applyReport, readReport } from "../lib/weather";

/**
 * Dev-only console hooks, so dusk, after-dark and weather states can be
 * reached on demand instead of waited for:
 *
 *   walkRouletteDev.clockOffset(4 * 60 * 60 * 1000)   // four hours later
 *   walkRouletteDev.clockOffset(0)                     // back to the device
 *   walkRouletteDev.weather(wire)                      // push a forecast in
 *
 * The whole module is behind `import.meta.env.DEV` at the call site.
 */

/** Set by the mounted App so a pushed forecast repaints. */
let repaint: () => void = () => {};

export function setDevRepaint(fn: () => void): void {
  repaint = fn;
}

type DevGlobal = typeof globalThis & {
  walkRouletteDev?: {
    clockOffset: (ms: number) => void;
    readOffset: () => number;
    weather: (wire: Json) => boolean;
  };
};

export function installDevHooks(): void {
  // SAFETY: widens globalThis by exactly one optional property; nothing is read back.
  (globalThis as DevGlobal).walkRouletteDev = {
    clockOffset: setClockOffset,
    readOffset: clockOffsetMs,
    weather: (wire) => {
      const parsed = readReport(wire);
      if (parsed === null) return false;
      applyReport(parsed);
      repaint();
      return true;
    },
  };
}
