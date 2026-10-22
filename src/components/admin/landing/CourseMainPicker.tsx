"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useAsyncAction } from "@/hooks/useAsyncAction";

const SELECT =
  "max-w-48 truncate rounded-md border border-pz-outline-variant bg-pz-surface-container-lowest px-2 py-1 font-body text-xs text-pz-on-surface focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-60";

/** Picks the course a landing page belongs to and whether it is that course's main page. Saves on change. */
export function CourseMainPicker({
  pageId, courses, courseId, isMainPage,
}: {
  pageId: string; courses: { id: string; title: string }[]; courseId: string | null; isMainPage: boolean;
}) {
  const router = useRouter();
  const [course, setCourse] = useState(courseId ?? "");
  const [main, setMain] = useState(isMainPage);
  useEffect(() => { setCourse(courseId ?? ""); setMain(isMainPage); }, [courseId, isMainPage]);

  const { run: save, pending } = useAsyncAction(async (nextCourse: string, nextMain: boolean) => {
    try {
      const res = await fetch(`/api/admin/landing-pages/${pageId}/course`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ courseId: nextCourse === "" ? null : nextCourse, isMain: nextCourse === "" ? false : nextMain }),
      });
      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(payload?.error ?? "Couldn't save the course.");
        return;
      }
      setCourse(nextCourse);
      setMain(nextCourse === "" ? false : nextMain);
      toast.success(
        main && nextCourse !== course ? "Course saved. Main page turned off for the new course." : "Course saved.",
      );
      router.refresh();
    } catch {
      toast.error("Couldn't save the course.");
    }
  });

  return (
    <div className="flex items-center gap-3">
      <label className="flex items-center gap-1.5 font-body text-xs text-pz-on-surface-variant">
        Course
        <select
          value={course}
          disabled={pending}
          onChange={(e) => void save(e.target.value, false)}
          className={SELECT}
        >
          <option value="">No course</option>
          {courses.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </select>
      </label>
      <label className="flex items-center gap-1.5 font-body text-xs text-pz-on-surface-variant">
        <input
          type="checkbox"
          checked={main}
          disabled={pending || course === ""}
          onChange={(e) => void save(course, e.target.checked)}
        />
        Main page for this course (shown on the website)
      </label>
    </div>
  );
}
