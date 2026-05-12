import type { StartLocation } from "../data/pois";
import type { Range } from "./geo";

export type ShareState = {
  start: string | null;
  custom: StartLocation | null;
  range: Range;
  rt: boolean;
  diff: "any" | "flat" | "hilly";
  tags: string[];
  pick: string | null;
};

export function readShareState(): Partial<ShareState> | null {
  try {
    const h = window.location.hash;
    if (!h.startsWith("#s=")) return null;
    return JSON.parse(decodeURIComponent(h.slice(3))) as Partial<ShareState>;
  } catch {
    return null;
  }
}

export function writeShareState(state: ShareState): void {
  const enc = encodeURIComponent(JSON.stringify(state));
  window.history.replaceState(null, "", "#s=" + enc);
}
