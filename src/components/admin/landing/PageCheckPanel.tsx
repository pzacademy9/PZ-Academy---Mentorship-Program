"use client";

import { useEffect } from "react";
import { AlertTriangle, CheckCircle2, ShieldCheck, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { failures, warnings, type PageCheck } from "@/lib/landing/page-check";
import { registrationTarget } from "@/lib/landing/registration/setup-steps";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function headline(checks: PageCheck[]): string {
  const f = failures(checks).length;
  const w = warnings(checks).length;
  if (f > 0) return `${plural(f, "thing must be", "things must be")} fixed before this page can be published.`;
  if (w > 0) return `Everything that must be fixed is fixed. ${plural(w, "thing", "things")} to look at.`;
  return "Everything checks out.";
}

/** The "Check this page" list: a tick for each passed check, a note for a warning, a Fix this button for a failure. */
export function PageCheckPanel({ checks, onGoto }: { checks: PageCheck[]; onGoto: (sectionId: string, field?: string) => void }) {
  if (checks.length === 0) {
    return <p className="font-body text-sm text-pz-on-surface-variant">There is nothing to check yet. Turn on the registration form to see the checks.</p>;
  }
  return (
    <section aria-label="Page checks" className="space-y-3">
      <p className="font-body text-sm font-semibold text-pz-on-surface">{headline(checks)}</p>
      <ul className="space-y-2">
        {checks.map((c) => {
          const target = c.sectionId ?? (c.step ? registrationTarget(c.step) : undefined);
          return (
            <li
              key={c.id}
              className={cn(
                "flex items-start gap-2 rounded-lg border p-2.5 font-body text-sm",
                c.status === "pass" && "border-pz-outline-variant bg-pz-surface-container-lowest",
                c.status === "warn" && "border-pz-warning/40 bg-pz-warning/10",
                c.status === "fail" && "border-pz-solid-danger/40 bg-pz-error-container/40",
              )}
            >
              {c.status === "pass" && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-pz-success" role="img" aria-label="Passed" />}
              {c.status === "warn" && <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-pz-warning" role="img" aria-label="Warning" />}
              {c.status === "fail" && <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-pz-solid-danger" role="img" aria-label="Must be fixed" />}
              <span className="min-w-0 flex-1">
                <span className="block font-semibold text-pz-on-surface">{c.title}</span>
                {c.status !== "pass" && c.detail && <span className="mt-0.5 block text-pz-on-surface-variant">{c.detail}</span>}
              </span>
              {c.status === "fail" && target && (
                <button
                  type="button"
                  onClick={() => onGoto(target)}
                  className="shrink-0 rounded border border-pz-outline-variant bg-pz-surface-container-lowest px-2.5 py-1 text-xs font-bold text-pz-primary hover:bg-pz-surface-container-high focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring max-md:min-h-11"
                >
                  Fix this
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Side sheet that holds the page checks (Escape or Done closes it). */
export function PageCheckSheet({ checks, onGoto, onClose }: {
  checks: PageCheck[]; onGoto: (sectionId: string, field?: string) => void; onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <aside
      role="dialog"
      aria-label="Check this page"
      className="fixed inset-y-0 right-0 z-[60] flex w-[min(420px,100vw)] flex-col border-l border-pz-outline-variant bg-pz-surface-container-lowest shadow-2xl"
    >
      <div className="flex items-center justify-between gap-2 border-b border-pz-outline-variant p-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-pz-primary" aria-hidden="true" />
          <h2 className="font-headline text-sm font-bold text-pz-on-surface">Check this page</h2>
        </div>
        <button
          type="button"
          aria-label="Close page checks"
          onClick={onClose}
          className="rounded-lg p-1 text-pz-on-surface-variant hover:bg-pz-surface-container-high focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <PageCheckPanel checks={checks} onGoto={onGoto} />
      </div>
      <div className="border-t border-pz-outline-variant bg-pz-surface-container-low p-3">
        <Button type="button" variant="outline" size="sm" className="w-full" onClick={onClose}>Done</Button>
      </div>
    </aside>
  );
}
