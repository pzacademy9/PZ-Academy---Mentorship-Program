import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDown, ChevronRight, ClipboardList, FileSearch, MessageCircle, UserCheck } from "lucide-react";
import { MarketingNav } from "@/components/marketing/MarketingNav";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { FaqAccordion } from "@/components/marketing/FaqAccordion";
import { MentorApplicationForm, APPLY_ROLES } from "@/components/mentorship/MentorApplicationForm";
import { MENTOR_BENEFITS } from "@/components/mentorship/MentorshipSections";

export const metadata: Metadata = {
  title: "Apply to mentor – PZ Academy",
  description: "Share your clinical expertise. Apply to give 1-on-1 mentorship sessions or teach courses and workshops at PZ Academy.",
};

/** What happens after an application. Each step is how the team works today. */
const AFTER = [
  { icon: ClipboardList, title: "Send your application", text: "Five short steps: your details, background, role, two short answers, your CV and photo." },
  { icon: FileSearch, title: "We review it", text: "Our team reads every application and replies within 48 hours." },
  { icon: MessageCircle, title: "We contact you", text: "We reach you by email or WhatsApp to talk about the next steps." },
  { icon: UserCheck, title: "Your profile goes live", text: "Once accepted, your verified profile appears on the Mentorship page." },
];

const FAQ = [
  { q: "What do I need before I start?", a: "Your CV or resume (PDF or Word, under 2 MB) and one professional photo. A LinkedIn profile link helps, but it is optional." },
  { q: "How long does the review take?", a: "Our team replies within 48 hours, by email or WhatsApp." },
  { q: "Can I teach courses instead of 1-on-1 sessions?", a: "Yes. In the form, choose <strong>Instructor</strong> to teach courses, workshops, seminars or webinars. You can choose both roles." },
  { q: "When and how are sessions held?", a: "Online, on Google Meet or Zoom. You choose your own session times, and you are paid for every session you give." },
];

export default function MentorApplyPage() {
  return (
    <>
      <MarketingNav />
      <main className="bg-pz-web-surface">
        <MarketingHero
          kicker="Join PZ Academy faculty"
          title={<>Share your <span className="text-pz-bright">clinical expertise</span></>}
          text="Are you an experienced pharmacist, physician or researcher? Guide the next generation of health professionals across Pakistan, the UAE and KSA."
        >
          <a href="#form" className="mb-6 inline-flex min-h-11 items-center gap-2 rounded-full bg-pz-bright px-7 font-montserrat text-[15px] font-bold text-pz-solid-deep shadow-md transition-transform hover:scale-[1.02]">
            Start my application <ArrowDown className="h-4 w-4" aria-hidden="true" />
          </a>
          <nav aria-label="Breadcrumb">
            <ol className="flex flex-wrap items-center justify-center gap-1.5 font-poppins text-sm text-white/70">
              <li><Link href="/mentorship" className="hover:text-white">Mentorship</Link></li>
              <li aria-hidden="true"><ChevronRight className="h-4 w-4" /></li>
              <li aria-current="page" className="font-semibold text-white">Apply to mentor</li>
            </ol>
          </nav>
        </MarketingHero>

        <section aria-label="Why mentor with us" className="relative z-10 mx-auto -mt-8 w-full max-w-[1320px] px-5 md:px-6">
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:gap-6">
            {MENTOR_BENEFITS.map(({ icon: Icon, title, text }) => (
              <li key={title} className="flex items-start gap-4 rounded-2xl border border-pz-border bg-pz-surface-container-lowest p-6 shadow-[0_8px_30px_rgba(15,61,34,0.08)]">
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-pz-tertiary-fixed text-pz-on-tertiary-fixed"><Icon className="h-6 w-6" aria-hidden="true" /></span>
                <span>
                  <span className="block font-montserrat text-lg font-bold text-pz-deep">{title}</span>
                  <span className="mt-1 block font-poppins text-sm leading-relaxed text-pz-muted">{text}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="w-full px-5 py-14 md:px-6 md:py-20">
          <div className="mx-auto grid max-w-[1320px] grid-cols-1 gap-10 lg:grid-cols-12">
            <div className="min-w-0 space-y-10 lg:col-span-5">
              <div>
                <span className="font-poppins text-xs font-bold uppercase tracking-wider text-pz-mid">Two ways to teach</span>
                <h2 className="mt-1 font-montserrat text-[26px] font-black tracking-[-0.02em] text-pz-deep md:text-[30px]">Who can apply</h2>
                <ul className="mt-5 space-y-3">
                  {APPLY_ROLES.map((r) => (
                    <li key={r.id} className="rounded-2xl bg-pz-surface-container-lowest p-5 shadow-[0_8px_30px_rgba(15,61,34,0.05)]">
                      <p className="font-montserrat text-base font-bold text-pz-deep">{r.label}</p>
                      <p className="mt-1 font-poppins text-sm text-pz-muted">{r.desc}</p>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <span className="font-poppins text-xs font-bold uppercase tracking-wider text-pz-mid">The process</span>
                <h2 className="mt-1 font-montserrat text-[26px] font-black tracking-[-0.02em] text-pz-deep md:text-[30px]">What happens after you apply</h2>
                <ol className="relative mt-6 space-y-6 border-l-2 border-dashed border-pz-border pl-7">
                  {AFTER.map(({ icon: Icon, title, text }, i) => (
                    <li key={title} className="relative">
                      <span className="absolute -left-[46px] flex h-9 w-9 items-center justify-center rounded-full bg-pz-solid-deep text-pz-bright ring-4 ring-pz-web-surface">
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <p className="font-montserrat text-base font-bold text-pz-deep"><span className="sr-only">Step {i + 1}: </span>{title}</p>
                      <p className="mt-1 font-poppins text-sm leading-relaxed text-pz-muted">{text}</p>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
            <div id="form" className="min-w-0 scroll-mt-28 lg:col-span-7">
              <h2 className="mb-5 font-montserrat text-[26px] font-black tracking-[-0.02em] text-pz-deep md:text-[30px]">Your application</h2>
              <MentorApplicationForm />
            </div>
          </div>
        </section>

        <section aria-labelledby="apply-faq" className="w-full bg-pz-web-surface-low px-5 py-16 md:px-6">
          <div className="mx-auto flex max-w-[880px] flex-col gap-8">
            <h2 id="apply-faq" className="text-center font-montserrat text-[26px] font-extrabold tracking-[-0.02em] text-pz-deep md:text-[30px]">Questions from applicants</h2>
            <FaqAccordion items={FAQ} />
          </div>
        </section>
      </main>
      <MarketingFooter />
    </>
  );
}
