import Link from "next/link";
import { CalendarDays } from "lucide-react";

/** Strip at the top of a course page when a live batch is open for registration. */
export function LiveBatchBanner({ title, startsOn, href }: { title: string; startsOn: string; href: string }) {
  return (
    <section aria-label="Live batch" className="mb-8 flex flex-col gap-4 rounded-xl bg-pz-primary-container px-6 py-5 text-pz-on-primary-container sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-headline text-lg font-bold">Live batch open</p>
        <p className="font-body text-sm opacity-90">{title}</p>
        {startsOn && (
          <p className="mt-1 flex items-center gap-1.5 font-body text-sm font-medium">
            <CalendarDays className="h-4 w-4" aria-hidden="true" />
            Starts {startsOn}
          </p>
        )}
      </div>
      <Link
        href={href}
        aria-label={`Register for live: ${title}`}
        className="inline-flex items-center justify-center rounded-lg bg-pz-primary px-5 py-2.5 font-headline text-sm font-bold text-pz-on-primary transition-colors hover:bg-pz-on-primary-container"
      >
        Register for live
      </Link>
    </section>
  );
}
