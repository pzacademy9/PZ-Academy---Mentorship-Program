import { cn } from "@/lib/utils";

/** Small building blocks for the Audiences page: a toggle chip, a segmented control and a filter card. */

export function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 items-center rounded-full px-4 py-2 font-body text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        on
          ? "bg-pz-primary-container text-pz-on-primary-container font-semibold"
          : "bg-pz-surface-variant text-pz-on-surface-variant hover:bg-pz-surface-container-high",
      )}
    >
      {children}
    </button>
  );
}

export function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex w-full flex-wrap gap-1 rounded-xl bg-pz-surface-variant p-1 sm:w-auto sm:inline-flex">
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={cn(
              "min-h-11 flex-1 rounded-lg px-4 py-2 font-body text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:flex-none",
              on ? "bg-pz-primary text-pz-on-primary font-semibold" : "text-pz-on-surface-variant hover:bg-pz-surface-container-high",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export function FilterCard({
  title,
  helper,
  children,
  titleId,
}: {
  title: string;
  helper?: string;
  children: React.ReactNode;
  titleId?: string;
}) {
  return (
    <section aria-labelledby={titleId} className="space-y-3 rounded-2xl border border-pz-outline-variant bg-pz-surface-container-lowest p-4">
      <div>
        <h3 id={titleId} className="font-headline text-sm font-bold text-pz-secondary">{title}</h3>
        {helper && <p className="mt-1 font-body text-xs text-pz-on-surface-variant">{helper}</p>}
      </div>
      {children}
    </section>
  );
}
