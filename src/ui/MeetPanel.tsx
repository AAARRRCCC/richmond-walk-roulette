import { CrosshairIcon, MapPinIcon, XIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { PRESET_ORIGINS, type Origin } from "../data/places";
import { locateActionLabel, type PermissionHint } from "../lib/locate";
import { playPress, playTap } from "../lib/sound";
import { INVITE_STALE_DAYS, epochDay } from "../app/share";
import type { Failure, MeetArrival } from "../app/session";

export type MeetPanelProps = {
  /** The other person's start, or null when the link named none we could use. */
  partner: Origin | null;
  /** Their display name. A preset's own name, or "Their start". Never free text. */
  partnerName: string;
  /**
   * True when they arrived as a coordinate rather than as a preset id, which is
   * derived (`partner.id === "partner"`) rather than stored — see
   * `partnerOrigin`. It is what earns the "to about a block" hint: a pin in a
   * meet link is always written at `PIN_PRECISION`.
   */
  partnerCoarse: boolean;
  originChosen: boolean;
  meet: MeetArrival | null;
  /** 0 to 1 across their ladder. Display only; no gate reads it. */
  partnerWarmed: number;
  partnerFailure: Failure | null;
  /** How many places are inside both reaches right now. */
  bothCount: number;
  /** This device's dial position, so the lock control can name what it commits to. */
  yourMinutes: number;
  /** True once this device has minted a link committing to `yourMinutes`. */
  youLocked: boolean;
  onLockIn: () => void;
  onMatchTheirs: (minutes: number) => void;
  /** The dial's budget, which is the number the link asked for and the reader sees. */
  budgetMinutes: number;
  permissionHint: PermissionHint;
  locating: boolean;
  nowMs: number;
  onUseMyLocation: () => void;
  onPickOnMap: () => void;
  onSelectPreset: (origin: Origin) => void;
  onLeaveMeet: () => void;
};

/**
 * **Both in reach.**
 *
 * Not "meet in the middle": that is the phrase every competitor uses and it is
 * a lie in this app's own terms. There is no middle — there is an overlap, and
 * the midpoint of two people on opposite banks of the James is in the river.
 * Refusing the phrase is the same refusal as refusing the circle.
 *
 * Four states, and the first of them is the one that carries the feature's
 * whole privacy argument: **before the reader has chosen a start, nothing is
 * drawn, nothing is warmed, Spin is not pressable and no link is mintable.**
 * Opening an invite therefore costs the recipient's browser and IP nothing at
 * all until they answer it.
 *
 * Its root is `<section className="origin meet">` deliberately: `.is-picking`
 * dims the rail and kills its pointer events, exempting `.origin` and its
 * children, so without that class "Pick on the map" would be unusable the
 * moment it was pressed.
 */
export function MeetPanel(props: MeetPanelProps) {
  const [presetsOpen, setPresetsOpen] = useState(false);

  const staleDays =
    props.meet?.mintedDay == null ? null : epochDay(props.nowMs) - props.meet.mintedDay;
  const stale = staleDays !== null && staleDays > INVITE_STALE_DAYS;

  return (
    <section className="origin meet">
      {/* Above everything, because both are facts about the LINK rather than
          about the meeting it created. */}
      {props.meet?.partnerOutOfBounds === true && (
        <p className="notice is-warn">
          Their start is outside Richmond. This app only measures walks here.
        </p>
      )}
      {props.meet?.selfOutOfBounds === true && (
        <p className="notice is-warn">
          This link came back with your own start broken — set it again below.
        </p>
      )}
      {/* It still works, and that is the point. Refusing to open it would be
          theatre: the coordinate is in the URL either way, so the honest act is
          to say the start may be stale, not to pretend it was withdrawn. */}
      {stale && (
        <p className="notice">
          This invite is {staleDays} days old. Whoever sent it may not be starting there any
          more.
        </p>
      )}

      {!props.originChosen ? (
        <>
          <p className="field-label">Both in reach</p>
          <p className="meet-hint">
            Someone shared a starting point with you. Set where you're starting from and you'll
            see what's inside {props.budgetMinutes} minutes' walk of both of you.
          </p>
          {/* The recipient disclosure, verbatim, before anything is set. It
              deliberately does NOT say "your starting point stays on this
              device" — that would be false, and shipping a comfortable untruth
              in the one sentence written to reassure people would be the worst
              line in the product. The moment a start is set the app POSTs that
              coordinate to /api/isochrone at full precision, because that is
              the measurement being asked for. What is true is the claim below:
              nowhere else, and never into a link. */}
          <p className="meet-hint">
            When you set your start, it goes to this app's own server to measure how far you can
            walk — and nowhere else. It never goes into a link, and it never reaches the other
            person unless you press <em>Send this back</em>.
          </p>
          <div className="meet-actions">
            <button
              type="button"
              className="origin-action"
              disabled={props.locating}
              onClick={() => {
                playPress();
                props.onUseMyLocation();
              }}
            >
              <CrosshairIcon size={15} aria-hidden="true" />
              {props.locating ? "Finding you" : locateActionLabel(props.permissionHint)}
            </button>
            <button
              type="button"
              className="origin-action"
              onClick={() => {
                playPress();
                props.onPickOnMap();
              }}
            >
              <MapPinIcon size={15} aria-hidden="true" />
              Pick on the map
            </button>
            {/* Last, and behind a reveal, for two reasons that point the same
                way: the reader who wants the privacy-safe path will go looking
                for it, and a preset is the only choice that costs the engine
                nothing at all — it has a baked snapshot, while a pin pays a
                full 96-contour warm-up. */}
            {presetsOpen ? (
              <div className="meet-presets">
                {PRESET_ORIGINS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    className="origin-option"
                    onClick={() => {
                      playTap(true);
                      props.onSelectPreset(preset);
                    }}
                  >
                    {preset.name}
                  </button>
                ))}
              </div>
            ) : (
              <button
                type="button"
                className="link-button"
                onClick={() => {
                  playTap(true);
                  setPresetsOpen(true);
                }}
              >
                or start from a landmark
              </button>
            )}
          </div>
        </>
      ) : props.partnerFailure !== null ? (
        /* The only consumer of `partnerFailure`, and the reason the field
           exists rather than reusing `failure`: that one is read by the
           on-demand fetch gate and by `status`, so an error on their leg routed
           into it would blank YOUR answer at any dial position of yours that
           had not warmed. */
        <>
          <p className="field-label">Both in reach</p>
          <p className="notice is-warn">
            Couldn&rsquo;t measure their side. {props.partnerFailure.message}
          </p>
          <button type="button" className="link-button" onClick={leave(props)}>
            Spin from just your side
          </button>
        </>
      ) : props.partner === null ? null : props.partnerWarmed < 1 ? (
        <>
          <p className="field-label">Both in reach</p>
          <p className="meet-hint">
            Working out what&rsquo;s inside {props.budgetMinutes} minutes of their start.
          </p>
        </>
      ) : (
        <>
          <p className="field-label">Both in reach</p>
          <div className="meet-row">
            <span className="meet-chip">{props.partnerName}</span>
            <button
              type="button"
              className="icon-button"
              aria-label="Remove the other person"
              onClick={leave(props)}
            >
              <XIcon size={15} weight="bold" aria-hidden="true" />
            </button>
          </div>
          {props.partnerCoarse && <p className="meet-hint">to about a block</p>}

          {/* The lock-in. Deliberately NOT live sync: two dials moving on two
              screens needs a socket, a room and a server holding both
              sessions, which is the thing this feature refused. What the
              mechanic actually wants is smaller - a number that travels with
              the link and means "this is what I am walking", rather than "this
              is what I happen to be looking at". */}
          {props.meet?.partnerLockedMinutes != null && (
            <p className="meet-hint">
              They&rsquo;re locked in at <strong>{props.meet.partnerLockedMinutes} min</strong>.
              {props.meet.partnerLockedMinutes !== props.yourMinutes && (
                <>
                  {" "}
                  <button
                    type="button"
                    className="link-button"
                    onClick={() => {
                      playTap(true);
                      props.onMatchTheirs(props.meet?.partnerLockedMinutes ?? props.yourMinutes);
                    }}
                  >
                    Match {props.meet.partnerLockedMinutes} min
                  </button>
                </>
              )}
            </p>
          )}
          {props.youLocked ? (
            <p className="meet-hint">
              You&rsquo;re locked in at <strong>{props.yourMinutes} min</strong>. Send them the
              link again if you change it.
            </p>
          ) : (
            <button
              type="button"
              className="button"
              onClick={() => {
                playPress();
                props.onLockIn();
              }}
            >
              Lock in {props.yourMinutes} min
            </button>
          )}
          {/* One admission, said out loud rather than implied. There is no
              per-request speed parameter and adding one would put a costing
              knob on the one endpoint that costs real graph expansions — so
              both walks are measured at the same pace, and the app says so.
              The words "their pace" appear nowhere in this feature. */}
          <p className="meet-hint">
            {props.bothCount} places are inside both your reaches, both measured at the same
            walking pace.
          </p>
        </>
      )}
    </section>
  );
}

const leave = (props: MeetPanelProps) => () => {
  playPress();
  props.onLeaveMeet();
};
