import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { Mentor } from "@/lib/data/mentors";
import { SectionHeader } from "@/components/marketing/kit/SectionHeader";
import { BTN_SOLID } from "@/components/marketing/kit/buttons";

export type StripMentor = Pick<Mentor, "id" | "slug" | "name" | "title" | "photo">;

function initials(name: string): string {
  return name
    .replace(/^(dr|mr|ms|mrs)\.?\s+/i, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/** Home page faces strip: up to 6 published mentors. Renders nothing without mentors. */
export function MentorStrip({ mentors }: { mentors: StripMentor[] }) {
  const shown = mentors.slice(0, 6);
  if (shown.length === 0) return null;
  return (
    <section aria-labelledby="home-mentors" className="bg-pz-surface-container-lowest px-6 py-16 md:py-24">
      <div className="mx-auto max-w-[1120px]">
        <SectionHeader
          kicker="1-on-1 help"
          title={<>Meet your <em className="not-italic text-pz-mid">mentors</em></>}
          titleId="home-mentors"
          text="Pharmacists, doctors and researchers who have walked the path you are on — and now guide others along it."
        />
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
          {shown.map((m) => (
            <li key={m.id}>
              <Link
                href={`/mentorship/mentors/${m.slug}`}
                className="group flex h-full flex-col items-center rounded-3xl border border-pz-border bg-pz-offwhite p-4 text-center transition-all duration-300 hover:-translate-y-1 hover:border-pz-solid-mid hover:shadow-card-lg"
              >
                <span className="relative mb-3 block h-20 w-20 overflow-hidden rounded-full bg-gradient-to-br from-pz-solid-forest to-pz-solid-mid ring-4 ring-pz-bright/25 transition-transform duration-300 group-hover:scale-105">
                  {m.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.photo} alt="" referrerPolicy="no-referrer" loading="lazy" className="h-full w-full object-cover object-top" />
                  ) : (
                    <span aria-hidden="true" className="flex h-full w-full items-center justify-center font-montserrat text-xl font-bold text-pz-bright">
                      {initials(m.name)}
                    </span>
                  )}
                </span>
                <span className="font-montserrat text-sm font-bold leading-snug text-pz-deep group-hover:text-pz-mid">{m.name}</span>
                {m.title && <span className="mt-1 line-clamp-2 font-poppins text-xs leading-snug text-pz-muted">{m.title}</span>}
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-10 flex justify-center">
          <Link href="/mentorship#mentors" className={BTN_SOLID}>
            See all mentors <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
