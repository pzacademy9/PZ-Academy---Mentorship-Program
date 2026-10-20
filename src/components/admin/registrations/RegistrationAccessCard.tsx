import { BookOpen, CheckCircle2, Key, Lock } from "lucide-react";
import type { RegistrationDetail } from "@/lib/data/landing-registration-admin";

/** What this person can get into: format, account, portal and each module. */
export function RegistrationAccessCard({ access }: { access: RegistrationDetail["access"] }) {
  const { mode, hasAccount, portalOpen, hasCourse, modules } = access;
  return (
    <section className="bg-pz-surface-container rounded-2xl border border-pz-outline-variant/40 p-6">
      <div className="flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-lg bg-pz-surface-container-high flex items-center justify-center text-pz-primary">
          <Key className="w-4 h-4" aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-headline font-bold text-pz-on-surface text-base">Course access</h2>
          <p className="font-body text-xs text-pz-on-surface-variant">Sign-up, portal and modules</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mt-5 text-xs">
        <div className="p-2.5 bg-pz-surface-container-low rounded-lg flex flex-col gap-0.5">
          <span className="text-[10px] font-headline font-bold uppercase tracking-wider text-pz-on-surface-variant">Format</span>
          <span className="font-headline font-bold text-pz-on-surface flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-pz-primary" aria-hidden="true" />
            {mode === "live" ? "Live" : "Recorded"}
          </span>
        </div>
        <div className="p-2.5 bg-pz-surface-container-low rounded-lg flex flex-col gap-0.5">
          <span className="text-[10px] font-headline font-bold uppercase tracking-wider text-pz-on-surface-variant">Account</span>
          <span className={`font-headline font-bold flex items-center gap-1 ${hasAccount ? "text-pz-primary" : "text-pz-on-surface-variant"}`}>
            {hasAccount && <CheckCircle2 className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />}
            {hasAccount ? "Account: signed up" : "Account: not signed up yet"}
          </span>
        </div>
        <div className="p-2.5 bg-pz-surface-container-low rounded-lg flex flex-col gap-0.5">
          <span className="text-[10px] font-headline font-bold uppercase tracking-wider text-pz-on-surface-variant">Portal</span>
          <span className={`font-headline font-bold ${portalOpen ? "text-pz-primary" : "text-pz-on-surface-variant"}`}>
            {portalOpen === null ? "Portal: not set up yet" : portalOpen ? "Portal: open" : "Portal: closed"}
          </span>
        </div>
      </div>

      {modules === null ? (
        <p className="mt-4 p-4 rounded-lg bg-pz-surface-container-low text-center text-xs text-pz-on-surface-variant font-body">
          {!hasCourse ? "No course on this page" : hasAccount ? "Modules appear once the registration is paid" : "Modules appear once they sign up"}
        </p>
      ) : modules.length === 0 ? (
        <p className="mt-4 p-4 rounded-lg bg-pz-surface-container-low text-center text-xs text-pz-on-surface-variant font-body">No modules yet</p>
      ) : (
        <div className="mt-4">
          <div className="text-[11px] font-headline font-bold uppercase tracking-wider text-pz-on-surface-variant mb-1.5">Modules</div>
          <ul className="space-y-2">
            {modules.map((m) => (
              <li key={m.id} className={`p-2.5 rounded-lg bg-pz-surface-container-low flex items-center justify-between gap-3 ${m.open ? "" : "opacity-75"}`}>
                <span className="flex items-center gap-2 min-w-0">
                  {m.open ? (
                    <BookOpen className="w-3.5 h-3.5 shrink-0 text-pz-on-surface-variant" aria-hidden="true" />
                  ) : (
                    <Lock className="w-3.5 h-3.5 shrink-0 text-pz-on-surface-variant" aria-hidden="true" />
                  )}
                  <span className={`text-xs font-headline font-medium truncate ${m.open ? "text-pz-on-surface" : "text-pz-on-surface-variant"}`}>{m.title}</span>
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-headline font-bold shrink-0 ${
                    m.open ? "bg-pz-primary-container text-pz-on-primary-container" : "bg-pz-surface-container-high text-pz-on-surface-variant"
                  }`}
                >
                  {m.open ? "Open" : "Closed"}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
