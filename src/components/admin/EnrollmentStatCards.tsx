import { ClipboardClock, CheckCircle2, Armchair, XCircle, type LucideIcon } from "lucide-react";

/**
 * The four-up stat row from the Stitch "Admin: Enrollment Review — Clinical
 * Excellence" screen (`d5483d0f798c46959c35b4e4c871643c`).
 *
 * Deliberately not built on components/dashboard/StatCard: that card is a
 * vertical tile with a fixed secondary-tinted icon, whereas this one is a
 * horizontal row with per-card tinting, a larger radius, a soft green shadow
 * and a scale hover. Forcing one component to cover both would have meant
 * seven conditional props and a regression risk on the three dashboards
 * already using StatCard.
 */
const CARDS: {
  key: "pending" | "approvedThisMonth" | "reserved" | "rejected";
  label: string;
  icon: LucideIcon;
  circle: string;
  icon_color: string;
}[] = [
  {
    key: "pending",
    label: "Pending Review",
    icon: ClipboardClock,
    circle: "bg-pz-secondary-container/20",
    icon_color: "text-pz-secondary",
  },
  {
    key: "approvedThisMonth",
    label: "Approved This Month",
    icon: CheckCircle2,
    circle: "bg-pz-primary-container/20",
    icon_color: "text-pz-primary",
  },
  {
    key: "reserved",
    label: "Reserved Seats",
    icon: Armchair,
    circle: "bg-pz-gold/10",
    icon_color: "text-pz-gold",
  },
  {
    key: "rejected",
    label: "Rejected",
    icon: XCircle,
    circle: "bg-pz-error-container/40",
    icon_color: "text-pz-academy-error",
  },
];

export function EnrollmentStatCards({
  counts,
}: {
  counts: { pending: number; approvedThisMonth: number; reserved: number; rejected: number };
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
      {CARDS.map(({ key, label, icon: Icon, circle, icon_color }) => (
        <div
          key={key}
          className="bg-pz-surface-container-lowest p-6 rounded-2xl border border-pz-outline-variant shadow-[0_4px_12px_rgba(36,109,0,0.04)] flex items-center gap-5 transition-transform duration-200 hover:scale-[1.02]"
        >
          <div
            className={`w-14 h-14 shrink-0 rounded-full flex items-center justify-center ${circle} ${icon_color}`}
          >
            <Icon className="w-7 h-7" />
          </div>
          <div className="min-w-0">
            <p className="font-label text-[11px] text-pz-on-surface-variant uppercase tracking-wider">
              {label}
            </p>
            <p className="font-headline font-bold text-2xl text-pz-on-surface tabular-nums">
              {counts[key]}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}
