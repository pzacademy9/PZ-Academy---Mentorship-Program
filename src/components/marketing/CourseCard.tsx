import Link from "next/link";
import { BookOpen, BarChart3, Calendar, Wrench, Video } from "lucide-react";
import type { CourseCard as CourseCardData } from "@/lib/data/lms";

const TYPE_LABEL: Record<CourseCardData["type"], string> = {
  course: "Course",
  workshop: "Workshop",
  webinar: "Webinar",
  mentorship: "Mentorship",
};

const TYPE_ICON = { course: BookOpen, workshop: Wrench, webinar: Video, mentorship: BookOpen } as const;

const DOTS_BG = "radial-gradient(circle at 2px 2px, rgba(126,217,87,.22) 1.5px, transparent 0)";

function initials(name: string): string {
  return name
    .replace(/^(dr|mr|ms|mrs)\.?\s+/i, "")
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("");
}

/** The program card used on the home page and the Courses / Workshops lists. */
export function CourseCard({ course }: { course: CourseCardData }) {
  const Icon = TYPE_ICON[course.type];
  return (
    <article className="group flex flex-col overflow-hidden rounded-3xl border border-pz-border bg-pz-surface-container-lowest transition-all duration-300 hover:-translate-y-1.5 hover:border-pz-solid-mid/40 hover:shadow-card-lg">
      <div className="relative aspect-[16/10] overflow-hidden bg-gradient-to-br from-pz-solid-deep to-pz-solid-mid">
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
          <div className="flex h-full w-full items-center justify-center" style={{ backgroundImage: DOTS_BG, backgroundSize: "22px 22px" }}>
            <Icon className="h-12 w-12 text-pz-bright/70" strokeWidth={1.5} aria-hidden="true" />
          </div>
        )}
        <div className="absolute left-4 top-4">
          <span className="rounded-full bg-white/90 px-3 py-1 font-fredoka text-xs font-semibold text-pz-solid-deep backdrop-blur">
            {TYPE_LABEL[course.type]}
          </span>
        </div>
        {course.liveBatch && (
          <div className="absolute right-4 top-4">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-pz-bright px-3 py-1 font-fredoka text-xs font-semibold text-pz-solid-deep">
              <span aria-hidden="true" className="h-1.5 w-1.5 animate-pulse rounded-full bg-pz-solid-deep" />
              Live batch open
            </span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-6">
        <h3 className="mb-2 font-montserrat text-lg font-bold leading-snug text-pz-deep transition-colors group-hover:text-pz-mid">
          {course.title}
        </h3>
        {course.tagline && <p className="mb-4 line-clamp-2 font-poppins text-sm text-pz-muted">{course.tagline}</p>}

        {course.mentorName && (
          <div className="mb-4 flex items-center gap-2.5">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-pz-solid-forest font-montserrat text-xs font-bold text-pz-bright">
              {course.mentorAvatarUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={course.mentorAvatarUrl} alt="" referrerPolicy="no-referrer" loading="lazy" className="h-full w-full object-cover" />
              ) : (
                <span aria-hidden="true">{initials(course.mentorName)}</span>
              )}
            </span>
            <span className="min-w-0">
              <span className="block truncate font-poppins text-sm font-semibold text-pz-ink">{course.mentorName}</span>
              {course.mentorTitle && <span className="block truncate font-poppins text-xs text-pz-muted">{course.mentorTitle}</span>}
            </span>
          </div>
        )}

        {(course.level || course.durationLabel) && (
          <div className="mb-5 flex flex-wrap gap-2">
            {course.level && (
              <span className="inline-flex items-center gap-1 rounded-full bg-pz-offwhite px-3 py-1 font-poppins text-xs font-medium text-pz-muted">
                <BarChart3 className="h-3.5 w-3.5" aria-hidden="true" /> {course.level}
              </span>
            )}
            {course.durationLabel && (
              <span className="inline-flex items-center gap-1 rounded-full bg-pz-offwhite px-3 py-1 font-poppins text-xs font-medium text-pz-muted">
                <Calendar className="h-3.5 w-3.5" aria-hidden="true" /> {course.durationLabel}
              </span>
            )}
          </div>
        )}

        <div className="mt-auto flex items-center justify-between gap-3 border-t border-pz-border pt-4">
          <div className="flex flex-col">
            <span className="font-poppins text-[10px] font-bold uppercase tracking-wider text-pz-muted">Tuition</span>
            <span className="font-montserrat text-lg font-black text-pz-deep">
              {course.pricePkr > 0 ? `PKR ${course.pricePkr.toLocaleString()}` : "Free"}
            </span>
          </div>
          <Link
            href={`/courses/${course.slug}`}
            className="inline-flex min-h-11 items-center rounded-full bg-pz-solid-forest px-5 py-2.5 font-poppins text-sm font-bold text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-pz-solid-mid"
          >
            View Details
          </Link>
        </div>
      </div>
    </article>
  );
}
