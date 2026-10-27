"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getSessionById } from "@/lib/data/attendance";
import {
  getBatchLeaderboard,
  getSessionQuiz,
  listQuizWithoutCheckin,
  markPresentFromQuiz,
  prepareReview,
  saveQuizResults,
  type LeaderRow,
  type SessionQuizRow,
} from "@/lib/data/quiz-results";
import { MAX_BYTES, readKahootFile } from "@/lib/quiz/kahoot-parse";
import { decisionsFromChoices, resolveReview, type Choices, type ReviewBase, type Summary } from "@/lib/quiz/review";

const NOT_ALLOWED = "You do not have permission to do this.";
const FAILED = "Something went wrong. Please try again.";
const NO_SESSION = "That session was not found";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

function refresh(pageId: string) {
  revalidatePath(`/dashboard/admin/enrollments/registrations/campaign/${pageId}/sessions`);
}

/** Admin check, ids shape check, and "this session belongs to this batch". */
async function guard(pageId: string, sessionId: string): Promise<{ ok: true; adminId: string } | { ok: false; message: string }> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, message: NOT_ALLOWED };
  if (!isUuid(pageId) || !isUuid(sessionId)) return { ok: false, message: NO_SESSION };
  const session = await getSessionById(sessionId);
  if (!session || session.page_id !== pageId) return { ok: false, message: NO_SESSION };
  return { ok: true, adminId: auth.user.id };
}

export type UploadResult =
  | { ok: true; base: ReviewBase; prior: Choices; skipped: number; fileName: string; sheetName: string }
  | { ok: false; message: string };

export async function uploadKahootReport(pageId: string, sessionId: string, formData: FormData): Promise<UploadResult> {
  try {
    const g = await guard(pageId, sessionId);
    if (!g.ok) return g;
    const file = formData.get("file");
    if (!(file instanceof File)) return { ok: false, message: "Please choose the Kahoot report file." };
    if (file.size > MAX_BYTES) return { ok: false, message: "The file is too big (5 MB is the limit)." };
    const parsed = await readKahootFile(file.name, new Uint8Array(await file.arrayBuffer()));
    if (!parsed.ok) return parsed;
    const prepared = await prepareReview(sessionId, parsed.rows, parsed.questionCount);
    if (!prepared) return { ok: false, message: NO_SESSION };
    return { ok: true, base: prepared.base, prior: prepared.base.prior, skipped: parsed.skipped, fileName: file.name, sheetName: parsed.sheetName };
  } catch {
    return { ok: false, message: FAILED };
  }
}

export type SaveReviewInput = { base: ReviewBase; choices: Choices; maxScore: number; fileName: string };
export type SaveReviewResult =
  | { ok: true; saved: number; summary: Summary; noCheckin: number; notes: string[] }
  | { ok: false; message: string };

export async function saveReview(pageId: string, sessionId: string, input: SaveReviewInput): Promise<SaveReviewResult> {
  try {
    const g = await guard(pageId, sessionId);
    if (!g.ok) return g;
    if (!input || !Array.isArray(input.base?.rows) || typeof input.base.people !== "object" || !input.choices) {
      return { ok: false, message: FAILED };
    }
    // The server decides whether the review is finished; the screen cannot skip the undecided check.
    const resolved = resolveReview(input.base, input.choices);
    if (!resolved.ok) {
      return { ok: false, message: `${resolved.undecided} ${resolved.undecided === 1 ? "problem is" : "problems are"} still waiting for your choice.` };
    }
    const fileName = typeof input.fileName === "string" ? input.fileName.slice(0, 200) : "";
    const saved = await saveQuizResults(sessionId, {
      maxScore: input.maxScore,
      fileName,
      rows: resolved.rows,
      decisions: decisionsFromChoices(input.base, input.choices),
    });
    if (!saved.ok) return saved;
    refresh(pageId);
    const noCheckin = (await listQuizWithoutCheckin(sessionId)).length;
    return { ok: true, saved: saved.saved, summary: resolved.summary, noCheckin, notes: saved.notes };
  } catch {
    return { ok: false, message: FAILED };
  }
}

export async function markFromQuiz(pageId: string, sessionId: string, personId: string): Promise<{ ok: boolean; message?: string }> {
  try {
    const g = await guard(pageId, sessionId);
    if (!g.ok) return g;
    if (!isUuid(personId)) return { ok: false, message: "That student was not found" };
    const r = await markPresentFromQuiz(sessionId, personId, g.adminId);
    if (r.ok) refresh(pageId);
    return r;
  } catch {
    return { ok: false, message: FAILED };
  }
}

export type QuizPanelData = {
  saved: boolean;
  maxScore: number | null;
  fileName: string | null;
  savedAt: string | null;
  rows: SessionQuizRow[];
  noCheckin: { personId: string; pzId: string; name: string }[];
  leaderboard: { rows: LeaderRow[]; sessionCount: number };
};

export async function loadQuizPanel(pageId: string, sessionId: string): Promise<{ ok: true; data: QuizPanelData } | { ok: false; message: string }> {
  try {
    const g = await guard(pageId, sessionId);
    if (!g.ok) return g;
    const [quiz, noCheckin, leaderboard] = await Promise.all([
      getSessionQuiz(sessionId),
      listQuizWithoutCheckin(sessionId),
      getBatchLeaderboard(pageId),
    ]);
    return { ok: true, data: { ...quiz, noCheckin, leaderboard } };
  } catch {
    return { ok: false, message: FAILED };
  }
}
