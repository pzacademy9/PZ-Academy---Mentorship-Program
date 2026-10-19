import { cn } from "@/lib/utils";
import type { RegistrationStatus } from "@/lib/landing/registration/config";

/** Pending amber, Reserved blue, Underpaid orange, Paid green, Free grey. */
const STYLES: Record<RegistrationStatus, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" },
  reserved: { label: "Reserved", className: "bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300" },
  underpaid: { label: "Underpaid", className: "bg-orange-100 text-orange-800 dark:bg-orange-500/15 dark:text-orange-300" },
  paid: { label: "Paid", className: "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300" },
  free: { label: "Free", className: "bg-pz-surface-container-high text-pz-on-surface-variant" },
};

export const REGISTRATION_STATUS_LABELS: Record<RegistrationStatus, string> = {
  pending: STYLES.pending.label,
  reserved: STYLES.reserved.label,
  underpaid: STYLES.underpaid.label,
  paid: STYLES.paid.label,
  free: STYLES.free.label,
};

export function RegistrationStatusBadge({ status, className }: { status: RegistrationStatus; className?: string }) {
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
