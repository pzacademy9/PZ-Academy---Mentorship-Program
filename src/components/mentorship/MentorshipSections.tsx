import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, BadgeCheck, CalendarCheck, CalendarClock, Link2, ShieldCheck, Video, Wallet } from "lucide-react";

/** The four steps of a booking. Wording kept from the old page: it is how the service really runs. */
export const HOW_IT_WORKS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: CalendarCheck, title: "Submit booking", text: "Browse mentors, choose your package, and complete the booking form." },
  { icon: ShieldCheck, title: "Payment verified", text: "Transfer the fee and upload your screenshot. Our team confirms within 24 hours." },
  { icon: Link2, title: "Get meeting link", text: "Your mentor sends a Google Meet or Zoom link to your email." },
  { icon: Video, title: "Attend session", text: "Join your private 1-on-1 session and start growing." },
];

export function HowItWorks() {
  return (
    <section id="how-it-works" aria-labelledby="how-title" className="w-full scroll-mt-24 bg-pz-web-surface-low px-5 py-16 md:px-6 md:py-20">
      <div className="mx-auto max-w-[1320px]">
        <div className="mx-auto mb-10 max-w-2xl text-center">
          <span className="inline-block rounded-full bg-pz-tertiary-fixed px-3 py-1 font-poppins text-xs font-bold uppercase tracking-wider text-pz-on-tertiary-fixed">Four simple steps</span>
          <h2 id="how-title" className="mt-3 font-montserrat text-[28px] font-black tracking-[-0.02em] text-pz-deep md:text-[36px]">How 1-on-1 mentorship works</h2>
          <p className="mt-2 font-poppins text-base text-pz-muted">From choosing a mentor to your private session, every step is clear.</p>
        </div>
        <ol className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {HOW_IT_WORKS.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="flex flex-col rounded-3xl bg-pz-surface-container-lowest p-6 shadow-[0_8px_30px_rgba(15,61,34,0.05)]">
              <div className="mb-6 flex items-start justify-between">
                <span aria-hidden="true" className="font-montserrat text-3xl font-black text-pz-bright">{String(i + 1).padStart(2, "0")}</span>
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-pz-web-surface-low text-pz-mid">
                  <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
              </div>
              <h3 className="font-montserrat text-lg font-bold text-pz-deep">{title}</h3>
              <p className="mt-2 font-poppins text-sm leading-relaxed text-pz-muted">{text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/** What mentors get. Each line confirmed by the owner (2026-11-05). */
export const MENTOR_BENEFITS: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: CalendarClock, title: "Flexible schedule", text: "Choose your own session times, around your work." },
  { icon: Wallet, title: "Paid per session", text: "You are paid for every session you give." },
  { icon: BadgeCheck, title: "Verified PZ Academy badge", text: "Your profile carries the verified badge, so students know you are checked." },
];

/** "Become a mentor" band near the end of /mentorship. Keeps the old #apply anchor. */
export function BecomeMentorBand() {
  return (
    <section id="apply" aria-labelledby="apply-title" className="w-full scroll-mt-24 px-5 py-16 md:px-6 md:py-20">
      <div className="mx-auto grid max-w-[1320px] grid-cols-1 items-center gap-10 rounded-[32px] border border-pz-border bg-pz-surface-container-lowest p-6 shadow-[0_8px_30px_rgba(15,61,34,0.06)] sm:p-10 lg:grid-cols-12">
        <div className="min-w-0 lg:col-span-7">
          <span className="inline-block rounded-full bg-pz-secondary-container px-3 py-1 font-poppins text-xs font-bold uppercase tracking-wider text-pz-on-secondary-container">Join PZ Academy faculty</span>
          <h2 id="apply-title" className="mt-3 font-montserrat text-[28px] font-black leading-tight tracking-[-0.02em] text-pz-deep md:text-[36px]">Share your clinical expertise</h2>
          <p className="mt-3 max-w-xl font-poppins text-base leading-relaxed text-pz-muted">
            Are you an experienced pharmacist, physician or researcher? Guide the next generation of health professionals, one session at a time.
          </p>
          <ul className="mt-6 space-y-4">
            {MENTOR_BENEFITS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-start gap-3.5">
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pz-bright text-pz-solid-deep">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span>
                  <span className="block font-montserrat text-[15px] font-bold text-pz-deep">{title}</span>
                  <span className="block font-poppins text-sm text-pz-muted">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-3xl bg-pz-solid-deep p-7 text-white lg:col-span-5">
          <p className="font-montserrat text-xl font-extrabold">Apply to mentor</p>
          <p className="mt-2 font-poppins text-sm leading-relaxed text-white/80">
            Have your CV and one professional photo ready. Our team reviews every application and replies within 48 hours.
          </p>
          <Link
            href="/mentorship/apply"
            className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-pz-bright px-6 font-montserrat text-[15px] font-bold text-pz-solid-deep shadow-md transition-transform hover:scale-[1.02]"
          >
            Start my application <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
