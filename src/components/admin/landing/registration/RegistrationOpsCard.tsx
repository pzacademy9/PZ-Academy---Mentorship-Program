"use client";

import { lazy, Suspense, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, ExternalLink, FileSpreadsheet, FlaskConical, RefreshCw, RotateCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAsyncAction } from "@/hooks/useAsyncAction";
import { cn } from "@/lib/utils";
import type { PageStatus } from "@/lib/landing/content";
import type { JobIssue, PageJobSummary } from "@/lib/data/landing-ops";
import type { JobType } from "@/lib/data/landing-jobs";
import { HELP, LABEL } from "./styles";

// The public form, loaded only when the admin asks for a test run.
const RegistrationModal = lazy(() => import("@/components/landing/registration/RegistrationModal"));

export const JOB_LABEL: Record<JobType, string> = {
  sheet_append: "Sheet row",
  sheet_status: "Sheet status",
  email_received: "Confirmation email",
  email_members: "Group member emails",
  email_admin: "Team alert email",
  enrollment_sync: "Course access",
  email_status: "Payment status email",
};

export function sheetUrl(sheetId: string): string {
  return `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/edit`;
}

const PILL = "inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-body text-xs font-semibold";
const MAX_SHOWN = 10;

type JobsState = { kind: "loading" } | { kind: "error" } | { kind: "ready"; data: PageJobSummary };

export function RegistrationOpsCard({
  pageId, slug, status, initialSheetId,
}: { pageId: string; slug: string; status: PageStatus; initialSheetId: string | null }) {
  const router = useRouter();
  const [sheetId, setSheetId] = useState<string | null>(initialSheetId);
  const [jobs, setJobs] = useState<JobsState>({ kind: "loading" });
  const [testOpen, setTestOpen] = useState(false);
  const [testLoaded, setTestLoaded] = useState(false);

  // A server refresh (after a 409) brings the sheet id in through the prop.
  useEffect(() => { if (initialSheetId) setSheetId(initialSheetId); }, [initialSheetId]);

  const loadJobs = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/landing-pages/${pageId}/jobs`, { cache: "no-store" });
      if (!res.ok) throw new Error(String(res.status));
      setJobs({ kind: "ready", data: (await res.json()) as PageJobSummary });
    } catch {
      setJobs({ kind: "error" });
    }
  }, [pageId]);
  useEffect(() => { void loadJobs(); }, [loadJobs]);

  const { run: createSheet, pending: creating } = useAsyncAction(async () => {
    try {
      const res = await fetch(`/api/admin/landing-pages/${pageId}/sheet`, { method: "POST" });
      const body = (await res.json().catch(() => null)) as { sheetId?: string; error?: string } | null;
      if (res.status === 201 && body?.sheetId) {
        setSheetId(body.sheetId);
        toast.success("Event sheet created.");
        return;
      }
      toast.error(body?.error ?? "Could not create the sheet. Please try again.");
      // 409: a sheet exists (or a parallel click made one); the page props carry the real id.
      if (res.status === 409) router.refresh();
    } catch {
      toast.error("Could not reach the server. Please try again.");
    }
  });

  const { run: retry, pending: retrying } = useAsyncAction(async () => {
    try {
      const res = await fetch(`/api/admin/landing-pages/${pageId}/jobs/retry`, { method: "POST" });
      const body = (await res.json().catch(() => null)) as { requeued?: number; error?: string } | null;
      if (!res.ok) {
        toast.error(body?.error ?? "Could not retry. Please try again.");
        return;
      }
      const n = body?.requeued ?? 0;
      toast.success(n === 1 ? "1 task sent again. The list updates in a minute." : `${n} tasks sent again. The list updates in a minute.`);
      await loadJobs();
    } catch {
      toast.error("Could not reach the server. Please try again.");
    }
  });

  const published = status !== "draft";

  return (
    <section aria-labelledby="reg-ops-h" className="space-y-4 rounded-xl border border-pz-outline-variant bg-pz-surface-container-low p-4">
      <h3 id="reg-ops-h" className="font-headline text-sm font-bold text-pz-on-surface">Registrations</h3>

      <div className="space-y-2">
        <h4 className={LABEL}>Google Sheet</h4>
        {sheetId ? (
          <div className="flex flex-wrap items-center gap-2">
            <FileSpreadsheet className="h-4 w-4 text-pz-primary" aria-hidden="true" />
            <span className="font-body text-sm text-pz-on-surface">Event sheet ready</span>
            <a
              href={sheetUrl(sheetId)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 font-body text-sm font-semibold text-pz-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring max-md:min-h-11"
            >
              Open sheet <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </a>
          </div>
        ) : (
          <div className="space-y-2">
            <p className={HELP}>No sheet yet. Every registration is saved in the app; the sheet is a copy for your team. If people registered before the sheet existed, press Retry now after creating it.</p>
            <Button type="button" size="sm" disabled={creating} aria-busy={creating || undefined} onClick={() => void createSheet()}>
              <FileSpreadsheet aria-hidden="true" />
              {creating ? "Creating…" : "Create event sheet"}
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-2 border-t border-pz-outline-variant pt-3">
        <h4 className={LABEL}>Sheet rows and emails</h4>
        {jobs.kind === "loading" && <p role="status" className={HELP}>Checking…</p>}
        {jobs.kind === "error" && (
          <div className="flex flex-wrap items-center gap-2">
            <p role="alert" className="font-body text-xs text-pz-on-surface">Couldn&apos;t load the background tasks.</p>
            <Button type="button" variant="outline" size="sm" onClick={() => void loadJobs()}>
              <RefreshCw aria-hidden="true" /> Check again
            </Button>
          </div>
        )}
        {jobs.kind === "ready" && (
          <JobsPanel data={jobs.data} retrying={retrying} onRetry={() => void retry()} onRefresh={() => void loadJobs()} />
        )}
      </div>

      <div className="space-y-2 border-t border-pz-outline-variant pt-3">
        <h4 className={LABEL}>Try it yourself</h4>
        <p className={HELP}>Runs the real form in test mode. Nothing real is saved: no sheet row, no promo use, emails go only to you. The form shows the published version of this page.</p>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!published}
          aria-describedby={published ? undefined : "reg-ops-publish-first"}
          onClick={() => { setTestLoaded(true); setTestOpen(true); }}
        >
          <FlaskConical aria-hidden="true" /> Register as a customer
        </Button>
        {!published && <p id="reg-ops-publish-first" className={HELP}>Publish the page first.</p>}
      </div>

      {testLoaded && (
        <Suspense fallback={<p role="status" className={HELP}>Opening the form…</p>}>
          <RegistrationModal slug={slug} open={testOpen} onClose={() => setTestOpen(false)} testMode tracking={false} />
        </Suspense>
      )}
    </section>
  );
}

function JobsPanel({ data, retrying, onRetry, onRefresh }: { data: PageJobSummary; retrying: boolean; onRetry: () => void; onRefresh: () => void }) {
  const clean = data.waiting === 0 && data.failed === 0;
  const otherTasks = data.waiting + data.failed - data.sheetWaiting - data.sheetFailed;
  const shown: JobIssue[] = data.issues.slice(0, MAX_SHOWN);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        {clean && (
          <span className={cn(PILL, "bg-pz-primary-container text-pz-on-primary-container")}>
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />All rows synced
          </span>
        )}
        {data.sheetWaiting > 0 && (
          <span className={cn(PILL, "border border-pz-warning/50 bg-pz-warning/15 text-pz-on-surface")}>{`Sheet sync: ${data.sheetWaiting} waiting`}</span>
        )}
        {data.sheetFailed > 0 && (
          <span className={cn(PILL, "bg-pz-error-container text-pz-on-error-container")}>
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />{`Sheet sync: ${data.sheetFailed} failed`}
          </span>
        )}
        {otherTasks > 0 && (
          <span className={cn(PILL, "border border-pz-outline-variant bg-pz-surface-container-high text-pz-on-surface")}>{`Emails and test runs: ${otherTasks} unfinished`}</span>
        )}
      </div>
      <p className={HELP}>Waiting rows are retried once a day. Rows that stopped after 5 tries are only retried when you press Retry now.</p>
      {shown.length > 0 && (
        <ul aria-label="Tasks that need attention" className="divide-y divide-pz-outline-variant rounded-lg border border-pz-outline-variant bg-pz-surface-container-lowest">
          {shown.map((j) => (
            <li key={j.id} className="space-y-0.5 px-3 py-2">
              <p className="font-body text-sm text-pz-on-surface">
                <span className="font-semibold">{JOB_LABEL[j.type] ?? j.type}</span>
                {` · ${j.name || j.email} · ${j.refId ?? "no reference"}`}
                {j.isTest && (
                  <span className="ml-1.5 rounded-full bg-pz-surface-container-high px-1.5 py-0.5 text-[10px] font-bold text-pz-on-surface-variant">Test</span>
                )}
              </p>
              <p className={HELP}>
                {`${j.status === "failed" ? `Stopped after ${j.attempts} tries` : `Waiting, ${j.attempts} ${j.attempts === 1 ? "try" : "tries"} so far`}${j.lastError ? `: ${j.lastError.slice(0, 160)}` : ""}`}
              </p>
            </li>
          ))}
        </ul>
      )}
      {data.issues.length > MAX_SHOWN && <p className={HELP}>{`And ${data.issues.length - MAX_SHOWN} more.`}</p>}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={(data.waiting === 0 && data.failed === 0) || retrying} aria-busy={retrying || undefined} onClick={onRetry}>
          <RotateCw aria-hidden="true" />
          {retrying ? "Retrying…" : "Retry now"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onRefresh}>
          <RefreshCw aria-hidden="true" /> Check again
        </Button>
      </div>
    </div>
  );
}
