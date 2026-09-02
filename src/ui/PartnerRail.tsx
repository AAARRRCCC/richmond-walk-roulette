import { VIBES, type Vibe } from "../data/places";
import { playTap } from "../lib/sound";
import { describePresence, formatRemaining, presenceOf, type RoomState } from "../app/room";

export type PartnerRailProps = {
  room: RoomState;
  /** A preset's own name, or "Their start". Never a person. */
  partnerName: string;
  yourMinutes: number;
  /** Places inside both reaches right now. */
  bothCount: number;
  nowMs: number;
  onMatch: (minutes: number) => void;
  onNewRoom: () => void;
};

const vibeLabel = (id: Vibe): string => VIBES.find((vibe) => vibe.id === id)?.label ?? id;

/**
 * The mirror rail (#15): their whole side, read-only, in the reader's own
 * order. Presence reads as data staleness — reconnecting dims, away dates
 * the values, waiting ghosts them.
 */
export function PartnerRail(props: PartnerRailProps) {
  const { room } = props;
  const presence = presenceOf(room);
  // Full and replaced are the room panel's to explain; nothing of theirs shows.
  if (presence === "full" || presence === "replaced") return null;

  const them = room.partner;
  const staleness = presence === "here" ? "" : presence === "reconnecting" ? " is-dim" : " is-stale";
  const remaining = room.expiresAt === null ? null : formatRemaining(room.expiresAt - props.nowMs);

  return (
    <aside className={`mirror panel${staleness}`} aria-label="Their side">
      <div className="mirror-head">
        <p className="field-label">Their side</p>
        <span className={`mirror-dot is-${presence}`} aria-hidden="true" />
      </div>
      {them !== null && (
        <p className="mirror-name">
          <span className="meet-chip">{props.partnerName}</span>
        </p>
      )}
      <p className="meet-hint" role="status">
        {describePresence(room, props.nowMs)}
      </p>

      {presence === "closed" ? (
        <>
          <p className="meet-hint">Rooms stay open 12 hours. Their settings went with it.</p>
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
            {presence === "waiting" ? "Nothing of theirs shows until they do." : "They're here, choosing a start."}
          </p>
          <p className="mirror-ghost">&mdash; min</p>
          {remaining !== null && <p className="meet-hint">Room closes in {remaining}.</p>}
        </>
      ) : (
        <>
          <div className="mirror-value-row">
            <span className="mirror-value">{them.budgetMinutes}</span>
            <span className="mirror-unit">min{them.roundTrip ? ", round trip" : ""}</span>
            {them.locked && <span className="mirror-lock">locked in</span>}
          </div>
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
            <p className="notice is-warn">Their start is outside Richmond. This app only measures walks here.</p>
          )}

          <p className="field-label">Their filters</p>
          <div className="chips">
            {them.edgeOnly && <span className="chip is-theirs">Far edge only</span>}
            {them.weatherAware && <span className="chip is-theirs">Mind the weather</span>}
            {them.climb !== "any" && <span className="chip is-theirs">Climb: {them.climb}</span>}
            {them.kind !== "any" && <span className="chip is-theirs">{them.kind}s only</span>}
            {them.vibes.map((vibe) => (
              <span key={vibe} className="chip is-theirs">
                {vibeLabel(vibe)}
              </span>
            ))}
            {!them.edgeOnly && !them.weatherAware && them.climb === "any" && them.kind === "any" && them.vibes.length === 0 && (
              <span className="meet-hint">None.</span>
            )}
          </div>

          {presence === "away" && (
            <p className="meet-hint">These are their settings from before they left. They may have walked off.</p>
          )}
          {presence === "reconnecting" && (
            <p className="meet-hint">Holding their last settings while the connection comes back.</p>
          )}
          {them.origin !== null && (
            <p className="meet-hint">{props.bothCount} places are inside both your reaches.</p>
          )}
        </>
      )}
    </aside>
  );
}
