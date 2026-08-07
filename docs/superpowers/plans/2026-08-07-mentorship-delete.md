# Mentorship Bookings & Applications: Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin permanently delete a mentorship booking or application from both Supabase and its Google Sheet, from the existing admin review screen.

**Architecture:** A new `DELETE` handler on the existing per-record admin API routes reads the row, deletes it from Supabase, then best-effort deletes the matching Sheet row via a new `deleteRow` GAS action — matched by email + submission-timestamp proximity (unlike the existing status-push action's email-only match, since a wrong delete is permanent). The Sheet-side response is checked and surfaced to the admin, unlike the fire-and-forget status push.

**Tech Stack:** Next.js 14 App Router API routes, Supabase (admin client), Google Apps Script (`gas/mentorship-sync/Code.gs`), React client component with `sonner` toasts and the existing shadcn `Dialog`.

## Global Constraints

- Deleting removes the row from **both** Supabase and the Sheet — Sheets remain the team's source of truth per project rules, so a Supabase-only delete would leave the Sheet cluttered with the same junk this feature exists to clear.
- Sheet row match: email (case-insensitive, trimmed) **and** Timestamp within 5 minutes of the Supabase row's `created_at`. Zero or multiple matches → refuse, return an error, never guess.
- The Sheet row is deleted outright (`sheet.deleteRow`), not cleared or marked.
- No email is sent on delete.
- Delete is available regardless of the record's current status.
- No new automated tests — mirrors the existing untested GAS/sync-client/API-route siblings (`applyStatus`, `pushMentorshipStatusToSheet`, the `PATCH` routes) already in this codebase; verified manually.

---

### Task 1: GAS `deleteRow` action

**Files:**
- Modify: `gas/mentorship-sync/Code.gs`

**Interfaces:**
- Consumes: existing `headerIndex_(headerRow, headerText)`, `jsonResponse_(obj)`, `PropertiesService` properties `BOOKING_SHEET_ID`/`APPLICATION_SHEET_ID`/`BOOKING_COL_EMAIL`/`APPLICATION_COL_EMAIL` (all already set).
- Produces: `doPost` dispatches `action: "deleteRow"` (payload `{ secret, action: "deleteRow", sheetKind: "booking" | "application", email: string, timestamp: string }`) to a new `handleDeleteRow_(body, props)`, returning `{ status: "success", message: string }` or `{ status: "error", message: string }`. Task 2's client calls this over HTTP — no in-process import.

- [ ] **Step 1: Add the dispatch line in `doPost`**

In `gas/mentorship-sync/Code.gs`, find:

```js
  if (body.action === "applyStatus") {
    return handleApplyStatus_(body, props);
  }

  return jsonResponse_({ status: "error", message: "Unknown action: " + body.action });
```

Replace with:

```js
  if (body.action === "applyStatus") {
    return handleApplyStatus_(body, props);
  }

  if (body.action === "deleteRow") {
    return handleDeleteRow_(body, props);
  }

  return jsonResponse_({ status: "error", message: "Unknown action: " + body.action });
```

- [ ] **Step 2: Add `handleDeleteRow_`**

Directly below the closing brace of `handleApplyStatus_` (after `displayValueForBookingStatus_`'s preceding function ends — i.e. right after `handleApplyStatus_`'s own closing `}`), add:

```js
/**
 * Permanently deletes the Sheet row matching sheetKind/email whose
 * Timestamp falls within 5 minutes of `timestamp` (the Supabase row's
 * created_at) — tighter than handleApplyStatus_'s email-only match because
 * a wrong row delete, unlike a wrong status write, can't be corrected by a
 * later edit. Refuses (returns an error) rather than guessing if zero or
 * more than one row qualifies.
 */
function handleDeleteRow_(body, props) {
  if (!body.sheetKind || !body.email || !body.timestamp) {
    return jsonResponse_({ status: "error", message: "Missing sheetKind, email, or timestamp" });
  }

  try {
    const sheetId =
      body.sheetKind === "booking"
        ? props.getProperty("BOOKING_SHEET_ID")
        : props.getProperty("APPLICATION_SHEET_ID");
    const sheet = SpreadsheetApp.openById(sheetId).getSheets()[0];
    const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const colEmailProp = body.sheetKind === "booking" ? "BOOKING_COL_EMAIL" : "APPLICATION_COL_EMAIL";
    const emailCol = headerIndex_(headerRow, props.getProperty(colEmailProp));
    const timestampCol = headerIndex_(headerRow, "Timestamp");
    if (emailCol === -1 || timestampCol === -1) {
      return jsonResponse_({ status: "error", message: "Could not resolve email or Timestamp column" });
    }

    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
      return jsonResponse_({ status: "error", message: "No data rows" });
    }

    const targetTime = new Date(body.timestamp).getTime();
    const TOLERANCE_MS = 5 * 60 * 1000;
    const emails = sheet.getRange(2, emailCol + 1, lastRow - 1, 1).getValues();
    const timestamps = sheet.getRange(2, timestampCol + 1, lastRow - 1, 1).getValues();

    const matchedRows = [];
    for (let i = 0; i < emails.length; i++) {
      const rowEmail = String(emails[i][0]).trim().toLowerCase();
      if (rowEmail !== String(body.email).trim().toLowerCase()) continue;

      const cellValue = timestamps[i][0];
      const cellTime = cellValue instanceof Date ? cellValue.getTime() : new Date(cellValue).getTime();
      if (Math.abs(cellTime - targetTime) <= TOLERANCE_MS) {
        matchedRows.push(i + 2); // +2: 0-index -> 1-index, +1 for header row
      }
    }

    if (matchedRows.length === 0) {
      return jsonResponse_({ status: "error", message: "No row found within the timestamp tolerance" });
    }
    if (matchedRows.length > 1) {
      return jsonResponse_({ status: "error", message: "Multiple matching rows found — refusing to guess" });
    }

    sheet.deleteRow(matchedRows[0]);
    return jsonResponse_({ status: "success", message: "Row deleted" });
  } catch (err) {
    return jsonResponse_({ status: "error", message: String(err) });
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add gas/mentorship-sync/Code.gs
git commit -m "feat(gas): add deleteRow action to mentorship-sync bridge"
```

No automated test — `.gs` files have no test runner in this repo (same as every existing handler in this file). Manual deployment and end-to-end verification happens in Task 6.

---

### Task 2: `pushMentorshipDelete` client helper

**Files:**
- Modify: `src/lib/gas/mentorship-sync-client.ts`

**Interfaces:**
- Consumes: `process.env.MENTORSHIP_SYNC_URL`, `process.env.MENTORSHIP_SYNC_SECRET` (both already set).
- Produces: `pushMentorshipDelete(params: { sheetKind: "booking" | "application"; email: string; timestamp: string }): Promise<boolean>` — resolves `true` only if the GAS response is `{ status: "success" }`; resolves `false` (never throws) on missing env vars, network failure, or a GAS-side error response. Task 3 calls this.

- [ ] **Step 1: Add the function**

In `src/lib/gas/mentorship-sync-client.ts`, below the existing `pushMentorshipStatusToSheet`, add:

```ts
/**
 * Permanently deletes the matching Sheet row for a deleted booking/
 * application. Unlike pushMentorshipStatusToSheet, this checks the GAS
 * response — a delete is destructive and rarer than a status change, so the
 * extra round-trip is worth surfacing a real failure to the admin instead
 * of silently leaving the Sheet row behind.
 */
export async function pushMentorshipDelete(params: {
  sheetKind: "booking" | "application";
  email: string;
  timestamp: string;
}): Promise<boolean> {
  const url = process.env.MENTORSHIP_SYNC_URL;
  const secret = process.env.MENTORSHIP_SYNC_SECRET;
  if (!url || !secret) {
    console.warn("[mentorship-sync] delete skipped: MENTORSHIP_SYNC_URL or MENTORSHIP_SYNC_SECRET not set");
    return false;
  }

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        secret,
        action: "deleteRow",
        sheetKind: params.sheetKind,
        email: params.email,
        timestamp: params.timestamp,
      }),
    });
    const json: { status?: string } = await res.json();
    return json.status === "success";
  } catch (error) {
    console.error(`[mentorship-sync] failed to delete row for ${params.email}:`, error);
    return false;
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/gas/mentorship-sync-client.ts
git commit -m "feat: add pushMentorshipDelete GAS client helper"
```

---

### Task 3: `deleteBooking` / `deleteApplication` data functions

**Files:**
- Modify: `src/lib/data/mentorship-bookings.ts`
- Modify: `src/lib/data/mentorship-applications.ts`

**Interfaces:**
- Consumes: `createAdminSupabase` (existing import in both files), `pushMentorshipDelete` (Task 2, add to both files' existing `import { pushMentorshipStatusToSheet } from "@/lib/gas/mentorship-sync-client";` line).
- Produces: `deleteBooking(bookingId: string): Promise<DeleteBookingResult>` where `DeleteBookingResult = { ok: true; sheetDeleted: boolean } | { ok: false; reason: "not-found" | "db-error" }`; `deleteApplication(applicationId: string): Promise<DeleteApplicationResult>`, same shape. Task 4's routes call these.

- [ ] **Step 1: Update the import in `mentorship-bookings.ts`**

Change:

```ts
import { pushMentorshipStatusToSheet } from "@/lib/gas/mentorship-sync-client";
```

to:

```ts
import { pushMentorshipStatusToSheet, pushMentorshipDelete } from "@/lib/gas/mentorship-sync-client";
```

- [ ] **Step 2: Add `deleteBooking` to `mentorship-bookings.ts`**

At the end of the file, after `applyBookingStatus`, add:

```ts
export type DeleteBookingResult =
  | { ok: true; sheetDeleted: boolean }
  | { ok: false; reason: "not-found" | "db-error" };

/**
 * Deletes the booking from Supabase first — that's the authoritative delete
 * from the admin's perspective. The Sheet-side delete is attempted
 * regardless of whether the Supabase delete already succeeded (it always
 * has, by this point), and its outcome is reported back so the admin knows
 * if the Sheet row needs manual cleanup.
 */
export async function deleteBooking(bookingId: string): Promise<DeleteBookingResult> {
  const admin = createAdminSupabase();
  const { data: existing } = await admin
    .from("mentorship_bookings")
    .select("id, email, created_at")
    .eq("id", bookingId)
    .maybeSingle();

  if (!existing) return { ok: false, reason: "not-found" };

  const { error } = await admin.from("mentorship_bookings").delete().eq("id", bookingId);
  if (error) return { ok: false, reason: "db-error" };

  const sheetDeleted = await pushMentorshipDelete({
    sheetKind: "booking",
    email: existing.email,
    timestamp: existing.created_at,
  });

  return { ok: true, sheetDeleted };
}
```

- [ ] **Step 3: Update the import in `mentorship-applications.ts`**

Same change as Step 1, in `mentorship-applications.ts`:

```ts
import { pushMentorshipStatusToSheet, pushMentorshipDelete } from "@/lib/gas/mentorship-sync-client";
```

- [ ] **Step 4: Add `deleteApplication` to `mentorship-applications.ts`**

At the end of the file, after `applyApplicationStatus`, add:

```ts
export type DeleteApplicationResult =
  | { ok: true; sheetDeleted: boolean }
  | { ok: false; reason: "not-found" | "db-error" };

/** Mirrors deleteBooking in mentorship-bookings.ts — see its comment. */
export async function deleteApplication(applicationId: string): Promise<DeleteApplicationResult> {
  const admin = createAdminSupabase();
  const { data: existing } = await admin
    .from("mentor_applications")
    .select("id, email, created_at")
    .eq("id", applicationId)
    .maybeSingle();

  if (!existing) return { ok: false, reason: "not-found" };

  const { error } = await admin.from("mentor_applications").delete().eq("id", applicationId);
  if (error) return { ok: false, reason: "db-error" };

  const sheetDeleted = await pushMentorshipDelete({
    sheetKind: "application",
    email: existing.email,
    timestamp: existing.created_at,
  });

  return { ok: true, sheetDeleted };
}
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 6: Commit**

```bash
git add src/lib/data/mentorship-bookings.ts src/lib/data/mentorship-applications.ts
git commit -m "feat: add deleteBooking/deleteApplication data functions"
```

---

### Task 4: `DELETE` API routes

**Files:**
- Modify: `src/app/api/admin/mentorship/bookings/[id]/route.ts`
- Modify: `src/app/api/admin/mentorship/applications/[id]/route.ts`

**Interfaces:**
- Consumes: `requireAdmin` (existing import in both files), `deleteBooking`/`deleteApplication` (Task 3).
- Produces: `DELETE /api/admin/mentorship/bookings/[id]` and `DELETE /api/admin/mentorship/applications/[id]`, both admin-gated, returning `{ ok: true, sheetDeleted: boolean }` (200), `{ error: string }` (404 not found / 500 db error), or the existing 401/403 from `requireAdmin`. Task 5's UI calls these.

- [ ] **Step 1: Add `DELETE` to the bookings route**

In `src/app/api/admin/mentorship/bookings/[id]/route.ts`, change the import line:

```ts
import { applyBookingStatus } from "@/lib/data/mentorship-bookings";
```

to:

```ts
import { applyBookingStatus, deleteBooking } from "@/lib/data/mentorship-bookings";
```

Then, at the end of the file, after the existing `PATCH` function's closing brace, add:

```ts

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const result = await deleteBooking(id);

  if (!result.ok) {
    if (result.reason === "not-found") return NextResponse.json({ error: "Booking not found" }, { status: 404 });
    return NextResponse.json({ error: "Could not delete booking" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sheetDeleted: result.sheetDeleted });
}
```

- [ ] **Step 2: Add `DELETE` to the applications route**

In `src/app/api/admin/mentorship/applications/[id]/route.ts`, change the import line:

```ts
import { applyApplicationStatus } from "@/lib/data/mentorship-applications";
```

to:

```ts
import { applyApplicationStatus, deleteApplication } from "@/lib/data/mentorship-applications";
```

Then, at the end of the file, after the existing `PATCH` function's closing brace, add:

```ts

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const { id } = await params;
  const result = await deleteApplication(id);

  if (!result.ok) {
    if (result.reason === "not-found") return NextResponse.json({ error: "Application not found" }, { status: 404 });
    return NextResponse.json({ error: "Could not delete application" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sheetDeleted: result.sheetDeleted });
}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/api/admin/mentorship/bookings/[id]/route.ts src/app/api/admin/mentorship/applications/[id]/route.ts
git commit -m "feat: add DELETE endpoints for mentorship bookings/applications"
```

---

### Task 5: Delete button + confirmation dialog in the admin UI

**Files:**
- Modify: `src/components/admin/mentorship/MentorshipReviewActions.tsx`

**Interfaces:**
- Consumes: existing `Dialog`/`DialogContent`/`DialogDescription`/`DialogFooter`/`DialogHeader`/`DialogTitle` imports, existing `cn` util, `toast` from `sonner`, `useRouter`, `useTransition`. Adds `Trash2` from `lucide-react` (already a project dependency — `CheckCircle2`/`XCircle` come from the same package in this file).
- Produces: no new exports — `MentorshipReviewActions` keeps its existing `{ kind, id, status, name }` props signature; the Delete button and its dialog are internal to this component, using a new `DELETE /api/admin/mentorship/{bookings|applications}/{id}` call.

- [ ] **Step 1: Replace the file**

The existing "primary"/"secondary" `open` state and its `Dialog` handle Confirm/Cancel (bookings) or Approve/Reject (applications). Delete is a separate concern — it's not a status transition, has no reason field, and needs its own confirmation copy — so it gets its own `deleteOpen` boolean state and its own `Dialog`, rather than overloading the existing `Action` union (which is keyed to `targetStatus`, a concept delete doesn't have).

Replace the full contents of `src/components/admin/mentorship/MentorshipReviewActions.tsx` with:

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, XCircle, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Action = "primary" | "secondary";

interface ActionConfig {
  label: string;
  icon: typeof CheckCircle2;
  button: string;
  confirmTitle: string;
  confirmBody: string;
}

const BOOKING_ACTIONS: Record<Action, ActionConfig> = {
  primary: {
    label: "Confirm",
    icon: CheckCircle2,
    button: "bg-pz-primary text-pz-on-primary hover:bg-pz-on-primary-container",
    confirmTitle: "Confirm this booking?",
    confirmBody: "The student is emailed a confirmation.",
  },
  secondary: {
    label: "Cancel",
    icon: XCircle,
    button: "border border-pz-danger/40 text-pz-danger hover:bg-pz-danger/10",
    confirmTitle: "Cancel this booking?",
    confirmBody: "The student is emailed the reason below.",
  },
};

const APPLICATION_ACTIONS: Record<Action, ActionConfig> = {
  primary: {
    label: "Approve",
    icon: CheckCircle2,
    button: "bg-pz-primary text-pz-on-primary hover:bg-pz-on-primary-container",
    confirmTitle: "Approve this application?",
    confirmBody: "The applicant is emailed a confirmation.",
  },
  secondary: {
    label: "Reject",
    icon: XCircle,
    button: "border border-pz-danger/40 text-pz-danger hover:bg-pz-danger/10",
    confirmTitle: "Reject this application?",
    confirmBody: "The applicant is emailed the reason below.",
  },
};

export function MentorshipReviewActions({
  kind,
  id,
  status,
  name,
}: {
  kind: "booking" | "application";
  id: string;
  status: string;
  name: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState<Action | null>(null);
  const [reason, setReason] = useState("");
  const [deleteOpen, setDeleteOpen] = useState(false);

  const actions = kind === "booking" ? BOOKING_ACTIONS : APPLICATION_ACTIONS;
  const targetStatus: Record<Action, string> =
    kind === "booking" ? { primary: "confirmed", secondary: "cancelled" } : { primary: "approved", secondary: "rejected" };
  const recordLabel = kind === "booking" ? "booking" : "application";
  const apiPath = `/api/admin/mentorship/${kind === "booking" ? "bookings" : "applications"}/${id}`;

  const config = open ? actions[open] : null;
  const isAvailable = (action: Action) => targetStatus[action] !== status;

  function submit() {
    if (!open) return;
    const action = open;

    startTransition(async () => {
      const res = await fetch(apiPath, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: targetStatus[action],
          reason: action === "secondary" ? reason.trim() || undefined : undefined,
        }),
      });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(payload?.error ?? "Could not update this record.");
        return;
      }

      setOpen(null);
      setReason("");
      toast.success(`${name} — ${actions[action].label.toLowerCase()} applied.`);
      router.refresh();
    });
  }

  function submitDelete() {
    startTransition(async () => {
      const res = await fetch(apiPath, { method: "DELETE" });

      if (!res.ok) {
        const payload = (await res.json().catch(() => null)) as { error?: string } | null;
        toast.error(payload?.error ?? `Could not delete this ${recordLabel}.`);
        return;
      }

      const payload = (await res.json().catch(() => null)) as { sheetDeleted?: boolean } | null;
      setDeleteOpen(false);

      if (payload?.sheetDeleted) {
        toast.success(`${name} deleted.`);
      } else {
        toast.warning(`${name} deleted from the database, but the Sheet row needs manual cleanup.`);
      }
      router.refresh();
    });
  }

  return (
    <>
      <div className="flex items-center gap-1.5">
        {(["primary", "secondary"] as Action[]).filter(isAvailable).map((action) => {
          const { label, icon: Icon, button } = actions[action];
          return (
            <button
              key={action}
              type="button"
              onClick={() => {
                setReason("");
                setOpen(action);
              }}
              disabled={isPending}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-headline font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed",
                button,
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setDeleteOpen(true)}
          disabled={isPending}
          title={`Delete this ${recordLabel}`}
          className="inline-flex items-center justify-center rounded-lg p-1.5 text-pz-danger hover:bg-pz-danger/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <Dialog open={open !== null} onOpenChange={(next) => !next && setOpen(null)}>
        <DialogContent className="sm:max-w-md">
          {config && (
            <>
              <DialogHeader>
                <DialogTitle className="font-headline text-pz-on-surface">{config.confirmTitle}</DialogTitle>
                <DialogDescription className="font-body text-pz-on-surface-variant">{name}</DialogDescription>
              </DialogHeader>

              <p className="font-body text-sm text-pz-on-surface-variant">{config.confirmBody}</p>

              {open === "secondary" && (
                <div className="space-y-1.5">
                  <label htmlFor="mentorship-reason" className="font-headline text-sm font-semibold text-pz-on-surface">
                    Reason <span className="font-body font-normal text-pz-on-surface-variant">(optional)</span>
                  </label>
                  <textarea
                    id="mentorship-reason"
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    maxLength={500}
                    placeholder="Included in the email…"
                    className="w-full rounded-lg border border-pz-outline-variant bg-pz-surface-container-lowest px-3 py-2.5 text-sm font-body text-pz-on-surface placeholder:text-pz-on-surface-variant/50 focus:outline-none focus:ring-2 focus:ring-pz-primary/20 focus:border-pz-primary resize-none"
                  />
                </div>
              )}

              <DialogFooter className="gap-2 sm:gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(null)}
                  disabled={isPending}
                  className="px-4 py-2.5 rounded-lg font-headline text-sm font-semibold bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submit}
                  disabled={isPending}
                  className="px-4 py-2.5 rounded-lg font-headline text-sm font-semibold bg-pz-primary text-pz-on-primary hover:bg-pz-on-primary-container transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isPending ? "Working…" : config.label}
                </button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-headline text-pz-on-surface">
              Delete this {recordLabel}?
            </DialogTitle>
            <DialogDescription className="font-body text-pz-on-surface-variant">{name}</DialogDescription>
          </DialogHeader>

          <p className="font-body text-sm text-pz-on-surface-variant">
            This permanently removes it from the database and the Google Sheet. This cannot be undone.
          </p>

          <DialogFooter className="gap-2 sm:gap-2">
            <button
              type="button"
              onClick={() => setDeleteOpen(false)}
              disabled={isPending}
              className="px-4 py-2.5 rounded-lg font-headline text-sm font-semibold bg-pz-surface-container-high text-pz-on-surface-variant hover:bg-pz-surface-variant transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={submitDelete}
              disabled={isPending}
              className="px-4 py-2.5 rounded-lg font-headline text-sm font-semibold bg-pz-danger text-white hover:bg-pz-danger/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isPending ? "Working…" : "Delete"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no new errors.

- [ ] **Step 3: Run the existing test suite**

Run: `npx vitest run`
Expected: all existing tests still pass (this component has no test file; this confirms nothing else broke).

- [ ] **Step 4: Commit**

```bash
git add src/components/admin/mentorship/MentorshipReviewActions.tsx
git commit -m "feat: add delete action to mentorship admin review screen"
```

---

### Task 6: Manual deployment + end-to-end verification

This task has no code changes — it deploys Task 1's GAS change and walks the delete flow by hand. Do not skip it: Tasks 2–5 depend on the deployed GAS code to actually work.

- [ ] **Step 1: Redeploy the mentorship-sync GAS project**

Open the mentorship-sync Apps Script project (the one with `MENTORSHIP_SYNC_SECRET`/`BOOKING_SHEET_ID`/etc. Script Properties already set). Paste in the updated `gas/mentorship-sync/Code.gs`. Deploy → Manage deployments → edit the existing deployment → New version → Deploy. The `/exec` URL does not change, so `MENTORSHIP_SYNC_URL` in `.env.local` needs no update.

- [ ] **Step 2: Start the dev server**

Run: `node node_modules/next/dist/bin/next dev` (not `npm run dev` — this repo's path contains `&`, which breaks `npm run`).
Expected: clean start, no compile errors.

- [ ] **Step 3: Delete a test booking**

As an admin, go to `/dashboard/admin/mentorship`, Bookings tab. Click the trash icon on a test booking, confirm in the dialog. Confirm:
- The row disappears from the admin list immediately.
- `select * from mentorship_bookings where id = '<the deleted id>';` returns no row.
- The matching row is gone from the Booking Sheet.
- The toast says "deleted" (not the Sheet-cleanup warning) — if it shows the warning instead, check the GAS Executions log for the `deleteRow` call's actual error before concluding the feature is broken.

- [ ] **Step 4: Delete a test application**

Same as Step 3, on the Applications tab, against a test application. Confirm both the Supabase row and the Applications Sheet row are gone.

- [ ] **Step 5: Confirm the "refuse to guess" path**

Submit two test bookings (or applications) using the same email address within a few minutes of each other, so the Sheet has two rows with that email close together in time — this recreates the case `handleDeleteRow_` is meant to refuse. Attempt to delete one from the admin screen. Confirm the toast shows the Sheet-cleanup warning (not a plain success) — that's `matchedRows.length !== 1` correctly declining to delete either row rather than guessing.
