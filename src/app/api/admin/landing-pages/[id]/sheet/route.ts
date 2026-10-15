// src/app/api/admin/landing-pages/[id]/sheet/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { isPageId } from "@/lib/validations/landing";
import { getPageSheetInfo, saveEventSheet } from "@/lib/data/landing-event-sheet";
import { createEventSheet } from "@/lib/gas/event-sheet-client";
import { drainDueJobs, requeueSheetAppendJobs } from "@/lib/data/landing-jobs";
import { runInBackground } from "@/lib/landing/registration/background";

export const maxDuration = 60;

const PREFIX_RE = /^[A-Z0-9]{2,8}$/;

/**
 * Creates the event's Google Sheet (tab "Form Responses 1", headers A->W) and its
 * voucher folder via Apps Script, then stores sheet_id / drive_folder_id / ref_prefix.
 * Refuses when the page already has a sheet, so a retry never makes a second one.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;
  // Part 0 L2: a malformed id is "not found" after the auth gate, before any query.
  if (!isPageId(id)) return NextResponse.json({ error: "Page not found" }, { status: 404 });

  const page = await getPageSheetInfo(id).catch(() => undefined);
  if (page === undefined) return NextResponse.json({ error: "Could not load the page." }, { status: 500 });
  if (!page) return NextResponse.json({ error: "Page not found" }, { status: 404 });
  if (page.sheetId) {
    return NextResponse.json({ error: "This page already has a sheet.", sheetId: page.sheetId }, { status: 409 });
  }

  const refPrefix = (page.refPrefix ?? page.draftRefPrefix).trim().toUpperCase();
  if (!PREFIX_RE.test(refPrefix)) {
    return NextResponse.json(
      { error: "Set a reference prefix (2 to 8 letters or numbers, for example PPC) in the registration settings first." },
      { status: 422 },
    );
  }

  // The slug suffix keeps two pages with the same title from sharing one voucher folder.
  const created = await createEventSheet(page.title, `${page.title} - ${page.slug}`);
  if (!created.ok) {
    return NextResponse.json({ error: `Could not create the sheet: ${created.message}` }, { status: 502 });
  }

  const saved = await saveEventSheet(id, { sheetId: created.sheetId, driveFolderId: created.driveFolderId, refPrefix });
  if (!saved.ok) {
    if (saved.reason === "already-set") {
      return NextResponse.json(
        { error: "Another sheet was created for this page at the same moment. Delete the extra one in Drive.", sheetId: created.sheetId },
        { status: 409 },
      );
    }
    return NextResponse.json({ error: "The sheet was created but could not be saved. Try again." }, { status: 500 });
  }

  // Registrations made before the sheet existed had their sheet_append job marked done without
  // writing anything. Send them all now (Apps Script dedupes on Ref ID + email, so repeats are safe).
  // A failure here must never hide the sheet that was just created.
  try {
    await requeueSheetAppendJobs(id);
    runInBackground(drainDueJobs(25));
  } catch {
    console.error("[landing-sheet] could not requeue sheet rows for page", id);
  }

  return NextResponse.json(
    {
      sheetId: created.sheetId,
      driveFolderId: created.driveFolderId,
      refPrefix,
      sheetUrl: `https://docs.google.com/spreadsheets/d/${created.sheetId}/edit`,
    },
    { status: 201 },
  );
}
