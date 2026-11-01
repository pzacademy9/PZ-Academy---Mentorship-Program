"use client";

import { useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { CalendarPlus, Settings2 } from "lucide-react";
import type { GridRow, SessionRow } from "@/lib/data/attendance";
import type { ClassOverview } from "@/lib/data/class-overview";
import type { SessionSendState } from "@/lib/data/session-emails";
import { saveMinPct } from "@/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/actions";
import { ClassList } from "@/components/admin/classes/ClassList";
import { BatchSummary } from "@/components/admin/classes/BatchSummary";
import { PortalVisibilitySwitch } from "@/components/admin/classes/PortalVisibilitySwitch";
import { TodayPanel } from "@/components/admin/classes/TodayPanel";
import { EditClassDialog } from "@/components/admin/classes/EditClassDialog";
import { cardCls, fieldCls, labelCls, primaryBtn, quietBtn } from "@/components/admin/classes/styles";

const BASE = "/dashboard/admin/enrollments/registrations";

function BatchSettings({ pageId, minPct, pageStatus, showInPortal }: { pageId: string; minPct: number; pageStatus: string; showInPortal: boolean | null }) {
  const [min, setMin] = useState(String(minPct));
  const [busy, startTransition] = useTransition();
  function save() {
    startTransition(async () => {
      const res = await saveMinPct(pageId, Number(min));
      if (res.ok) toast.success(res.message ?? "Saved");
      else toast.error(res.message ?? "Something went wrong. Please try again.");
    });
  }
  return (
    <details className={cardCls}>
      <summary className="flex min-h-12 cursor-pointer items-center gap-2 font-headline text-lg font-bold text-pz-on-surface">
        <Settings2 className="size-5" aria-hidden />
        <span>
          Batch settings
          <span className="block text-base font-normal text-pz-on-surface-variant">Pass mark and student portal</span>
        </span>
      </summary>
      <div className="mt-3 space-y-2">
        <label htmlFor="min-pct" className={labelCls}>Minimum attendance to pass (%)</label>
        <div className="flex flex-col gap-2 md:flex-row md:items-end">
          <input
            id="min-pct" type="number" min={0} max={100} value={min} onChange={(e) => setMin(e.target.value)}
            className={`${fieldCls} md:w-32`}
          />
          <button type="button" className={`${quietBtn} max-md:w-full`} onClick={save} disabled={busy}>Save minimum</button>
        </div>
        <p className="text-base text-pz-on-surface-variant">
          The percentage counts classes that have already started. Each class has its own attendance link, shown in its Attendance card.
        </p>
      </div>
      <div className="mt-4 border-t border-pz-outline-variant/60 pt-4">
        <PortalVisibilitySwitch pageId={pageId} status={pageStatus} showInPortal={showInPortal} />
      </div>
    </details>
  );
}

export function SessionsPanel({
  pageId, overview, sessions, rows, minPct, sends, nowIso, pageStatus, showInPortal,
}: {
  pageStatus: string;
  showInPortal: boolean | null;
  pageId: string;
  overview: ClassOverview;
  sessions: SessionRow[];
  rows: GridRow[];
  minPct: number;
  sends: Record<string, SessionSendState>;
  nowIso: string;
}) {
  const [selectedId, setSelectedId] = useState(overview.selectedId);
  const [adding, setAdding] = useState(false);
  const setupHref = `${BASE}/campaign/${pageId}/sessions/setup`;

  useEffect(() => {
    // Keep a valid selection when classes change (for example after a class is removed).
    if (!overview.classes.some((c) => c.id === selectedId)) setSelectedId(overview.selectedId);
  }, [overview, selectedId]);

  if (overview.classes.length === 0) {
    return (
      <div className="space-y-4">
        <section className={`${cardCls} space-y-4 text-center`}>
          <h2 className="font-headline text-2xl font-bold text-pz-on-surface">No classes yet</h2>
          <p className="text-base text-pz-on-surface-variant">Pick the days this batch meets and we will create each class, its attendance link and its feedback link.</p>
          <Link href={setupHref} className={`${primaryBtn} max-md:w-full`}>Set up classes</Link>
        </section>
        <section className={cardCls}>
          <PortalVisibilitySwitch pageId={pageId} status={pageStatus} showInPortal={showInPortal} />
        </section>
      </div>
    );
  }

  const cls = overview.classes.find((c) => c.id === selectedId) ?? overview.classes[0];
  const session = sessions.find((s) => s.id === cls.id);
  const nextNumber = sessions.reduce((m, s) => Math.max(m, s.number), 0) + 1;
  // A new class starts from the latest class that follows the batch defaults, so it follows them too.
  const byNumber = [...sessions].sort((a, b) => b.number - a.number);
  const last = byNumber.find((s) => !s.custom_time && !s.custom_zoom) ?? byNumber[0];

  return (
    <div className="space-y-4">
      <BatchSummary feedback={overview.batchFeedback} pageId={pageId} programId={overview.programId} rows={rows} minPct={minPct} />
      <div className="grid gap-4 lg:grid-cols-[20rem_1fr]">
        <div className="space-y-3">
          <ClassList classes={overview.classes} selectedId={cls.id} onSelect={setSelectedId} />
          <button type="button" className={`${quietBtn} w-full`} onClick={() => setAdding(true)}>
            <CalendarPlus className="size-5" aria-hidden />
            Add a class
          </button>
          <Link href={setupHref} className={`${quietBtn} w-full`}>Edit all classes</Link>
        </div>
        {session && (
          <TodayPanel
            key={cls.id}
            pageId={pageId}
            cls={cls}
            session={session}
            rows={rows}
            minPct={minPct}
            sends={sends[cls.id]}
            nowIso={nowIso}
          />
        )}
      </div>
      <BatchSettings pageId={pageId} minPct={minPct} pageStatus={pageStatus} showInPortal={showInPortal} />
      {adding && <EditClassDialog pageId={pageId} reference={last} nextNumber={nextNumber} onClose={() => setAdding(false)} />}
    </div>
  );
}
