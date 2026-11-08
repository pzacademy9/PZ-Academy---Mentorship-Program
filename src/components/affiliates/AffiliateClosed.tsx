// src/components/affiliates/AffiliateClosed.tsx
// The one answer for a wrong, malformed, dropped or rate-limited link. It never says which, and shows nothing personal.
export function AffiliateClosed({ supportWa }: { supportWa: string }) {
  return (
    <div className="mx-auto flex w-full min-w-0 max-w-md flex-col items-center gap-5 rounded-2xl border border-landing-border bg-white px-6 py-12 text-center shadow-landing-soft">
      <h1 className="font-headline text-xl font-extrabold text-landing-deep md:text-2xl">This page is no longer active.</h1>
      <p className="text-sm text-landing-muted">Message us on WhatsApp if you think this is a mistake.</p>
      <a
        href={supportWa}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex min-h-[48px] w-full items-center justify-center rounded-full bg-landing-mint px-6 py-3 font-headline text-sm font-bold text-landing-deep"
      >
        Message on WhatsApp
      </a>
    </div>
  );
}
