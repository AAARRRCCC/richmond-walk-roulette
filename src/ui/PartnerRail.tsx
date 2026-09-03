import { CaretDownIcon } from "@phosphor-icons/react";
import { VIBES, type Vibe } from "../data/places";
import { playTap } from "../lib/sound";
import {
  describePresence,
  formatRemaining,
  presenceOf,
  type Presence,
  type RoomState,
} from "../app/room";

export type PartnerRailProps = {
  room: RoomState;
  /** A preset's own name, or "Their start". Never a person. */
  partnerName: string;
  yourMinutes: number;
  /** Places inside both reaches right now. */
  bothCount: number;
  nowMs: number;
  /** A strip under the status bar that opens on tap, instead of the desktop panel. */
  compact?: boolean;
  /** Whether the strip is open. Owned by App: the bottom sheet makes room for it. */
  expanded?: boolean;
  onToggle?: () => void;
  onMatch: (minutes: number) => void;
  onNewRoom: () => void;
};

const vibeLabel = (id: Vibe): string =>
  VIBES.find((vibe) => vibe.id === id)?.label ?? id;

const STRIP_WORD = {
  here: "choosing a start",
  reconnecting: "reconnecting",
  away: "away",
  waiting: "waiting",
  closed: "room closed",
  full: "",
  replaced: "",
} satisfies Record<Presence, string>;

/**
 * The mirror rail (#15): their whole side, read-only, in the reader's own
 * order. Presence reads as data staleness — reconnecting dims, away dates
 * the values, waiting ghosts them.
 */
export function PartnerRail(props: PartnerRailProps) {
  const { room } = props;
  const expanded = props.expanded === true;
  const presence = presenceOf(room);
  // Full and replaced are the room panel's to explain; nothing of theirs shows.
  if (presence === "full" || presence === "replaced") return null;

  const them = room.partner;
  const staleness =
    presence === "here"
      ? ""
      : presence === "reconnecting"
        ? " is-dim"
        : " is-stale";
  const compact = props.compact === true;
  const open = !compact || expanded;

  return (
    <aside
      className={`mirror${compact ? " is-compact" : " panel"}${open ? " is-open" : ""}${staleness}`}
      aria-label="Their side"
    >
      {compact ? (
        <button
          type="button"
          className="mirror-strip"
          aria-expanded={expanded}
          onClick={() => {
            playTap(!expanded);
            props.onToggle?.();
          }}
        >
          <span className={`mirror-dot is-${presence}`} aria-hidden="true" />
          <span className="mirror-strip-name">
            {them === null ? "Their side" : props.partnerName}
          </span>
          <span className="mirror-strip-value">
            {them === null
              ? STRIP_WORD[presence]
              : `${them.budgetMinutes} min${them.roundTrip ? ", round trip" : ""}`}
          </span>
          {them?.locked && <span className="mirror-lock">locked in</span>}
          <CaretDownIcon
            size={14}
            weight="bold"
            aria-hidden="true"
            className="mirror-caret"
          />
        </button>
      ) : (
        <div className="mirror-head">
          <p className="field-label">Their side</p>
          <span className={`mirror-dot is-${presence}`} aria-hidden="true" />
        </div>
      )}
      {open && <MirrorBody {...props} presence={presence} />}
    </aside>
  );
}

function MirrorBody(props: PartnerRailProps & { presence: Presence }) {
  const { room, presence } = props;
  const them = room.partner;
  const compact = props.compact === true;
  const remaining =
    room.expiresAt === null
      ? null
      : formatRemaining(room.expiresAt - props.nowMs);

  return (
    <div className="mirror-body">
      {them !== null && !compact && (
        <p className="mirror-name">
          <span className="meet-chip">{props.partnerName}</span>
        </p>
      )}
      <p className="meet-hint" role="status">
        {describePresence(room, props.nowMs)}
      </p>

      {presence === "closed" ? (
        <>
          <p className="meet-hint">
            Rooms stay open 12 hours. Their settings went with it.
          </p>
          <button
            type="button"
            className="button"
            onClick={() => {
              playTap(true);
              props.onNewRoom();
            }}
          >
            Start a new room
          </button>
        </>
      ) : them === null ? (
        <>
          <p className="meet-hint">
            {presence === "waiting"
              ? "Nothing of theirs shows until they do."
              : "They're here, choosing a start."}
          </p>
          {!compact && <p className="mirror-ghost">&mdash; min</p>}
          {remaining !== null && (
            <p className="meet-hint">Room closes in {remaining}.</p>
          )}
        </>
      ) : (
        <>
          {!compact && (
            <div className="mirror-value-row">
              <span className="mirror-value">{them.budgetMinutes}</span>
              <span className="mirror-unit">
                min{them.roundTrip ? ", round trip" : ""}
              </span>
              {them.locked && <span className="mirror-lock">locked in</span>}
            </div>
          )}
          {them.budgetMinutes !== props.yourMinutes && (
            <button
              type="button"
              className="link-button"
              onClick={() => {
                playTap(true);
                props.onMatch(them.budgetMinutes);
              }}
            >
              Match {them.budgetMinutes} min
            </button>
          )}
          {them.originOutOfBounds && (
            <p className="notice is-warn">
              Their start is outside Richmond. This app only measures walks
              here.
            </p>
          )}

          <p className="field-label">Their filters</p>
          <div className="chips">
            {them.edgeOnly && (
              <span className="chip is-theirs">Far edge only</span>
            )}
            {them.weatherAware && (
              <span className="chip is-theirs">Mind the weather</span>
            )}
            {them.climb !== "any" && (
              <span className="chip is-theirs">Climb: {them.climb}</span>
            )}
            {them.kind !== "any" && (
              <span className="chip is-theirs">{them.kind}s only</span>
            )}
            {them.vibes.map((vibe) => (
              <span key={vibe} className="chip is-theirs">
                {vibeLabel(vibe)}
              </span>
            ))}
            {!them.edgeOnly &&
              !them.weatherAware &&
              them.climb === "any" &&
              them.kind === "any" &&
              them.vibes.length === 0 && (
                <span className="meet-hint">None.</span>
              )}
          </div>

          {presence === "away" && (
            <p className="meet-hint">
              These are their settings from before they left. They may have
              walked off.
            </p>
          )}
          {presence === "reconnecting" && (
            <p className="meet-hint">
              Holding their last settings while the connection comes back.
            </p>
          )}
          {them.origin !== null && (
            <p className="meet-hint">
              {props.bothCount} places are inside both your reaches.
            </p>
          )}
        </>
      )}
    </div>
  );
}
