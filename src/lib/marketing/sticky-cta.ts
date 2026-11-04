import type { EnrollCtaStatus } from "@/components/courses/EnrollCta";

/**
 * The phone bottom bar's one button on a course page. Only for people who can
 * still buy (signed out, not enrolled, reserved / rejected / expired);
 * everyone else (enrolled, pending check, portal closed) gets no bar — the
 * full enroll box already explains their state. Links match EnrollCta's.
 */
export function stickyEnrollAction({
  signedIn,
  status,
  slug,
  ctaVerb,
}: {
  signedIn: boolean;
  status: EnrollCtaStatus | null;
  slug: string;
  ctaVerb: "Enroll" | "Register";
}): { href: string; label: string } | null {
  if (!signedIn) return { href: `/login?returnUrl=/courses/${slug}`, label: `Log In to ${ctaVerb}` };
  if (status === null) return { href: `/enroll/${slug}`, label: `${ctaVerb} Now` };
  switch (status) {
    case "reserved":
      return { href: `/enroll/${slug}`, label: "Complete Payment" };
    case "rejected":
      return { href: `/enroll/${slug}`, label: "Submit New Payment" };
    case "expired":
      return { href: `/enroll/${slug}`, label: `${ctaVerb} Again` };
    case "active":
    case "pending":
    case "portal_closed":
      return null;
    default: {
      // A new enrollment status must be decided here, not silently hidden.
      const unhandled: never = status;
      return unhandled;
    }
  }
}
