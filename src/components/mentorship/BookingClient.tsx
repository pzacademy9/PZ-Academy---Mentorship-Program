"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight, BadgeCheck, Banknote, Check, CheckCircle, ChevronRight, CloudUpload, Copy, ExternalLink,
  Info, Landmark, MessageCircle, ShieldCheck, Smartphone, Wallet, X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import type { Mentor } from "@/lib/data/mentors";
import type { MentorReviewSummary } from "@/lib/data/mentor-reviews";
import { formatPrice, initials } from "@/lib/format";
import { formatSessionDuration } from "@/lib/validations/admin-mentor";
import { whatsappLink } from "@/lib/mentorship/whatsapp";
import {
  BOOKING_SUMMARY_KEY, PAYMENT_ACCOUNTS, SCREENSHOT_TYPES, bookingRef, bookingStep, screenshotProblem,
  type BookingSummary,
} from "@/lib/mentorship/booking";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { MentorTierBadge } from "./MentorTierBadge";
import { StarRow } from "./MentorReviews";

/**
 * Booking page (Stitch "Mentor Booking Flow", Platform 2). The fields and the
 * POST to /api/mentorship/bookings are exactly the old ones; only the look
 * changed. Payment accounts are the real ones from PAYMENT_ACCOUNTS.
 */

interface FormState {
  fullName: string;
  email: string;
  phone: string;
  package: string;
  notes: string;
  screenshot: File | null;
}

const ACCOUNT_ICONS: Record<(typeof PAYMENT_ACCOUNTS)[number]["kind"], LucideIcon> = {
  bank: Landmark,
  wallet: Smartphone,
  paypal: Wallet,
};

const card = "rounded-[24px] border border-pz-border bg-pz-surface-container-lowest p-5 shadow-[0_8px_30px_rgba(15,61,34,0.05)] sm:p-7";
const fieldLabel = "mb-1.5 block font-poppins text-sm font-semibold text-pz-ink";
const input =
  "w-full min-h-12 rounded-xl border border-pz-border bg-pz-web-surface-low px-4 py-3 font-poppins text-sm text-pz-ink placeholder:text-pz-muted/70 focus:border-pz-solid-mid focus:outline-none focus:ring-2 focus:ring-pz-bright/40";

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard?.writeText(text).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy ${text}`}
      className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-pz-border bg-pz-surface-container-lowest px-3.5 font-poppins text-xs font-semibold text-pz-deep transition-colors hover:bg-pz-web-surface-high"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-pz-mid" aria-hidden="true" /> : <Copy className="h-3.5 w-3.5" aria-hidden="true" />}
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

function StepNumber({ n }: { n: number }) {
  return (
    <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-pz-bright/25 font-montserrat text-sm font-black text-pz-deep">
      {n}
    </span>
  );
}

const STEPS = ["Choose package", "Pay by transfer", "Send proof"] as const;

function StepsBar({ current }: { current: 1 | 2 | 3 }) {
  return (
    <ol aria-label="Booking steps" className="grid grid-cols-3 gap-2 rounded-[24px] border border-pz-border bg-pz-surface-container-lowest p-3 shadow-[0_8px_30px_rgba(15,61,34,0.05)] sm:p-4">
      {STEPS.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3;
        const done = n < current;
        const now = n === current;
        return (
          <li key={label} aria-current={now ? "step" : undefined} className="flex min-w-0 flex-col items-center gap-1.5 text-center sm:flex-row sm:gap-3 sm:text-left">
            <span
              aria-hidden="true"
              className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-montserrat text-sm font-black ${done ? "bg-pz-bright text-pz-solid-deep" : now ? "bg-pz-solid-mid text-white" : "bg-pz-web-surface-high text-pz-muted"}`}
            >
              {done ? <Check className="h-4 w-4" /> : n}
            </span>
            <span className="min-w-0">
              <span className={`hidden font-poppins text-[10px] font-bold uppercase tracking-wider sm:block ${now ? "text-pz-mid" : "text-pz-muted"}`}>
                {done ? "Done" : now ? "Now" : `Step ${n}`}
              </span>
              <span className={`block break-words font-poppins text-xs font-semibold sm:text-sm ${now || done ? "text-pz-deep" : "text-pz-muted"}`}>{label}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export default function BookingClient({
  mentor,
  initialPackage = "",
  reviewSummary,
}: {
  mentor: Mentor;
  initialPackage?: string;
  reviewSummary?: MentorReviewSummary;
}) {
  const [form, setForm] = useState<FormState>({ fullName: "", email: "", phone: "", package: initialPackage, notes: "", screenshot: null });
  const [fileError, setFileError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const lastSubmitRef = useRef<number>(0);
  const router = useRouter();

  const selectedPackage = mentor.packages.find((p) => p.name === form.package);
  const step = bookingStep(form.package, form.screenshot !== null);
  const length = mentor.sessionDurationText.trim() || formatSessionDuration(mentor.sessionDurationMinutes);
  const rated = mentor.showReviews && reviewSummary && reviewSummary.count > 0 && reviewSummary.avg != null;
  const waMsg = `Hi! I've completed the payment for a session with ${mentor.name} on PZ Academy. Here is my payment screenshot.`;

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleFile(file: File | null) {
    if (!file) return;
    const problem = screenshotProblem(file);
    setFileError(problem);
    if (problem) return;
    setForm((prev) => ({ ...prev, screenshot: file }));
  }

  const { run: submitBooking, pending: loading } = useAsyncAction(async () => {
    const missing = [
      !form.package && "a package",
      !form.fullName.trim() && "your full name",
      !form.email.trim() && "your email",
      !form.phone.trim() && "your WhatsApp number",
    ].filter(Boolean);
    if (missing.length > 0) {
      toast.error(`Please add ${missing.join(", ")}.`);
      return;
    }

    // Rate limiting: prevent submissions within 30 seconds
    const now = Date.now();
    if (now - lastSubmitRef.current < 30_000) {
      toast.info("Please wait a moment before submitting again.");
      return;
    }

    let id: string | null = null;
    try {
      let screenshotBase64 = "";
      let screenshotName = "";
      let screenshotMimeType = "";
      if (form.screenshot) {
        screenshotName = form.screenshot.name;
        screenshotMimeType = form.screenshot.type;
        screenshotBase64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(",")[1] ?? "");
          };
          reader.readAsDataURL(form.screenshot!);
        });
      }

      const res = await fetch("/api/mentorship/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: form.fullName,
          email: form.email,
          phone: form.phone,
          mentorSlug: mentor.slug,
          mentorName: mentor.name,
          packageName: form.package,
          goals: form.notes,
          screenshotBase64: screenshotBase64 || undefined,
          screenshotName: screenshotName || undefined,
          screenshotMimeType: screenshotMimeType || undefined,
        }),
      });

      if (!res.ok) {
        toast.error("Something went wrong submitting your booking. Please try again or send your screenshot via WhatsApp instead.");
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { id?: string | null };
      id = data.id ?? null;
    } catch {
      toast.error("Something went wrong submitting your booking. Please try again or send your screenshot via WhatsApp instead.");
      return;
    }

    lastSubmitRef.current = Date.now();
    const ref = bookingRef(id);
    const summary: BookingSummary = {
      ref,
      mentorName: mentor.name,
      mentorTitle: mentor.title,
      mentorPhoto: mentor.photo,
      packageName: form.package,
      price: selectedPackage?.price ?? null,
      fullName: form.fullName.trim(),
    };
    try {
      sessionStorage.setItem(BOOKING_SUMMARY_KEY, JSON.stringify(summary));
    } catch {
      // Private mode or storage blocked: the thank-you page still works without the summary.
    }
    router.push(ref ? `/mentorship/thank-you?ref=${ref}` : "/mentorship/thank-you");
  });

  return (
    <div className="min-h-screen bg-pz-web-surface px-4 pb-16 pt-[6.5rem] sm:px-5 md:px-6 md:pt-[7.5rem]">
      <div className="mx-auto max-w-[1240px]">
        {/* ── Header ── */}
        <nav aria-label="Breadcrumb" className="mb-4">
          <ol className="flex flex-wrap items-center gap-1.5 font-poppins text-xs text-pz-muted">
            <li><Link href="/mentorship" className="hover:text-pz-deep">All mentors</Link></li>
            <li aria-hidden="true"><ChevronRight className="h-3 w-3" /></li>
            <li className="min-w-0"><Link href={`/mentorship/mentors/${mentor.slug}`} className="break-words hover:text-pz-deep">{mentor.name}</Link></li>
            <li aria-hidden="true"><ChevronRight className="h-3 w-3" /></li>
            <li aria-current="page" className="font-semibold text-pz-deep">Book session</li>
          </ol>
        </nav>
        <span className="inline-block rounded-full bg-pz-tertiary-fixed px-3 py-1 font-poppins text-xs font-bold uppercase tracking-wider text-pz-on-tertiary-fixed">1-on-1 mentorship</span>
        <h1 className="mt-3 font-montserrat text-[28px] font-black leading-tight tracking-[-0.02em] text-pz-deep sm:text-4xl">Book your 1-on-1 session</h1>
        <p className="mt-2 max-w-2xl font-poppins text-sm text-pz-muted sm:text-base">
          Choose a package, pay by transfer, then send this form with your payment proof. Our team checks every payment by hand.
        </p>

        <div className="mt-6">
          <StepsBar current={step} />
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-12 lg:gap-8">
          {/* ── Summary ── */}
          <aside className="min-w-0 lg:order-last lg:col-span-4">
            <section aria-labelledby="summary-title" className="overflow-hidden rounded-[24px] border border-pz-border bg-pz-surface-container-lowest shadow-[0_16px_48px_rgba(15,61,34,0.10)] lg:sticky lg:top-28">
              <div className="p-5 sm:p-6">
                <h2 id="summary-title" className="font-poppins text-xs font-bold uppercase tracking-wider text-pz-muted">Booking summary</h2>
                <div className="mt-4 flex items-center gap-3 rounded-2xl bg-pz-web-surface-low p-3">
                  <div className="relative h-14 w-14 shrink-0">
                    <div className="h-14 w-14 overflow-hidden rounded-xl bg-pz-web-surface-high">
                      {mentor.photo ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={mentor.photo} alt="" referrerPolicy="no-referrer" className="h-full w-full object-cover object-top" />
                      ) : (
                        <span aria-hidden="true" className="flex h-full w-full items-center justify-center font-montserrat text-base font-bold text-pz-mid">{initials(mentor.name)}</span>
                      )}
                    </div>
                    <span title="Verified by PZ Academy" className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full border-2 border-pz-surface-container-lowest bg-pz-bright">
                      <BadgeCheck className="h-3 w-3 text-pz-solid-deep" aria-hidden="true" />
                      <span className="sr-only">Verified by PZ Academy</span>
                    </span>
                  </div>
                  <div className="min-w-0">
                    <p className="break-words font-montserrat text-sm font-bold text-pz-deep">{mentor.name}</p>
                    {mentor.title && <p className="break-words font-poppins text-xs text-pz-muted">{mentor.title}</p>}
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <MentorTierBadge tier={mentor.tier} />
                      {rated && (
                        <span className="inline-flex items-center gap-1 font-poppins text-[11px] text-pz-muted">
                          <StarRow avg={reviewSummary!.avg!} size={11} />
                          {reviewSummary!.avg!.toFixed(1)} ({reviewSummary!.count})
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <dl className="mt-4 space-y-2.5 font-poppins text-sm">
                  <div className="flex justify-between gap-3">
                    <dt className="text-pz-muted">Package</dt>
                    <dd className="min-w-0 break-words text-right font-semibold text-pz-ink">{selectedPackage?.name ?? "Choose a package"}</dd>
                  </div>
                  {length && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-pz-muted">Session length</dt>
                      <dd className="text-right font-semibold text-pz-ink">{length}</dd>
                    </div>
                  )}
                  {mentor.format && (
                    <div className="flex justify-between gap-3">
                      <dt className="text-pz-muted">Format</dt>
                      <dd className="min-w-0 break-words text-right font-semibold text-pz-ink">{mentor.format}</dd>
                    </div>
                  )}
                </dl>

                <div className="mt-4 flex items-end justify-between gap-3 border-t border-pz-border pt-4">
                  <span className="font-montserrat text-sm font-bold text-pz-deep">Total to pay</span>
                  <span data-total className="font-montserrat text-2xl font-black text-pz-mid">
                    {selectedPackage ? formatPrice(selectedPackage.price) : "—"}
                  </span>
                </div>

                <div className="mt-4 flex items-start gap-3 rounded-2xl bg-pz-web-surface-low p-4">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-pz-mid" aria-hidden="true" />
                  <p className="font-poppins text-xs leading-relaxed text-pz-ink">
                    <strong className="font-semibold text-pz-deep">Checked within 24 hours.</strong> Our team checks your payment by hand. Then your mentor sends the Google Meet or Zoom link to your email.
                  </p>
                </div>
              </div>
              <div className="border-t border-pz-border bg-pz-web-surface-low px-5 py-3.5 sm:px-6">
                <a
                  href={whatsappLink("Hi PZ Academy! I need help paying for a mentorship session.")}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between gap-2 font-poppins text-sm font-semibold text-pz-deep hover:underline"
                >
                  <span className="flex items-center gap-2">
                    <MessageCircle className="h-4 w-4 text-pz-mid" aria-hidden="true" />
                    Need help paying? WhatsApp us
                  </span>
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                </a>
              </div>
            </section>
          </aside>

          {/* ── Form ── */}
          <form
            onSubmit={(e) => { e.preventDefault(); void submitBooking(); }}
            noValidate
            className="min-w-0 space-y-6 lg:col-span-8"
          >
            {/* 1. Package */}
            <section aria-labelledby="pkg-title" className={card}>
              <h2 id="pkg-title" className="mb-5 flex items-center gap-3 font-montserrat text-lg font-bold text-pz-deep sm:text-xl">
                <StepNumber n={1} /> Choose your package
              </h2>
              {mentor.packages.length === 0 ? (
                <p className="rounded-2xl bg-pz-web-surface-low p-4 font-poppins text-sm text-pz-muted">
                  This mentor has no packages online yet. Please ask us on WhatsApp.
                </p>
              ) : (
                <fieldset>
                  <legend className="sr-only">Session package (required)</legend>
                  <div className="space-y-3">
                    {mentor.packages.map((p) => {
                      const on = p.name === form.package;
                      return (
                        <label
                          key={p.name}
                          className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition-colors ${on ? "border-pz-solid-mid bg-pz-web-surface-low ring-1 ring-pz-solid-mid" : "border-pz-border hover:bg-pz-web-surface-low"}`}
                        >
                          <input
                            type="radio"
                            name="package"
                            value={p.name}
                            checked={on}
                            onChange={handleChange}
                            required
                            className="mt-1 h-4 w-4 shrink-0 accent-pz-solid-mid"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="break-words font-montserrat text-sm font-bold text-pz-deep sm:text-base">{p.name}</span>
                              {p.savings ? (
                                <span className="rounded-full bg-pz-gold/20 px-2 py-0.5 font-poppins text-[10px] font-bold uppercase text-pz-ink">Save {formatPrice(p.savings)}</span>
                              ) : null}
                            </span>
                            <span className="mt-0.5 block font-poppins text-xs text-pz-muted">
                              {p.sessions} session{p.sessions === 1 ? "" : "s"}{length ? ` · ${length} each` : ""}
                            </span>
                          </span>
                          <span className="shrink-0 font-montserrat text-base font-extrabold text-pz-deep">{formatPrice(p.price)}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              )}
            </section>

            {/* 2. Payment */}
            <section aria-labelledby="pay-title" className={card}>
              <h2 id="pay-title" className="mb-2 flex items-center gap-3 font-montserrat text-lg font-bold text-pz-deep sm:text-xl">
                <StepNumber n={2} /> Pay by transfer
              </h2>
              <p className="mb-5 font-poppins text-sm text-pz-muted">Send the fee to any one account below. Tap Copy to copy a number.</p>
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {PAYMENT_ACCOUNTS.map((a) => {
                  const Icon = ACCOUNT_ICONS[a.kind];
                  return (
                    <li key={a.label} className={`rounded-2xl bg-pz-web-surface-low p-4 ${a.kind === "bank" ? "md:col-span-2" : ""}`}>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 font-poppins text-[11px] font-bold uppercase tracking-wider text-pz-muted">
                            <Icon className="h-4 w-4 text-pz-mid" aria-hidden="true" />
                            {a.label}
                          </p>
                          <p className="mt-1.5 break-all font-mono text-sm font-bold sm:text-base tracking-wide text-pz-deep">{a.value}</p>
                          <p className="mt-0.5 break-words font-poppins text-xs text-pz-muted">{a.holder}</p>
                          {a.link && (
                            <a href={a.link} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 font-poppins text-xs font-semibold text-pz-mid hover:underline">
                              {a.link.replace(/^https:\/\//, "")}
                              <ExternalLink className="h-3 w-3" aria-hidden="true" />
                            </a>
                          )}
                        </div>
                        <CopyButton text={a.copy} />
                      </div>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-4 flex items-start gap-2.5 rounded-2xl bg-pz-gold/15 p-4 font-poppins text-xs leading-relaxed text-pz-ink">
                <Info className="mt-px h-4 w-4 shrink-0 text-pz-ink" aria-hidden="true" />
                <span>
                  <strong className="font-semibold">Important:</strong> send exactly{" "}
                  <strong className="font-semibold">{selectedPackage ? formatPrice(selectedPackage.price) : "your package price"}</strong>{" "}
                  and keep a screenshot of the payment for step 3.
                </span>
              </p>
            </section>

            {/* 3. Details + proof */}
            <section aria-labelledby="details-form-title" className={card}>
              <h2 id="details-form-title" className="mb-5 flex items-center gap-3 font-montserrat text-lg font-bold text-pz-deep sm:text-xl">
                <StepNumber n={3} /> Your details and payment proof
              </h2>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                <div>
                  <label htmlFor="fullName" className={fieldLabel}>Full name <span className="text-pz-danger">*</span></label>
                  <input id="fullName" name="fullName" type="text" required autoComplete="name" value={form.fullName} onChange={handleChange} placeholder="Your full name" className={input} />
                </div>
                <div>
                  <label htmlFor="email" className={fieldLabel}>Email (for your meeting link) <span className="text-pz-danger">*</span></label>
                  <input id="email" name="email" type="email" required autoComplete="email" value={form.email} onChange={handleChange} placeholder="you@example.com" className={input} />
                </div>
                <div className="md:col-span-2">
                  <label htmlFor="phone" className={fieldLabel}>WhatsApp number <span className="text-pz-danger">*</span></label>
                  <input id="phone" name="phone" type="tel" required autoComplete="tel" value={form.phone} onChange={handleChange} placeholder="+92 300 0000000" className={input} />
                </div>
                <div className="md:col-span-2">
                  <label htmlFor="notes" className={fieldLabel}>Notes for your mentor <span className="font-normal text-pz-muted">(optional)</span></label>
                  <textarea
                    id="notes" name="notes" rows={3} maxLength={2000} value={form.notes} onChange={handleChange}
                    placeholder="Topics you want to cover, a preferred time, or a message to the mentor."
                    className={`${input} resize-none`}
                  />
                </div>
              </div>

              <div className="mt-6">
                <p className={fieldLabel}>Payment screenshot <span className="font-normal text-pz-muted">(JPG, PNG or PDF, up to 5 MB)</span></p>
                {form.screenshot ? (
                  <div className="flex items-center justify-between gap-3 rounded-2xl border border-pz-solid-mid bg-pz-web-surface-low px-4 py-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <CheckCircle className="h-5 w-5 shrink-0 text-pz-mid" aria-hidden="true" />
                      <div className="min-w-0">
                        <p className="truncate font-poppins text-sm font-medium text-pz-ink">{form.screenshot.name}</p>
                        <p className="font-poppins text-xs text-pz-muted">{(form.screenshot.size / 1024).toFixed(0)} KB</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setForm((p) => ({ ...p, screenshot: null }))}
                      aria-label="Remove file"
                      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full text-pz-muted hover:bg-pz-web-surface-high"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                ) : (
                  <div
                    onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                    onDragLeave={() => setDragOver(false)}
                    onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0] ?? null); }}
                    className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed p-6 text-center transition-colors sm:p-8 ${dragOver ? "border-pz-solid-mid bg-pz-bright/10" : "border-pz-border bg-pz-web-surface-low"}`}
                  >
                    <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-pz-bright/25 text-pz-deep">
                      <CloudUpload className="h-6 w-6" aria-hidden="true" />
                    </span>
                    <p className="font-poppins text-sm font-semibold text-pz-ink">Drag and drop your payment screenshot here</p>
                    <button
                      type="button"
                      onClick={() => fileRef.current?.click()}
                      className="mt-3 inline-flex min-h-11 items-center gap-2 rounded-full border border-pz-border bg-pz-surface-container-lowest px-5 font-poppins text-sm font-semibold text-pz-deep hover:bg-pz-web-surface-high"
                    >
                      <Banknote className="h-4 w-4" aria-hidden="true" />
                      Choose file
                    </button>
                  </div>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept={SCREENSHOT_TYPES.join(",")}
                  aria-label="Payment screenshot file"
                  tabIndex={-1}
                  className="sr-only"
                  onChange={(e) => { handleFile(e.target.files?.[0] ?? null); e.target.value = ""; }}
                />
                {fileError && (
                  <p role="alert" className="mt-2 font-poppins text-sm font-medium text-pz-danger">{fileError}</p>
                )}
                <a
                  href={whatsappLink(waMsg)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-1.5 font-poppins text-sm font-semibold text-pz-mid hover:underline"
                >
                  <MessageCircle className="h-4 w-4" aria-hidden="true" />
                  Or send your screenshot on WhatsApp
                </a>
              </div>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Button
                  type="submit"
                  variant="bare"
                  size="bare"
                  loading={loading}
                  className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-pz-bright px-6 font-montserrat text-sm font-bold text-pz-solid-deep shadow-sm transition-transform hover:scale-[1.01]"
                >
                  {loading ? "Sending..." : (
                    <>
                      Complete booking
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </>
                  )}
                </Button>
                <Link
                  href={`/mentorship/mentors/${mentor.slug}`}
                  className="inline-flex min-h-12 items-center justify-center rounded-full border border-pz-border px-6 font-montserrat text-sm font-bold text-pz-deep hover:bg-pz-web-surface-low"
                >
                  Back to profile
                </Link>
              </div>
              <p className="mt-3 text-center font-poppins text-xs text-pz-muted sm:text-left">
                We check every booking within 24 hours and send a confirmation to your email.
              </p>
            </section>
          </form>
        </div>
      </div>
    </div>
  );
}
