import { playThock } from "../lib/sound";

export type DaylightSwitchProps = {
  checked: boolean;
  /** `describeDeadline`'s sentence. The only string here that knows about legs. */
  deadline: string;
  disabled?: boolean;
  onToggle: () => void;
};

/**
 * "Get back before dark", and the one deadline it promises.
 *
 * Its own component rather than a third switch inside `Filters` because the
 * Filters drawer starts closed on a phone, and a control that moves the dial
 * cannot live behind a disclosure.
 *
 * The mode defaults off and is never set by the app. Clamping a dial nobody
 * asked to have clamped is the same silent pool-shrinkage this release exists
 * to stop; the always-on half — the dusk time in the readout, the light clause
 * on the card, the warning when a walk does not fit — is information, and
 * information is free to be default. The clamp is an action, and actions are
 * opt-in.
 */
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
