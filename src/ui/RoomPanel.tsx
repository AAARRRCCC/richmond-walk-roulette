import { CrosshairIcon, MapPinIcon, UsersIcon, LinkIcon } from "@phosphor-icons/react";
import { useState } from "react";
import { PRESET_ORIGINS, type Origin } from "../data/places";
import { locateActionLabel, type PermissionHint } from "../lib/locate";
import { playPress, playTap } from "../lib/sound";
import { presenceOf, type RoomState } from "../app/room";
import type { Failure } from "../app/session";
import { shareNote, useShareAction } from "./useShareAction";

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
          Invite someone to meet
        </button>
        <p className="meet-hint">
          You get a link. Whoever opens it sees your start and your settings in that room, for 12 hours, and
          nowhere else.
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
        <p className="notice is-warn">This room already has two walkers.</p>
        <button type="button" className="link-button" onClick={leave}>
          Spin on your own instead
        </button>
      </section>
    );
  }
  if (presence === "replaced") {
    return (
      <section className="origin meet">
        <p className="notice">This room is open in another tab.</p>
        <button type="button" className="link-button" onClick={leave}>
          Spin on your own here
        </button>
      </section>
    );
  }
  if (presence === "closed") {
    return (
      <section className="origin meet">
        <p className="notice">This room has closed. Rooms stay open 12 hours.</p>
        <div className="meet-row">
          <button
            type="button"
            className="link-button"
            onClick={() => {
              playTap(true);
              props.onNewRoom();
            }}
          >
            Start a new room
          </button>
          <button type="button" className="link-button" onClick={leave}>
            Spin on your own
          </button>
        </div>
      </section>
    );
  }

  if (!props.originChosen) {
    return (
      <section className="origin meet">
        <p className="field-label">Both in reach</p>
        <p className="meet-hint">
          Someone wants to find somewhere you can both walk to. Set your start to see what&rsquo;s inside both
          your reaches.
        </p>
        <p className="meet-hint">
          Your start goes to this app&rsquo;s server to measure your reach. It reaches them only when you press{" "}
          <em>Share my start</em>.
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
        <button type="button" className="link-button" onClick={leave}>
          Spin on your own instead
        </button>
      </section>
    );
  }

  if (!props.consented) {
    const isPin = props.origin.id === "custom" || props.origin.id === "me";
    return (
      <section className="origin meet">
        <p className="field-label">Both in reach</p>
        <p className="meet-hint">
          {isPin
            ? "Sharing sends your exact pin to the other person in this room, and to nobody else. Move it first if that is closer to home than you'd like."
            : `Sharing tells them you're starting from ${props.origin.name}.`}
        </p>
        <button
          type="button"
          className="button"
          onClick={() => {
            playPress();
            props.onShareStart();
          }}
        >
          Share my start
        </button>
        <button type="button" className="link-button" onClick={leave}>
          Spin on your own instead
        </button>
      </section>
    );
  }

  return (
    <section className="origin meet">
      <div className="meet-row">
        <p className="field-label">Both in reach</p>
        <button type="button" className="link-button" onClick={leave}>
          Leave the room
        </button>
      </div>
      {props.partnerFailure !== null && (
        <p className="notice is-warn">Couldn&rsquo;t measure their side. {props.partnerFailure.message}</p>
      )}
      {props.roomUrl !== null && (
        <>
          <button type="button" className="button" onClick={() => void share({ url: props.roomUrl ?? "" })}>
            <LinkIcon size={16} weight="bold" aria-hidden="true" />
            {presence === "waiting" ? "Copy the link to send" : "Copy the room link"}
          </button>
          <p className="result-share-note" role="status">
            {shareNote(state) ?? ""}
          </p>
          {state === "manual" && (
            <input ref={fallbackRef} className="result-share-fallback" readOnly value={lastUrl} aria-label="Room link" />
          )}
        </>
      )}
    </section>
  );
}
