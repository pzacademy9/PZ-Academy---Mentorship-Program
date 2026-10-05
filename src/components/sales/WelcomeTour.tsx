"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, ArrowRight, Bell, CheckCheck, ClipboardList, MessageCircle, ThumbsUp } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { createBrowserSupabase } from "@/lib/supabase/client";
import { TOUR_STEPS } from "@/lib/crm/sales-help-copy";
import { shouldShowTour, TOUR_LOCAL_KEY } from "@/lib/crm/tour";
import type { Role } from "@/lib/roles";

async function defaultMarkSeen(alreadySaved: boolean) {
  // Replays (?tour=1) must not overwrite the original timestamp.
  if (!alreadySaved) {
    try {
      const { error } = await createBrowserSupabase().auth.updateUser({ data: { sales_tour_seen_at: new Date().toISOString() } });
      if (error) {
        // updateUser returns errors rather than throwing; the local flag below is the fallback
      }
    } catch {
      // fall through to the local flag
    }
  }
  try {
    localStorage.setItem(TOUR_LOCAL_KEY, "1");
  } catch {
    // private mode: the tour may show again on this device, which is harmless
  }
}

function readLocalSeen(): boolean {
  try {
    return localStorage.getItem(TOUR_LOCAL_KEY) === "1";
  } catch {
    return false;
  }
}

const SAMPLE_NAMES = ["Aisha", "Daniel", "Meera"];
const OUTCOMES = ["Replied", "Interested", "Bought", "Not interested"];
const EYEBROW_TONE = ["text-pz-secondary", "text-pz-primary", "text-pz-tertiary", "text-pz-secondary"];

/** Small static mock for each step: pz tokens and sample first names only, no numbers or claims. */
function Illustration({ step }: { step: number }) {
  if (step === 0) {
    return (
      <div className="bg-pz-surface-container-lowest rounded-xl p-4 shadow-md flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-pz-primary" aria-hidden="true" />
          <span className="font-headline font-bold text-xs text-pz-on-surface">Today list</span>
        </div>
        {SAMPLE_NAMES.map((n, i) => (
          <div key={n} className={`flex items-center gap-2.5 p-2.5 rounded-lg ${i === 0 ? "bg-pz-tertiary-fixed/20" : "bg-pz-surface-container-low"}`}>
            <span className="w-8 h-8 rounded-full bg-pz-primary text-pz-on-primary font-headline font-bold text-xs flex items-center justify-center shrink-0">{n[0]}</span>
            <span className="text-xs font-headline font-bold text-pz-on-surface truncate">{n}</span>
            {i === 0 && <span className="ml-auto px-2 py-0.5 rounded-full bg-pz-primary-fixed text-pz-on-primary-fixed text-[11px] font-bold">Replied</span>}
          </div>
        ))}
      </div>
    );
  }
  if (step === 1) {
    return (
      <div className="bg-pz-surface-container-lowest rounded-xl p-4 shadow-md flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <MessageCircle className="h-4 w-4 text-pz-primary" aria-hidden="true" />
          <span className="font-headline font-bold text-xs text-pz-on-surface">Your message</span>
        </div>
        <div className="p-3 bg-pz-surface-container-low rounded-xl rounded-tl-none">
          <p className="text-xs font-body text-pz-on-surface">Hi Aisha, thanks for your interest. Here are the details you asked for.</p>
        </div>
        <div className="w-full min-h-11 px-4 rounded-lg bg-pz-primary text-pz-on-primary font-headline font-bold text-xs flex items-center justify-center gap-2 shadow-sm">
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
          Message on WhatsApp
        </div>
      </div>
    );
  }
  if (step === 2) {
    return (
      <div className="bg-pz-surface-container-lowest rounded-xl p-4 shadow-md flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <ThumbsUp className="h-4 w-4 text-pz-primary" aria-hidden="true" />
          <span className="font-headline font-bold text-xs text-pz-on-surface">What happened?</span>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {OUTCOMES.map((o, i) => (
            <span
              key={o}
              className={`p-3 rounded-xl text-center text-xs font-headline font-bold ${
                i === 1 ? "bg-pz-primary-container/30 text-pz-on-primary-container ring-2 ring-pz-primary" : "bg-pz-surface-container-low text-pz-on-surface-variant"
              }`}
            >
              {o}
            </span>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="bg-pz-surface-container-lowest rounded-xl p-4 shadow-md flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <Bell className="h-4 w-4 text-pz-secondary" aria-hidden="true" />
        <span className="font-headline font-bold text-xs text-pz-on-surface">Back on your list</span>
      </div>
      <div className="flex items-center gap-2.5 p-2.5 rounded-lg bg-pz-secondary-fixed/40">
        <span className="w-8 h-8 rounded-full bg-pz-secondary text-pz-on-secondary font-headline font-bold text-xs flex items-center justify-center shrink-0">D</span>
        <span className="text-xs font-headline font-bold text-pz-on-surface">Daniel</span>
        <CheckCheck className="ml-auto h-4 w-4 text-pz-on-secondary-fixed" aria-hidden="true" />
      </div>
    </div>
  );
}

export function WelcomeTour({
  role,
  metadataSeen,
  markSeen,
}: {
  role: Role;
  metadataSeen: boolean;
  markSeen?: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const dismissedRef = useRef(false);
  const searchParams = useSearchParams();
  const forced = searchParams
    ? searchParams.get("tour") === "1"
    : typeof window !== "undefined" && new URLSearchParams(window.location.search).get("tour") === "1";

  // Decide after mount (localStorage and the URL are browser-only; avoids a hydration mismatch).
  useEffect(() => {
    // Once dismissed this session, only a fresh ?tour=1 may reopen it (the server prop can lag the save).
    if (dismissedRef.current && !forced) return;
    if (forced) dismissedRef.current = false;
    setOpen(shouldShowTour({ role, metadataSeen, localSeen: readLocalSeen(), forced }));
  }, [role, metadataSeen, forced]);

  const finish = () => {
    dismissedRef.current = true;
    try {
      localStorage.setItem(TOUR_LOCAL_KEY, "1");
    } catch {
      // private mode: the in-memory flag above still holds for this session
    }
    setOpen(false);
    setStep(0);
    // Drop ?tour=1 so a re-render never reopens it and the Help link can replay again.
    try {
      const url = new URL(window.location.href);
      if (url.searchParams.get("tour") === "1") {
        url.searchParams.delete("tour");
        window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);
      }
    } catch {
      // ignore
    }
    // Saving must never block or break the app.
    Promise.resolve()
      .then(() => (markSeen ? markSeen() : defaultMarkSeen(metadataSeen)))
      .catch(() => {});
  };

  const last = step === TOUR_STEPS.length - 1;
  const current = TOUR_STEPS[step];
  const upcoming = TOUR_STEPS.map((s, i) => ({ s, i })).filter(({ i }) => i > step);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) finish(); }}>
      <DialogContent className="sm:max-w-4xl max-md:h-full max-md:w-full overflow-y-auto overflow-x-hidden grid-cols-[minmax(0,1fr)] font-body bg-pz-surface-container-lowest border-0 sm:rounded-2xl p-0 gap-0">
        <div className="min-w-0 px-6 sm:px-8 pt-6 pb-2 pr-14">
          <p className="text-xs font-headline font-bold uppercase tracking-wider text-pz-tertiary">Quick 4-step tour</p>
          <DialogTitle className="mt-2 text-2xl sm:text-3xl font-headline font-black text-pz-on-surface tracking-tight leading-tight break-words">Welcome to your sales desk</DialogTitle>
          <DialogDescription className="mt-1 text-sm sm:text-base text-pz-on-surface-variant font-medium">Here is how a day works, in under two minutes.</DialogDescription>
        </div>

        <div className="min-w-0 px-6 sm:px-8 py-4">
          <div role="tablist" aria-label="Tour steps" className="min-w-0 max-w-full flex sm:grid sm:grid-cols-4 gap-2.5 overflow-x-auto pb-1">
            {TOUR_STEPS.map((s, i) => (
              <button
                key={s.title}
                role="tab"
                aria-selected={i === step}
                type="button"
                onClick={() => setStep(i)}
                className={`text-left p-3 min-h-11 rounded-xl min-w-[150px] sm:min-w-0 flex items-center gap-2.5 transition-all duration-200 ${
                  i === step ? "bg-pz-primary text-pz-on-primary shadow-sm" : "bg-pz-surface-container-low text-pz-on-surface-variant hover:bg-pz-surface-container"
                }`}
              >
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-headline font-bold shrink-0 ${
                    i === step ? "bg-pz-surface-container-lowest/20 text-pz-on-primary" : "bg-pz-surface-container-highest text-pz-on-surface-variant"
                  }`}
                >
                  {i + 1}
                </span>
                <span className="text-xs sm:text-sm font-headline font-bold">{s.title}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="min-w-0 px-6 sm:px-8 pb-4">
          <section aria-live="polite" className="grid grid-cols-1 md:grid-cols-12 gap-6 bg-pz-surface-container-low rounded-xl p-5 sm:p-6 items-center">
            <div className="md:col-span-5"><Illustration step={step} /></div>
            <div className="md:col-span-7 flex flex-col gap-2">
              <span className={`font-label font-semibold text-sm ${EYEBROW_TONE[step % EYEBROW_TONE.length]}`}>Step {step + 1}</span>
              <h3 className="text-xl sm:text-2xl font-headline font-black text-pz-on-surface tracking-tight">{current.title}</h3>
              <p className="text-sm sm:text-base text-pz-on-surface-variant leading-relaxed">{current.body}</p>
            </div>
          </section>

          {upcoming.length > 0 && (
            <div className="mt-4 flex flex-col gap-3">
              <span className="text-xs font-headline uppercase tracking-wider text-pz-on-surface-variant font-bold">Upcoming steps</span>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {upcoming.map(({ s, i }) => (
                  <button
                    key={s.title}
                    type="button"
                    onClick={() => setStep(i)}
                    className="group text-left min-h-11 p-3.5 rounded-xl bg-pz-surface-container hover:bg-pz-surface-container-high transition-all flex items-center justify-between gap-2"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="w-5 h-5 rounded-full bg-pz-primary/20 text-pz-primary flex items-center justify-center text-[10px] font-headline font-bold shrink-0">{i + 1}</span>
                      <span className="font-headline font-bold text-xs text-pz-on-surface truncate">{s.title}</span>
                    </span>
                    <ArrowRight className="h-4 w-4 text-pz-outline shrink-0" aria-hidden="true" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="min-w-0 px-6 sm:px-8 py-4 bg-pz-surface-container-low flex flex-col sm:flex-row items-center justify-between gap-4">
          <button
            type="button"
            onClick={finish}
            className="min-h-11 px-4 py-2 text-sm font-headline font-bold text-pz-on-surface-variant hover:bg-pz-surface-container-highest rounded-lg transition-all w-full sm:w-auto"
          >
            Skip tour
          </button>
          <div className="flex items-center gap-2" aria-label="Tour progress">
            {TOUR_STEPS.map((s, i) => (
              <span
                key={s.title}
                aria-hidden="true"
                className={`rounded-full transition-all duration-300 ${i === step ? "w-3 h-3 bg-pz-primary" : "w-2.5 h-2.5 bg-pz-outline-variant"}`}
              />
            ))}
            <span className="ml-2 text-xs font-label text-pz-on-surface-variant font-bold">Step {step + 1} of {TOUR_STEPS.length}</span>
          </div>
          <div className="flex items-center gap-2 w-full min-w-0 sm:w-auto">
            {step > 0 && (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="min-h-11 px-4 rounded-lg bg-pz-surface-container text-pz-on-surface hover:bg-pz-surface-container-highest text-sm font-headline font-bold transition-all flex items-center justify-center gap-2"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back
              </button>
            )}
            <button
              type="button"
              onClick={() => (last ? finish() : setStep((s) => s + 1))}
              className="min-h-11 px-6 rounded-lg bg-pz-primary text-pz-on-primary text-sm font-headline font-bold shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 flex-1 sm:flex-none"
            >
              {last ? "Get started" : `Next: ${TOUR_STEPS[step + 1].title}`}
              {!last && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
