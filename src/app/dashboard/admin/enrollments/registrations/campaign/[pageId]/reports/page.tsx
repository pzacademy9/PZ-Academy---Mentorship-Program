import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { listRegistrationPageOptions } from "@/lib/data/landing-registration-admin";
import { listReportRounds, loadBatchReport, reportTablesReady } from "@/lib/data/progress-reports";
import { ReportsPanel, type ReportStudentOption } from "@/components/admin/reports/ReportsPanel";
import {
  previewReportAction,
  retryReportRoundAction,
  runReportRoundAction,
  sendReportTestAction,
  startReportRoundAction,
} from "./actions";

export const metadata = { title: "Progress reports — PZ Academy" };
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASE = "/dashboard/admin/enrollments/registrations";

export default async function ProgressReportsPage({ params }: { params: Promise<{ pageId: string }> }) {
  // Duplicates the middleware role gate on purpose: defence-in-depth for every admin page.
  await requireAdminPage("classes");
  const { pageId } = await params;
  if (!UUID.test(pageId)) notFound();
  const campaign = (await listRegistrationPageOptions()).find((p) => p.id === pageId);
  if (!campaign) notFound();

  const [loaded, ready, rounds] = await Promise.all([loadBatchReport(pageId), reportTablesReady(), listReportRounds(pageId)]);
  if (!loaded) notFound();
  const { report } = loaded;
  const students: ReportStudentOption[] = report.students.map((s) => ({
    personId: s.personId,
    label: `${s.name} (${s.pzId})${s.rank !== null ? ` · #${s.rank}` : s.mode === "recorded" ? " · recorded" : " · no quiz yet"}`,
    hasEmail: s.email !== "",
    labels: loaded.optionLabels[s.personId] ?? [],
  }));
  const summary = {
    students: report.students.length,
    withEmail: report.students.filter((s) => s.email !== "").length,
    ranked: report.rankedCount,
    noQuiz: report.students.filter((s) => s.mode === "live" && !s.hasData).length,
    recorded: report.students.filter((s) => s.mode === "recorded").length,
    quizClasses: report.quizClasses,
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h1 className="font-headline text-2xl font-bold text-pz-on-surface">Progress reports</h1>
          <p className="break-words text-base text-pz-on-surface-variant">{campaign.title}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-5">
          <Link href={`${BASE}/campaign/${pageId}/sessions`} className="inline-flex min-h-12 items-center font-headline text-base font-bold text-pz-primary">
            Classes
          </Link>
          <Link href={`${BASE}/campaign/${pageId}`} className="inline-flex min-h-12 items-center font-headline text-base font-bold text-pz-primary">
            Back to registrations
          </Link>
        </div>
      </div>
      <ReportsPanel
        pageId={pageId}
        ready={ready}
        summary={summary}
        students={students}
        rounds={rounds}
        actions={{
          preview: previewReportAction,
          sendTest: sendReportTestAction,
          start: startReportRoundAction,
          run: runReportRoundAction,
          retry: retryReportRoundAction,
        }}
      />
    </div>
  );
}
