// src/components/landing/sections/FinalCta.tsx
import { RegisterButton, ctaLabel } from "../RegisterButton";
import { str } from "./util";
import type { SectionProps } from "./types";

export function FinalCta({ data, register }: SectionProps) {
  const headline = str(data, "headline");
  const text = str(data, "text");
  return (
    <div className="relative overflow-hidden bg-landing-deep px-4 py-12 text-center text-landing-on-primary md:px-6 md:py-20">
      <div className="relative z-10 mx-auto max-w-3xl">
        {headline ? <h2 className="font-headline text-2xl font-extrabold leading-tight tracking-tight sm:text-4xl lg:text-5xl">{headline}</h2> : null}
        {text ? <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-landing-on-primary/75 md:mt-6 md:text-lg">{text}</p> : null}
        <div className="mt-6 flex justify-center md:mt-10">
          <RegisterButton register={register} label={ctaLabel(str(data, "buttonLabel"), "Register now")} variant="mint" size="lg" arrow className="w-full sm:w-auto md:px-10 md:py-5" />
        </div>
      </div>
      <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-landing-primary/30 blur-3xl" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -left-24 h-96 w-96 rounded-full bg-landing-mint/10 blur-3xl" />
    </div>
  );
}
