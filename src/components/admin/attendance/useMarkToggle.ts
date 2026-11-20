"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { GridRow, SessionRow } from "@/lib/data/attendance";
import { toggleMark } from "@/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/actions";

/**
 * Marks flip at once and are put back (with a message) if the save fails.
 * Shared by the whole-batch grid and the single-class Attendance tab.
 */
export function useMarkToggle() {
  const [busy, startTransition] = useTransition();
  const [flipped, setFlipped] = useState<Record<string, boolean>>({});
  const key = (personId: string, sessionId: string) => `${personId}|${sessionId}`;

  function isOn(r: GridRow, s: Pick<SessionRow, "id">): boolean {
    const k = key(r.personId, s.id);
    return k in flipped ? flipped[k] : !!r.marks[s.id];
  }

  function toggle(r: GridRow, s: Pick<SessionRow, "id">) {
    const k = key(r.personId, s.id);
    const next = !isOn(r, s);
    setFlipped((p) => ({ ...p, [k]: next }));
    startTransition(async () => {
      const res = await toggleMark(s.id, r.personId, next);
      if (!res.ok) {
        toast.error(res.message ?? "Something went wrong. Please try again.");
        setFlipped((p) => ({ ...p, [k]: !next }));
      }
    });
  }

  /** Show a whole class as present at once (after Mark everyone present succeeds). */
  function setAllOn(rows: GridRow[], s: Pick<SessionRow, "id">) {
    setFlipped((p) => {
      const n = { ...p };
      for (const r of rows) n[key(r.personId, s.id)] = true;
      return n;
    });
  }

  return { isOn, toggle, setAllOn, busy };
}
