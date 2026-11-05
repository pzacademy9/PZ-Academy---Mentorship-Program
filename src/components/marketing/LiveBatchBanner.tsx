import Link from "next/link";
import { CalendarDays, Timer, Users } from "lucide-react";
import type { BatchEarlyBird } from "@/lib/marketing/batch-facts";
import { seatsLeftText } from "@/lib/marketing/batch-facts";
import { CalendarButtons, type CalendarLinks } from "./CalendarButtons";

/** Strip at the top of a course page when a live batch is open for registration. */
export function LiveBatchBanner({
  title,
  startsOn,
  startsAtLabel = "",
  href,
  seatsLeft = null,
  earlyBird = null,
  calendar = null,
}: {
  title: string;
  startsOn: string;
  /** Date and time; preferred over startsOn when given. */
  startsAtLabel?: string;
  href: string;
  seatsLeft?: number | null;
  earlyBird?: BatchEarlyBird | null;
  calendar?: CalendarLinks | null;
}) {
  const when = startsAtLabel || startsOn;
  return (
    <section aria-label="Live batch" className="flex flex-col gap-4 rounded-3xl bg-pz-surface-container-lowest px-6 py-5 shadow-[0_8px_30px_rgba(15,61,34,0.05)] lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0 space-y-1">
        <p className="flex items-center gap-2 font-montserrat text-lg font-bold text-pz-deep"><span aria-hidden="true" className="h-2.5 w-2.5 animate-pulse rounded-full bg-pz-solid-mid" />Live batch open</p>
        <p className="break-words font-poppins text-sm text-pz-muted">{title}</p>
        {when && (
          <p className="flex items-start gap-1.5 break-words font-poppins text-sm font-semibold text-pz-deep">
            <CalendarDays className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0">Starts {when}</span>
          </p>
        )}
        {seatsLeft !== null && (
          <p className="flex items-center gap-1.5 font-poppins text-sm font-semibold text-pz-danger">
            <Users className="h-4 w-4 shrink-0" aria-hidden="true" />
            {seatsLeftText(seatsLeft)}
          </p>
        )}
        {earlyBird && (
          <p data-early-bird className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 pt-1 font-poppins text-sm text-pz-ink">
            <Timer className="h-4 w-4 shrink-0 self-center text-pz-mid" aria-hidden="true" />
            <span className="font-semibold">Early Bird:</span>
            <span className="font-montserrat text-base font-extrabold text-pz-deep">{earlyBird.price}</span>
            <s className="text-pz-muted">{earlyBird.was}</s>
            {earlyBird.until && <span className="text-pz-muted">until {earlyBird.until}</span>}
          </p>
        )}
        {calendar && (
          <div className="pt-2">
            <CalendarButtons links={calendar} />
          </div>
        )}
      </div>
      <Link
        href={href}
        aria-label={`Register for live: ${title}`}
        className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-full bg-pz-solid-deep px-6 font-montserrat text-sm font-bold text-white transition-colors hover:bg-pz-solid-forest"
      >
        Register for live
      </Link>
    </section>
  );
}
