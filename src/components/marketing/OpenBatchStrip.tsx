import Link from "next/link";
import { ArrowRight, CalendarDays } from "lucide-react";

type StripBatch = { courseId: string; title: string; startsOn: string; href: string };

/** Home page strip: up to 3 open live batches. Renders nothing when there are none. */
export function OpenBatchStrip({ batches }: { batches: StripBatch[] }) {
  const shown = batches.slice(0, 3);
  if (shown.length === 0) return null;
  return (
    <section aria-labelledby="open-batches" className="bg-pz-web-surface px-5 pb-12 md:px-12 md:pb-20">
      <div className="mx-auto max-w-[1344px] rounded-[24px] bg-pz-solid-forest p-6 md:p-8">
        <h2 id="open-batches" className="mb-5 flex items-center gap-2.5 font-montserrat text-xl font-extrabold text-white">
          <span aria-hidden="true" className="relative flex h-2.5 w-2.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pz-bright opacity-60" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-pz-bright" />
          </span>
          Live batches open now
        </h2>
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {shown.map((b) => (
            <li key={b.courseId} className="flex flex-col justify-between gap-4 rounded-2xl border border-white/10 bg-white/[.06] p-5">
              <div>
                <p className="font-montserrat text-base font-bold text-white">{b.title}</p>
                {b.startsOn && (
                  <p className="mt-1.5 flex items-center gap-1.5 font-poppins text-sm text-white/70">
                    <CalendarDays className="h-4 w-4 text-pz-bright" aria-hidden="true" /> Starts {b.startsOn}
                  </p>
                )}
              </div>
              <Link
                href={b.href}
                aria-label={`Register for live: ${b.title}`}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-pz-bright px-4 py-2 font-poppins text-sm font-bold text-pz-solid-deep transition-all duration-200 hover:-translate-y-0.5 hover:brightness-105"
              >
                Register for live <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
