import { History } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import type { StatusEventRow } from "@/lib/data/landing-registration-admin";
import type { RegistrationStatus } from "@/lib/landing/registration/config";
import { REGISTRATION_STATUS_LABELS } from "./RegistrationStatusBadge";

const label = (s: string | null) => (s ? (REGISTRATION_STATUS_LABELS[s as RegistrationStatus] ?? s) : "New");

/** Newest first. Each entry: the move, who did it, when, and whether it came from the app or the sheet. */
export function StatusHistory({ events, showPerson }: { events: StatusEventRow[]; showPerson: boolean }) {
  return (
    <section aria-label="Status history" className="bg-pz-surface-container rounded-2xl border border-pz-outline-variant/40 p-6">
      <div className="flex items-center gap-2 mb-1">
        <History className="w-4 h-4 text-pz-secondary" aria-hidden="true" />
        <h2 className="font-headline font-bold text-pz-on-surface text-base">Status history</h2>
      </div>
      <p className="font-body text-xs text-pz-on-surface-variant mb-5">Every change to this registration, newest first.</p>
      {events.length === 0 ? (
        <p className="font-body text-sm text-pz-on-surface-variant">No changes yet.</p>
      ) : (
        <ol className="relative space-y-5 border-l border-pz-outline-variant/60 ml-1.5">
          {events.map((e, i) => (
            <li key={`${e.at}-${i}`} className="pl-5 relative">
              <span className="absolute -left-[5px] top-1.5 w-2.5 h-2.5 rounded-full bg-pz-primary" aria-hidden="true" />
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-headline font-bold text-sm text-pz-on-surface">
                  {label(e.from)} → {label(e.to)}
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-headline font-bold uppercase tracking-wider bg-pz-surface-container-high text-pz-on-surface-variant">
                  {e.source === "sheet" ? "Sheet" : "App"}
                </span>
              </div>
              <p className="font-body text-xs text-pz-on-surface-variant mt-0.5">{formatDateTime(e.at)}</p>
              <p className="font-body text-xs text-pz-on-surface-variant">
                <span>{e.actorName ?? (e.source === "sheet" ? "Changed in the sheet" : "Not recorded")}</span>
                {showPerson && e.registrationName ? ` · ${e.registrationName}` : ""}
              </p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
