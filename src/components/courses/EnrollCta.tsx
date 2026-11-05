import Link from "next/link";
import { BookOpen } from "lucide-react";
import type { Database } from "@/lib/supabase/database.types";

/** Every enrollment status, plus the active-but-portal-not-open-yet state. */
export type EnrollCtaStatus =
  | Database["public"]["Enums"]["enrollment_status"]
  | "portal_closed";

const CTA_PRIMARY =
  "flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-pz-bright py-3.5 text-center font-montserrat text-base font-bold text-pz-solid-deep shadow-md transition-transform hover:scale-[1.01] active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pz-solid-mid";
const CTA_DISABLED =
  "min-h-12 w-full cursor-not-allowed rounded-full bg-pz-web-surface-high py-3.5 font-montserrat text-base font-bold text-pz-muted";
const CTA_HELPER = "mt-2 text-center font-poppins text-xs text-pz-muted";

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
          className={CTA_PRIMARY}
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
