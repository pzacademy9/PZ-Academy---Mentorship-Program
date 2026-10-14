import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { Problem } from "@/lib/landing/content";
import { cn } from "@/lib/utils";

/** The "Ready to publish?" checklist: plain-language problems, each with a Fix button when it points at a section. */
export function ReadinessPanel({
  problems, onGoto, onKeep,
}: { problems: Problem[]; onGoto: (sectionId: string, field?: string) => void; onKeep?: (paths: string[]) => void }) {
  const ready = problems.length === 0;
  return (
    <section
      aria-label="Publish checklist"
      className={cn(
        "rounded-xl border bg-pz-surface-container-lowest p-3 shadow-sm",
        ready ? "border-pz-outline-variant" : "border-pz-warning/40",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          {ready ? (
            <CheckCircle2 className="h-4 w-4 text-pz-success" aria-hidden="true" />
          ) : (
            <AlertTriangle className="h-4 w-4 text-pz-warning" aria-hidden="true" />
          )}
          <h3 className="font-headline text-xs font-bold text-pz-on-surface">Ready to publish?</h3>
        </div>
        {!ready && (
          <span className="rounded bg-pz-secondary-container px-1.5 py-0.5 font-body text-[10px] font-bold text-pz-on-secondary-container">
            {problems.length} pending
          </span>
        )}
      </div>

      {ready ? (
        <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-pz-primary-container/40 p-2 font-body text-[11px] font-medium text-pz-on-surface">
          Everything is filled in
        </p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {problems.map((p, i) => (
            <li
              key={`${i}:${p.message}`}
              className="flex items-start justify-between gap-2 rounded-lg border border-pz-warning/30 bg-pz-warning/10 p-1.5 font-body text-[11px]"
            >
              <span className="min-w-0 leading-snug text-pz-on-surface">{p.message}</span>
              <span className="flex shrink-0 items-center gap-1">
                {p.sectionId && (
                  <button
                    type="button"
                    onClick={() => (p.field ? onGoto(p.sectionId as string, p.field) : onGoto(p.sectionId as string))}
                    className="shrink-0 rounded border border-pz-outline-variant bg-pz-surface-container-lowest px-2 py-0.5 text-[10px] font-bold text-pz-primary hover:bg-pz-surface-container-high focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring max-md:min-h-11"
                  >
                    Fix
                  </button>
                )}
                {p.review && onKeep && (
                  <button
                    type="button"
                    onClick={() => onKeep(p.review as string[])}
                    className="shrink-0 rounded border border-pz-outline-variant bg-pz-surface-container-lowest px-2 py-0.5 text-[10px] font-bold text-pz-on-surface-variant hover:bg-pz-surface-container-high focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring max-md:min-h-11"
                  >
                    Keep
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
