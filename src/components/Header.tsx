type Props = {
  weather: string;
  onShare: () => void;
};

export function Header({ weather, onShare }: Props) {
  return (
    <header className="header">
      <div className="brand">
        <h1>Richmond Walk Roulette</h1>
        <span className="tag">v1 · downtown · 4-mile radius</span>
      </div>
      <div className="actions">
        <span className="tag" style={{ marginRight: 8 }}>
          {weather}
        </span>
        <button className="btn ghost" onClick={onShare}>
          Share
        </button>
      </div>
    </header>
  );
}
