import { CrosshairIcon, MapPinIcon, UsersIcon, LinkIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { PRESET_ORIGINS, type Origin } from "../data/places";
import { locateActionLabel, type PermissionHint } from "../lib/locate";
import { playPress, playTap } from "../lib/sound";
import { presenceOf, type RoomState } from "../app/room";
import type { Failure } from "../app/session";
import { useShareAction } from "./useShareAction";

export type RoomPanelProps = {
  /** Null outside a room: the panel is then only the button that starts one. */
  room: RoomState | null;
  roomUrl: string | null;
  origin: Origin;
  originChosen: boolean;
  /** True once this device has shared its start into the room. */
  consented: boolean;
  partnerFailure: Failure | null;
  permissionHint: PermissionHint;
  locating: boolean;
  onStartRoom: () => void;
  onShareStart: () => void;
  onUseMyLocation: () => void;
  onPickOnMap: () => void;
  onSelectPreset: (origin: Origin) => void;
  onLeave: () => void;
  onNewRoom: () => void;
};

export function RoomPanel(props: RoomPanelProps) {
  const [presetsOpen, setPresetsOpen] = useState(false);
  const { state, lastUrl, fallbackRef, share } = useShareAction();

  if (props.room === null) {
    return (
      <div className="invite">
        <button
          type="button"
          className="button"
          onClick={() => {
            playPress();
            props.onStartRoom();
          }}
        >
          <UsersIcon size={16} weight="bold" aria-hidden="true" />
          meet someone
        </button>
        <p className="meet-hint">
          the link shows your start and settings to whoever opens it, for 12 hours.
        </p>
      </div>
    );
  }

  const presence = presenceOf(props.room);
  const leave = () => {
    playPress();
    props.onLeave();
  };

  if (presence === "full") {
    return (
      <section className="origin meet">
        <p className="notice is-warn">room is full.</p>
        <button type="button" className="link-button" onClick={leave}>
          spin alone
        </button>
      </section>
    );
  }
  if (presence === "replaced") {
    return (
      <section className="origin meet">
        <p className="notice">open in another tab.</p>
        <button type="button" className="link-button" onClick={leave}>
          spin alone here
        </button>
      </section>
    );
  }
  if (presence === "closed") {
    return (
      <section className="origin meet">
        <p className="notice">room closed. rooms last 12 hours.</p>
        <div className="meet-row">
          <button
            type="button"
            className="link-button"
            onClick={() => {
              playTap(true);
              props.onNewRoom();
            }}
          >
            new room
          </button>
          <button type="button" className="link-button" onClick={leave}>
            spin alone
          </button>
        </div>
      </section>
    );
  }

  if (!props.originChosen) {
    return (
      <section className="origin meet">
        <p className="field-label">both in reach</p>
        <p className="meet-hint">set your start to see what is in both reaches.</p>
        <p className="meet-hint">
          your start goes to the server to measure reach. it reaches them only when you press{" "}
          <em>share my start</em>.
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
            {props.locating ? "locating…" : locateActionLabel(props.permissionHint)}
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
            pick on the map
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
              landmarks
            </button>
          )}
        </div>
        <button type="button" className="link-button" onClick={leave}>
          spin alone
        </button>
      </section>
    );
  }

  if (!props.consented) {
    const isPin = props.origin.id === "custom" || props.origin.id === "me";
    return (
      <section className="origin meet">
        <p className="field-label">both in reach</p>
        <p className="meet-hint">
          {isPin
            ? "sharing sends your exact pin to the other person in this room."
            : `sharing tells them you start from ${props.origin.name}.`}
        </p>
        <button
          type="button"
          className="button"
          onClick={() => {
            playPress();
            props.onShareStart();
          }}
        >
          share my start
        </button>
        <button type="button" className="link-button" onClick={leave}>
          spin alone
        </button>
      </section>
    );
  }

  return (
    <section className="origin meet">
      <div className="meet-row">
        <p className="field-label">both in reach</p>
        <button type="button" className="link-button" onClick={leave}>
          leave
        </button>
      </div>
      {props.partnerFailure !== null && (
        <p className="notice is-warn">could not measure their side. {props.partnerFailure.message}</p>
      )}
      {props.roomUrl !== null && (
        <>
          <button type="button" className="button" onClick={() => void share({ url: props.roomUrl ?? "" })}>
            <LinkIcon size={16} weight="bold" aria-hidden="true" />
            copy link
          </button>
          {state === "manual" && (
            <input ref={fallbackRef} className="result-share-fallback" readOnly value={lastUrl} aria-label="room link" />
          )}
        </>
      )}
    </section>
  );
}
