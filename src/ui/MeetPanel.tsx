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
  /** A preset's own name, or "Their start". Never free text from a link. */
  partnerName: string;
  /** True when they arrived as a coordinate, which is always rounded to about a block. */
  partnerCoarse: boolean;
  originChosen: boolean;
  meet: MeetArrival | null;
  /** 0 to 1 across their ladder. Display only. */
  partnerWarmed: number;
  partnerFailure: Failure | null;
  /** How many places are inside both reaches right now. */
  bothCount: number;
  yourMinutes: number;
  /** True once this device has minted a link committing to `yourMinutes`. */
  youLocked: boolean;
  onLockIn: () => void;
  onMatchTheirs: (minutes: number) => void;
  budgetMinutes: number;
  permissionHint: PermissionHint;
  locating: boolean;
  nowMs: number;
  onUseMyLocation: () => void;
  onPickOnMap: () => void;
  onSelectPreset: (origin: Origin) => void;
  onLeaveMeet: () => void;
};

// Root carries `.origin` so `.is-picking` leaves it interactive.
// Before the reader chooses a start nothing is drawn, warmed, or mintable.
export function MeetPanel(props: MeetPanelProps) {
  const [presetsOpen, setPresetsOpen] = useState(false);

  const staleDays =
    props.meet?.mintedDay == null ? null : epochDay(props.nowMs) - props.meet.mintedDay;
  const stale = staleDays !== null && staleDays > INVITE_STALE_DAYS;

  return (
    <section className="origin meet">
      {props.meet?.partnerOutOfBounds === true && (
        <p className="notice is-warn">
          Their start is outside Richmond. This app only measures walks here.
        </p>
      )}
      {props.meet?.selfOutOfBounds === true && (
        <p className="notice is-warn">
          This link came back with your own start broken. Set it again below.
        </p>
      )}
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
            Someone shared a start with you. Set yours to see what&rsquo;s inside{" "}
            {props.budgetMinutes} minutes&rsquo; walk of both of you.
          </p>
          <p className="meet-hint">
            Your start goes to this app&rsquo;s server to measure your reach, and nowhere else.
            It never goes into a link unless you press <em>Send this back</em>.
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
          <p className="meet-hint">Measuring their side.</p>
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
          <p className="meet-hint">
            {props.bothCount} places are inside both your reaches, measured at the same pace.
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
