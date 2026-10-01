"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, Check, UploadCloud, CheckCircle2, Clock, Circle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";

// Sticky action bar on phones. Public pages have no bottom nav, so it sits at the
// viewport bottom (plus safe-area inset). The card has p-8, hence -mx-8 / px-8.
const STICKY_BAR =
  "max-md:sticky max-md:bottom-0 max-md:z-40 max-md:-mx-8 max-md:border-t max-md:border-border max-md:bg-background/95 max-md:px-8 max-md:pt-3 max-md:pb-[calc(0.75rem+env(safe-area-inset-bottom))] max-md:backdrop-blur";

const BANK_DETAILS = {
  bankName: "Faysal Bank",
  accountTitle: "PHARMACOZYME (PRIVATE) LIMITED",
  accountNumber: "3573499000006913",
};

const EASYPAISA_DETAILS = {
  accountTitle: "Aftab Alam",
  accountNumber: "03401940624",
};

const STEP_LABELS = ["Info", "Payment", "Proof"] as const;

interface EnrollWizardProps {
  courseSlug: string;
  courseTitle: string;
  pricePkr: number;
  profile: {
    fullName: string;
    email: string;
    phone: string | null;
    profession: string | null;
    city: string | null;
  };
}

type Step = 1 | 2 | 3 | "done";

function CopyRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[10px] font-bold text-pz-outline uppercase tracking-widest">{label}</span>
      <div className="flex justify-between items-center gap-3">
        <span className="text-sm font-semibold font-headline text-pz-on-surface break-all">
          {value}
        </span>
        <button
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="shrink-0 text-pz-primary active:scale-90 transition-transform max-md:min-h-11 max-md:min-w-11 inline-flex items-center justify-center"
          aria-label={`Copy ${label}`}
        >
          {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

export function EnrollWizard({ courseSlug, courseTitle, pricePkr, profile }: EnrollWizardProps) {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [file, setFile] = useState<File | null>(null);
  const [submittedAt, setSubmittedAt] = useState<Date | null>(null);

  async function submitEnrollment(screenshotUrl?: string) {
    const res = await fetch("/api/enrollments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        courseSlug,
        paymentAmountPkr: pricePkr,
        ...(screenshotUrl ? { paymentScreenshotUrl: screenshotUrl } : {}),
      }),
    });
    if (!res.ok) {
      toast.error("Could not submit your enrollment. Please try again.");
      return;
    }
    setSubmittedAt(new Date());
    setStep("done");
  }

  const { run: handleUploadAndSubmit, pending: submitting } = useAsyncAction(async () => {
    if (!file) {
      toast.error("Choose a file first");
      return;
    }
    try {
      const form = new FormData();
      form.append("screenshot", file);
      form.append("courseSlug", courseSlug);
      const res = await fetch("/api/uploads/payment-screenshot", { method: "POST", body: form });

      if (!res.ok) {
        toast.error("Upload isn't available right now. Submitting without it — our team will follow up.");
        await submitEnrollment();
        return;
      }
      const { url } = await res.json();
      await submitEnrollment(url);
    } catch {
      toast.error("Could not submit your enrollment. Please try again.");
    }
  });

  if (step === "done") {
    return (
      <div className="w-full max-w-[500px] mx-auto bg-pz-surface-container-lowest rounded-xl shadow-xl p-8 border border-pz-outline-variant/30 text-center">
        <div className="w-20 h-20 bg-pz-primary-container rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg shadow-pz-primary/20">
          <CheckCircle2 className="w-10 h-10 text-pz-on-primary-container" />
        </div>
        <h1 className="font-headline text-2xl text-pz-on-surface mb-1">Enrollment Submitted</h1>
        <p className="font-label text-pz-secondary font-bold text-lg mb-8 italic">
          Course: {courseTitle}
        </p>

        <div className="max-w-[280px] mx-auto space-y-0 mb-10 text-left">
          <div className="flex gap-4 items-start">
            <div className="flex flex-col items-center">
              <CheckCircle2 className="w-5 h-5 text-pz-primary" />
              <div className="w-px h-8 bg-pz-outline-variant" />
            </div>
            <div className="pt-0.5">
              <p className="text-sm font-bold text-pz-on-surface leading-none">Submitted</p>
              <p className="text-[11px] text-pz-outline">
                {submittedAt?.toLocaleString(undefined, {
                  hour: "numeric",
                  minute: "2-digit",
                  hour12: true,
                }) ?? "Just now"}
              </p>
            </div>
          </div>
          <div className="flex gap-4 items-start">
            <div className="flex flex-col items-center">
              <Clock className="w-5 h-5 text-pz-secondary-container" />
              <div className="w-px h-8 bg-pz-outline-variant" />
            </div>
            <div className="pt-0.5">
              <p className="text-sm font-bold text-pz-on-surface leading-none">Under review</p>
              <p className="text-[11px] text-pz-outline">Expected: 24-48 hours</p>
            </div>
          </div>
          <div className="flex gap-4 items-start">
            <div className="flex flex-col items-center">
              <Circle className="w-5 h-5 text-pz-outline-variant" />
            </div>
            <div className="pt-0.5">
              <p className="text-sm font-bold text-pz-outline leading-none">Verified</p>
              <p className="text-[11px] text-pz-outline">Course access granted</p>
            </div>
          </div>
        </div>

        <button
          onClick={() => router.push("/dashboard/courses")}
          className="w-full py-4 bg-pz-secondary text-white font-headline font-bold rounded-lg hover:opacity-90 transition-all active:scale-[0.98] shadow-md"
        >
          Back to My Courses
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[500px] mx-auto bg-pz-surface-container-lowest rounded-xl shadow-xl p-8 border border-pz-outline-variant/30">
      {/* Step progress indicator */}
      <div className="flex items-center justify-between mb-10 relative">
        <div className="absolute top-5 left-0 w-full h-[2px] bg-pz-surface-container-high -translate-y-1/2 z-0" />
        <div
          className="absolute top-5 left-0 h-[2px] bg-pz-primary-container -translate-y-1/2 z-0 transition-all duration-500"
          style={{ width: `${((step - 1) / 2) * 100}%` }}
        />
        {STEP_LABELS.map((label, i) => {
          const s = i + 1;
          const isDone = step > s;
          const isActive = step === s;
          return (
            <div key={label} className="relative z-10 flex flex-col items-center gap-2">
              <div
                className={cn(
                  "w-10 h-10 rounded-full flex items-center justify-center font-headline font-bold text-sm shadow-lg transition-colors",
                  isDone
                    ? "bg-pz-primary-container text-pz-on-primary-container"
                    : isActive
                      ? "bg-pz-primary text-white"
                      : "bg-pz-surface-container-high text-pz-on-surface-variant",
                )}
              >
                {isDone ? <Check className="w-4 h-4" /> : s}
              </div>
              <span
                className={cn(
                  "text-[10px] font-bold uppercase tracking-wider",
                  isDone || isActive ? "text-pz-primary" : "text-pz-on-surface-variant",
                )}
              >
                {label}
              </span>
            </div>
          );
        })}
      </div>

      {step === 1 && (
        <section>
          <h1 className="font-headline text-xl text-pz-on-surface mb-2">Confirm Your Info</h1>
          <p className="text-pz-on-surface-variant mb-6 text-sm font-body">
            Please verify your enrollment details before proceeding to payment.
          </p>
          <div className="border border-pz-outline-variant rounded-lg overflow-hidden mb-8">
            {[
              ["Full Name", profile.fullName],
              ["Email Address", profile.email],
              ["Phone", profile.phone ?? "—"],
              ["Profession", profile.profession ?? "—"],
              ["City", profile.city ?? "—"],
            ].map(([label, value], i) => (
              <div
                key={label}
                className={cn(
                  "px-4 py-3 flex justify-between items-center border-b border-pz-outline-variant/30 last:border-b-0",
                  i % 2 === 0 && "bg-pz-surface-container-low",
                )}
              >
                <span className="text-xs font-semibold text-pz-on-surface-variant uppercase">
                  {label}
                </span>
                <span className="text-sm font-medium text-pz-on-surface">{value}</span>
              </div>
            ))}
          </div>
          <div className={STICKY_BAR}>
            <button
              onClick={() => setStep(2)}
              className="w-full py-4 bg-pz-primary text-white font-headline font-bold rounded-lg hover:bg-pz-on-primary-container transition-all active:scale-[0.98] shadow-md"
            >
              Looks Good, Continue
            </button>
          </div>
        </section>
      )}

      {step === 2 && (
        <section>
          <h1 className="font-headline text-xl text-pz-on-surface mb-2">Make Payment</h1>
          <p className="text-pz-on-surface-variant mb-6 text-sm font-body">
            Transfer <span className="font-bold text-pz-primary">PKR {pricePkr.toLocaleString()}</span>{" "}
            via bank transfer or Easypaisa, using either option below.
          </p>
          <div className="p-5 bg-pz-surface-container-low rounded-xl border border-pz-primary/20 space-y-4 mb-4">
            <p className="text-[10px] font-bold text-pz-primary uppercase tracking-widest">Bank Transfer</p>
            <CopyRow label="Bank Name" value={BANK_DETAILS.bankName} />
            <div className="h-px bg-pz-outline-variant/30" />
            <CopyRow label="Account Title" value={BANK_DETAILS.accountTitle} />
            <div className="h-px bg-pz-outline-variant/30" />
            <CopyRow label="Account Number" value={BANK_DETAILS.accountNumber} />
          </div>
          <div className="p-5 bg-pz-surface-container-low rounded-xl border border-pz-primary/20 space-y-4 mb-8">
            <p className="text-[10px] font-bold text-pz-primary uppercase tracking-widest">Easypaisa</p>
            <CopyRow label="Account Title" value={EASYPAISA_DETAILS.accountTitle} />
            <div className="h-px bg-pz-outline-variant/30" />
            <CopyRow label="Account Number" value={EASYPAISA_DETAILS.accountNumber} />
          </div>
          <div className={cn("grid grid-cols-2 gap-4", STICKY_BAR)}>
            <button
              onClick={() => setStep(1)}
              className="py-4 border-2 border-pz-primary text-pz-primary font-headline font-bold rounded-lg hover:bg-pz-primary/5 transition-all active:scale-[0.98]"
            >
              Back
            </button>
            <button
              onClick={() => setStep(3)}
              className="py-4 bg-pz-primary text-white font-headline font-bold rounded-lg hover:bg-pz-on-primary-container transition-all active:scale-[0.98] shadow-md"
            >
              I&apos;ve Paid, Continue
            </button>
          </div>
        </section>
      )}

      {step === 3 && (
        <section>
          <h1 className="font-headline text-xl text-pz-on-surface mb-2">Upload Payment Proof</h1>
          <p className="text-pz-on-surface-variant mb-6 text-sm font-body">
            Please provide a screenshot, photo, or PDF of your transaction receipt.
          </p>
          <label className="w-full aspect-video border-2 border-dashed border-pz-outline-variant rounded-xl flex flex-col items-center justify-center gap-3 bg-pz-surface hover:bg-pz-surface-container-low transition-colors cursor-pointer group mb-8">
            <div className="w-16 h-16 rounded-full bg-pz-primary-container/20 flex items-center justify-center group-hover:scale-110 transition-transform">
              <UploadCloud className="w-7 h-7 text-pz-primary" />
            </div>
            <div className="text-center">
              <p className="text-sm font-semibold text-pz-on-surface">
                {file ? file.name : "Click to choose a file"}
              </p>
              <p className="text-[11px] text-pz-outline">Supported: JPG, PNG, PDF (Max 5MB)</p>
            </div>
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp,application/pdf"
              className="hidden"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
          <div className={cn("grid grid-cols-2 gap-4", STICKY_BAR)}>
            <button
              onClick={() => setStep(2)}
              disabled={submitting}
              className="py-4 border-2 border-pz-primary text-pz-primary font-headline font-bold rounded-lg hover:bg-pz-primary/5 transition-all active:scale-[0.98] disabled:opacity-50"
            >
              Back
            </button>
            <Button
              variant="bare"
              size="bare"
              loading={submitting}
              onClick={() => handleUploadAndSubmit()}
              className="py-4 text-base bg-pz-primary text-white font-headline font-bold rounded-lg hover:bg-pz-on-primary-container transition-all active:scale-[0.98] shadow-md disabled:opacity-50"
            >
              {submitting ? "Submitting…" : "Submit Enrollment"}
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}
