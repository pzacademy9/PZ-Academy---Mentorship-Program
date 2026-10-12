// src/components/landing/sections/RichText.tsx
import { LandingImage } from "../LandingImage";
import { SimpleText } from "../SimpleText";
import { str } from "./util";
import type { SectionProps } from "./types";

export function RichText({ data }: SectionProps) {
  const heading = str(data, "heading");
  const body = str(data, "body");
  const image = str(data, "image");
  if (!heading && !body && !image) return null;
  return (
    <div className="border-b border-landing-border bg-landing-surface-container-lowest px-4 py-10 md:px-6 md:py-20">
      <div className="mx-auto max-w-7xl">
        <div className="grid grid-cols-1 items-center gap-8 lg:grid-cols-12 lg:gap-16">
          <div className={image ? "lg:col-span-7" : "lg:col-span-12 lg:mx-auto lg:max-w-3xl"}>
            {heading ? <h2 className="mb-4 font-headline text-xl font-bold leading-snug tracking-tight text-landing-deep sm:text-3xl md:mb-6 lg:text-4xl">{heading}</h2> : null}
            <SimpleText text={body} className="text-sm leading-relaxed text-landing-on-surface md:text-base [&_li]:mb-2 [&_ul]:space-y-1" />
          </div>
          {image ? (
            <div className="lg:col-span-5">
              <LandingImage
                src={image}
                alt={heading}
                width={800}
                height={600}
                className="h-auto w-full rounded-landing border border-landing-border object-cover shadow-landing-soft lg:border-4 lg:border-landing-surface-container-lowest"
              />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
