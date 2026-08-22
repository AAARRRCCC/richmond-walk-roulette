import { useEffect, useRef, useState } from "react";
import { playPress } from "../lib/sound";

/**
 * What the share note is saying, if anything.
 *
 * `shared` is retained but no longer reachable: it belonged to the system share
 * sheet, which this app no longer opens. Kept so a future decision to bring it
 * back does not have to re-derive the state machine.
 */
export type ShareState = "idle" | "copied" | "shared" | "manual";

/** How long "Link copied." stays up before the note goes quiet again. */
const COPIED_MS = 4_000;

/**
 * Hand a URL to the system, or to the clipboard, or to the reader.
 *
 * Lifted out of `ResultCard` when the invite gained a second button that needs
 * exactly the same three-step fallback. Two copies of this would drift, and the
 * drift would only ever be visible to whoever pressed the button that got the
 * worse half — which is the same argument that keeps one `describeShare`.
 *
 * **The cue answers the gesture, not the outcome.** `playPress()` fires
 * synchronously on the press and nothing sounds on success or failure: a cue
 * arriving a second later, after a share sheet closes, would be the only sound
 * in this app not caused by a press. The written confirmation is the
 * confirmation, which also means it still works with sound off.
 */
export function useShareAction() {
  const [state, setState] = useState<ShareState>("idle");
  /**
   * The URL of the press that produced the current state.
   *
   * Not the caller's "current" link: one component can own two share controls,
   * and a manual fallback showing the other button's URL would hand the reader
   * the wrong link at exactly the moment they have to copy it by hand.
   */
  const [lastUrl, setLastUrl] = useState("");
  const fallbackRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state !== "copied") return;
    const timer = setTimeout(() => setState("idle"), COPIED_MS);
    return () => clearTimeout(timer);
  }, [state]);

  useEffect(() => {
    // Focus is being taken from the button the reader just pressed, which is the
    // sort of thing that needs justifying where it happens: the whole point of
    // this state is that they now have to copy the text themselves.
    if (state !== "manual") return;
    fallbackRef.current?.focus();
    fallbackRef.current?.select();
  }, [state]);

  const share = async (args: { url: string }): Promise<void> => {
    playPress();
    setLastUrl(args.url);

    // **Straight to the clipboard. The system share sheet is deliberately not
    // used**, even where the browser offers one.
    //
    // `navigator.share` was the first implementation and it was wrong for this
    // app: it interrupts with a full-screen chooser, it takes a variable number
    // of taps to reach the thing everyone actually wants, and its outcome is
    // unknowable - a resolved promise means the sheet closed, not that anything
    // was sent, which is why there was never an honest confirmation to show for
    // it. Copying is one action with one certain result, and the reader pastes
    // it wherever they were already going to paste it.
    try {
      await navigator.clipboard.writeText(args.url);
      setState("copied");
    } catch {
      // Clipboard access can be refused outright, and a button that silently
      // does nothing is worse than one that hands you the text to copy.
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
