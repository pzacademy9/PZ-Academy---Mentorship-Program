import { Mail } from "lucide-react";
import { formatDateTime } from "@/lib/format";
import type { RegistrationDetail } from "@/lib/data/landing-registration-admin";

const KINDS: Record<RegistrationDetail["emails"][number]["kind"], { label: string; className: string }> = {
  paid: { label: "Paid", className: "bg-pz-primary-fixed text-pz-on-primary-fixed" },
  portal_link: { label: "Portal link", className: "bg-pz-tertiary-fixed text-pz-on-tertiary-fixed" },
  reserved: { label: "Reserved", className: "bg-pz-surface-container-high text-pz-on-surface-variant" },
  // Not drawn on the design screens: reuses the Underpaid colours from the status badge.
  underpaid: { label: "Underpaid", className: "bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300" },
};

/** Every email we sent to this person, in the order the data arrives. Admin-only. */
export function RegistrationEmailsCard({ emails }: { emails: RegistrationDetail["emails"] }) {
  return (
    <section className="bg-pz-surface-container rounded-2xl border border-pz-outline-variant/40 p-6">
      <div className="flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-lg bg-pz-surface-container-high flex items-center justify-center text-pz-primary">
          <Mail className="w-4 h-4" aria-hidden="true" />
        </span>
        <div>
          <h2 className="font-headline font-bold text-pz-on-surface text-base">Emails sent</h2>
          <p className="font-body text-xs text-pz-on-surface-variant">Emails we sent to this person</p>
        </div>
      </div>
      {emails.length === 0 ? (
        <p className="mt-5 p-4 rounded-lg bg-pz-surface-container-low text-center text-xs text-pz-on-surface-variant font-body">No emails sent yet</p>
      ) : (
        <ul className="mt-5 space-y-2.5">
          {emails.map((e, i) => (
            <li key={`${e.kind}-${e.sentAt}-${i}`} className="p-3 bg-pz-surface-container-low rounded-lg flex flex-col gap-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className={`px-2 py-0.5 rounded text-[10px] font-headline font-extrabold ${KINDS[e.kind].className}`}>{KINDS[e.kind].label}</span>
                <span className="font-mono text-[10px] text-pz-on-surface-variant">{formatDateTime(e.sentAt)}</span>
              </div>
              <span className="font-body text-xs text-pz-on-surface truncate">{e.toEmail}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
