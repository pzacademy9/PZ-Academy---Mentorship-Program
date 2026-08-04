import Link from "next/link";
import { BookOpen, BarChart3, Calendar } from "lucide-react";
import type { CourseCard as CourseCardData } from "@/lib/data/lms";

const TYPE_BADGE: Record<CourseCardData["type"], string> = {
  course: "bg-pz-secondary text-pz-on-secondary",
  workshop: "bg-pz-primary text-pz-on-primary",
  webinar: "bg-pz-tertiary text-pz-on-tertiary",
  mentorship: "bg-pz-tertiary text-pz-on-tertiary",
};

export function CourseCard({ course }: { course: CourseCardData }) {
  return (
    <div className="group bg-pz-surface-container-lowest rounded-xl overflow-hidden shadow-card hover:shadow-card-lg hover:-translate-y-1 transition-all duration-300">
      <div className="aspect-video relative overflow-hidden bg-pz-primary/5">
        {course.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={course.thumbnailUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <BookOpen className="w-10 h-10 text-pz-primary/30" />
          </div>
        )}
        <div className="absolute top-4 left-4">
          <span
            className={`px-3 py-1 rounded-lg text-xs font-bold tracking-widest uppercase font-headline ${TYPE_BADGE[course.type]}`}
          >
            {course.type}
          </span>
        </div>
      </div>
      <div className="p-6">
        <h3 className="font-headline text-xl font-bold text-pz-on-surface mb-2 group-hover:text-pz-primary transition-colors">
          {course.title}
        </h3>
        {course.tagline && (
          <p className="font-body text-pz-on-surface-variant text-sm mb-4 line-clamp-2">
            {course.tagline}
          </p>
        )}
        <div className="flex items-center justify-between py-4 border-y border-pz-surface-variant mb-6">
          {course.level && (
            <div className="flex items-center gap-1 text-xs text-pz-on-surface-variant font-medium">
              <BarChart3 className="w-4 h-4" />
              {course.level}
            </div>
          )}
          {course.durationLabel && (
            <div className="flex items-center gap-1 text-xs text-pz-on-surface-variant font-medium">
              <Calendar className="w-4 h-4" />
              {course.durationLabel}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-[10px] uppercase font-bold text-pz-outline tracking-wider">
              Tuition
            </span>
            <span className="text-lg font-headline font-black text-pz-on-surface">
              PKR {course.pricePkr.toLocaleString()}
            </span>
          </div>
          <Link
            href={`/courses/${course.slug}`}
            className="bg-pz-primary text-pz-on-primary font-bold px-5 py-2.5 rounded-lg hover:bg-pz-on-primary-container transition-colors font-headline text-sm"
          >
            View Details
          </Link>
        </div>
      </div>
    </div>
  );
}
