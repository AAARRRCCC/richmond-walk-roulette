/**
 * The light/dark theme, shared with every plvr.net site.
 *
 * The chosen theme lives in a `plvr_theme` cookie on `.plvr.net`, so a visit
 * to the home page and a visit here open in the same mode. localStorage backs
 * it up for hosts the cookie cannot reach, such as localhost. Neither set
 * means the system preference.
 */

import { useSyncExternalStore } from "react";

export type Theme = "light" | "dark";

const COOKIE = "plvr_theme";
const KEY = "plvr.theme";

const listeners = new Set<() => void>();
let current: Theme = read();

function read(): Theme {
  try {
    const match = document.cookie.match(/(?:^|; )plvr_theme=(dark|light)/);
    const stored = match?.[1] ?? localStorage.getItem(KEY);
    if (stored === "dark" || stored === "light") return stored;
  } catch {
    /* storage blocked */
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function paint(next: Theme): void {
  document.documentElement.dataset["theme"] = next;
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute("content", next === "dark" ? "#232a33" : "#f6f1e7");
}

export function theme(): Theme {
  return current;
}

export function setTheme(next: Theme): void {
  current = next;
  paint(next);
  try {
    document.cookie = `${COOKIE}=${next}; Domain=.plvr.net; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;
    localStorage.setItem(KEY, next);
  } catch {
    /* storage blocked */
  }
  for (const listener of listeners) listener();
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    theme,
  );
}

paint(current);
