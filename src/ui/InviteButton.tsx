import { UsersIcon } from "@phosphor-icons/react";
import { shareNote, useShareAction } from "./useShareAction";

export type InviteButtonProps = {
  /** The invite link, or null when there must be no control at all (no start of the reader's own yet). */
  url: string | null;
  /** A preset's name, or "a dropped pin". */
  originName: string;
  /** The dial's budget. No route has been measured yet. */
  minutes: number;
  roundTrip: boolean;
  /** True when the link will carry a coordinate rather than a preset id. */
  pin: boolean;
};

// The disclosure sits above the button, before the press. A stateless link
// cannot be revoked or expired, so the app says how old an invite is instead.
export function InviteButton(props: InviteButtonProps) {
  const { state, lastUrl, fallbackRef, share } = useShareAction();
  if (props.url === null) return null;
  const url = props.url;

  return (
    <div className="invite">
      <p className="meet-hint">
        {props.pin
          ? "This link carries your start, rounded to about 100 m. Anyone with the link can read it, and it can't be taken back."
          : `This link names ${props.originName}, not a coordinate.`}
      </p>
      <button
        type="button"
        className="button"
        onClick={() => void share({ url })}
      >
        <UsersIcon size={16} weight="bold" aria-hidden="true" />
        Invite someone to meet
      </button>
      <p className="result-share-note" role="status">
        {shareNote(state) ?? ""}
      </p>
      {state === "manual" && (
        <input
          ref={fallbackRef}
          className="result-share-fallback"
          readOnly
          value={lastUrl}
          aria-label="Invite link"
        />
      )}
    </div>
  );
}
