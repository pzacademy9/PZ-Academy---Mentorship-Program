"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, BadgeCheck, Check, Clock, Copy, Hash, Landmark, Link2, MessageCircle, ReceiptText, ShieldCheck } from "lucide-react";
import { formatPrice, initials } from "@/lib/format";
import { whatsappLink } from "@/lib/mentorship/whatsapp";
import { BOOKING_SUMMARY_KEY, type BookingSummary } from "@/lib/mentorship/booking";

/**
 * Thank-you page body (Stitch "Mentorship Booking Thank You", Platform 2).
 * The reference comes from the address bar (already checked by the server
 * page); the summary comes from this browser tab only, and is shown only
 * when it belongs to the same booking.
 */

const NEXT_STEPS = [
  { icon: ShieldCheck, title: "Payment check", when: "Within 24 hours", text: "Our team checks your payment against your screenshot." },
  { icon: Link2, title: "Meeting link", when: "By email", text: "Your mentor sends a Google Meet or Zoom link to your email." },
  { icon: Check, title: "Your session", when: "At the agreed time", text: "Join your private 1-on-1 session and bring your questions." },
];

function readSummary(refCode: string | null): BookingSummary | null {
  try {
    const raw = sessionStorage.getItem(BOOKING_SUMMARY_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as Partial<BookingSummary>;
    if (typeof s.mentorName !== "string" || typeof s.packageName !== "string") return null;
    if ((s.ref ?? null) !== refCode) return null;
    return {
      ref: s.ref ?? null,
      mentorName: s.mentorName,
      mentorTitle: typeof s.mentorTitle === "string" ? s.mentorTitle : "",
      mentorPhoto: typeof s.mentorPhoto === "string" ? s.mentorPhoto : "",
      packageName: s.packageName,
      price: typeof s.price === "number" ? s.price : null,
      fullName: typeof s.fullName === "string" ? s.fullName : "",
    };
  } catch {
    return null;
  }
}

function CopyRef({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      aria-label={`Copy ${code}`}
      onClick={async () => {
        await navigator.clipboard?.writeText(code).catch(() => {});
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-pz-web-surface-high px-3.5 font-poppins text-xs font-semibold text-pz-deep hover:bg-pz-web-surface-low"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-pz-mid" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

export function ThankYouClient({ refCode }: { refCode: string | null }) {
  const [summary, setSummary] = useState<BookingSummary | null>(null);
  useEffect(() => setSummary(readSummary(refCode)), [refCode]);

  const helpMsg = refCode
    ? `Hi PZ Academy! I need help with my mentorship booking ${refCode}.`
    : "Hi PZ Academy! I need help with my booking.";

  return (
    <div className="min-h-screen bg-pz-web-surface px-4 pb-16 pt-[7rem] sm:px-5 md:pt-[8rem]">
      <div className="mx-auto max-w-[820px]">
        <div className="flex flex-col items-center text-center">
          <span className="relative flex h-20 w-20 items-center justify-center rounded-full bg-pz-bright shadow-[0_0_0_10px_rgba(126,217,87,0.2)]">
            <Check className="h-10 w-10 text-pz-solid-deep" strokeWidth={3} aria-hidden="true" />
          </span>
          <span className="mt-6 inline-flex items-center gap-2 rounded-full bg-pz-web-surface-high px-3 py-1 font-poppins text-xs font-semibold text-pz-deep">
            <span aria-hidden="true" className="h-2 w-2 rounded-full bg-pz-solid-mid" />
            Booking request sent
          </span>
          <h1 className="mt-3 font-montserrat text-[32px] font-black tracking-[-0.02em] text-pz-deep sm:text-5xl">Booking received!</h1>
          <p className="mt-3 max-w-lg font-poppins text-base text-pz-muted">
            Your 1-on-1 mentorship request has been sent. We have emailed you a copy.
          </p>

          {refCode && (
            <div className="mt-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-2 rounded-2xl border border-pz-border bg-pz-surface-container-lowest px-4 py-2.5 shadow-sm sm:rounded-full sm:py-2 sm:pl-5 sm:pr-2">
              <Hash className="h-4 w-4 text-pz-mid" aria-hidden="true" />
              <span className="font-poppins text-xs font-bold uppercase tracking-wider text-pz-muted">Your reference</span>
              <span className="font-mono text-base font-bold text-pz-deep">{refCode}</span>
              <CopyRef code={refCode} />
            </div>
          )}
          {refCode && <p className="mt-2 font-poppins text-xs text-pz-muted">Quote this code if you message us about your booking.</p>}
        </div>

        <div className="mt-8 flex items-start gap-4 rounded-[24px] bg-pz-bright/15 p-5 sm:p-6">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pz-surface-container-lowest text-pz-mid">
            <Clock className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-2 font-montserrat text-base font-bold text-pz-deep">
              Payment check in progress
              <span className="rounded-full bg-pz-solid-mid px-2 py-0.5 font-poppins text-[10px] font-bold uppercase tracking-wider text-white">Pending review</span>
            </p>
            <p className="mt-1 font-poppins text-sm leading-relaxed text-pz-ink">
              Our team checks payments within 24 hours. Once it is confirmed, your mentor sends your meeting link to your email.
            </p>
          </div>
        </div>

        {summary && (
          <section aria-labelledby="ty-summary-title" className="mt-6 rounded-[24px] border border-pz-border bg-pz-surface-container-lowest p-5 shadow-[0_8px_30px_rgba(15,61,34,0.05)] sm:p-7">
            <h2 id="ty-summary-title" className="mb-5 flex items-center gap-2.5 font-montserrat text-lg font-bold text-pz-deep">
              <ReceiptText className="h-5 w-5 text-pz-mid" aria-hidden="true" />
              Booking summary
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex items-center gap-3 rounded-2xl bg-pz-web-surface-low p-4">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-pz-web-surface-high">
                  {summary.mentorPhoto ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={summary.mentorPhoto} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover object-top" />
                  ) : (
                    <span aria-hidden="true" className="flex h-full w-full items-center justify-center font-montserrat font-bold text-pz-mid">{initials(summary.mentorName)}</span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="font-poppins text-[10px] font-bold uppercase tracking-wider text-pz-mid">Your mentor</p>
                  <p className="break-words font-montserrat text-sm font-bold text-pz-deep">{summary.mentorName}</p>
                  {summary.mentorTitle && <p className="break-words font-poppins text-xs text-pz-muted">{summary.mentorTitle}</p>}
                  <p className="mt-0.5 inline-flex items-center gap-1 font-poppins text-[11px] font-semibold text-pz-mid">
                    <BadgeCheck className="h-3 w-3" aria-hidden="true" /> Verified mentor
                  </p>
                </div>
              </div>
              <div className="rounded-2xl bg-pz-web-surface-low p-4">
                <p className="font-poppins text-[10px] font-bold uppercase tracking-wider text-pz-mid">Package</p>
                <p className="break-words font-montserrat text-sm font-bold text-pz-deep">{summary.packageName}</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-pz-border pt-4">
              {summary.fullName && (
                <div className="min-w-0">
                  <p className="font-poppins text-[11px] text-pz-muted">Booked by</p>
                  <p className="break-words font-poppins text-sm font-semibold text-pz-ink">{summary.fullName}</p>
                </div>
              )}
              {summary.price !== null && (
                <div className="flex items-center gap-3 text-right">
                  <div>
                    <p className="font-poppins text-[11px] text-pz-muted">Amount (bank transfer)</p>
                    <p className="font-montserrat text-xl font-black text-pz-mid">{formatPrice(summary.price)}</p>
                  </div>
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-pz-bright/20 text-pz-deep">
                    <Landmark className="h-5 w-5" aria-hidden="true" />
                  </span>
                </div>
              )}
            </div>
          </section>
        )}

        <section aria-labelledby="ty-next-title" className="mt-6 rounded-[24px] border border-pz-border bg-pz-surface-container-lowest p-5 shadow-[0_8px_30px_rgba(15,61,34,0.05)] sm:p-7">
          <p className="font-poppins text-xs font-bold uppercase tracking-wider text-pz-mid">What happens next</p>
          <h2 id="ty-next-title" className="mt-1 font-montserrat text-lg font-bold text-pz-deep">3 next steps</h2>
          <ol className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {NEXT_STEPS.map(({ title, when, text }, i) => (
              <li key={title} className="rounded-2xl bg-pz-web-surface-low p-4">
                <span aria-hidden="true" className={`flex h-8 w-8 items-center justify-center rounded-full font-montserrat text-sm font-black ${i === 0 ? "bg-pz-bright text-pz-solid-deep" : "bg-pz-web-surface-high text-pz-deep"}`}>
                  {i + 1}
                </span>
                <h3 className="mt-3 font-montserrat text-sm font-bold text-pz-deep">{title}</h3>
                <p className="font-poppins text-[11px] font-semibold text-pz-mid">{when}</p>
                <p className="mt-1.5 font-poppins text-xs leading-relaxed text-pz-muted">{text}</p>
              </li>
            ))}
          </ol>
        </section>

        <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <a
            href={whatsappLink(helpMsg)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-pz-bright px-6 text-center font-montserrat text-sm font-bold text-pz-solid-deep shadow-sm"
          >
            <MessageCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            Need help? WhatsApp us
          </a>
          <Link
            href="/mentorship"
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full border border-pz-border bg-pz-surface-container-lowest px-6 font-montserrat text-sm font-bold text-pz-deep hover:bg-pz-web-surface-low"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            Back to all mentors
          </Link>
        </div>
        <p className="mt-4 text-center font-poppins text-xs text-pz-muted">WhatsApp: +92 370 0199 429</p>
      </div>
    </div>
  );
}
