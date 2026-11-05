import { CalendarDays } from "lucide-react";
import { CalendarButtons, type CalendarLinks } from "./CalendarButtons";

/** Strip at the top of an upcoming webinar's page that has an exact date (course editor). */
export function WebinarDateBanner({ when, calendar }: { when: string; calendar: CalendarLinks | null }) {
  return (
    <section aria-label="Webinar date" className="flex flex-col gap-4 rounded-3xl bg-pz-surface-container-lowest px-6 py-5 shadow-[0_8px_30px_rgba(15,61,34,0.05)] lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <p className="flex items-center gap-2 font-montserrat text-lg font-bold text-pz-deep">
          <span aria-hidden="true" className="h-2.5 w-2.5 animate-pulse rounded-full bg-pz-solid-mid" />
          Upcoming live webinar
        </p>
        <p className="mt-1 flex items-start gap-1.5 break-words font-poppins text-sm font-semibold text-pz-deep">
          <CalendarDays className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0">{when}</span>
        </p>
      </div>
      {calendar && <CalendarButtons links={calendar} />}
    </section>
  );
}
