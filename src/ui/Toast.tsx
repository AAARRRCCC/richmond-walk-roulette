import { useSyncExternalStore } from "react";

/** The one-line toast every plvr.net page has, for "copied" and the toggles. */

type ToastState = { message: string; shown: boolean };

let state: ToastState = { message: "", shown: false };
let timer = 0;
const listeners = new Set<() => void>();

const notify = () => {
  for (const listener of listeners) listener();
};

export function say(text: string): void {
  window.clearTimeout(timer);
  state = { message: text, shown: true };
  notify();
  timer = window.setTimeout(() => {
    state = { message: text, shown: false };
    notify();
  }, 1600);
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};
const snapshot = () => state;

export function Toast() {
  const { message, shown } = useSyncExternalStore(subscribe, snapshot);
  return (
    <div className={`toast${shown ? " show" : ""}`} role="status">
      {message}
    </div>
  );
}
