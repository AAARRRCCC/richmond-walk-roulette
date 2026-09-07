import { setTheme, useTheme } from "../app/theme";
import { playTap, setSoundOn, soundOn } from "../lib/sound";
import { say } from "./Toast";

/**
 * The corner toggles every plvr.net page has: theme, sound, and a way home.
 * On a phone the two toggles sit in the sheet's titlebar instead.
 */

const SUN = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);
const MOON = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" />
  </svg>
);
const SOUND = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 9v6h4l5 4V5L8 9z" />
    <path d="M16 9a4 4 0 0 1 0 6M18.5 6.5a8 8 0 0 1 0 11" />
  </svg>
);
const MUTED = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M4 9v6h4l5 4V5L8 9z" />
    <path d="M17 9l4 6M21 9l-4 6" />
  </svg>
);
const HOME = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 11l9-8 9 8" />
    <path d="M5 10v10h5v-6h4v6h5V10" />
  </svg>
);

export function ThemeButton({ className }: { className: string }) {
  const theme = useTheme();
  const dark = theme === "dark";
  return (
    <button
      type="button"
      className={`${className}${dark ? " off" : ""}`}
      title={dark ? "light mode" : "dark mode"}
      aria-label="toggle theme"
      onClick={() => {
        setTheme(dark ? "light" : "dark");
        playTap(true);
        say(dark ? "light mode" : "dark mode");
      }}
    >
      {dark ? MOON : SUN}
    </button>
  );
}

export function SoundButton({ className, on }: { className: string; on: boolean }) {
  return (
    <button
      type="button"
      className={`${className}${on ? "" : " off"}`}
      title="click and hover sounds"
      aria-pressed={on}
      aria-label="toggle sound effects"
      onClick={() => {
        const next = !soundOn();
        setSoundOn(next);
        if (next) playTap(true);
        say(next ? "sfx on" : "sfx off");
      }}
    >
      {on ? SOUND : MUTED}
    </button>
  );
}

export function Corner({ sound }: { sound: boolean }) {
  return (
    <div className="corner">
      <ThemeButton className="rb" />
      <SoundButton className="rb" on={sound} />
      <a className="rb" href="https://plvr.net" title="back to plvr.net" aria-label="back to plvr.net">
        {HOME}
      </a>
    </div>
  );
}
