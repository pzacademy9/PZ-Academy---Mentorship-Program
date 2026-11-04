import Link from "next/link";
import { ArrowRight, Award, Check, Sparkles } from "lucide-react";
import type { OpenLiveBatch } from "@/lib/data/landing-website";

/**
 * Right side of the home hero: a framed photo with small floating cards that
 * show what learning here looks like (next live batch, a quiz moment, the
 * certificate). The batch card only appears when a batch is really open.
 */
export function HeroCollage({ batch }: { batch: OpenLiveBatch | null }) {
  return (
    <div className="relative mx-auto w-full max-w-[340px] sm:max-w-[400px] lg:max-w-[440px]">
      {/* Soft glow behind the photo */}
      <div aria-hidden="true" className="absolute -inset-6 rounded-[40px] bg-pz-bright/20 blur-3xl" />

      <div className="relative aspect-[4/5] overflow-hidden rounded-[32px] border border-white/15 bg-[#7FC4EE] shadow-[0_30px_80px_rgba(0,0,0,.35)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/hero-banner-pc.jpeg"
          alt="A PZ Academy pharmacist in a white coat"
          className="h-full w-full object-cover object-[80%_center]"
          fetchPriority="high"
        />
        <div aria-hidden="true" className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-pz-solid-deep/85 to-transparent" />
        <p className="absolute inset-x-5 bottom-5 font-fredoka text-sm font-semibold text-white">
          Learn from practising pharmacists
        </p>
      </div>

      {/* Next live batch */}
      {batch && (
        <div className="absolute -left-3 top-6 w-[210px] rounded-2xl border border-pz-border bg-pz-surface-container-lowest p-3.5 shadow-card-lg animate-[floatY_6s_ease-in-out_infinite] sm:-left-10">
          <span className="inline-flex items-center gap-1.5 font-fredoka text-[.7rem] font-semibold uppercase tracking-[.1em] text-pz-mid">
            <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-pz-bright" />
            Live batch open
          </span>
          <p className="mt-1 line-clamp-2 font-montserrat text-sm font-bold leading-snug text-pz-deep">{batch.title}</p>
          {batch.startsOn && <p className="mt-0.5 font-poppins text-xs text-pz-muted">Starts {batch.startsOn}</p>}
          <Link
            href={batch.href}
            aria-label={`Register for live: ${batch.title}`}
            className="mt-2 inline-flex min-h-11 items-center gap-1 font-poppins text-xs font-bold text-pz-mid hover:gap-2 transition-all"
          >
            Register <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        </div>
      )}

      {/* A quiz moment (decorative; the real quiz is further down the page) */}
      <div
        aria-hidden="true"
        className="absolute -right-2 bottom-20 w-[200px] rounded-2xl border border-pz-border bg-pz-surface-container-lowest p-3.5 shadow-card-lg animate-[floatY_7s_ease-in-out_infinite_1s] sm:-right-8"
      >
        <div className="flex items-center justify-between">
          <span className="font-fredoka text-[.7rem] font-semibold uppercase tracking-[.1em] text-pz-mid">Quick quiz</span>
          <span className="inline-flex items-center gap-1 font-fredoka text-xs font-bold text-pz-gold">
            <Sparkles className="h-3.5 w-3.5" /> +100
          </span>
        </div>
        <p className="mt-1 font-poppins text-xs leading-snug text-pz-ink">Antidote for paracetamol overdose?</p>
        <p className="mt-2 flex items-center gap-1.5 rounded-xl bg-pz-bright/20 px-2.5 py-1.5 font-poppins text-xs font-semibold text-pz-deep">
          <Check className="h-3.5 w-3.5 text-pz-mid" /> N-acetylcysteine
        </p>
      </div>

      {/* Certificate */}
      <div
        aria-hidden="true"
        className="absolute -bottom-4 left-6 flex items-center gap-2.5 rounded-full border border-pz-border bg-pz-surface-container-lowest py-2 pl-2 pr-4 shadow-card-lg animate-[floatY_8s_ease-in-out_infinite_.5s]"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-pz-gold to-pz-gold-light">
          <Award className="h-4 w-4 text-white" />
        </span>
        <span className="font-fredoka text-sm font-semibold text-pz-deep">SECP certified</span>
      </div>
    </div>
  );
}
