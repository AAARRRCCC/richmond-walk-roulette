import { UsersIcon } from "@phosphor-icons/react";
import { describeInvite } from "../app/share";
import { shareNote, useShareAction } from "./useShareAction";

export type InviteButtonProps = {
  /**
   * The invite link, or null when there must not be a control at all.
   *
   * Null is the mint gate rendered. A reader who has opened an invite and not
   * yet set a start would otherwise mint a link naming **somebody else's front
   * door as their own** — a fabricated premise handed to a third person under
   * their name — so the button is absent rather than merely inert.
   */
  url: string | null;
  /** The sender's start as it will be described: a preset's name, or "a dropped pin". */
  originName: string;
  /** The dial's budget. Never a measured route: no route has been measured yet. */
  minutes: number;
  roundTrip: boolean;
  /** True when the link will carry a coordinate rather than a preset id. */
  pin: boolean;
};

/**
 * "Here is where I'm starting from — where are you?"
 *
 * The disclosure sits **above the button, before the press**, and it says what
 * is true rather than what is comfortable: the link cannot be revoked, because
 * a stateless link cannot be. There is no room, no socket, no account and no
 * server that ever holds both coordinates at once — which is the whole argument
 * of the feature, and it is also why an expiry cannot be offered. An
 * `x=<timestamp>` checked on the client would be *advisory* expiry, which looks
 * like a guarantee and is not one, so what ships instead is a date: the app can
 * say how old an invite is, and does.
 */
export function InviteButton(props: InviteButtonProps) {
  const { state, lastUrl, fallbackRef, share } = useShareAction();
  if (props.url === null) return null;
  const url = props.url;

  return (
    <div className="invite">
      <p className="meet-hint">
        {props.pin
          ? "This link carries where you're starting from, rounded to about 100 metres. Anyone who gets the link can read it — including the app you send it through, which fetches the link to build its preview. It does not expire and it cannot be taken back. Treat it like a text message, not a secret."
          : `This link names ${props.originName}, not a coordinate. Nothing about where you actually are goes into it.`}
      </p>
      <button
        type="button"
        className="button"
        onClick={() =>
          void share({
            url,
            title: "Both in reach",
            text: describeInvite({
              originName: props.originName,
              minutes: props.minutes,
              roundTrip: props.roundTrip,
            }),
          })
        }
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
