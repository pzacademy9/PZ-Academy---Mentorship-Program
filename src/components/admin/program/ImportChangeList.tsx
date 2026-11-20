"use client";

export type ImportChangeItem = {
  id: string;
  label: string;
  from?: string;
  to?: string;
  note?: string;
  defaultOn?: boolean;
  danger?: boolean;
};

const LINK_BTN =
  "inline-flex items-center rounded-lg px-2 font-body text-sm font-semibold text-pz-primary hover:bg-pz-surface-container-low max-md:min-h-11 disabled:opacity-50";

/**
 * A checklist of changes. The caller owns which ones are ticked.
 * Used by the page import and the curriculum import.
 */
export function ImportChangeList({
  items,
  checked,
  onChange,
}: {
  items: ImportChangeItem[];
  checked: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
}) {
  const toggle = (id: string) => {
    const next = new Set(checked);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };
  const ticked = items.filter((i) => checked.has(i.id)).length;

  return (
    <div className="min-w-0 space-y-2">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
        <p role="status" className="font-body text-sm text-pz-on-surface-variant">
          {ticked} of {items.length} changes ticked
        </p>
        <div className="flex gap-1">
          <button type="button" className={LINK_BTN} onClick={() => onChange(new Set(items.map((i) => i.id)))}>
            Tick all
          </button>
          <button type="button" className={LINK_BTN} onClick={() => onChange(new Set())}>
            Untick all
          </button>
        </div>
      </div>
      <ul aria-label="Changes" className="min-w-0 divide-y divide-pz-outline-variant rounded-lg border border-pz-outline-variant">
        {items.map((i) => (
          <li key={i.id} className="min-w-0">
            <label className="flex min-w-0 cursor-pointer items-start gap-3 px-3 py-2 font-body text-sm max-md:min-h-11">
              <input
                type="checkbox"
                checked={checked.has(i.id)}
                onChange={() => toggle(i.id)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--pz-primary)]"
              />
              <span className="min-w-0 space-y-0.5 [overflow-wrap:anywhere]">
                <span className={`block font-semibold ${i.danger ? "text-pz-error" : "text-pz-on-surface"}`}>{i.label}</span>
                {(i.from !== undefined || i.to !== undefined) && (
                  <span className="block min-w-0 break-words [overflow-wrap:anywhere] text-pz-on-surface-variant">
                    {i.from !== undefined && <span className="line-through">{i.from}</span>}
                    {i.from !== undefined && i.to !== undefined && (
                      <>
                        {" "}
                        <span aria-hidden="true">→</span>
                        <span className="sr-only"> becomes </span>{" "}
                      </>
                    )}
                    {i.to !== undefined && <span className={i.danger ? "text-pz-error" : "text-pz-on-surface"}>{i.to}</span>}
                  </span>
                )}
                {i.note && <span className="block text-xs text-pz-on-surface-variant">{i.note}</span>}
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
