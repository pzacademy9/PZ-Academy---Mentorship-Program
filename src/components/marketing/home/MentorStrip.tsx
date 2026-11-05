import Link from "next/link";
import type { Mentor } from "@/lib/data/mentors";
import { SectionHeader } from "@/components/marketing/kit/SectionHeader";

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
    <section aria-labelledby="home-mentors" className="w-full bg-pz-web-surface-low px-5 py-12 md:px-12 md:py-20">
      <div className="mx-auto max-w-[1344px]">
        <SectionHeader
          kicker="Faculty leadership"
          title="Meet your mentors"
          titleId="home-mentors"
          text="Pharmacists, doctors and researchers who have walked the path you are on — and now guide others along it."
          align="center"
        />
        <ul className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4 lg:grid-cols-6">
          {shown.map((m) => (
            <li key={m.id}>
              <Link
                href={`/mentorship/mentors/${m.slug}`}
                className="flex h-full flex-col items-center rounded-2xl bg-pz-surface-container-lowest p-4 text-center shadow-[0_8px_30px_rgba(15,61,34,0.04)] transition-shadow hover:shadow-md"
              >
                <span className="mb-3 block h-20 w-20 overflow-hidden rounded-full bg-pz-web-surface-high md:h-24 md:w-24">
                  {m.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={m.photo} alt="" referrerPolicy="no-referrer" loading="lazy" className="h-full w-full object-cover object-top" />
                  ) : (
                    <span aria-hidden="true" className="flex h-full w-full items-center justify-center font-montserrat text-xl font-bold text-pz-deep">
                      {initials(m.name)}
                    </span>
                  )}
                </span>
                <span className="font-poppins text-sm font-bold leading-snug text-pz-deep md:text-base">{m.name}</span>
                {m.title && <span className="mt-1 line-clamp-2 font-poppins text-xs leading-snug text-pz-muted">{m.title}</span>}
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-8 flex justify-center md:mt-10">
          <Link
            href="/mentorship#mentors"
            className="inline-flex min-h-11 w-full items-center justify-center rounded-full bg-pz-surface-container-lowest px-8 font-montserrat text-[15px] font-bold text-pz-deep shadow-sm transition-colors hover:bg-pz-web-surface-high sm:w-auto"
          >
            See all mentors
          </Link>
        </div>
      </div>
    </section>
  );
}
