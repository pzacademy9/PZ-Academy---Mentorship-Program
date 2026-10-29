import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdminPage } from "@/lib/auth/require-admin";
import { listRegistrationPageOptions } from "@/lib/data/landing-registration-admin";
import { getSessionById } from "@/lib/data/attendance";
import { getBatchLeaderboard, getSessionQuiz, listQuizWithoutCheckin } from "@/lib/data/quiz-results";
import { QuizScreen } from "@/components/admin/quiz/QuizScreen";

export const metadata = { title: "Quiz results — PZ Academy" };

// Results change from this page: never serve a cached copy.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASE = "/dashboard/admin/enrollments/registrations";

export default async function AdminQuizPage({ params }: { params: Promise<{ pageId: string; sessionId: string }> }) {
  // Duplicates the middleware role gate on purpose: defence-in-depth for every admin page.
  await requireAdminPage();

  const { pageId, sessionId } = await params;
  if (!UUID.test(pageId) || !UUID.test(sessionId)) notFound();
  const pages = await listRegistrationPageOptions();
  const campaign = pages.find((p) => p.id === pageId);
  const session = await getSessionById(sessionId);
  if (!campaign || !session || session.page_id !== pageId) notFound();

  const [quiz, noCheckin, leaderboard] = await Promise.all([
    getSessionQuiz(sessionId),
    listQuizWithoutCheckin(sessionId),
    getBatchLeaderboard(pageId),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-headline text-xl font-bold text-pz-on-surface">Quiz results: session {session.number}</h1>
          <p className="text-sm text-pz-on-surface-variant">{campaign.title}</p>
        </div>
        <Link
          href={`${BASE}/campaign/${pageId}/sessions`}
          className="inline-flex items-center max-md:min-h-11 text-xs font-headline font-bold text-pz-primary hover:text-pz-on-primary-container dark:hover:text-pz-primary-fixed transition-colors"
        >
          Back to classes
        </Link>
      </div>
      <QuizScreen
        pageId={pageId}
        sessionId={sessionId}
        sessionTitle={session.title}
        startsAt={session.starts_at}
        saved={{ maxScore: quiz.maxScore, fileName: quiz.fileName, savedAt: quiz.savedAt, rows: quiz.rows }}
        noCheckin={noCheckin}
        leaderboard={leaderboard}
      />
    </div>
  );
}
