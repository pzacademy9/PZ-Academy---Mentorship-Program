"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Link2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";

const FIELD =
  "w-full rounded-lg border border-pz-outline-variant bg-pz-surface-container-lowest px-3 py-2.5 text-sm max-md:text-base max-md:min-h-11 font-body text-pz-on-surface placeholder:text-pz-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-pz-primary/20 focus:border-pz-primary";
const LABEL = "block font-headline text-sm font-semibold text-pz-on-surface mb-1.5";

interface CourseOption {
  id: string;
  title: string;
  sheetId: string | null;
}

/**
 * Links a course to a batch's Google Sheet for Phase 0 sync. One shared GAS
 * deployment serves every sheet — this form is the entire onboarding step
 * for a new batch: no Apps Script editor visit, just a sheet ID.
 */
export function ConnectSheetForm({ courses }: { courses: CourseOption[] }) {
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();

  const [courseId, setCourseId] = useState(courses[0]?.id ?? "");
  const [sheetId, setSheetId] = useState(courses[0]?.sheetId ?? "");

  // Keep the sheet-ID field in sync with whichever course is selected, so
  // switching courses shows that course's current value instead of leaking
  // the previous course's input.
  useEffect(() => {
    setSheetId(courses.find((c) => c.id === courseId)?.sheetId ?? "");
  }, [courseId, courses]);

  const { run: submit, pending: connecting } = useAsyncAction(async () => {
    const trimmed = sheetId.trim();

    try {
      const res = await fetch(`/api/admin/courses/${courseId}/connect-sheet`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sheetId: trimmed }),
      });
      const json = (await res.json().catch(() => null)) as
        | { registered?: boolean; warning?: string; error?: string }
        | null;

      if (!res.ok && res.status !== 207) {
        toast.error(json?.error ?? "Could not connect this sheet.");
        return;
      }
      if (res.status === 207) {
        toast.warning(json?.warning ?? "Saved, but the sheet registration couldn't be confirmed.");
      } else {
        toast.success("Connected — this sheet is now being watched for edits.");
      }
      startTransition(() => router.refresh());
    } catch {
      toast.error("Could not connect this sheet.");
    }
  });

  const disabled = !courseId || sheetId.trim().length < 10;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="bg-pz-surface-container rounded-2xl border border-pz-outline-variant/40 p-4 md:p-6 space-y-5 max-w-2xl"
    >
      <div>
        <label htmlFor="sheet-course" className={LABEL}>
          Course
        </label>
        <select
          id="sheet-course"
          value={courseId}
          onChange={(e) => setCourseId(e.target.value)}
          className={FIELD}
        >
          {courses.length === 0 && <option value="">No courses yet</option>}
          {courses.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
              {c.sheetId ? " — connected" : ""}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="sheet-id" className={LABEL}>
          Google Sheet ID
        </label>
        <input
          id="sheet-id"
          value={sheetId}
          onChange={(e) => setSheetId(e.target.value)}
          placeholder="1OEl4BIi53bsecA562n7fci659r6I6umBj2cG-t4Bc"
          className={FIELD}
        />
        <p className="font-body text-xs text-pz-on-surface-variant mt-1.5">
          The long ID in the sheet&apos;s URL, between <code>/d/</code> and <code>/edit</code>.
          Saving this also asks the sync script to start watching the sheet — nothing else to
          set up.
        </p>
      </div>

      <div className="flex justify-end pt-1">
        <Button
          type="submit"
          variant="bare"
          size="bare"
          loading={connecting || isRefreshing}
          disabled={disabled}
          className="gap-2 px-5 py-2.5 max-md:min-h-11 max-md:w-full rounded-lg bg-pz-primary text-pz-on-primary font-headline font-bold text-sm hover:bg-pz-on-primary-container transition-colors"
        >
          <Link2 className="w-4 h-4" />
          {connecting || isRefreshing ? "Connecting…" : "Connect sheet"}
        </Button>
      </div>
    </form>
  );
}
