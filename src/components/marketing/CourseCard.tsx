import Link from "next/link";
import { ArrowRight, BookOpen, CalendarDays, Wrench, Video } from "lucide-react";
import type { CourseCard as CourseCardData } from "@/lib/data/lms";

const TYPE_LABEL: Record<CourseCardData["type"], string> = {
  course: "Course",
  workshop: "Workshop",
  webinar: "Webinar",
  mentorship: "Mentorship",
};

const TYPE_ICON = { course: BookOpen, workshop: Wrench, webinar: Video, mentorship: BookOpen } as const;

function initials(name: string): string {
  return name
    .replace(/^(dr|mr|ms|mrs)\.?\s+/i, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

function priceText(pricePkr: number): string {
  return pricePkr > 0 ? `PKR ${pricePkr.toLocaleString()}` : "Free";
}

function Mentor({ course, boxed }: { course: CourseCardData; boxed: boolean }) {
  if (!course.mentorName) return null;
  return (
    <div className={`flex items-center gap-3 ${boxed ? "rounded-xl bg-pz-web-surface-low p-2.5" : ""}`}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pz-solid-forest font-montserrat text-xs font-bold text-pz-bright">
        {course.mentorAvatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={course.mentorAvatarUrl} alt="" referrerPolicy="no-referrer" loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <span aria-hidden="true">{initials(course.mentorName)}</span>
        )}
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-poppins text-sm font-bold text-pz-ink">{course.mentorName}</span>
        {course.mentorTitle && <span className="truncate font-poppins text-[11px] text-pz-muted">{course.mentorTitle}</span>}
      </span>
    </div>
  );
}

/**
 * The program card. "home" (default): the home page "Popular programs" card.
 * "list": the Courses / Workshops list card (Stitch list screens) with the
 * schedule text, a tinted teacher row and a full-width View details button.
 */
export function CourseCard({ course, layout = "home" }: { course: CourseCardData; layout?: "home" | "list" }) {
  if (layout === "list") return <ListCard course={course} />;
  const Icon = TYPE_ICON[course.type];
  return (
    <article className="group flex h-full flex-col justify-between gap-5 rounded-[24px] bg-pz-surface-container-lowest p-5 shadow-[0_8px_30px_rgba(15,61,34,0.06)] transition-shadow duration-200 hover:shadow-lg md:p-6">
      <div className="flex flex-col gap-4">
        <div className="relative aspect-[16/10] w-full overflow-hidden rounded-[16px] bg-pz-web-surface-high">
          {course.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={course.thumbnailUrl}
              alt=""
              referrerPolicy="no-referrer"
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Icon className="h-10 w-10 text-pz-mid/50" strokeWidth={1.5} aria-hidden="true" />
            </div>
          )}
          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
            {course.liveBatch ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-pz-bright px-3 py-1 font-poppins text-[11px] font-bold text-pz-solid-deep shadow-sm">
                <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-pz-solid-mid" />
                Live batch open
              </span>
            ) : (
              <span className="rounded-full bg-white/90 px-3 py-1 font-poppins text-[11px] font-bold text-pz-solid-deep shadow-sm">
                {TYPE_LABEL[course.type]}
              </span>
            )}
          </div>
        </div>

        {(course.level || course.durationLabel) && (
          <div className="flex flex-wrap items-center gap-2">
            {course.level && (
              <span className="rounded-full bg-pz-web-surface-high px-3 py-1 font-poppins text-xs font-bold text-pz-deep">{course.level}</span>
            )}
            {course.durationLabel && (
              <span className="rounded-full bg-pz-web-surface-low px-3 py-1 font-poppins text-xs font-bold text-pz-muted">{course.durationLabel}</span>
            )}
          </div>
        )}

        <h3 className="font-montserrat text-xl font-bold leading-tight tracking-[-0.015em] text-pz-deep md:text-2xl">{course.title}</h3>
        {course.tagline && <p className="-mt-2 line-clamp-2 font-poppins text-sm text-pz-muted">{course.tagline}</p>}

        <Mentor course={course} boxed={false} />
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="font-montserrat text-xl font-bold text-pz-deep md:text-2xl">
          {priceText(course.pricePkr)}
        </span>
        <Link
          href={`/courses/${course.slug}`}
          className="inline-flex min-h-11 items-center justify-center rounded-full bg-pz-solid-deep px-5 font-montserrat text-[15px] font-bold text-white transition-colors hover:bg-pz-solid-forest"
        >
          View details
        </Link>
      </div>
    </article>
  );
}

function ListCard({ course }: { course: CourseCardData }) {
  const Icon = TYPE_ICON[course.type];
  const timingsOnImage = course.type === "workshop" && !!course.timings;
  const chips = [
    course.level && { text: course.level, strong: false },
    course.durationLabel && { text: course.durationLabel, strong: false },
    course.liveBatch && { text: `Starts ${course.liveBatch.startsOn}`, strong: true },
    !timingsOnImage && course.timings && { text: course.timings, strong: true },
  ].filter(Boolean) as { text: string; strong: boolean }[];

  return (
    <article className="group flex h-full flex-col justify-between rounded-3xl bg-pz-surface-container-lowest p-5 shadow-[0_8px_30px_rgba(15,61,34,0.05)] transition-shadow hover:shadow-xl">
      <div>
        <div className="relative mb-4 aspect-[16/10] w-full overflow-hidden rounded-2xl bg-pz-web-surface-high">
          {course.thumbnailUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={course.thumbnailUrl}
              alt=""
              referrerPolicy="no-referrer"
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <Icon className="h-10 w-10 text-pz-mid/50" strokeWidth={1.5} aria-hidden="true" />
            </div>
          )}
          <div className="absolute left-3 top-3 flex flex-wrap gap-1.5 pr-3">
            {timingsOnImage ? (
              <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-pz-solid-deep/95 px-3 py-1 font-poppins text-xs font-bold text-white shadow-sm">
                <CalendarDays className="h-3.5 w-3.5 shrink-0 text-pz-bright" aria-hidden="true" />
                {course.timings}
              </span>
            ) : (
              <span className="rounded-full bg-white/90 px-2.5 py-1 font-poppins text-xs font-bold text-pz-solid-deep shadow-sm">
                {TYPE_LABEL[course.type]}
              </span>
            )}
            {course.liveBatch && (
              <span className="inline-flex items-center gap-1 rounded-full bg-pz-bright px-2.5 py-1 font-poppins text-xs font-bold text-pz-solid-deep shadow-sm">
                <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-pz-solid-mid" />
                Live batch open
              </span>
            )}
          </div>
        </div>

        <h3 className="font-montserrat text-xl font-bold leading-snug tracking-[-0.01em] text-pz-deep">{course.title}</h3>
        {course.tagline && <p className="mt-2 line-clamp-2 font-poppins text-[15px] text-pz-muted">{course.tagline}</p>}

        <div className="mt-4">
          <Mentor course={course} boxed />
        </div>

        {chips.length > 0 && (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            {chips.map((c, i) => (
              <span
                key={`${i}-${c.text}`}
                className={`rounded-full px-2.5 py-1 font-poppins text-[13px] font-semibold ${c.strong ? "bg-pz-web-surface-high text-pz-deep" : "bg-pz-web-surface-low text-pz-ink"}`}
              >
                {c.text}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="mt-6 flex flex-col gap-3 pt-2">
        <div className="flex items-center justify-end">
          <span className="font-montserrat text-xl font-extrabold text-pz-deep">{priceText(course.pricePkr)}</span>
        </div>
        <Link
          href={`/courses/${course.slug}`}
          className="flex min-h-11 w-full items-center justify-center gap-2 rounded-full bg-pz-bright py-3 font-montserrat text-[15px] font-bold text-pz-solid-deep shadow-sm transition-transform hover:scale-[1.01] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pz-solid-mid"
        >
          View details <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}
