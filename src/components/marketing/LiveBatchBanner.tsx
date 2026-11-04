import Link from "next/link";
import { CalendarDays } from "lucide-react";

/** Strip at the top of a course page when a live batch is open for registration. */
export function LiveBatchBanner({ title, startsOn, href }: { title: string; startsOn: string; href: string }) {
  return (
    <section aria-label="Live batch" className="flex flex-col gap-4 rounded-3xl bg-pz-surface-container-lowest px-6 py-5 shadow-[0_8px_30px_rgba(15,61,34,0.05)] sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="flex items-center gap-2 font-montserrat text-lg font-bold text-pz-deep"><span aria-hidden="true" className="h-2.5 w-2.5 animate-pulse rounded-full bg-pz-solid-mid" />Live batch open</p>
        <p className="font-poppins text-sm text-pz-muted">{title}</p>
        {startsOn && (
          <p className="mt-1 flex items-center gap-1.5 font-poppins text-sm font-semibold text-pz-deep">
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            Starts {startsOn}
          </p>
        )}
      </div>
      <Link
        href={href}
        aria-label={`Register for live: ${title}`}
        className="inline-flex min-h-11 items-center justify-center rounded-full bg-pz-solid-deep px-6 font-montserrat text-sm font-bold text-white transition-colors hover:bg-pz-solid-forest"
      >
        Register for live
      </Link>
    </section>
  );
}
