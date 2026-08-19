# Feedback Audit Log Viewer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give admins a read-only page listing `feedback_audit_log`'s history — written by every feedback-domain mutation today, read by nothing.

**Architecture:** A pure `describeAuditAction` lookup (label/filter-category/color-tone per action string) backs both a new DB-read function and a new client component that filters client-side over an already-fetched, capped row set. Ported from a Stitch screen generated this session; only the page's actual content is used, not its generic sidebar/topbar scaffold.

**Tech Stack:** Next.js App Router (Server Component + one client component), Supabase (service-role client, named-FK join for actor name), Vitest, Tailwind (`pz-*` M3 dashboard tokens — this is an admin dashboard screen).

**Spec:** [docs/superpowers/specs/2026-08-19-feedback-audit-log-viewer-design.md](../specs/2026-08-19-feedback-audit-log-viewer-design.md)

## Global Constraints

- All 17 real `action` strings (verified by direct grep of `src/lib/data/feedback-*.ts`, not the earlier under-count of 14) must appear in `describeAuditAction`'s lookup table, with the exact labels/categories/tones from the spec's table.
- An unrecognized action string must never throw — falls back to `{ label: action, category: "sessions", tone: "neutral" }`.
- `listFeedbackAuditLog` is capped at `.limit(500)`, ordered `created_at desc`. No pagination UI.
- `font-label` is never used for the ported UI — badges/tabs use `font-headline font-bold`, matching `SessionDetailClient.tsx`'s existing Hidden/Featured pill convention.
- No migration, no `database.types.ts` edit — `feedback_audit_log`'s types and its FK relationship to `profiles` already exist.

---

### Task 1: `describeAuditAction` pure function + tests

**Files:**
- Modify: `src/lib/data/feedback-audit.ts` (currently only `logFeedbackAudit`, 20 lines)
- Test: `tests/feedback-audit.test.ts` (new file)

**Interfaces:**
- Produces: `AuditCategory`, `AuditTone`, `AuditActionInfo` types and `describeAuditAction(action: string): AuditActionInfo`, all exported from `src/lib/data/feedback-audit.ts`. Consumed by Task 2 (indirectly, via the type) and Task 3 (`AuditLogClient.tsx`).

- [ ] **Step 1: Write the failing test**

Create `tests/feedback-audit.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { describeAuditAction, type AuditActionInfo } from "@/lib/data/feedback-audit";

const EXPECTED: Record<string, AuditActionInfo> = {
  createFeedbackSession: { label: "Created session", category: "sessions", tone: "create" },
  updateFeedbackSessionDetails: { label: "Updated session details", category: "sessions", tone: "neutral" },
  updateFeedbackSessionQuestions: { label: "Updated session questions", category: "sessions", tone: "neutral" },
  setFeedbackSessionStatus: { label: "Changed session status", category: "sessions", tone: "neutral" },
  setFeedbackSessionMentor: { label: "Changed session mentor", category: "sessions", tone: "neutral" },
  deleteFeedbackSession: { label: "Deleted session", category: "sessions", tone: "destructive" },
  setCoverImage: { label: "Set cover image", category: "sessions", tone: "neutral" },
  removeCoverImage: { label: "Removed cover image", category: "sessions", tone: "neutral" },
  createFeedbackProgram: { label: "Created program", category: "programs", tone: "create" },
  deleteFeedbackProgram: { label: "Deleted program", category: "programs", tone: "destructive" },
  deleteResponse: { label: "Deleted response", category: "responses", tone: "destructive" },
  showResponse: { label: "Showed response", category: "responses", tone: "moderate" },
  hideResponse: { label: "Hid response", category: "responses", tone: "moderate" },
  featureResponse: { label: "Featured response", category: "responses", tone: "moderate" },
  unfeatureResponse: { label: "Unfeatured response", category: "responses", tone: "moderate" },
  saveQuestionBank: { label: "Updated question bank", category: "questionBank", tone: "neutral" },
  generateShareToken: { label: "Generated share link", category: "sharing", tone: "share" },
};

describe("describeAuditAction", () => {
  it("maps every known action string to its exact label/category/tone", () => {
    for (const [action, expected] of Object.entries(EXPECTED)) {
      expect(describeAuditAction(action)).toEqual(expected);
    }
  });

  it("falls back to a neutral sessions-category entry for an unrecognized action, using the raw string as the label", () => {
    expect(describeAuditAction("someFutureAction")).toEqual({
      label: "someFutureAction",
      category: "sessions",
      tone: "neutral",
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `./node_modules/.bin/vitest run tests/feedback-audit.test.ts`
Expected: FAIL — `describeAuditAction` is not exported (module has no such export).

- [ ] **Step 3: Implement `describeAuditAction`**

Replace the full contents of `src/lib/data/feedback-audit.ts` with:

```ts
import "server-only";
import { createAdminSupabase } from "@/lib/supabase/admin";

/** Best-effort: never throws into the caller — an audit-log failure must never block a real mutation. */
export async function logFeedbackAudit(params: {
  action: string;
  detail: string;
  actorProfileId: string | null;
}): Promise<void> {
  try {
    const admin = createAdminSupabase();
    await admin.from("feedback_audit_log").insert({
      action: params.action,
      detail: params.detail,
      actor_profile_id: params.actorProfileId,
    });
  } catch (error) {
    console.error("[feedback-audit] failed to log:", error);
  }
}

export type AuditCategory = "sessions" | "programs" | "responses" | "questionBank" | "sharing";
export type AuditTone = "create" | "destructive" | "moderate" | "neutral" | "share";

export interface AuditActionInfo {
  label: string;
  category: AuditCategory;
  tone: AuditTone;
}

/**
 * setCoverImage/removeCoverImage are logged identically by both
 * feedback-sessions.ts and feedback-programs.ts — the log has no way to
 * tell which one a given row came from (detail is a bare id, no type
 * prefix). Bucketed under "sessions" as the more common case; a real
 * data-shape limitation, not something this lookup can resolve.
 */
const AUDIT_ACTIONS: Record<string, AuditActionInfo> = {
  createFeedbackSession: { label: "Created session", category: "sessions", tone: "create" },
  updateFeedbackSessionDetails: { label: "Updated session details", category: "sessions", tone: "neutral" },
  updateFeedbackSessionQuestions: { label: "Updated session questions", category: "sessions", tone: "neutral" },
  setFeedbackSessionStatus: { label: "Changed session status", category: "sessions", tone: "neutral" },
  setFeedbackSessionMentor: { label: "Changed session mentor", category: "sessions", tone: "neutral" },
  deleteFeedbackSession: { label: "Deleted session", category: "sessions", tone: "destructive" },
  setCoverImage: { label: "Set cover image", category: "sessions", tone: "neutral" },
  removeCoverImage: { label: "Removed cover image", category: "sessions", tone: "neutral" },
  createFeedbackProgram: { label: "Created program", category: "programs", tone: "create" },
  deleteFeedbackProgram: { label: "Deleted program", category: "programs", tone: "destructive" },
  deleteResponse: { label: "Deleted response", category: "responses", tone: "destructive" },
  showResponse: { label: "Showed response", category: "responses", tone: "moderate" },
  hideResponse: { label: "Hid response", category: "responses", tone: "moderate" },
  featureResponse: { label: "Featured response", category: "responses", tone: "moderate" },
  unfeatureResponse: { label: "Unfeatured response", category: "responses", tone: "moderate" },
  saveQuestionBank: { label: "Updated question bank", category: "questionBank", tone: "neutral" },
  generateShareToken: { label: "Generated share link", category: "sharing", tone: "share" },
};

/** Pure lookup — never throws, so a page render never breaks because a future mutation added a logFeedbackAudit call this table doesn't know about yet. */
export function describeAuditAction(action: string): AuditActionInfo {
  return AUDIT_ACTIONS[action] ?? { label: action, category: "sessions", tone: "neutral" };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `./node_modules/.bin/vitest run tests/feedback-audit.test.ts`
Expected: PASS, both tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/data/feedback-audit.ts tests/feedback-audit.test.ts
git commit -m "feat(feedback): add describeAuditAction pure action-label lookup"
```

---

### Task 2: `listFeedbackAuditLog` data-layer read

**Files:**
- Modify: `src/lib/data/feedback-audit.ts` (append after Task 1's `describeAuditAction`)

**Interfaces:**
- Consumes: `createAdminSupabase` from `@/lib/supabase/admin` (already imported in this file).
- Produces: `AuditLogEntry` interface and `listFeedbackAuditLog(): Promise<AuditLogEntry[]>`, exported from `src/lib/data/feedback-audit.ts`. Consumed by Task 4's `page.tsx`.

- [ ] **Step 1: Implement**

Append to `src/lib/data/feedback-audit.ts`, after `describeAuditAction`:

```ts
export interface AuditLogEntry {
  id: string;
  action: string;
  detail: string;
  actorName: string | null;
  createdAt: string;
}

/**
 * No error check on the read — matches listFeedbackSessions's existing
 * convention for a list-display query (falls back to an empty array on
 * failure, shown as the page's own "No activity yet" empty state). This
 * is a display-only read with no integrity decision riding on it, unlike
 * the guard read in updateFeedbackSessionQuestions.
 */
export async function listFeedbackAuditLog(): Promise<AuditLogEntry[]> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("feedback_audit_log")
    .select("id, action, detail, created_at, actor:profiles!feedback_audit_log_actor_profile_id_fkey(full_name)")
    .order("created_at", { ascending: false })
    .limit(500);
  return (data ?? []).map((row) => ({
    id: row.id,
    action: row.action,
    detail: row.detail,
    actorName: row.actor?.full_name ?? null,
    createdAt: row.created_at,
  }));
}
```

- [ ] **Step 2: Type-check**

Run: `./node_modules/.bin/tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/data/feedback-audit.ts
git commit -m "feat(feedback): add listFeedbackAuditLog data-layer read"
```

---

### Task 3: `AuditLogClient` component

**Files:**
- Create: `src/app/dashboard/admin/feedback/audit-log/AuditLogClient.tsx`

**Interfaces:**
- Consumes: `describeAuditAction`, `AuditLogEntry`, `AuditCategory`, `AuditTone` from Task 1/2 (`@/lib/data/feedback-audit`). `relativeTime`, `formatDateTime` from `@/lib/format`. `cn` from `@/lib/utils`.
- Produces: `export function AuditLogClient({ entries }: { entries: AuditLogEntry[] })`. Consumed by Task 4's `page.tsx`.

- [ ] **Step 1: Write the component**

Create `src/app/dashboard/admin/feedback/audit-log/AuditLogClient.tsx`:

```tsx
"use client";

import { useState } from "react";
import { CirclePlus, Trash2, EyeOff, Pencil, Share2, Inbox } from "lucide-react";
import { relativeTime, formatDateTime } from "@/lib/format";
import { describeAuditAction, type AuditLogEntry, type AuditCategory, type AuditTone } from "@/lib/data/feedback-audit";
import { cn } from "@/lib/utils";

const CATEGORY_TABS: { value: AuditCategory | "all"; label: string }[] = [
  { value: "all", label: "All" },
  { value: "sessions", label: "Sessions" },
  { value: "programs", label: "Programs" },
  { value: "responses", label: "Responses" },
  { value: "questionBank", label: "Question Bank" },
  { value: "sharing", label: "Sharing" },
];

const TONE_ICON: Record<AuditTone, typeof CirclePlus> = {
  create: CirclePlus,
  destructive: Trash2,
  moderate: EyeOff,
  neutral: Pencil,
  share: Share2,
};

const TONE_CLASSES: Record<AuditTone, string> = {
  create: "bg-pz-tertiary-container text-pz-on-tertiary-container",
  destructive: "bg-pz-error-container text-pz-on-error-container",
  moderate: "bg-pz-secondary-container text-pz-on-secondary-container",
  neutral: "bg-pz-surface-container-highest text-pz-on-surface",
  share: "bg-pz-primary-container text-pz-on-primary-container",
};

function ActionBadge({ action }: { action: string }) {
  const info = describeAuditAction(action);
  const Icon = TONE_ICON[info.tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md font-headline font-bold text-xs whitespace-nowrap",
        TONE_CLASSES[info.tone],
      )}
    >
      <Icon className="w-3.5 h-3.5" />
      {info.label}
    </span>
  );
}

export function AuditLogClient({ entries }: { entries: AuditLogEntry[] }) {
  const [category, setCategory] = useState<AuditCategory | "all">("all");

  const visible =
    category === "all" ? entries : entries.filter((e) => describeAuditAction(e.action).category === category);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-headline font-bold text-2xl text-pz-secondary">Audit Log</h1>
        <p className="font-body text-pz-on-surface-variant text-sm mt-1">
          A record of every change made to feedback sessions, programs, and responses.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {CATEGORY_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            onClick={() => setCategory(tab.value)}
            className={cn(
              "px-4 py-2 rounded-full font-headline font-bold text-sm transition-colors border",
              category === tab.value
                ? "bg-pz-primary-container text-pz-on-primary-container border-pz-primary"
                : "bg-pz-surface-container-lowest text-pz-on-surface-variant border-pz-outline-variant hover:bg-pz-surface-container-high",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <div className="bg-pz-surface-container rounded-2xl border border-pz-outline-variant/40 p-10 flex flex-col items-center text-center">
          <Inbox className="w-10 h-10 text-pz-outline-variant mb-3" />
          <p className="font-body text-pz-on-surface-variant text-sm">No activity yet.</p>
        </div>
      ) : (
        <div className="bg-pz-surface-container-lowest rounded-2xl border border-pz-outline-variant/40 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[48rem]">
              <thead>
                <tr className="border-b border-pz-outline-variant/40 text-pz-on-surface text-left">
                  <th className="py-4 px-6 font-headline font-semibold">Timestamp</th>
                  <th className="py-4 px-6 font-headline font-semibold">Action</th>
                  <th className="py-4 px-6 font-headline font-semibold">Actor</th>
                  <th className="py-4 px-6 font-headline font-semibold">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pz-outline-variant/30 text-pz-on-surface">
                {visible.map((entry) => (
                  <tr key={entry.id} className="hover:bg-pz-surface-container/40 transition-colors">
                    <td
                      className="py-4 px-6 whitespace-nowrap font-body text-pz-on-surface-variant"
                      title={formatDateTime(entry.createdAt)}
                    >
                      {relativeTime(entry.createdAt)}
                    </td>
                    <td className="py-4 px-6 whitespace-nowrap">
                      <ActionBadge action={entry.action} />
                    </td>
                    <td className="py-4 px-6 whitespace-nowrap font-body font-medium">{entry.actorName ?? "System"}</td>
                    <td className="py-4 px-6 font-body text-pz-on-surface-variant">{entry.detail}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-6 py-4 border-t border-pz-outline-variant/40 font-body text-sm text-pz-on-surface-variant">
            Showing {visible.length} entr{visible.length === 1 ? "y" : "ies"}
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check and lint**

Run: `./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/next lint`
Expected: no errors or warnings.

- [ ] **Step 3: Commit**

```bash
git add "src/app/dashboard/admin/feedback/audit-log/AuditLogClient.tsx"
git commit -m "feat(feedback): add AuditLogClient component"
```

---

### Task 4: Route + sessions-list link

**Files:**
- Create: `src/app/dashboard/admin/feedback/audit-log/page.tsx`
- Modify: `src/app/dashboard/admin/feedback/page.tsx`

**Interfaces:**
- Consumes: `AuditLogClient` from Task 3 (`./AuditLogClient`), `listFeedbackAuditLog` from Task 2 (`@/lib/data/feedback-audit`), `requireAdminPage` from `@/lib/auth/require-admin` (already used by every sibling admin page in this area).

- [ ] **Step 1: Create the route**

Create `src/app/dashboard/admin/feedback/audit-log/page.tsx`:

```tsx
import { requireAdminPage } from "@/lib/auth/require-admin";
import { listFeedbackAuditLog } from "@/lib/data/feedback-audit";
import { AuditLogClient } from "./AuditLogClient";

export const metadata = { title: "Audit Log — PZ Academy" };

export default async function AdminAuditLogPage() {
  await requireAdminPage();
  const entries = await listFeedbackAuditLog();
  return <AuditLogClient entries={entries} />;
}
```

- [ ] **Step 2: Add the link on the sessions list**

In `src/app/dashboard/admin/feedback/page.tsx`, add `History` to the `lucide-react` import (line 2):

```ts
import { Inbox, Star, ListChecks, Layers, History, Image as ImageIcon } from "lucide-react";
```

Then add a new `Link` immediately after the existing "Question Bank" link (currently lines 53–59), inside the same `<div className="flex items-center gap-3">`:

```tsx
          <Link
            href="/dashboard/admin/feedback/question-bank"
            className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 font-headline text-sm font-semibold bg-pz-surface-container-high text-pz-on-surface hover:bg-pz-surface-variant transition-colors"
          >
            <ListChecks className="w-4 h-4" />
            Question Bank
          </Link>
          <Link
            href="/dashboard/admin/feedback/audit-log"
            className="inline-flex items-center gap-2 rounded-full px-5 py-2.5 font-headline text-sm font-semibold bg-pz-surface-container-high text-pz-on-surface hover:bg-pz-surface-variant transition-colors"
          >
            <History className="w-4 h-4" />
            Audit Log
          </Link>
          <NewSessionModal />
```

- [ ] **Step 3: Type-check and lint**

Run: `./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/next lint`
Expected: no errors or warnings.

- [ ] **Step 4: Commit**

```bash
git add "src/app/dashboard/admin/feedback/audit-log/page.tsx" src/app/dashboard/admin/feedback/page.tsx
git commit -m "feat(feedback): add audit log route and sessions-list link"
```

---

### Task 5: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Full test suite**

Run: `./node_modules/.bin/vitest run`
Expected: all tests pass, including the 2 new `describeAuditAction` tests.

- [ ] **Step 2: Type-check and lint, whole project**

Run: `./node_modules/.bin/tsc --noEmit && ./node_modules/.bin/next lint`
Expected: no errors; no new warnings beyond the pre-existing `<img>`/LCP warnings in `FeedbackClient.tsx`/`ReviewClient.tsx`.

- [ ] **Step 3: Live click-through**

Against the real Supabase project (46 real rows as of the spec's writing, likely more by execution time — includes real entries from today's session-edit feature work), open `/dashboard/admin/feedback` and click the new "Audit Log" link. Confirm: the page loads all entries newest-first; each row's action badge shows a sensible label/icon/color (spot-check a few against the mapping table in the spec — in particular confirm `updateFeedbackSessionQuestions` rows render correctly, since that's the action the earlier under-counted research pass missed); each filter tab shows the expected subset and "All" shows everything; actor names resolve for rows with a real `actor_profile_id` and render "System" for any row where it's null; the timestamp's hover title shows the exact date/time; the empty state would render correctly (can verify by filtering to a category with zero matching rows, if one exists, or by temporarily reasoning about the code path — no need to fabricate empty data for this).

- [ ] **Step 4: Update memory**

Update the `pz-academy-feedback-phase2-status` memory: mark the audit-log-viewer item (already noted as "still deferred, not yet scoped" after the session-edit update) as shipped, same style as the other completed items in that memory.
