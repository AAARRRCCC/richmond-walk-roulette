import type { POI, StartLocation } from "../data/pois";
import { distanceTo, fmtMiles, type MileXY, type Range } from "../lib/geo";
import type { WalkingRoute } from "../lib/route";
import { DeferredMap } from "./DeferredMap";
import { MapErrorBoundary } from "./MapErrorBoundary";

type Props = {
  pois: readonly POI[];
  /** Eligible + alphabetically sorted POIs (same set the wheel uses). */
  wheelPois: POI[];
  eligibleIds: ReadonlySet<string>;
  startLocation: StartLocation;
  destination: POI | null;
  walkRange: Range;
  roundTrip: boolean;
  walkingRoute: WalkingRoute | null;
  pickingStart: boolean;
  onPickStart: (miles: MileXY, name?: string) => void;
  onPoiClick: (poiId: string) => void;
};

export function MapPane({
  pois,
  wheelPois,
  eligibleIds,
  startLocation,
  destination,
  walkRange,
  roundTrip,
  walkingRoute,
  pickingStart,
  onPickStart,
  onPoiClick,
}: Props) {
  return (
    <div className="map-pane">
      <span className="pane-label">Map</span>
      <span className="pane-meta">
        <span>{startLocation.name.toUpperCase()}</span>
        {destination && <span>→ {destination.name.toUpperCase()}</span>}
        {/* If destination is picked but the real walking polyline didn't
            arrive (no Routes API key, or the fetch failed), the map is
            drawing a stylized Bezier curve, not an actual walking path.
            Tag it so the user doesn't trust the shape literally. */}
        {destination && !walkingRoute && (
          <span
            className="approx-tag"
            title="Showing a stylized straight-line approximation. Configure VITE_GOOGLE_MAPS_API_KEY for the real walking route."
          >
            approx route
          </span>
        )}
      </span>
      <MapErrorBoundary>
        <DeferredMap
          pois={pois}
          eligibleIds={eligibleIds}
          startLocation={startLocation}
          destination={destination}
          walkRange={walkRange}
          roundTrip={roundTrip}
          showRoute={!!destination}
          walkingRoute={walkingRoute}
          pickingStart={pickingStart}
          onPickStart={onPickStart}
          onPoiClick={onPoiClick}
        />
      </MapErrorBoundary>
      {/* Keyboard / screen-reader equivalent of clicking POI dots on the
          map. Visually hidden; participates in tab order so SR users can
          pick a destination by name + distance. */}
      <ul className="sr-only" aria-label="Map destinations">
        {wheelPois.map((p) => {
          const trip = (roundTrip ? 2 : 1) * distanceTo(startLocation, p);
          return (
            <li key={p.id}>
              <button type="button" onClick={() => onPoiClick(p.id)}>
                {p.name}, {fmtMiles(trip)}{" "}
                {roundTrip ? "round trip" : "one way"}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
