/*
 * PROTOTYPE - throwaway. Answers issue #15: what should the partner panel look
 * like once a room is live? Three radically different answers, mounted on the
 * real app, switchable with `?variant=A|B|C` and the floating bar at the
 * bottom.
 *
 *   A  Mirror rail        a full panel opposite your own controls
 *   B  Agreement ledger   one quiet line that only grows where you disagree
 *   C  Map callout        no chrome at all; their state hangs off their pin
 *
 * Nothing here is wired to a room: there is no room service yet (#8 decided
 * one, it is not built). The partner state below is fake and driven by the
 * chips in the switcher bar, so every presence state can be looked at on
 * demand rather than waited for.
 *
 * Dev-only: App mounts it behind `import.meta.env.DEV`, and it renders nothing
 * unless `?variant=` is in the URL. Delete this directory when #15 closes.
 */
import { useCallback, useEffect, useState } from "react";
import { VIBES, type Vibe } from "../../data/places";

/** Captured at module load: App wipes the query string on its first paint. */
const REQUESTED = new URLSearchParams(window.location.search).get("variant");

const VARIANTS = [
  { key: "A", name: "Mirror rail" },
  { key: "B", name: "Agreement ledger" },
  { key: "C", name: "Map callout" },
];

/**
 * Where the room can be, from this side of it. `waiting` is a room with one
 * person in it; `away` is the long absence folded in from #10; `closed` is the
 * 12-hour clock running out.
 */
type Presence = "waiting" | "here" | "reconnecting" | "away" | "closed";

type Side = {
  minutes: number;
  locked: boolean;
  roundTrip: boolean;
  edgeOnly: boolean;
  weatherAware: boolean;
  climb: string;
  vibes: Vibe[];
};

const YOURS: Side = {
  minutes: 20,
  locked: false,
  roundTrip: true,
  edgeOnly: false,
  weatherAware: true,
  climb: "Any",
  vibes: ["river"],
};

const THEIRS_SAME: Side = { ...YOURS, locked: true };

const THEIRS_DIFFERENT: Side = {
  minutes: 30,
  locked: true,
  roundTrip: true,
  edgeOnly: true,
  weatherAware: false,
  climb: "Easy",
  vibes: ["river", "park", "food"],
};

/**
 * There are no names in this app and there never will be: joining is a link,
 * there are no accounts, and nothing takes free text. So the other side is
 * named by WHERE THEY START, exactly as `App` already derives it -
 * `partner?.name ?? "Their start"`, a preset's own name or nothing.
 */
const PRESET_START = "Maymont";
const PIN_START = "Their start";

const AWAY_MINUTES = 14;
const ROOM_LEFT = "11h 40m";
const BOTH_COUNT = 14;

const vibeLabel = (id: Vibe) => VIBES.find((vibe) => vibe.id === id)?.label ?? id;

type PanelProps = {
  presence: Presence;
  them: Side;
  you: Side;
  /** Their start, which is the only name the other side has. */
  startName: string;
};

/** Their values are only worth showing when there is a them. */
const hasState = (presence: Presence) => presence !== "waiting" && presence !== "closed";

/** How stale what is on screen is. Drives dimming in every variant. */
const staleness = (presence: Presence) =>
  presence === "here" ? "" : presence === "reconnecting" ? " is-dim" : " is-stale";

/** Short form, for a line that already has a subject. */
const presenceWord = (presence: Presence) => {
  if (presence === "here") return "here";
  if (presence === "reconnecting") return "reconnecting...";
  if (presence === "away") return `last seen ${AWAY_MINUTES} min ago`;
  if (presence === "waiting") return "not joined yet";
  return "room closed";
};

/** Full sentence. "They", never a name: nobody in this app has one. */
const presenceLine = (presence: Presence) => {
  if (presence === "here") return "They're here.";
  if (presence === "reconnecting") return "Reconnecting to them...";
  if (presence === "away") return `Last seen ${AWAY_MINUTES} minutes ago.`;
  if (presence === "waiting") return "They haven't opened the link yet.";
  return "This room has closed.";
};

function TheirFilters(props: { them: Side }) {
  const { them } = props;
  return (
    <div className="chips">
      {them.roundTrip && <span className="chip pp-chip is-on">Round trip</span>}
      {them.edgeOnly && <span className="chip pp-chip is-on">Far edge only</span>}
      {them.weatherAware && <span className="chip pp-chip is-on">Mind the weather</span>}
      <span className="chip pp-chip is-on">Climb: {them.climb}</span>
      {them.vibes.map((vibe) => (
        <span key={vibe} className="chip pp-chip is-on">
          {vibeLabel(vibe)}
        </span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ variant A */

/**
 * The literal reading of the ticket: their controls, mirrored, on the other
 * side of the screen. Every field of yours has a twin in the same order, so
 * the eye compares by sliding across rather than by reading.
 */
function MirrorRail(props: PanelProps) {
  const { presence, them, you } = props;
  return (
    <aside className={`pp-mirror panel${staleness(presence)}`}>
      <div className="pp-mirror-head">
        <p className="field-label">Their side</p>
        <span className={`pp-dot is-${presence}`} aria-hidden="true" />
      </div>
      {/* Their START, in the chip `MeetPanel` already uses for it, because a
          start is the only thing the other side can be called. Presence is a
          separate sentence about the person rather than a word hung off a
          place: "Maymont here" says a park is here. */}
      {/* Only once there is a them: nobody has a start before they join, and
          the room's whole privacy argument is that opening the link costs the
          joiner nothing until they set one. */}
      {hasState(presence) && (
        <p className="pp-name">
          <span className="meet-chip">{props.startName}</span>
        </p>
      )}
      <p className="meet-hint">{presenceLine(presence)}</p>

      {presence === "closed" ? (
        <>
          <p className="meet-hint">
            This room has been open 12 hours and has closed. Their settings went with it.
          </p>
          <button type="button" className="button">
            Start a new room
          </button>
        </>
      ) : presence === "waiting" ? (
        <>
          <p className="meet-hint">Nothing of theirs shows until they do.</p>
          <p className="pp-ghost-value">&mdash; min</p>
          <p className="meet-hint">Room closes in {ROOM_LEFT}.</p>
        </>
      ) : (
        <>
          <div className="pp-value-row">
            <span className="pp-value">{them.minutes}</span>
            <span className="pp-unit">min</span>
            {them.locked && <span className="pp-lock">locked in</span>}
          </div>
          {them.minutes !== you.minutes && (
            <button type="button" className="link-button">
              Match {them.minutes} min
            </button>
          )}

          <p className="field-label">Their filters</p>
          <TheirFilters them={them} />

          {presence === "away" && (
            <p className="meet-hint">
              These are their settings from {AWAY_MINUTES} minutes ago. They may have walked off.
            </p>
          )}
          {presence === "reconnecting" && (
            <p className="meet-hint">
              Holding their last settings while the connection comes back.
            </p>
          )}
          <p className="meet-hint">{BOTH_COUNT} places are inside both your reaches.</p>
        </>
      )}
    </aside>
  );
}

/* ------------------------------------------------------------ variant B */

type Difference = { label: string; yours: string; theirs: string; match: string };

const differences = (you: Side, them: Side): Difference[] => {
  const rows: Difference[] = [];
  if (you.minutes !== them.minutes) {
    rows.push({
      label: "Minutes",
      yours: `${you.minutes}`,
      theirs: `${them.minutes}`,
      match: `Match ${them.minutes} min`,
    });
  }
  if (you.edgeOnly !== them.edgeOnly) {
    rows.push({
      label: "Far edge only",
      yours: you.edgeOnly ? "on" : "off",
      theirs: them.edgeOnly ? "on" : "off",
      match: "Match theirs",
    });
  }
  if (you.weatherAware !== them.weatherAware) {
    rows.push({
      label: "Mind the weather",
      yours: you.weatherAware ? "on" : "off",
      theirs: them.weatherAware ? "on" : "off",
      match: "Match theirs",
    });
  }
  if (you.climb !== them.climb) {
    rows.push({ label: "Climb", yours: you.climb, theirs: them.climb, match: "Match theirs" });
  }
  const extra = them.vibes.filter((vibe) => !you.vibes.includes(vibe));
  if (extra.length > 0) {
    rows.push({
      label: "Looking for",
      yours: you.vibes.map(vibeLabel).join(", "),
      theirs: them.vibes.map(vibeLabel).join(", "),
      match: "Match theirs",
    });
  }
  return rows;
};

/**
 * Refuses to mirror. Two people who agree need no panel at all, so agreement
 * collapses to a single line and only disagreement earns rows. Unobtrusive by
 * construction rather than by styling.
 */
function AgreementLedger(props: PanelProps) {
  const { presence, them, you } = props;
  const rows = hasState(presence) ? differences(you, them) : [];

  return (
    <div className={`pp-ledger${staleness(presence)}`}>
      <div className="pp-ledger-line">
        <span className={`pp-dot is-${presence}`} aria-hidden="true" />
        <span className="pp-ledger-who">{props.startName}</span>
        {presence === "closed" ? (
          <span className="pp-ledger-note">room closed &mdash; start a new one</span>
        ) : presence === "waiting" ? (
          <span className="pp-ledger-note">not joined &mdash; room closes in {ROOM_LEFT}</span>
        ) : rows.length === 0 ? (
          <span className="pp-ledger-note">
            agrees with you &mdash; {them.minutes} min{them.locked ? ", locked in" : ""}, same
            filters
          </span>
        ) : (
          <span className="pp-ledger-note">
            {rows.length} thing{rows.length === 1 ? "" : "s"} to settle
            {them.locked ? ` — locked in at ${them.minutes} min` : ""}
          </span>
        )}
        {presence !== "here" && hasState(presence) && (
          <span className="pp-ledger-stale">{presenceWord(presence)}</span>
        )}
      </div>

      {rows.length > 0 && (
        <dl className="pp-rows">
          {rows.map((row) => (
            <div key={row.label} className="pp-row">
              <dt>{row.label}</dt>
              <dd>
                <span className="pp-row-yours">you {row.yours}</span>
                <span className="pp-row-arrow" aria-hidden="true">
                  &middot;
                </span>
                <span className="pp-row-theirs">them {row.theirs}</span>
                <button type="button" className="link-button">
                  {row.match}
                </button>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ variant C */

/**
 * Rejects the panel premise outright. Their state belongs to their pin, so it
 * hangs off it on the map, where the reader is already looking, and the chrome
 * stays yours alone. Fixed in place here; in the real thing it tracks the
 * marker.
 */
function MapCallout(props: PanelProps) {
  const { presence, them, you } = props;
  const [open, setOpen] = useState(false);
  const rows = hasState(presence) ? differences(you, them) : [];

  return (
    <div className={`pp-callout${staleness(presence)}`}>
      <span className={`pp-pin is-${presence}`} aria-hidden="true" />
      <button
        type="button"
        className="pp-callout-body"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="pp-callout-name">{props.startName}</span>
        {presence === "closed" ? (
          <span className="pp-callout-note">room closed</span>
        ) : presence === "waiting" ? (
          <span className="pp-callout-note">not joined</span>
        ) : (
          <span className="pp-callout-note">
            <strong>{them.minutes} min</strong>
            {them.locked ? " · locked" : " · still moving"}
            {rows.length > 0 ? ` · ${rows.length} differ` : " · same filters"}
          </span>
        )}
        {presence !== "here" && <span className="pp-callout-stale">{presenceWord(presence)}</span>}
      </button>

      {open && hasState(presence) && (
        <div className="pp-callout-sheet panel">
          <p className="field-label">Their filters</p>
          <TheirFilters them={them} />
          {rows.length > 0 && (
            <button type="button" className="link-button">
              Match all of theirs
            </button>
          )}
          <p className="meet-hint">{BOTH_COUNT} places are inside both your reaches.</p>
        </div>
      )}
    </div>
  );
}

/* ----------------------------------------------------------- the harness */

const PRESENCES: Presence[] = ["waiting", "here", "reconnecting", "away", "closed"];

export function PartnerPanelPrototype() {
  const [variant, setVariant] = useState(REQUESTED ?? "A");
  const [presence, setPresence] = useState<Presence>("here");
  const [differ, setDiffer] = useState(true);
  // A preset start has a name of its own; a dropped pin has none, and gets the
  // app's existing fallback. Both cases have to look right.
  const [preset, setPreset] = useState(true);

  const go = useCallback((step: number) => {
    setVariant((current) => {
      const index = VARIANTS.findIndex((entry) => entry.key === current);
      const next = VARIANTS[(index + step + VARIANTS.length) % VARIANTS.length];
      return next?.key ?? "A";
    });
  }, []);

  // App wipes the query string once on its first paint, and a child's effect
  // runs before its parent's, so the param is written back after that.
  useEffect(() => {
    if (REQUESTED === null) return;
    const timer = window.setTimeout(() => {
      window.history.replaceState(null, "", `/?variant=${variant}`);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [variant]);

  useEffect(() => {
    if (REQUESTED === null) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target;
      const editing =
        target instanceof HTMLElement &&
        (target.isContentEditable ||
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement);
      if (editing) return;
      if (event.key === "ArrowLeft") go(-1);
      if (event.key === "ArrowRight") go(1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go]);

  if (REQUESTED === null) return null;

  const them = differ ? THEIRS_DIFFERENT : THEIRS_SAME;
  const shown = {
    presence,
    them,
    you: YOURS,
    startName: preset ? PRESET_START : PIN_START,
  };
  const current = VARIANTS.find((entry) => entry.key === variant) ?? VARIANTS[0];

  return (
    <>
      <style>{STYLES}</style>
      {variant === "A" && <MirrorRail {...shown} />}
      {variant === "B" && <AgreementLedger {...shown} />}
      {variant === "C" && <MapCallout {...shown} />}

      <div className="pp-switcher">
        <div className="pp-switcher-row">
          <button type="button" onClick={() => go(-1)} aria-label="Previous variant">
            &larr;
          </button>
          <span className="pp-switcher-label">
            {current?.key} &mdash; {current?.name}
          </span>
          <button type="button" onClick={() => go(1)} aria-label="Next variant">
            &rarr;
          </button>
        </div>
        <div className="pp-switcher-row is-states">
          {PRESENCES.map((option) => (
            <button
              key={option}
              type="button"
              className={option === presence ? "is-on" : ""}
              onClick={() => setPresence(option)}
            >
              {option}
            </button>
          ))}
          <button
            type="button"
            className={differ ? "is-on" : ""}
            onClick={() => setDiffer((value) => !value)}
          >
            {differ ? "disagreeing" : "agreeing"}
          </button>
          <button
            type="button"
            className={preset ? "is-on" : ""}
            onClick={() => setPreset((value) => !value)}
          >
            {preset ? "preset start" : "dropped pin"}
          </button>
        </div>
      </div>
    </>
  );
}

const STYLES = `
.pp-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--ink-3); flex: none; }
.pp-dot.is-here { background: #6fd08c; box-shadow: 0 0 0 4px rgba(111, 208, 140, 0.16); }
.pp-dot.is-reconnecting { background: var(--accent); animation: pp-pulse 1.2s infinite; }
.pp-dot.is-away { background: var(--ink-3); }
.pp-dot.is-waiting { background: transparent; border: 1px dashed var(--line-strong); }
.pp-dot.is-closed { background: #6b3b3b; }
@keyframes pp-pulse { 50% { opacity: 0.25; } }

.is-dim { opacity: 0.72; }
.is-stale { opacity: 0.55; }

.pp-chip { cursor: default; }
.pp-chip.is-on {
  border-color: var(--accent);
  color: var(--accent-soft);
  background: var(--accent-wash);
}

/* ---- A: mirror rail */
.pp-mirror {
  position: absolute; top: 18px; right: 18px; width: 320px; z-index: 5;
  padding: 16px; display: flex; flex-direction: column; gap: 10px;
  transition: opacity 200ms var(--ease);
}
.pp-mirror-head { display: flex; align-items: center; justify-content: space-between; }
.pp-mirror .field-label { margin: 0; }
.pp-name { margin: 0; font-size: 15px; display: flex; align-items: baseline; gap: 8px; }
.pp-presence { font-size: 12px; color: var(--ink-3); }
.pp-value-row { display: flex; align-items: baseline; gap: 8px; }
.pp-value { font-family: var(--mono); font-size: 38px; line-height: 1; }
.pp-ghost-value {
  margin: 0; font-family: var(--mono); font-size: 38px; line-height: 1;
  color: var(--ink-3); opacity: 0.4;
}
.pp-unit { color: var(--ink-3); font-size: 13px; }
.pp-lock {
  margin-left: auto; font-family: var(--mono); font-size: 10px; letter-spacing: 0.14em;
  text-transform: uppercase; color: var(--accent-ink); background: var(--accent);
  padding: 3px 8px; border-radius: 999px;
}
@media (max-width: 899px) {
  .pp-mirror {
    top: calc(8px + env(safe-area-inset-top)); left: 12px; right: 12px; width: auto;
    max-height: 42dvh; overflow-y: auto;
  }
}

/* ---- B: agreement ledger */
.pp-ledger {
  position: absolute; top: 18px; left: 50%; transform: translateX(-50%); z-index: 5;
  width: min(460px, calc(100vw - 36px));
  background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-surface);
  backdrop-filter: blur(20px) saturate(1.3);
  -webkit-backdrop-filter: blur(20px) saturate(1.3);
  padding: 10px 14px; display: flex; flex-direction: column; gap: 8px;
}
.pp-ledger-line { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.pp-ledger-who { font-weight: 500; }
.pp-ledger-note { color: var(--ink-2); }
.pp-ledger-stale { margin-left: auto; font-size: 11px; color: var(--ink-3); }
.pp-rows {
  margin: 0; display: grid; gap: 6px;
  border-top: 1px solid var(--line); padding-top: 8px;
}
.pp-row { display: grid; grid-template-columns: 116px 1fr; gap: 10px; align-items: baseline; }
.pp-row dt {
  font-family: var(--mono); font-size: 10px; letter-spacing: 0.14em; text-transform: uppercase;
  color: var(--ink-3);
}
.pp-row dd { margin: 0; display: flex; align-items: baseline; gap: 8px; font-size: 13px; }
.pp-row-yours { color: var(--ink-3); }
.pp-row-theirs { color: var(--accent-soft); font-variant-numeric: tabular-nums; }
.pp-row-arrow { color: var(--ink-3); }
@media (max-width: 899px) {
  .pp-ledger { top: calc(8px + env(safe-area-inset-top)); }
  .pp-row { grid-template-columns: 1fr; gap: 2px; }
}

/* ---- C: map callout */
.pp-callout {
  position: absolute; left: 58%; top: 34%; z-index: 5;
  display: flex; flex-direction: column; gap: 8px; align-items: flex-start;
}
.pp-pin {
  width: 14px; height: 14px; border-radius: 50%; background: #7fb3ff;
  border: 3px solid rgba(11, 16, 20, 0.9); box-shadow: 0 0 0 5px rgba(127, 179, 255, 0.18);
  margin-left: 22px;
}
.pp-pin.is-away, .pp-pin.is-closed { background: var(--ink-3); box-shadow: none; }
.pp-pin.is-reconnecting { animation: pp-pulse 1.2s infinite; }
.pp-callout-body {
  display: flex; align-items: baseline; gap: 8px; text-align: left;
  background: rgba(11, 16, 20, 0.88); border: 1px solid var(--line);
  border-radius: 999px; padding: 6px 12px; font-size: 12.5px; cursor: pointer;
}
.pp-callout-name { font-weight: 500; }
.pp-callout-note { color: var(--ink-2); }
.pp-callout-note strong { color: var(--accent-soft); font-family: var(--mono); font-weight: 500; }
.pp-callout-stale { color: var(--ink-3); font-size: 11px; }
.pp-callout-sheet { padding: 14px; width: 280px; display: flex; flex-direction: column; gap: 8px; }
@media (max-width: 899px) {
  .pp-callout {
    left: 12px; right: 12px; top: calc(56px + env(safe-area-inset-top));
  }
  .pp-callout-sheet { width: auto; }
}

/* ---- prototype chrome, deliberately not of the design */
.pp-switcher {
  position: fixed; bottom: 14px; left: 50%; transform: translateX(-50%); z-index: 40;
  background: #f3f5f7; color: #10161d; border-radius: 12px; padding: 6px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5); display: grid; gap: 4px;
  font-family: var(--mono); font-size: 11px;
}
.pp-switcher-row { display: flex; align-items: center; gap: 4px; justify-content: center; }
.pp-switcher button {
  background: #fff; border: 1px solid #c9d2da; border-radius: 7px; padding: 4px 8px;
  color: #10161d; cursor: pointer; font-size: 11px;
}
.pp-switcher button.is-on { background: #10161d; color: #fff; border-color: #10161d; }
.pp-switcher-label { padding: 0 10px; white-space: nowrap; }
`;
