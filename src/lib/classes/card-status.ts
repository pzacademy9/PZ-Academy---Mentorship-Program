// Pure one-line status for each class card, and the single next action. No data access.
import type { ClassSummary } from "@/lib/data/class-overview";

export type CardTone = "ok" | "warn" | "idle";
export type CardStatus = { line: string; badge: string | null; tone: CardTone };
export type NextTarget = "attendance" | "quiz" | "feedback" | null;

export function attendanceStatus(c: ClassSummary): CardStatus {
  if (c.enrolledLive <= 0) return { line: "No live students yet", badge: null, tone: "idle" };
  const pct = Math.round((c.presentCount / c.enrolledLive) * 100);
  return {
    line: `${c.presentCount} of ${c.enrolledLive} present`,
    badge: `${pct}% present`,
    tone: pct >= 50 ? "ok" : "idle",
  };
}

export function quizStatus(c: ClassSummary): CardStatus {
  if (c.quiz.saved) return { line: `Saved · ${c.quiz.players} players`, badge: "Done", tone: "ok" };
  if (c.status === "upcoming") return { line: "Not uploaded yet", badge: null, tone: "idle" };
  return { line: "Not uploaded yet", badge: "Needs attention", tone: "warn" };
}

export function feedbackStatus(c: ClassSummary): CardStatus {
  if (!c.feedbackLink) return { line: "No feedback link yet", badge: null, tone: "idle" };
  if (c.feedbackCount === 0) return { line: "No answers yet", badge: null, tone: "idle" };
  const answers = `${c.feedbackCount} ${c.feedbackCount === 1 ? "answer" : "answers"}`;
  const line = c.feedbackAvg === null ? answers : `${answers} · ${c.feedbackAvg.toFixed(1)} average`;
  return { line, badge: "Collecting responses", tone: "ok" };
}

/** The one button under "Next step". Mirrors the order of nextStep() in TodayPanel. */
export function nextAction(c: ClassSummary): { label: string; target: NextTarget } {
  if (c.status === "upcoming") return { label: "Open attendance link", target: "attendance" };
  if (!c.quiz.saved) return { label: "Upload quiz results", target: "quiz" };
  if (!c.feedbackLink) return { label: "Create feedback link", target: "feedback" };
  if (c.feedbackCount === 0) return { label: "Open feedback", target: "feedback" };
  return { label: "", target: null };
}
