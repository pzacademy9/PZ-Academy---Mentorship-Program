"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { Play, CheckCircle } from "lucide-react";
import type { CourseCard } from "@/lib/data/lms";
import { PROMO_AFTER, type Promo } from "@/lib/marketing/promo";
import { PromoSlot } from "./PromoSlot";

type Filter = "all" | "past" | "upcoming";

/** "Dr Imad" -> "DI", "Ms Afreen" -> "MA" — same derivation the old hardcoded SPEAKERS data used. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/**
 * DB-driven replacement for the old hardcoded 13-entry SPEAKERS const.
 * `closed` (registration/status on the seeded course row) maps to "past" —
 * recording available; `open` maps to "upcoming" — still open for
 * registration. Every webinar's YouTube link and full detail live at
 * /courses/[slug], which embeds the free public_video_url and (separately)
 * gates quizzes/notes/certificate behind enrollment — see that page.
 */
export function WebinarGrid({ webinars, promo = null }: { webinars: CourseCard[]; promo?: Promo | null }) {
  const [filter, setFilter] = useState<Filter>("all");

  const visible = webinars.filter((w) => {
    if (filter === "all") return true;
    return filter === "past" ? w.status === "closed" : w.status === "open";
  });
  // Promo only in the full list — a filtered view stays exactly what was asked for.
  const promoAt = promo && filter === "all" ? Math.min(PROMO_AFTER, visible.length) : -1;

  return (
    <>
      {/* Filter tabs */}
      <div className="flex gap-2 justify-center mb-10 flex-wrap">
        {(["all", "upcoming", "past"] as Filter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={`min-h-11 px-5 py-2 rounded-full text-sm font-semibold font-poppins border transition-all duration-200 capitalize ${
              filter === f
                ? "bg-pz-solid-forest text-white border-pz-solid-forest"
                : "bg-white text-pz-muted border-pz-border hover:border-pz-solid-mid hover:text-pz-forest"
            }`}
          >
            {f === "all" ? "All Webinars" : f === "upcoming" ? "Upcoming" : "Past"}
          </button>
        ))}
      </div>

      {/* Grid */}
      {visible.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {visible.map((w, i) => {
            const isUpcoming = w.status === "open";
            return (
              <Fragment key={w.id}>
              <div
                data-grid-item={w.id}
                className="bg-white rounded-2xl border-[1.5px] border-pz-border overflow-hidden flex flex-col transition-all duration-300 hover:-translate-y-1.5 hover:shadow-card-lg hover:border-transparent"
              >
                {/* Card top */}
                <div className="p-5 flex items-center gap-4">
                  <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-lg font-bold font-montserrat shrink-0 bg-[#0F3D22] text-[#7ED957] overflow-hidden">
                    {w.mentorAvatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={w.mentorAvatarUrl} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                    ) : (
                      initials(w.mentorName ?? w.title)
                    )}
                  </div>
                  <span
                    className={`text-[.67rem] font-bold uppercase tracking-widest px-3 py-1 rounded-full ${
                      isUpcoming
                        ? "bg-[rgba(126,217,87,.12)] text-pz-forest border border-[rgba(126,217,87,.3)]"
                        : "bg-[rgba(201,150,10,.1)] text-pz-gold border border-[rgba(201,150,10,.25)]"
                    }`}
                  >
                    {isUpcoming ? "Upcoming" : "Recorded"}
                  </span>
                </div>

                {/* Body */}
                <div className="px-5 pb-4 flex-1 flex flex-col gap-1.5">
                  <div className="font-semibold text-pz-deep font-poppins text-[.95rem]">
                    {w.mentorName ?? "PZ Academy Faculty"}
                  </div>
                  <div className="text-pz-muted text-[.83rem] font-poppins leading-snug">{w.title}</div>
                </div>

                {/* Footer */}
                <div className="px-5 pb-5">
                  {isUpcoming ? (
                    <Link
                      href={`/courses/${w.slug}`}
                      className="flex min-h-11 items-center justify-center gap-2 w-full py-2.5 rounded-full bg-pz-bright text-pz-forest text-[.84rem] font-semibold font-poppins transition-all duration-200 hover:bg-pz-pale hover:-translate-y-0.5 hover:shadow-[0_6px_20px_rgba(126,217,87,.35)]"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      Register Now
                    </Link>
                  ) : (
                    <Link
                      href={`/courses/${w.slug}`}
                      className="flex min-h-11 items-center justify-center gap-2 w-full py-2.5 rounded-full bg-pz-solid-forest text-white text-[.84rem] font-semibold font-poppins transition-all duration-200 hover:bg-pz-solid-mid hover:-translate-y-0.5 hover:shadow-card"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      Watch Recording
                    </Link>
                  )}
                </div>
              </div>
              {i === promoAt - 1 && (
                <div data-grid-item="promo" className="contents">
                  <PromoSlot promo={promo} variant="card" />
                </div>
              )}
              </Fragment>
            );
          })}
        </div>
      ) : (
        <p className="text-center text-pz-muted font-poppins py-16">No webinars in this category yet.</p>
      )}
    </>
  );
}
