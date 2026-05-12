import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
};

/**
 * Tiny error boundary for the lazy-loaded map chunk. If the chunk fails
 * to load (network error, broken deployment) or the map throws during
 * mount, this contains the failure so the rest of the app keeps working
 * and the user sees a useful message in the map area.
 *
 * Class component because hooks can't catch render-phase errors.
 */
export class MapErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[walk-roulette] map failed to load:", error, info);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="map-error" role="alert">
          <div className="big">Map couldn't load</div>
          <div className="small">
            The wheel and POI list still work. Try reloading the page if you
            need the map.
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
