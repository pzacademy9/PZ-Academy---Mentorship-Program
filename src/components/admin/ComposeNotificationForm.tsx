"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Send, User, BookOpen, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { AUDIENCE_LABELS, type NotificationAudience } from "@/lib/validations/notification";

const AUDIENCE_ICONS = { student: User, course: BookOpen, all: Users } as const;

const FIELD =
  "w-full rounded-lg border border-pz-outline-variant bg-pz-surface-container-lowest px-3 py-2.5 text-sm max-md:text-base max-md:min-h-11 font-body text-pz-on-surface placeholder:text-pz-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-pz-primary/20 focus:border-pz-primary";
const LABEL = "block font-headline text-sm font-semibold text-pz-on-surface mb-1.5";

export function ComposeNotificationForm({
  courses,
  students,
}: {
  courses: { id: string; title: string }[];
  students: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();

  const [audience, setAudience] = useState<NotificationAudience>("student");
  const [studentId, setStudentId] = useState(students[0]?.id ?? "");
  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [link, setLink] = useState("");

  const { run: submit, pending: sending } = useAsyncAction(async () => {
    const payload: Record<string, string> = { audience, title: title.trim() };
    if (body.trim()) payload.body = body.trim();
    if (link.trim()) payload.link = link.trim();
    if (audience === "student") payload.studentId = studentId;
    if (audience === "course") payload.courseId = courseId;

    try {
      const res = await fetch("/api/admin/notifications", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = (await res.json().catch(() => null)) as
        | { sent?: number; error?: string }
        | null;

      if (!res.ok) {
        toast.error(json?.error ?? "Could not send the notification.");
        return;
      }

      toast.success(
        `Sent to ${json?.sent ?? 0} recipient${json?.sent === 1 ? "" : "s"}.`,
      );
      setTitle("");
      setBody("");
      setLink("");
      startTransition(() => router.refresh());
    } catch {
      toast.error("Could not send the notification.");
    }
  });

  const disabled =
    title.trim().length < 3 ||
    (audience === "student" && !studentId) ||
    (audience === "course" && !courseId);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="bg-pz-surface-container rounded-2xl border border-pz-outline-variant/40 p-4 md:p-6 space-y-5 max-w-2xl"
    >
      <div>
        <span className={LABEL}>Audience</span>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(AUDIENCE_LABELS) as NotificationAudience[]).map((option) => {
            const Icon = AUDIENCE_ICONS[option];
            const selected = audience === option;
            return (
              <button
                key={option}
                type="button"
                onClick={() => setAudience(option)}
                className={cn(
                  "inline-flex items-center gap-2 px-4 py-2 max-md:min-h-11 rounded-full font-headline text-sm transition-colors",
                  selected
                    ? "bg-pz-primary-container text-pz-on-primary-container font-semibold"
                    : "bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant font-medium",
                )}
              >
                <Icon className="w-4 h-4" />
                {AUDIENCE_LABELS[option]}
              </button>
            );
          })}
        </div>
      </div>

      {audience === "student" && (
        <div>
          <label htmlFor="notice-student" className={LABEL}>
            Student
          </label>
          <select
            id="notice-student"
            value={studentId}
            onChange={(e) => setStudentId(e.target.value)}
            className={FIELD}
          >
            {students.length === 0 && <option value="">No students yet</option>}
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {audience === "course" && (
        <div>
          <label htmlFor="notice-course" className={LABEL}>
            Course
          </label>
          <select
            id="notice-course"
            value={courseId}
            onChange={(e) => setCourseId(e.target.value)}
            className={FIELD}
          >
            {courses.length === 0 && <option value="">No courses yet</option>}
            {courses.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          <p className="font-body text-xs text-pz-on-surface-variant mt-1.5">
            Goes to students with an <strong>active</strong> enrollment only — not pending or
            rejected ones.
          </p>
        </div>
      )}

      <div>
        <label htmlFor="notice-title" className={LABEL}>
          Title
        </label>
        <input
          id="notice-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          placeholder="Live session moved to Saturday"
          className={FIELD}
        />
      </div>

      <div>
        <label htmlFor="notice-body" className={LABEL}>
          Message <span className="font-body font-normal text-pz-on-surface-variant">(optional)</span>
        </label>
        <textarea
          id="notice-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={4}
          maxLength={1000}
          placeholder="Add any detail the student needs…"
          className={cn(FIELD, "resize-none")}
        />
      </div>

      <div>
        <label htmlFor="notice-link" className={LABEL}>
          Link <span className="font-body font-normal text-pz-on-surface-variant">(optional)</span>
        </label>
        <input
          id="notice-link"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="/webinars"
          className={FIELD}
        />
        <p className="font-body text-xs text-pz-on-surface-variant mt-1.5">
          Internal paths only, starting with <code>/</code>. External URLs are rejected so a
          trusted in-app notice can&apos;t point off-site.
        </p>
      </div>

      <div className="flex justify-end pt-1">
        <Button
          type="submit"
          variant="bare"
          size="bare"
          loading={sending || isRefreshing}
          disabled={disabled}
          className="gap-2 px-5 py-2.5 max-md:min-h-11 max-md:w-full rounded-lg bg-pz-primary text-pz-on-primary font-headline font-bold text-sm hover:bg-pz-on-primary-container transition-colors"
        >
          <Send className="w-4 h-4" />
          {sending || isRefreshing ? "Sending…" : "Send notification"}
        </Button>
      </div>
    </form>
  );
}
