"use server";

import { requireAdmin } from "@/lib/auth/require-admin";
import {
  createReportSend,
  loadBatchReport,
  previewFor,
  retryReportFailed,
  runReportSend,
  sendReportTest,
} from "@/lib/data/progress-reports";

const NO_PERMISSION = "You do not have permission to do this.";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type Fail = { ok: false; message: string };

/** Admin only: the email one student would get, as HTML for the preview frame. */
export async function previewReportAction(pageId: string, personId: string): Promise<{ ok: true; subject: string; html: string } | Fail> {
  const auth = await requireAdmin("classes");
  if (!auth.ok) return { ok: false, message: NO_PERMISSION };
  try {
    const loaded = await loadBatchReport(String(pageId ?? ""));
    if (!loaded) return { ok: false, message: "This batch was not found." };
    const student = loaded.report.students.find((s) => s.personId === personId);
    if (!student) return { ok: false, message: "Pick a student from the list." };
    return { ok: true, ...previewFor(loaded.report, student) };
  } catch {
    return { ok: false, message: "Could not build the preview. Please try again." };
  }
}

/** Admin only: sends one student's report to the signed-in admin, marked [TEST]. */
export async function sendReportTestAction(pageId: string, personId: string): Promise<{ ok: true; to: string } | Fail> {
  const auth = await requireAdmin("classes");
  if (!auth.ok) return { ok: false, message: NO_PERMISSION };
  const to = auth.user.email ?? "";
  if (!to) return { ok: false, message: "Your account has no email." };
  try {
    const res = await sendReportTest(String(pageId ?? ""), String(personId ?? ""), to);
    return res.ok ? { ok: true, to } : res;
  } catch {
    return { ok: false, message: "The test email could not be sent." };
  }
}

/** Admin only: starts a new round for every student of the batch. */
export async function startReportRoundAction(pageId: string): Promise<{ ok: true; sendId: string; count: number } | Fail> {
  const auth = await requireAdmin("classes");
  if (!auth.ok) return { ok: false, message: NO_PERMISSION };
  try {
    return await createReportSend(String(pageId ?? ""), auth.user.id);
  } catch {
    return { ok: false, message: "Could not start sending. Nothing was sent. Please try again." };
  }
}

/** Admin only: sends the next group of a round. */
export async function runReportRoundAction(sendId: string): Promise<{ ok: true; sent: number; failed: number; pending: number } | Fail> {
  const auth = await requireAdmin("classes");
  if (!auth.ok) return { ok: false, message: NO_PERMISSION };
  if (!UUID.test(String(sendId ?? ""))) return { ok: false, message: "Reload the page and try again." };
  try {
    return { ok: true, ...(await runReportSend(sendId)) };
  } catch {
    return { ok: false, message: "Sending stopped. Press Continue to carry on." };
  }
}

/** Admin only: puts a round's failed emails back in the queue. */
export async function retryReportRoundAction(sendId: string): Promise<{ ok: true; count: number } | Fail> {
  const auth = await requireAdmin("classes");
  if (!auth.ok) return { ok: false, message: NO_PERMISSION };
  if (!UUID.test(String(sendId ?? ""))) return { ok: false, message: "Reload the page and try again." };
  try {
    return { ok: true, count: await retryReportFailed(sendId) };
  } catch {
    return { ok: false, message: "Could not retry. Please try again." };
  }
}
