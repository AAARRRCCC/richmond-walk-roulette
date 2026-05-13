import type { POI } from "../data/pois";
import { Wheel } from "./Wheel";

type Props = {
  wheelPois: POI[];
  totalPoiCount: number;
  rotation: number;
  selectedId: string | null;
  spinning: boolean;
  onSpin: () => void;
  onClearFilters: () => void;
};

export function WheelPane({
  wheelPois,
  totalPoiCount,
  rotation,
  selectedId,
  spinning,
  onSpin,
  onClearFilters,
}: Props) {
  return (
    <div className="wheel-pane" aria-busy={spinning}>
      <span className="pane-label">Destinations</span>
      <span className="pane-meta">
        <span>
          {wheelPois.length} of {totalPoiCount} fit
        </span>
      </span>

      {wheelPois.length === 0 ? (
        <div className="empty-wheel">
          <div className="big">No matches</div>
          <div className="small">no destinations fit these filters</div>
          <button
            type="button"
            className="btn ghost empty-wheel-clear"
            onClick={onClearFilters}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <Wheel pois={wheelPois} rotation={rotation} pickedId={selectedId} />
      )}

      <div className="spin-btn-wrap">
        <button
          className="btn primary"
          onClick={onSpin}
          disabled={spinning || wheelPois.length === 0}
          aria-busy={spinning}
        >
          {spinning ? "Spinning…" : selectedId ? "Spin Again" : "Spin"}
        </button>
      </div>
    </div>
  );
}
