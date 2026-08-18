import { VIBES, type Terrain, type Vibe } from "../data/places";

const TERRAINS: { id: Terrain | "any"; label: string }[] = [
  { id: "any", label: "Any" },
  { id: "flat", label: "Flat" },
  { id: "hilly", label: "Hilly" },
];

export type FiltersProps = {
  terrain: Terrain | "any";
  vibes: Vibe[];
  roundTrip: boolean;
  edgeOnly: boolean;
  onTerrain: (terrain: Terrain | "any") => void;
  onToggleVibe: (vibe: Vibe) => void;
  onToggleRoundTrip: () => void;
  onToggleEdge: () => void;
};

export function Filters(props: FiltersProps) {
  return (
    <div className="filters">
      <div className="switch-row">
        <Switch
          checked={props.roundTrip}
          onChange={props.onToggleRoundTrip}
          label="Round trip"
          hint="Split the budget across both legs"
        />
        <Switch
          checked={props.edgeOnly}
          onChange={props.onToggleEdge}
          label="Far edge only"
          hint="Only places in the outermost contour"
        />
      </div>

      <fieldset className="chips">
        <legend className="field-label">Terrain</legend>
        {TERRAINS.map((option) => (
          <button
            key={option.id}
            type="button"
            className="chip"
            aria-pressed={props.terrain === option.id}
            onClick={() => props.onTerrain(option.id)}
          >
            {option.label}
          </button>
        ))}
      </fieldset>

      <fieldset className="chips">
        <legend className="field-label">Looking for</legend>
        {VIBES.map((vibe) => (
          <button
            key={vibe.id}
            type="button"
            className="chip"
            aria-pressed={props.vibes.includes(vibe.id)}
            onClick={() => props.onToggleVibe(vibe.id)}
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
