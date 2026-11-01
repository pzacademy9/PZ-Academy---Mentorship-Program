// Small shared pieces for the public Track Your Progress page.

export const btnFocus =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pz-primary focus-visible:ring-offset-2 focus-visible:ring-offset-pz-surface-container-lowest";

/** text-base (16px) stops phones zooming in when the box is tapped. */
export const inputClass =
  "block min-h-12 w-full min-w-0 rounded-lg border border-pz-outline-variant bg-pz-surface-container-low px-4 py-2.5 font-body text-base text-pz-on-surface placeholder:text-pz-outline focus:border-pz-primary focus:bg-pz-surface-container-lowest focus:outline-none focus:ring-2 focus:ring-pz-primary/40 aria-[invalid=true]:border-pz-academy-error";

export function StepHeading({ n, id, title, note }: { n: number; id: string; title: string; note: string }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
      <div className="flex min-w-0 items-center gap-2">
        <span
          aria-hidden
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-pz-primary-container font-headline text-sm font-bold text-pz-on-primary-container"
        >
          {n}
        </span>
        <h2 id={id} className="min-w-0 break-words font-headline text-lg font-bold text-pz-on-surface">
          <span className="sr-only">Step {n}: </span>
          {title}
        </h2>
      </div>
      <span className="font-label text-sm text-pz-secondary">{note}</span>
    </div>
  );
}
