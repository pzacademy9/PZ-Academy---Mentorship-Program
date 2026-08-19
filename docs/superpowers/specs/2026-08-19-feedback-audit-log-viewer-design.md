# Feedback Audit Log Viewer

## Problem

`feedback_audit_log` is written by every mutation across `src/lib/data/feedback-*.ts`
(via `logFeedbackAudit`, `src/lib/data/feedback-audit.ts`) but read by nothing —
explicitly flagged as an unscoped deferred item in both the Phase 2 plan and
the session-edit spec (`pz-academy-feedback-phase2-status` memory). This spec
gives admins a read-only page listing that history.

Design source: no existing screen in the "PZ Academy Feedback System" Stitch
project covered this (confirmed by listing its screens); the user generated
one fresh in the "PZ Academy website" project (`projects/11811490301995978699`,
screen `Admin: Audit Log`, id `26266f3f8c1343b0935daf2b1d453c11`) from a
prompt this session wrote. That screen is the design source for everything
below except its sidebar/top-bar chrome, which is Stitch's own generic
scaffold — this app's real `/dashboard/admin/*` layout already supplies both,
so only the page's `<main>` content (header, filter tabs, table card,
pagination footer) is actually ported.

## Decisions already made

- **17 action strings, confirmed by direct grep, not assumed.** An earlier
  research pass under-counted these at 14 by missing
  `updateFeedbackSessionQuestions` (added the same day this spec was
  written, by the session-edit feature) — re-verified directly against
  `src/lib/data/feedback-*.ts` before writing the mapping below. Full list:
  `createFeedbackSession`, `updateFeedbackSessionDetails`,
  `updateFeedbackSessionQuestions`, `setFeedbackSessionStatus`,
  `setFeedbackSessionMentor`, `deleteFeedbackSession`, `setCoverImage`,
  `removeCoverImage`, `createFeedbackProgram`, `deleteFeedbackProgram`,
  `deleteResponse`, `showResponse`, `hideResponse`, `featureResponse`,
  `unfeatureResponse`, `saveQuestionBank`, `generateShareToken`.
- **`setCoverImage`/`removeCoverImage` can't be attributed to session vs.
  program from the log alone.** Both `feedback-programs.ts` and
  `feedback-sessions.ts` log the identical action string with `detail` set
  to a bare id (no type prefix) — a real data-shape limitation, not
  something this feature can fix without changing the write side (out of
  scope). Both are bucketed under the "Sessions" filter category as the
  more common case; the `detail` column still shows the raw id either way.
- **Category and visual "tone" are separate, both derived from a single
  pure `describeAuditAction`.** Category (`sessions` / `programs` /
  `responses` / `questionBank` / `sharing`) drives the filter tabs; tone
  (`create` / `destructive` / `moderate` / `neutral` / `share`) drives the
  badge's icon/color. Five tones map cleanly onto the Stitch screen's five
  example rows, which — coincidentally or not — already used five visually
  distinct badge treatments (create/hide/delete/share/edit), so this isn't
  a deviation from the generated design, just naming what it already did.
  Full action → {label, category, tone} table:

  | action | label | category | tone |
  |---|---|---|---|
  | `createFeedbackSession` | Created session | sessions | create |
  | `updateFeedbackSessionDetails` | Updated session details | sessions | neutral |
  | `updateFeedbackSessionQuestions` | Updated session questions | sessions | neutral |
  | `setFeedbackSessionStatus` | Changed session status | sessions | neutral |
  | `setFeedbackSessionMentor` | Changed session mentor | sessions | neutral |
  | `deleteFeedbackSession` | Deleted session | sessions | destructive |
  | `setCoverImage` | Set cover image | sessions | neutral |
  | `removeCoverImage` | Removed cover image | sessions | neutral |
  | `createFeedbackProgram` | Created program | programs | create |
  | `deleteFeedbackProgram` | Deleted program | programs | destructive |
  | `deleteResponse` | Deleted response | responses | destructive |
  | `showResponse` | Showed response | responses | moderate |
  | `hideResponse` | Hid response | responses | moderate |
  | `featureResponse` | Featured response | responses | moderate |
  | `unfeatureResponse` | Unfeatured response | responses | moderate |
  | `saveQuestionBank` | Updated question bank | questionBank | neutral |
  | `generateShareToken` | Generated share link | sharing | share |

  Tone → icon/color (lucide icon, `pz-*` token pair):
  - `create` — `CirclePlus`, `bg-pz-tertiary-container` / `text-pz-on-tertiary-container`
  - `destructive` — `Trash2`, `bg-pz-error-container` / `text-pz-on-error-container`
  - `moderate` — `EyeOff`, `bg-pz-secondary-container` / `text-pz-on-secondary-container`
  - `neutral` — `Pencil`, `bg-pz-surface-container-highest` / `text-pz-on-surface`
  - `share` — `Share2`, `bg-pz-primary-container` / `text-pz-on-primary-container`

  An action string not in the table (defensive — shouldn't happen, but a
  future mutation could add one and forget this file) falls back to
  `{ label: action, category: "sessions", tone: "neutral" }` rather than
  throwing — a page render should never break because someone added a new
  `logFeedbackAudit` call without updating this table.
- **`font-label` in the Stitch export becomes `font-headline font-bold`,
  not a literal port.** This repo's `font-label` resolves to Handlee, an
  actual cursive font-face — wrong for badge/tab text on a `pz-*` M3
  dashboard screen. `SessionDetailClient.tsx`'s existing Hidden/Featured
  pills already establish `font-headline font-bold` uppercase small text
  as this exact app's convention for this exact kind of pill; matched
  here rather than reusing the marketing-page `font-poppins` swap
  (`MentorReviews.tsx`'s fix) — this is a dashboard screen, not marketing.
- **No pagination UI, one bounded query.** 46 rows today, admin-only. A
  `.limit(500)` cap (the same lesson the session-edit final review
  surfaced: cap deliberately rather than discover PostgREST's row cap by
  accident) is enough headroom that a "Showing 1 to 5 of 46 / Next" footer
  like Stitch's mock would be pure decoration at current volume — dropped
  in favor of a plain "Showing N entries" line. Revisit if this table
  ever approaches the cap.
- **Client-side filtering, not a server round-trip per tab.** All ≤500
  rows fetch once server-side; the six filter tabs (All + 5 categories)
  just filter the already-fetched array in the client component. Simpler
  than URL-param-driven server filtering for a dataset this size.

## Data flow

`src/lib/data/feedback-audit.ts` (already exists, currently only
`logFeedbackAudit`) gains:

```ts
export type AuditCategory = "sessions" | "programs" | "responses" | "questionBank" | "sharing";
export type AuditTone = "create" | "destructive" | "moderate" | "neutral" | "share";

export interface AuditActionInfo {
  label: string;
  category: AuditCategory;
  tone: AuditTone;
}

export function describeAuditAction(action: string): AuditActionInfo
```

— a pure lookup against the table above, exported for direct unit testing
(this repo's established convention: `summarizeStarValues`,
`keyAnswersByQuestionId`, `diffFeedbackQuestions` are the same pattern —
DB-touching functions get no tests, the pure logic they lean on does).

```ts
export interface AuditLogEntry {
  id: string;
  action: string;
  detail: string;
  actorName: string | null;
  createdAt: string;
}

export async function listFeedbackAuditLog(): Promise<AuditLogEntry[]>
```

Single query: `feedback_audit_log` joined to `profiles` on
`actor_profile_id` via the named-FK join syntax already established in
`src/lib/data/admin-enrollments.ts` (`actor:profiles!feedback_audit_log_actor_profile_id_fkey(full_name)`),
`.order("created_at", { ascending: false }).limit(500)`. `actorName` is
`null` when `actor_profile_id` is null (a system-triggered write with no
human actor) or the joined profile has no `full_name` — the UI renders
`null` as "System", matching the Stitch mock's "System" actor row.

## UI

New route `src/app/dashboard/admin/feedback/audit-log/page.tsx` — server
component, `requireAdmin()` gate (matching every other
`/dashboard/admin/feedback/**` page), calls `listFeedbackAuditLog()` and
renders `AuditLogClient` with the rows.

New `src/app/dashboard/admin/feedback/audit-log/AuditLogClient.tsx` — client
component:
- Page header: "Audit Log" title, one-line subtitle, straight from the
  Stitch mock's copy.
- Filter tabs: All / Sessions / Programs / Responses / Question Bank /
  Sharing, styled as pill buttons matching the mock (active: filled
  `bg-pz-primary-container`; inactive: outlined `border-pz-outline-variant`).
  `useState` for the active category, filtering the full `rows` array
  client-side via each row's `describeAuditAction(row.action).category`.
- Table: Timestamp (relative, e.g. via the existing `relativeTime` helper
  already used in `MentorReviews.tsx`/`ResponseRow`) / Action (the tone-colored
  badge) / Actor (`actorName ?? "System"`) / Details (`row.detail`, the raw
  string — no attempt to prettify per-action detail formats, they're
  already human-composed by each `logFeedbackAudit` call site).
- Empty state: "No activity yet" when `rows.length === 0`, matching every
  other empty state's `Inbox` icon + centered text pattern already used on
  `SessionDetailClient.tsx`/`MentorReviews.tsx`.
- "Showing N entries" footer line, no pagination controls (see decision above).

`src/app/dashboard/admin/feedback/page.tsx`'s header gains an "Audit Log"
link next to the existing "Question Bank" link, same styling.

## Testing

Unit tests in a new `tests/feedback-audit.test.ts` covering
`describeAuditAction`: one case per action string in the table (17 cases,
asserting the exact label/category/tone), plus one case for an unknown
action string hitting the fallback. `listFeedbackAuditLog` gets no test,
matching every other DB-touching function in this codebase.

tsc/vitest/lint. Live click-through: load the page against the real
Supabase project (46 real rows as of this spec), confirm every row renders
a label/category/tone that matches its raw `action` string, confirm each
filter tab shows the expected subset, confirm actor names resolve correctly
for a few real rows and "System" renders for any null-actor row, confirm
the new "Audit Log" link on the sessions list navigates correctly.
