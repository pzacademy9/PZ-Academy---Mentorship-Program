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

type Message = RegistrationDetail["messages"][number];
const STATE_WORD: Record<string, string> = { sent: "Sent", failed: "Failed", skipped: "Skipped", pending: "Waiting", claimed: "Waiting" };
const STATE_CLASS: Record<string, string> = {
  failed: "text-pz-error",
  skipped: "text-pz-on-surface-variant",
  pending: "text-pz-secondary",
  claimed: "text-pz-secondary",
};
const SECTION_LABEL = "text-[11px] font-headline font-bold uppercase tracking-wider text-pz-secondary px-1";

function MessageRow({ m }: { m: Message }) {
  const whatsapp = m.channel === "whatsapp";
  const when = m.sentAt ?? m.sendCreatedAt;
  const notSent = m.state !== "sent";
  const title = whatsapp ? (notSent ? "WhatsApp message" : "Sent via WhatsApp") : m.subject;
  return (
    <li className="p-3 bg-pz-surface-container-low rounded-lg flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`px-2 py-0.5 rounded text-[10px] font-headline font-extrabold shrink-0 ${whatsapp ? "bg-pz-primary-container text-pz-on-primary-container" : "bg-pz-surface-container-high text-pz-on-surface"}`}>
            {whatsapp ? "WhatsApp" : "Email"}
          </span>
          <span className="font-headline font-bold text-xs text-pz-on-surface truncate">{title}</span>
        </div>
        {notSent && <span className={`text-[10px] font-headline font-bold shrink-0 ${STATE_CLASS[m.state] ?? "text-pz-on-surface-variant"}`}>{STATE_WORD[m.state] ?? m.state}</span>}
      </div>
      {when && <span className="font-mono text-[10px] text-pz-on-surface-variant">{formatDateTime(when)}</span>}
    </li>
  );
}

/** Every email we sent to this person, then the messages the team sent from a campaign. Admin-only. */
export function RegistrationEmailsCard({ emails, messages = [] }: { emails: RegistrationDetail["emails"]; messages?: RegistrationDetail["messages"] }) {
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
      {emails.length === 0 && messages.length === 0 ? (
        <p className="mt-5 p-4 rounded-lg bg-pz-surface-container-low text-center text-xs text-pz-on-surface-variant font-body">No emails sent yet</p>
      ) : (
        <div className="mt-5 space-y-4">
          {emails.length > 0 && (
            <div className="space-y-2">
              {messages.length > 0 && <p className={SECTION_LABEL}>Automatic emails</p>}
              <ul className="space-y-2.5">
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
            </div>
          )}
          {messages.length > 0 && (
            <div className={`space-y-2 ${emails.length > 0 ? "pt-3 border-t border-pz-outline-variant/30" : ""}`}>
              <p className={SECTION_LABEL}>Messages from the team</p>
              <ul className="space-y-2.5">
                {messages.map((m, i) => <MessageRow key={`${m.channel}-${m.sendCreatedAt}-${i}`} m={m} />)}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
