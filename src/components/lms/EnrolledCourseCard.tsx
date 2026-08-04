import Link from "next/link";
import { BookOpen, ArrowRight } from "lucide-react";
import { CourseProgressBar } from "./CourseProgressBar";
import type { EnrolledCourse } from "@/lib/data/lms";

export function EnrolledCourseCard({ course }: { course: EnrolledCourse }) {
  const started = course.completed > 0;
  return (
    <div className="bg-white dark:bg-[#1c211e] rounded-2xl shadow-xl border border-pz-border dark:border-[#2a2f2c] overflow-hidden flex flex-col">
      <div className="h-32 bg-pz-forest/5 dark:bg-white/5 relative flex items-center justify-center">
        {course.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={course.thumbnailUrl} alt="" referrerPolicy="no-referrer" className="w-full h-full object-cover" />
        ) : (
          <BookOpen className="w-10 h-10 text-pz-forest/30 dark:text-pz-lime/30" />
        )}
      </div>
      <div className="p-5 flex flex-col flex-1">
        <h3 className="font-montserrat font-bold text-pz-forest dark:text-[#e0e3df] text-base leading-snug">
          {course.title}
        </h3>
        <div className="mt-4 mb-1 flex items-center justify-between text-xs text-pz-muted dark:text-[#c1c6d5]">
          <span>
            {course.completed} / {course.total} lessons
          </span>
          <span className="font-semibold tabular-nums">{course.pct}%</span>
        </div>
        <CourseProgressBar pct={course.pct} />
        <Link
          href={`/portal/${course.slug}`}
          className="mt-5 inline-flex items-center justify-center gap-2 rounded-lg bg-pz-forest text-white text-sm font-bold py-2.5 shadow-md hover:opacity-90 transition-all"
        >
          {started ? "Continue Learning" : "Start Course"}
          <ArrowRight className="w-4 h-4" />
        </Link>
      </div>
    </div>
  );
}
