// src/components/landing/TermsDocument.tsx
import { termsBlocks } from "@/lib/landing/terms";

/** A page's Terms and Conditions as plain text blocks. Only React text nodes: nothing the owner pastes can become markup. */
export function TermsDocument({ title, text }: { title: string; text: string }) {
  return (
    <main className="min-h-screen bg-landing-surface px-4 py-10 font-landing-body text-landing-on-surface md:px-6 md:py-16">
      <article className="mx-auto max-w-3xl">
        {title ? <p className="mb-2 break-words text-sm font-semibold text-landing-primary">{title}</p> : null}
        <h1 className="mb-8 break-words font-headline text-2xl font-extrabold text-landing-deep md:text-4xl">Terms and Conditions</h1>
        <div className="space-y-4">
          {termsBlocks(text).map((b, i) =>
            b.kind === "heading" ? (
              <h2 key={i} className="mt-8 break-words font-headline text-lg font-bold text-landing-deep md:text-xl">{b.text}</h2>
            ) : (
              <p key={i} className="whitespace-pre-line break-words text-sm leading-relaxed md:text-base">{b.text}</p>
            ),
          )}
        </div>
      </article>
    </main>
  );
}
