import { playThock } from "../lib/sound";

export type DaylightSwitchProps = {
  checked: boolean;
  /** `describeDeadline`'s sentence. */
  deadline: string;
  disabled?: boolean;
  onToggle: () => void;
};

// Outside `Filters` because the drawer starts closed on a phone and a control
// that moves the dial cannot live behind a disclosure. Defaults off: the clamp
// is an action and actions are opt-in.
export function DaylightSwitch(props: DaylightSwitchProps) {
  return (
    <div className="guard-row">
      <label className="switch">
        <input
          type="checkbox"
          checked={props.checked}
          disabled={props.disabled ?? false}
          onChange={() => {
            playThock(!props.checked);
            props.onToggle();
          }}
        />
        <span className="switch-track" aria-hidden="true">
          <span className="switch-thumb" />
        </span>
        <span className="switch-text">
          <span className="switch-label">Get back before dark</span>
          <span className="switch-hint">{props.deadline}</span>
        </span>
      </label>
    </div>
  );
}
