import Link from "next/link";
import { Clock, XCircle, ArrowLeft, Bookmark, CircleSlash, type LucideIcon } from "lucide-react";
import type { Database } from "@/lib/supabase/database.types";

type EnrollmentStatus = Database["public"]["Enums"]["enrollment_status"];

/**
 * Every enrollment status EXCEPT 'active' lands on this screen — 'active' is
 * the only one that gets course content. Deriving the union with Exclude
 * rather than listing variants by hand is deliberate: the VARIANTS record
 * below then fails to compile if a new enrollment_status is ever added, which
 * is what stops the next status from silently falling through to a branch
 * that grants access. (That is exactly how 'reserved' would have leaked.)
 */
type Variant = Exclude<EnrollmentStatus, "active">;

interface VariantConfig {
  icon: LucideIcon;
  iconWrap: string;
  iconColor: string;
  title: string;
  body: (courseTitle: React.ReactNode, shortfallPkr?: number | null) => React.ReactNode;
}

const VARIANTS: Record<Variant, VariantConfig> = {
  pending: {
    icon: Clock,
    iconWrap: "bg-pz-warning/15",
    iconColor: "text-pz-warning",
    title: "Awaiting Verification",
    body: (course, shortfallPkr) =>
      shortfallPkr ? (
        <>
          We received a partial payment for {course} — Rs. {shortfallPkr.toLocaleString("en-GB")}{" "}
          is still due. Course content unlocks once the balance is confirmed.
        </>
      ) : (
        <>
          Your enrollment in {course} is being reviewed. You&apos;ll get an email once your payment
          is verified (usually within 24–48 hours), and the course content will unlock here.
        </>
      ),
  },
  reserved: {
    icon: Bookmark,
    iconWrap: "bg-pz-gold/15",
    iconColor: "text-pz-gold",
    title: "Seat Reserved",
    body: (course) => (
      <>
        Your seat in {course} is being held for you while your payment is completed. The course
        content unlocks as soon as the remaining payment is confirmed — contact support if you have
        already paid in full.
      </>
    ),
  },
  rejected: {
    icon: XCircle,
    iconWrap: "bg-pz-danger/15",
    iconColor: "text-pz-danger",
    title: "Enrollment Not Approved",
    body: (course) => (
      <>
        Your enrollment in {course} was not approved. Check the email we sent for the reason — you
        can submit a new payment from the course page once it&apos;s resolved.
      </>
    ),
  },
  expired: {
    icon: CircleSlash,
    iconWrap: "bg-pz-muted/15",
    iconColor: "text-pz-muted",
    title: "Enrollment Expired",
    body: (course) => (
      <>
        Your enrollment in {course} has expired. You can enroll again from the course page, or
        contact support if you think this is a mistake.
      </>
    ),
  },
};

interface EnrollmentStatusScreenProps {
  variant: Variant;
  courseTitle: string;
  shortfallPkr?: number | null;
}

export function EnrollmentStatusScreen({ variant, courseTitle, shortfallPkr }: EnrollmentStatusScreenProps) {
  const { icon: Icon, iconWrap, iconColor, title, body } = VARIANTS[variant];
  const course = (
    <span className="font-semibold text-pz-ink dark:text-pz-on-surface">{courseTitle}</span>
  );

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-6">
      <div className="bg-pz-surface-container-lowest rounded-2xl shadow-xl border border-pz-border dark:border-pz-outline-variant max-w-md w-full p-8 text-center">
        <div
          className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto ${iconWrap}`}
        >
          <Icon className={`w-7 h-7 ${iconColor}`} />
        </div>
        <h1 className="font-montserrat font-bold text-xl text-pz-forest dark:text-pz-on-surface mt-5">
          {title}
        </h1>
        <p className="text-pz-muted dark:text-pz-on-surface-variant text-sm mt-2">{body(course, shortfallPkr)}</p>
        <Link
          href="/dashboard/courses"
          className="mt-6 inline-flex items-center gap-2 text-pz-forest dark:text-pz-lime text-sm font-semibold hover:underline"
        >
          <ArrowLeft className="w-4 h-4" /> Back to My Courses
        </Link>
      </div>
    </div>
  );
}
