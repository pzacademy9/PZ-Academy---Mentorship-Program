import Link from "next/link";

type StripBatch = { courseId: string; title: string; startsOn: string; href: string };

/** Home page strip: up to 3 open live batches. Renders nothing when there are none. */
export function OpenBatchStrip({ batches }: { batches: StripBatch[] }) {
  const shown = batches.slice(0, 3);
  if (shown.length === 0) return null;
  return (
    <section className="bg-pz-surface-container-lowest px-6 py-10 border-b border-pz-outline-variant">
      <div className="mx-auto max-w-[1060px]">
        <h2 className="mb-4 font-headline text-xl font-bold text-pz-on-surface">Live batches open now</h2>
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {shown.map((b) => (
            <li
              key={b.courseId}
              className="flex flex-col justify-between gap-4 rounded-xl border border-pz-outline-variant bg-pz-secondary-container p-5"
            >
              <div>
                <p className="font-headline text-base font-bold text-pz-on-surface">{b.title}</p>
                {b.startsOn && <p className="mt-1 font-body text-sm text-pz-on-surface-variant">Starts {b.startsOn}</p>}
              </div>
              <Link
                href={b.href}
                aria-label={`Register for live: ${b.title}`}
                className="inline-flex items-center justify-center rounded-lg bg-pz-primary px-4 py-2 font-headline text-sm font-bold text-pz-on-primary transition-colors hover:bg-pz-on-primary-container"
              >
                Register for live
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
