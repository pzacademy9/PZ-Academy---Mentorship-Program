import Link from "next/link";
import { ArrowLeft, ExternalLink, Mail, MessageCircle, Phone } from "lucide-react";
import { formatDateTime, initials } from "@/lib/format";
import { formatMoney } from "@/lib/format-money";
import type { RegistrationDetail } from "@/lib/data/landing-registration-admin";
import { RegistrationStatusBadge } from "./RegistrationStatusBadge";
import { StatusChangeControl } from "./StatusChangeControl";
import { StatusHistory } from "./StatusHistory";
import { GroupMembers } from "./GroupMembers";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="font-label text-[11px] uppercase tracking-widest text-pz-secondary/80">{label}</dt>
      <dd className="font-body text-sm text-pz-on-surface mt-0.5 break-words">{children}</dd>
    </div>
  );
}

const Card = ({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) => (
  <section className="bg-pz-surface-container rounded-2xl border border-pz-outline-variant/40 p-6">
    <h2 className="font-headline font-bold text-pz-on-surface text-base">{title}</h2>
    {subtitle && <p className="font-body text-xs text-pz-on-surface-variant mt-0.5">{subtitle}</p>}
    <div className="mt-5">{children}</div>
  </section>
);

const Missing = ({ children = "Not provided" }: { children?: string }) => (
  <span className="text-pz-on-surface-variant">{children}</span>
);

/** Only a real https link is clickable; anything else (a javascript: link, a bare word) stays plain text. */
function VoucherValue({ url }: { url: string | null }) {
  if (!url) return <Missing>No payment proof was sent</Missing>;
  if (!url.startsWith("https://")) return <span className="break-all">{url}</span>;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 hover:text-pz-primary transition-colors break-all underline">
      {url}
      <ExternalLink className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
    </a>
  );
}

/**
 * The registration detail page body. Role-agnostic: the sales page passes showAgent={false},
 * its own back link and its own status endpoint.
 */
export function RegistrationDetailView({
  detail,
  backHref,
  backLabel,
  endpoint,
  showAgent,
}: {
  detail: RegistrationDetail;
  backHref: string;
  backLabel: string;
  endpoint: string;
  showAgent: boolean;
}) {
  const { lead, members, page, agentName, events } = detail;
  const isGroup = lead.rowType === "lead" || members.length > 0;
  const balance =
    lead.status === "underpaid" && lead.expectedAmount !== null && lead.amountReceived !== null
      ? lead.expectedAmount - lead.amountReceived
      : null;
  const whatsappDigits = lead.whatsapp.replace(/\D/g, "");
  const utm = Object.entries(lead.utm);

  return (
    <div className="space-y-6">
      <div>
        <Link href={backHref} className="inline-flex items-center gap-2 font-body text-sm text-pz-on-surface-variant hover:text-pz-primary transition-colors">
          <ArrowLeft className="w-4 h-4" aria-hidden="true" /> {backLabel}
        </Link>
        <div className="flex flex-wrap items-center gap-3 mt-3">
          <h1 className="font-headline font-bold text-2xl text-pz-secondary">{lead.name}</h1>
          <RegistrationStatusBadge status={lead.status} />
          {lead.isTest && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-headline font-extrabold bg-pz-surface-container-highest text-pz-on-surface-variant tracking-wider uppercase">
              Test
            </span>
          )}
        </div>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1">
          {lead.refId ? <span className="font-mono">{lead.refId}</span> : null}
          {lead.refId ? " · " : ""}
          {page.title || "Landing page"}
          {lead.optionLabel ? ` · ${lead.optionLabel}` : ""}
          {` · ${lead.mode === "live" ? "Live" : "Recorded"}`}
          {isGroup ? ` · Group of ${lead.groupSize}` : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2 mt-4">
          <StatusChangeControl
            registrationId={lead.id}
            endpoint={endpoint}
            status={lead.status}
            expectedAmount={lead.expectedAmount}
            currency={lead.currency}
            studentName={lead.name}
            groupSize={isGroup ? lead.groupSize : 1}
          />
          {whatsappDigits && (
            <a
              href={`https://wa.me/${whatsappDigits}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2.5 max-md:min-h-11 rounded-lg font-headline text-sm font-bold bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant transition-colors"
            >
              <MessageCircle className="w-4 h-4" aria-hidden="true" /> WhatsApp chat
            </a>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 items-start">
        <div className="lg:col-span-3 space-y-6">
          <Card title="Applicant details" subtitle="Who registered and where they work">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Email">
                {lead.email ? (
                  <a href={`mailto:${lead.email}`} className="inline-flex items-center gap-1.5 hover:text-pz-primary transition-colors break-all">
                    <Mail className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    {lead.email}
                  </a>
                ) : (
                  <Missing />
                )}
              </Field>
              <Field label="WhatsApp">
                {lead.whatsapp ? (
                  <a href={`tel:${lead.whatsapp}`} className="inline-flex items-center gap-1.5 hover:text-pz-primary transition-colors">
                    <Phone className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                    {lead.whatsapp}
                  </a>
                ) : (
                  <Missing />
                )}
              </Field>
              <Field label="Profession">{lead.profession || <Missing />}</Field>
              <Field label="City">{lead.city || <Missing />}</Field>
              <Field label="Country">{lead.region || <Missing />}</Field>
              <Field label="How they heard about us">{lead.discovery || <Missing />}</Field>
            </dl>
            <p className="font-body text-xs text-pz-on-surface-variant mt-5">Submitted {formatDateTime(lead.createdAt)}</p>
          </Card>

          <Card title="Price and payment" subtitle="What was chosen, what it costs and what has come in">
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Option">{lead.optionLabel || <Missing />}</Field>
              <Field label="Price">
                <span className="font-headline font-semibold tabular-nums">{formatMoney(lead.expectedAmount, lead.currency)}</span>
              </Field>
              <Field label="Promo code">{lead.promoCodeText ?? <Missing>None used</Missing>}</Field>
              <Field label="Amount received">
                <span className="font-headline font-semibold tabular-nums">{formatMoney(lead.amountReceived, lead.currency)}</span>
                {balance !== null && (
                  <span className="block text-xs text-pz-on-surface-variant tabular-nums">Still to pay: {formatMoney(balance, lead.currency)}</span>
                )}
              </Field>
              <Field label="Payment method">{lead.paymentMethod ?? <Missing />}</Field>
              <Field label="Payment proof">
                <VoucherValue url={lead.voucherUrl} />
              </Field>
              <Field label="Landing page">
                {page.slug ? (
                  <Link href={`/e/${page.slug}`} className="hover:text-pz-primary transition-colors">
                    {page.title || page.slug}
                  </Link>
                ) : (
                  page.title || <Missing />
                )}
              </Field>
            </dl>
          </Card>

          {showAgent && (
            <Card title="Agent" subtitle="Who brought this registration in">
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Sales agent">
                  {agentName ? (
                    <span className="inline-flex items-center gap-2">
                      <span className="w-8 h-8 shrink-0 rounded-full bg-pz-primary-container text-pz-on-primary-container grid place-items-center font-headline font-bold text-xs">
                        {initials(agentName)}
                      </span>
                      <span>{agentName}</span>
                    </span>
                  ) : (
                    <Missing>No agent. This came straight from the page.</Missing>
                  )}
                </Field>
                {utm.length > 0 && (
                  <Field label="Campaign details">
                    {utm.map(([k, v]) => (
                      <span key={k} className="block text-xs">
                        {k}: {v}
                      </span>
                    ))}
                  </Field>
                )}
              </dl>
            </Card>
          )}
        </div>

        <div className="lg:col-span-2 space-y-6">
          {isGroup && <GroupMembers lead={lead} members={members} />}
          <StatusHistory events={events} showPerson={isGroup} />
        </div>
      </div>
    </div>
  );
}
