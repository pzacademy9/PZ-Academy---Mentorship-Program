import { cn } from "@/lib/utils";
import type { Database } from "@/lib/supabase/database.types";

type BookingStatus = Database["public"]["Enums"]["mentorship_booking_status"];
type ApplicationStatus = Database["public"]["Enums"]["mentor_application_status"];

const BOOKING_STYLES: Record<BookingStatus, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-pz-secondary-container/40 text-pz-on-secondary-container dark:text-pz-secondary" },
  confirmed: { label: "Confirmed", className: "bg-pz-primary-container/30 dark:bg-pz-primary-container/15 text-pz-on-primary-container dark:text-pz-primary" },
  cancelled: { label: "Cancelled", className: "bg-pz-error-container text-pz-on-error-container" },
};

const APPLICATION_STYLES: Record<ApplicationStatus, { label: string; className: string }> = {
  pending: { label: "Pending", className: "bg-pz-secondary-container/40 text-pz-on-secondary-container dark:text-pz-secondary" },
  approved: { label: "Approved", className: "bg-pz-primary-container/30 dark:bg-pz-primary-container/15 text-pz-on-primary-container dark:text-pz-primary" },
  rejected: { label: "Rejected", className: "bg-pz-error-container text-pz-on-error-container" },
};

type MentorshipStatusBadgeProps =
  | { kind: "booking"; status: BookingStatus; className?: string }
  | { kind: "application"; status: ApplicationStatus; className?: string };

export function MentorshipStatusBadge(props: MentorshipStatusBadgeProps) {
  const { label, className: tone } =
    props.kind === "booking" ? BOOKING_STYLES[props.status] : APPLICATION_STYLES[props.status];
  return (
    <span
      className={cn(
        "inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider whitespace-nowrap font-headline",
        tone,
        props.className,
      )}
    >
      {label}
    </span>
  );
}
