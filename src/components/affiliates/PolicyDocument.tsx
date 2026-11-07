// src/components/affiliates/PolicyDocument.tsx
import Link from "next/link";
import { termsBlocks } from "@/lib/landing/terms";

/** One affiliate policy document as plain text blocks. Only React text nodes: nothing the owner pastes can become markup. */
export function PolicyDocument({ title, text }: { title: string; text: string }) {
  const blocks = termsBlocks(text);
  return (
    <main className="min-h-screen bg-landing-surface px-4 py-10 font-landing-body text-landing-on-surface md:px-6 md:py-16">
      <article className="mx-auto max-w-3xl">
        <p className="mb-2 text-sm font-semibold text-landing-primary">Pharmacozyme Affiliate Programme</p>
        <h1 className="mb-8 break-words font-headline text-2xl font-extrabold text-landing-deep md:text-4xl">{title}</h1>
        {blocks.length === 0 ? (
          <p className="text-sm md:text-base">This page is not published yet.</p>
        ) : (
          <div className="space-y-4">
            {blocks.map((b, i) =>
              b.kind === "heading" ? (
                <h2 key={i} className="mt-8 break-words font-headline text-lg font-bold text-landing-deep md:text-xl">{b.text}</h2>
              ) : (
                <p key={i} className="whitespace-pre-line break-words text-sm leading-relaxed md:text-base">{b.text}</p>
              ),
            )}
          </div>
        )}
        <p className="mt-10">
          <Link href="/affiliate-apply" className="text-sm font-semibold text-landing-primary underline">Back to the form</Link>
        </p>
      </article>
    </main>
  );
}
