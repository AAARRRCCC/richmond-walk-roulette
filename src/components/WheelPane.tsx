import type { POI } from "../data/pois";
import { Wheel } from "./Wheel";

type Props = {
  wheelPois: POI[];
  totalPoiCount: number;
  rotation: number;
  selectedId: string | null;
  spinning: boolean;
  onSpin: () => void;
};

export function WheelPane({
  wheelPois,
  totalPoiCount,
  rotation,
  selectedId,
  spinning,
  onSpin,
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
          <div className="small">widen the range or clear filters</div>
        </div>
      ) : (
        <Wheel pois={wheelPois} rotation={rotation} pickedId={selectedId} />
      )}

      <div className="spin-btn-wrap">
        <button
          className="btn primary"
          onClick={onSpin}
          disabled={spinning || wheelPois.length === 0}
        >
          {spinning ? "Spinning…" : selectedId ? "Spin Again" : "Spin"}
        </button>
      </div>
    </div>
  );
}
