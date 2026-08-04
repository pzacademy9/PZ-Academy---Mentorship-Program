import { cn } from "@/lib/utils";
import type { Database } from "@/lib/supabase/database.types";

type EnrollmentStatus = Database["public"]["Enums"]["enrollment_status"];

/**
 * Status pill matching the Stitch "Admin: Enrollment Review" screen: rounded-
 * full, uppercase, letter-spaced, no icon — icons made the dense table noisy.
 *
 * The Stitch export hardcoded raw Tailwind colours (bg-amber-100/text-amber-700).
 * These use the project's own tokens instead so the pills stay in step with the
 * palette; the amber/green/red/gold reading is unchanged.
 *
 * Keyed by the full enum so a new enrollment_status fails the build here rather
 * than rendering an unlabelled blank pill.
 */
const STYLES: Record<EnrollmentStatus, { label: string; className: string }> = {
  pending: {
    label: "Pending",
    className: "bg-pz-secondary-container/40 text-pz-on-secondary-container",
  },
  reserved: {
    label: "Reserved",
    className: "bg-pz-gold/15 text-pz-gold",
  },
  active: {
    label: "Active",
    className: "bg-pz-primary-container/30 text-pz-on-primary-container",
  },
  rejected: {
    label: "Rejected",
    className: "bg-pz-error-container text-pz-on-error-container",
  },
  expired: {
    label: "Expired",
    className: "bg-pz-surface-container-high text-pz-on-surface-variant",
  },
};

export function EnrollmentStatusBadge({
  status,
  className,
}: {
  status: EnrollmentStatus;
  className?: string;
}) {
  const { label, className: tone } = STYLES[status];
  return (
    <span
      className={cn(
        "inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider whitespace-nowrap font-headline",
        tone,
        className,
      )}
    >
      {label}
    </span>
  );
}

export const ENROLLMENT_STATUS_LABELS: Record<EnrollmentStatus, string> = {
  pending: STYLES.pending.label,
  reserved: STYLES.reserved.label,
  active: STYLES.active.label,
  rejected: STYLES.rejected.label,
  expired: STYLES.expired.label,
};
