"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, TriangleAlert } from "lucide-react";
import { PurchaseChoiceConfirmDialog } from "@/components/admin/registrations/PurchaseChoiceConfirmDialog";
import { callPortal } from "@/lib/portal-client";
import type { ChoiceGroup, ChoiceOverview } from "@/lib/landing/registration/choice-types";

const card = "rounded-xl bg-pz-surface-container-lowest border border-pz-outline-variant/40 p-5 md:p-6 space-y-4";
const cardTitle = "font-label text-xs font-semibold text-pz-primary uppercase tracking-wide";
const chip = "inline-flex items-center px-2.5 py-1 rounded-md text-xs font-headline font-bold bg-pz-surface-container-high text-pz-on-surface-variant";
const primaryBtn =
  "inline-flex items-center justify-center gap-2 px-4 py-2.5 min-h-11 rounded-lg font-headline text-sm font-bold bg-pz-primary text-pz-on-primary hover:bg-pz-on-primary-container transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

const people = (n: number) => `${n} ${n === 1 ? "person" : "people"}`;
const MODE_TEXT = { live: "Live", recorded: "Recorded" } as const;

type Pending = { group: ChoiceGroup; keys: string[] };

export function PurchaseChoicesCard({
  pageId,
  registrationSetupHref,
}: {
  pageId: string;
  registrationSetupHref: string;
}) {
  const ticket = useRef(0);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [overview, setOverview] = useState<ChoiceOverview | null>(null);
  const [picked, setPicked] = useState<Record<string, string[]>>({});
  const [saved, setSaved] = useState<Record<string, { group: ChoiceGroup; updated: number }>>({});
  const [pending, setPending] = useState<Pending | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const focusLabel = useRef<string | null>(null);

  const load = useCallback(async () => {
    const mine = ++ticket.current;
    const r = await callPortal<ChoiceOverview>(`/api/admin/landing/portal/choices?pageId=${encodeURIComponent(pageId)}`);
    // A slow older answer must never replace a newer one.
    if (mine !== ticket.current) return;
    if (!r.ok) {
      setLoadError(r.message);
      return;
    }
    if (!r.data || !Array.isArray(r.data.groups) || !Array.isArray(r.data.options)) return;
    setLoadError(null);
    const known = new Set(r.data.options.map((o) => o.key));
    const groups = r.data.groups.map((g) => ({ ...g, suggestedKeys: g.suggestedKeys.filter((k) => known.has(k)) }));
    setOverview({ ...r.data, groups });
    // Fill in suggestions only for labels the admin has not touched yet.
    setPicked((prev) => {
      const next = { ...prev };
      for (const g of groups) if (!(g.label in next)) next[g.label] = g.suggestedKeys;
      return next;
    });
  }, [pageId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (loadError && !overview) {
    return (
      <p role="alert" className="font-body text-sm text-pz-danger">{loadError}</p>
    );
  }
  if (!overview) return null;

  const open = overview.groups.filter((g) => !(g.label in saved));
  const savedRows = Object.values(saved);
  if (overview.groups.length === 0 && savedRows.length === 0) return null;

  if (!overview.hasOptions) {
    return (
      <section className={card} aria-labelledby="choices-title">
        <h2 id="choices-title" className={cardTitle}>Match purchase choices</h2>
        <p className="font-body text-sm text-pz-on-surface">Set up purchase options on the registration page first</p>
        <Link
          href={registrationSetupHref}
          className="inline-flex items-center max-md:min-h-11 font-headline text-sm font-bold text-pz-primary hover:text-pz-on-primary-container dark:hover:text-pz-primary-fixed transition-colors"
        >
          Open the registration page
        </Link>
      </section>
    );
  }

  const totalHeld = open.reduce((n, g) => n + g.count, 0);
  const paidHeld = open.reduce((n, g) => n + g.paidCount, 0);
  const labelFor = (key: string) => overview.options.find((o) => o.key === key)?.label ?? "";

  function toggle(label: string, key: string) {
    setPicked((p) => {
      const cur = p[label] ?? [];
      return { ...p, [label]: cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key] };
    });
  }

  const rowShell = "rounded-xl bg-pz-surface-container-low p-4 space-y-3 md:grid md:grid-cols-[minmax(0,1.2fr)_minmax(0,2fr)_auto] md:items-center md:gap-4 md:space-y-0 md:rounded-none md:bg-transparent md:p-0 md:py-4 md:border-t md:border-pz-outline-variant/40 md:first:border-t-0";

  return (
    <section className={card} aria-labelledby="choices-title">
      <h2 id="choices-title" className={cardTitle}>Match purchase choices</h2>

      {open.length > 0 && (
        <div role="status" className="flex items-start gap-3 rounded-lg bg-pz-secondary-fixed/40 p-3.5">
          <TriangleAlert className="w-4 h-4 mt-0.5 shrink-0 text-pz-on-surface" aria-hidden="true" />
          <p className="font-body text-sm text-pz-on-surface">
            {paidHeld === 0
              ? `${people(totalHeld)} ${totalHeld === 1 ? "has" : "have"} no recorded choice. None of them are paid yet.`
              : `${paidHeld} paid ${paidHeld === 1 ? "person has" : "people have"} no recorded choice and ${paidHeld === 1 ? "is" : "are"} held until matched.${paidHeld === totalHeld ? "" : ` ${people(totalHeld)} in all.`}`}
          </p>
        </div>
      )}

      {loadError && (
        <p role="alert" className="font-body text-sm text-pz-danger">
          We could not refresh this list. Your last change is saved. Reload the page to check.
        </p>
      )}

      <div className="space-y-3 md:space-y-0">
        {[...open, ...savedRows.map((s) => s.group)].map((g) => {
          const done = saved[g.label];
          const keys = picked[g.label] ?? [];
          return (
            <div key={g.label} role="group" aria-label={g.label} className={rowShell}>
              <div className="space-y-2">
                <p className="font-body text-sm font-semibold text-pz-on-surface break-words">{g.label}</p>
                <div className="flex flex-wrap gap-2">
                  <span className={chip}>{people(g.count)}</span>
                  {g.mode && <span className={chip}>{MODE_TEXT[g.mode]}</span>}
                  {g.confident && !done && (
                    <span className={`${chip} bg-pz-primary-fixed text-pz-on-primary-fixed`}>Suggested</span>
                  )}
                </div>
              </div>
              {done ? (
                <p
                  tabIndex={-1}
                  ref={(el) => {
                    if (el && focusLabel.current === g.label) {
                      focusLabel.current = null;
                      returnFocus.current = el;
                      el.focus();
                    }
                  }}
                  className="md:col-span-2 inline-flex focus:outline-none items-center gap-2 font-body text-sm font-semibold text-pz-on-surface">
                  <Check className="w-4 h-4 text-pz-primary" aria-hidden="true" />
                  {`Saved for ${people(done.updated)}`}
                </p>
              ) : (
                <>
                  <div className="flex flex-wrap gap-2">
                    {overview.options.map((o) => (
                      <label
                        key={o.key}
                        className={`inline-flex items-center gap-2 min-h-11 px-3 rounded-lg border cursor-pointer font-body text-sm text-pz-on-surface ${
                          keys.includes(o.key)
                            ? "bg-pz-primary-fixed/40 border-pz-primary"
                            : "bg-pz-surface-container-lowest border-pz-outline-variant/60"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={keys.includes(o.key)}
                          onChange={() => toggle(g.label, o.key)}
                          className="w-4 h-4 accent-pz-primary"
                        />
                        {o.label}
                      </label>
                    ))}
                  </div>
                  <button
                    type="button"
                    disabled={keys.length === 0 || pending !== null}
                    onClick={(e) => {
                      returnFocus.current = e.currentTarget;
                      setPending({ group: g, keys });
                    }}
                    className={`w-full md:w-auto ${primaryBtn}`}
                  >
                    Apply
                  </button>
                </>
              )}
            </div>
          );
        })}
      </div>

      {pending && (
        <PurchaseChoiceConfirmDialog
          open
          onOpenChange={(o) => {
            if (!o) setPending(null);
          }}
          pageId={pageId}
          label={pending.group.label}
          count={pending.group.count}
          optionKeys={pending.keys}
          optionLabels={pending.keys.map(labelFor)}
          returnFocusRef={returnFocus}
          onDone={(updated) => {
            const g = pending.group;
            focusLabel.current = g.label;
            setSaved((s) => ({ ...s, [g.label]: { group: g, updated } }));
            void load();
          }}
        />
      )}
    </section>
  );
}
