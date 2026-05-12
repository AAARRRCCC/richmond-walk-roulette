import type { StartLocation, Difficulty, Vibe } from "../data/pois";
import type { Range } from "../lib/geo";
import { RangeSlider } from "./RangeSlider";
import { ChipGroup } from "./ChipGroup";

type Props = {
  starts: readonly StartLocation[];
  startId: string;
  customStart: StartLocation | null;
  onStartChange: (id: string) => void;
  pickingStart: boolean;
  onTogglePickingStart: () => void;
  range: Range;
  onRangeChange: (r: Range) => void;
  roundTrip: boolean;
  onRoundTripChange: (v: boolean) => void;
  difficulty: "any" | Difficulty;
  onDifficultyChange: (d: "any" | Difficulty) => void;
  tags: ReadonlySet<Vibe>;
  onTagsChange: (next: Set<Vibe>) => void;
};

export function Controls({
  starts,
  startId,
  customStart,
  onStartChange,
  pickingStart,
  onTogglePickingStart,
  range,
  onRangeChange,
  roundTrip,
  onRoundTripChange,
  difficulty,
  onDifficultyChange,
  tags,
  onTagsChange,
}: Props) {
  return (
    <div className="controls">
      <div className="control">
        <span className="label">Start</span>
        <select
          value={customStart ? "__custom" : startId}
          onChange={(e) => {
            if (e.target.value === "__custom") return;
            onStartChange(e.target.value);
          }}
          aria-label="Start location"
        >
          {starts.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
          {customStart && <option value="__custom">{customStart.name}</option>}
        </select>
        <button
          type="button"
          className={"start-pick-link" + (pickingStart ? " active" : "")}
          onClick={onTogglePickingStart}
          aria-pressed={pickingStart}
          title={pickingStart ? "Click anywhere on the map (Esc to cancel)" : "Pick a custom start by clicking the map"}
        >
          {pickingStart ? "click map · esc to cancel" : "pick on map"}
        </button>
      </div>

      <div className="control">
        <span className="label">
          Distance ({roundTrip ? "round-trip" : "one-way"}, miles)
        </span>
        <RangeSlider range={range} onChange={onRangeChange} />
      </div>

      <div className="control" style={{ alignItems: "flex-start" }}>
        <span className="label">Round trip</span>
        <label className="toggle" style={{ marginTop: 4 }}>
          <input
            type="checkbox"
            checked={roundTrip}
            onChange={(e) => onRoundTripChange(e.target.checked)}
            role="switch"
            aria-label="Round trip"
          />
          <span className="switch" />
          <span className="toggle-state">{roundTrip ? "ON" : "OFF"}</span>
        </label>
      </div>

      <div className="control">
        <span className="label">Difficulty</span>
        <ChipGroup
          ariaLabel="Difficulty"
          options={[
            { label: "Any", value: "any" },
            { label: "Flat", value: "flat" },
            { label: "Hilly", value: "hilly" },
          ]}
          value={difficulty}
          onChange={onDifficultyChange}
        />
      </div>

      <div className="control">
        <span className="label">Vibe</span>
        <ChipGroup<Vibe>
          ariaLabel="Vibe"
          multi
          options={[
            { label: "River", value: "river" },
            { label: "Park", value: "park" },
            { label: "Museum", value: "museum" },
            { label: "History", value: "history" },
            { label: "Food", value: "food" },
            { label: "Scenic", value: "scenic" },
          ]}
          value={tags}
          onChange={onTagsChange}
        />
      </div>
    </div>
  );
}
