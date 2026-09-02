import { useEffect, useRef, useState } from "react";
import { playPress } from "../lib/sound";

/** `shared` belonged to the system share sheet, which is no longer opened. */
export type ShareState = "idle" | "copied" | "shared" | "manual";

const COPIED_MS = 4_000;

// Copies to the clipboard rather than opening the system share sheet: the
// sheet's outcome is unknowable, so there was never an honest confirmation for it.
// The press cue fires synchronously; nothing sounds on success or failure.
export function useShareAction() {
  const [state, setState] = useState<ShareState>("idle");
  /** The URL of the press that produced the current state, so a manual fallback shows the right link. */
  const [lastUrl, setLastUrl] = useState("");
  const fallbackRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state !== "copied") return;
    const timer = setTimeout(() => setState("idle"), COPIED_MS);
    return () => clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    // Focus moves to the fallback because the reader now has to copy it by hand.
    if (state !== "manual") return;
    fallbackRef.current?.focus();
    fallbackRef.current?.select();
  }, [state]);

  const share = async (args: { url: string }): Promise<void> => {
    playPress();
    setLastUrl(args.url);
    try {
      await navigator.clipboard.writeText(args.url);
      setState("copied");
    } catch {
      setState("manual");
    }
  };

  return { state, lastUrl, fallbackRef, share };
}

/** The note under a share control, or null when there is nothing to say. */
export function shareNote(state: ShareState): string | null {
  switch (state) {
    case "copied":
      return "Link copied.";
    case "manual":
      return "Could not copy. Here is the link:";
    case "shared":
    case "idle":
      return null;
  }
}
