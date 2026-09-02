import { useId } from "react";
import { PLACE_KINDS, VIBES, type PlaceKind, type Vibe } from "../data/places";
import type { ClimbBand } from "../lib/elevation";
import { playTap, playThock } from "../lib/sound";

const CLIMBS: { id: ClimbBand | "any"; label: string }[] = [
  { id: "any", label: "Any" },
  { id: "easy", label: "Easy" },
  { id: "hilly", label: "Hilly" },
];

export type FiltersProps = {
  climb: ClimbBand | "any";
  vibes: Vibe[];
  roundTrip: boolean;
  edgeOnly: boolean;
  weatherAware: boolean;
  kind: PlaceKind;
  hideClosed: boolean;
  /** False when the engine's graph has no elevation in it. */
  climbAvailable: boolean;
  onClimb: (climb: ClimbBand | "any") => void;
  onToggleVibe: (vibe: Vibe) => void;
  onToggleRoundTrip: () => void;
  onToggleEdge: () => void;
  onToggleWeatherAware: () => void;
  onKind: (kind: PlaceKind) => void;
  onToggleHideClosed: () => void;
};

export function Filters(props: FiltersProps) {
  // Disabled climb chips point at the notice explaining why.
  const noticeId = useId();

  return (
    <div className="filters">
      <div className="switch-row">
        <Switch
          checked={props.roundTrip}
          onChange={() => {
            playThock(!props.roundTrip);
            props.onToggleRoundTrip();
          }}
          label="Round trip"
          hint="Split the budget across both legs"
        />
        <Switch
          checked={props.edgeOnly}
          onChange={() => {
            playThock(!props.edgeOnly);
            props.onToggleEdge();
          }}
          label="Far edge only"
          hint="Only places in the outermost contour"
        />
        <Switch
          checked={props.hideClosed}
          onChange={() => {
            playThock(!props.hideClosed);
            props.onToggleHideClosed();
          }}
          label="Skip closed places"
          hint="Judged by when you'd arrive"
        />
        <Switch
          checked={props.weatherAware}
          onChange={() => {
            playThock(!props.weatherAware);
            props.onToggleWeatherAware();
          }}
          label="Mind the weather"
          hint="Trim the walk for rain, heat and dark"
        />
      </div>

      <fieldset className="chips">
        <legend className="field-label">Kind</legend>
        {PLACE_KINDS.map((option) => (
          <button
            key={option.id}
            type="button"
            className="chip"
            aria-pressed={props.kind === option.id}
            onClick={() => {
              playTap(props.kind !== option.id);
              props.onKind(option.id);
            }}
          >
            {option.label}
          </button>
        ))}
      </fieldset>

      <fieldset className="chips">
        <legend className="field-label">Climb</legend>
        {CLIMBS.map((option) => (
          <button
            key={option.id}
            type="button"
            className="chip"
            aria-pressed={props.climb === option.id}
            disabled={!props.climbAvailable}
            aria-describedby={props.climbAvailable ? undefined : noticeId}
            onClick={() => {
              playTap(props.climb !== option.id);
              props.onClimb(option.id);
            }}
          >
            {option.label}
          </button>
        ))}
      </fieldset>
      {!props.climbAvailable && (
        <p className="notice" id={noticeId}>
          Climb needs elevation data from the routing engine.
        </p>
      )}

      <fieldset className="chips">
        <legend className="field-label">Looking for</legend>
        {VIBES.map((vibe) => (
          <button
            key={vibe.id}
            type="button"
            className="chip"
            aria-pressed={props.vibes.includes(vibe.id)}
            onClick={() => {
              playTap(!props.vibes.includes(vibe.id));
              props.onToggleVibe(vibe.id);
            }}
          >
            {vibe.label}
          </button>
        ))}
      </fieldset>
    </div>
  );
}

type SwitchProps = {
  checked: boolean;
  onChange: () => void;
  label: string;
  hint: string;
};

function Switch({ checked, onChange, label, hint }: SwitchProps) {
  return (
    <label className="switch">
      <input type="checkbox" checked={checked} onChange={onChange} />
      <span className="switch-track" aria-hidden="true">
        <span className="switch-thumb" />
      </span>
      <span className="switch-text">
        <span className="switch-label">{label}</span>
        <span className="switch-hint">{hint}</span>
      </span>
    </label>
  );
}
