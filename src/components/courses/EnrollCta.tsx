import Link from "next/link";
import { BookOpen } from "lucide-react";
import type { Database } from "@/lib/supabase/database.types";

/** Every enrollment status, plus the active-but-portal-not-open-yet state. */
export type EnrollCtaStatus =
  | Database["public"]["Enums"]["enrollment_status"]
  | "portal_closed";

const CTA_PRIMARY =
  "block text-center w-full bg-pz-primary text-pz-on-primary py-4 rounded-lg font-bold text-lg hover:bg-pz-on-primary-container active:scale-95 transition-all shadow-lg shadow-pz-primary/20 font-headline";
const CTA_DISABLED =
  "w-full bg-pz-surface-container-high text-pz-on-surface-variant py-4 rounded-lg font-bold text-lg cursor-not-allowed font-headline";
const CTA_HELPER = "text-xs text-pz-on-surface-variant text-center mt-2 font-body";

/**
 * The sidebar call-to-action. Extracted from the sticky card because it now
 * covers seven states; as an inline ternary chain it was unreadable.
 *
 * The switch is exhaustive over enrollment_status by design — the annotated
 * return type makes a missing case a compile error rather than a blank CTA.
 */
export function EnrollCta({
  signedIn,
  slug,
  status,
  ctaVerb,
}: {
  signedIn: boolean;
  slug: string;
  status: EnrollCtaStatus | null;
  ctaVerb: "Enroll" | "Register";
}): React.ReactElement {
  if (!signedIn) {
    return (
      <Link href={`/login?returnUrl=/courses/${slug}`} className={CTA_PRIMARY}>
        Log In to {ctaVerb}
      </Link>
    );
  }
  if (!status) {
    return (
      <Link href={`/enroll/${slug}`} className={CTA_PRIMARY}>
        {ctaVerb} Now
      </Link>
    );
  }

  switch (status) {
    case "portal_closed":
      return (
        <div>
          <button disabled className={CTA_DISABLED}>
            Opens after your batch
          </button>
        </div>
      );
    case "active":
      return (
        <Link
          href={`/portal/${slug}`}
          className={`${CTA_PRIMARY} flex items-center justify-center gap-2`}
        >
          <BookOpen className="w-5 h-5" /> Continue Learning
        </Link>
      );
    case "pending":
      return (
        <div>
          <button disabled className={CTA_DISABLED}>
            Awaiting Verification
          </button>
          <p className={CTA_HELPER}>We&apos;ll email you once your payment is verified.</p>
        </div>
      );
    case "reserved":
      return (
        <div>
          <Link href={`/enroll/${slug}`} className={CTA_PRIMARY}>
            Complete Payment
          </Link>
          <p className={CTA_HELPER}>
            Your seat is reserved. The course unlocks once payment is confirmed.
          </p>
        </div>
      );
    case "rejected":
      return (
        <div>
          <Link href={`/enroll/${slug}`} className={CTA_PRIMARY}>
            Submit New Payment
          </Link>
          <p className={CTA_HELPER}>
            Your last submission wasn&apos;t approved — check your email for the reason.
          </p>
        </div>
      );
    case "expired":
      return (
        <div>
          <Link href={`/enroll/${slug}`} className={CTA_PRIMARY}>
            {ctaVerb} Again
          </Link>
          <p className={CTA_HELPER}>Your previous enrollment has expired.</p>
        </div>
      );
  }
}
