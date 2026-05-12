type ChipOption<T extends string> = { label: string; value: T };

type SingleProps<T extends string> = {
  options: ChipOption<T>[];
  value: T;
  onChange: (next: T) => void;
  multi?: false;
  ariaLabel?: string;
};

type MultiProps<T extends string> = {
  options: ChipOption<T>[];
  value: ReadonlySet<T>;
  onChange: (next: Set<T>) => void;
  multi: true;
  ariaLabel?: string;
};

type Props<T extends string> = SingleProps<T> | MultiProps<T>;

export function ChipGroup<T extends string>(props: Props<T>) {
  const { options, ariaLabel } = props;
  return (
    <div
      className="chips"
      role={props.multi ? "group" : "radiogroup"}
      aria-label={ariaLabel}
    >
      {options.map((opt) => {
        const active = props.multi ? props.value.has(opt.value) : props.value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role={props.multi ? undefined : "radio"}
            aria-checked={props.multi ? undefined : active}
            aria-pressed={props.multi ? active : undefined}
            className={"chip" + (active ? " active" : "")}
            onClick={() => {
              if (props.multi) {
                const next = new Set(props.value);
                if (next.has(opt.value)) next.delete(opt.value);
                else next.add(opt.value);
                props.onChange(next);
              } else {
                props.onChange(opt.value);
              }
            }}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
