# ID and Class-Email Audience Picker (Project A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The admin can filter and hand-pick students, download an ID PDF for only those students, email them their IDs after seeing exactly who gets it, and set a per-class audience so class emails reach only the right students.

**Architecture:** One pure rules file decides which option label (for example "Live — Modules: M1 – Individual") belongs to which audience. A class stores its audience as a small JSON value. One preview function builds the two lists (receiving, not receiving, with a reason each) and is used by both the class card and the ID-email builder. The existing registrations screen, selection and message builder are extended, not replaced.

**Tech Stack:** Next.js (App Router), TypeScript, Supabase (service-role server code), Vitest, Tailwind.

**Spec:** `docs/superpowers/specs/2026-10-30-id-audience-and-progress-design.md` (Project A, plus "Calls made after the builder check"). Project B is NOT in this plan.

## Global Constraints

- Migration number is **0092**. The owner pastes all SQL by hand; the builder only writes the file. Never regenerate `src/lib/supabase/database.types.ts`: hand-add the new column.
- Checks are called directly (the `&` in the path breaks `npm run`): `node node_modules/typescript/bin/tsc --noEmit` (baseline 0 errors), `node node_modules/vitest/vitest.mjs run tests/<file>`, `node node_modules/eslint/bin/eslint.js <paths>`. Known failing tests that are not ours: `tests/pz-tokens.test.ts`, `tests/participant-recipients.test.ts`, `tests/participant-whatsapp-ui.test.tsx`, `tests/landing-route-hardening.test.ts`, `tests/gas-apply-registration-status.test.ts`, `tests/landing-event-sheet.test.ts`.
- Never add `eslint-disable` for `@typescript-eslint`. Source files often use CRLF: use the Edit tool, do not rewrite whole files.
- A full-course student matches every class. A Module N student matches only classes whose audience includes Module N. Recorded students never match a class audience whose mode is `live`. An unreadable label is never included automatically.
- The ID PDF and any public page never contain email addresses or phone numbers.
- Screens must work at phone width (393px): stacked rows, tap targets at least 44px, no sideways scroll.
- Plain, non-technical wording in every message the owner reads. No jargon.
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. New commits only, never amend.

## Review Focus

1. A label with a different dash or spacing ("Live - Full Course - Individual") must still parse. Test in Task 1.
2. A multi-module label ("Live — Modules: M1, M2 – Individual") matches classes for M1 and for M2. Test in Task 1.
3. A group member follows their lead's option, so a group of 3 in the full course is 3 people in the list. Test in Task 3.
4. A person with no PZ ID is never sent an ID email (it would read "Your ID is ."). Test in Task 3 and Task 6.
5. A class with no audience set sends nothing, and the 5-minute timer skips it instead of erroring. Test in Task 4.
6. Unsubscribed people appear under "not receiving" with their reason and never get mail. Test in Task 3.

---

### Task 1: Audience rules (pure code)

**Files:**
- Create: `src/lib/classes/audience.ts`
- Test: `tests/class-audience.test.ts`

**Interfaces:**
- Produces:
  - `type OptionScope = { mode: "live" | "recorded" | "unknown"; full: boolean; modules: number[] }`
  - `parseOption(label: string): OptionScope`
  - `type Audience = { mode: "live" | "any"; modules: number[] | "all" }` (full course always matches)
  - `type ExcludeReason = "recorded" | "wrong_module" | "unrecognised"`
  - `matchAudience(opt: OptionScope, a: Audience): { include: true } | { include: false; reason: ExcludeReason }`
  - `audienceFromJson(v: unknown): Audience | null` (null for anything malformed)
  - `AUDIENCE_PRESETS: { key: string; label: string; audience: Audience }[]` with exactly: `live_module` is built by `presetLiveWithModule(n: number): Audience`, `all_live` = `{mode:"live",modules:"all"}`, `everyone` = `{mode:"any",modules:"all"}`
  - `optionPatterns(scope: "full" | number): string[]` (SQL `ilike` patterns, used by Task 5, so parse and filter share one definition)

- [ ] **Step 1: Write the failing tests** in `tests/class-audience.test.ts`:
  - `parseOption("Live — Full Course – Individual")` → `{mode:"live",full:true,modules:[]}`; same for `"Live - Full Course - Individual"` and `"live — full course – group of 3"`.
  - `parseOption("Recorded — Modules: M1 – Individual")` → `{mode:"recorded",full:false,modules:[1]}`.
  - `parseOption("Live — Modules: M1, M2 – Individual")` → modules `[1,2]`.
  - `parseOption("")` and `parseOption("Webinar seat")` → mode `"unknown"`, `full:false`, `modules:[]`.
  - `matchAudience` with `presetLiveWithModule(1)`: live full → include; live M1 → include; live M4 → `{include:false,reason:"wrong_module"}`; recorded full → `reason:"recorded"`; unknown → `reason:"unrecognised"`.
  - `matchAudience` with `all_live`: live M4 included, recorded excluded. With `everyone`: recorded included, unknown still excluded.
  - `audienceFromJson({mode:"live",modules:[1]})` returns it; `audienceFromJson({mode:"x"})`, `null`, `"a"` return `null`.
- [ ] **Step 2: Run** `node node_modules/vitest/vitest.mjs run tests/class-audience.test.ts` → FAIL (module missing).
- [ ] **Step 3: Implement** `src/lib/classes/audience.ts`. Parse case-insensitively: mode from a leading `live`/`recorded`; `full` when the text contains "full course"; modules from `/modules?:\s*((?:m\d+\s*,?\s*)+)/i`. No dash-sensitive matching anywhere.
- [ ] **Step 4: Run** the test → PASS. Run `tsc --noEmit` → 0 errors.
- [ ] **Step 5: Commit** `feat: audience rules for class emails and IDs`.

### Task 2: Migration 0092 and the stored audience

**Files:**
- Create: `supabase/migrations/0092_class_audience.sql`
- Modify: `src/lib/supabase/database.types.ts` (hand-add `audience: Json | null` to `batch_sessions` Row, Insert, Update)
- Modify: `src/lib/data/attendance.ts` (read/write helpers)
- Test: `tests/class-audience-data.test.ts`

**Interfaces:**
- Consumes: `Audience`, `audienceFromJson` (Task 1).
- Produces: `setSessionAudience(sessionId: string, audience: Audience | null): Promise<void>` and `getSessionAudience(session: SessionRow): Audience | null` in `src/lib/data/attendance.ts`.

- [ ] **Step 1: Write the failing test**: `getSessionAudience({audience:{mode:"live",modules:[1]}} as SessionRow)` returns that audience; `{audience:null}` and `{audience:{bad:1}}` return `null`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Write** `0092_class_audience.sql`: `alter table public.batch_sessions add column if not exists audience jsonb;` plus a comment that null means "send nothing". No default, so every existing class has no audience. Then implement the two helpers (`setSessionAudience` updates only the one column, requires nothing else).
- [ ] **Step 4: Run** the test → PASS; `tsc --noEmit` 0 errors.
- [ ] **Step 5: Commit** `feat: store an audience on each class`.

### Task 3: Recipient preview (receiving and not receiving)

**Files:**
- Create: `src/lib/data/audience-preview.ts`
- Modify: `src/lib/landing/participants/types.ts` (add optional `mode?: "live"|"recorded"` and `optionLabel?: string` to `Candidate`)
- Modify: `src/lib/data/participant-campaigns.ts` (fill both fields in `resolveCandidates`, taken from the lead row for members)
- Modify: `src/lib/data/participant-sends.ts` (export `pzIdsFor`)
- Test: `tests/audience-preview.test.ts`

**Interfaces:**
- Consumes: `parseOption`, `matchAudience`, `Audience`, `ExcludeReason` (Task 1); `resolveCandidates`; `pzIdsFor(registrationIds: string[]): Promise<Map<string,string>>`; `listUnsubscribed`.
- Produces:
  - `type PreviewPerson = { name: string; email: string; optionLabel: string }`
  - `type NotReceivingReason = "no_id" | "no_email" | "unsubscribed" | ExcludeReason`
  - `type RecipientPreview = { receiving: PreviewPerson[]; notReceiving: (PreviewPerson & { reason: NotReceivingReason })[] }`
  - `buildRecipientPreview(candidates: Candidate[], opts: { audience?: Audience; requirePzId: boolean; pzIds: Map<string,string>; unsubscribed: Set<string> }): RecipientPreview` (pure, tested)
  - `previewRecipients(input: { pageId: string; ids?: string[]; filters?: RegistrationListFilters; audience?: Audience; requirePzId?: boolean }): Promise<RecipientPreview>` (loads candidates, ids and unsubscribed, then calls the pure function)
  - Reason order when several apply: `no_id`, `no_email`, `unsubscribed`, then the audience reasons.
  - A class preview uses every head and member of the page; "no_id" means status is not paid/free or no PZ ID.

- [ ] **Step 1: Write the failing tests** for `buildRecipientPreview` with candidates built from the real Batch 3 mix: 3 live full (one group lead + 2 members whose `optionLabel` equals the lead's), 1 live M1, 1 live M4, 1 recorded full, 1 pending (no PZ ID), 1 unsubscribed live full, 1 unrecognised label. With `presetLiveWithModule(1)`: receiving = the 3 group people + live full + live M1; notReceiving reasons are exactly `wrong_module`, `recorded`, `no_id`, `unsubscribed`, `unrecognised`. With no audience and `requirePzId:true`: the person without a PZ ID is `no_id`, everyone else receives. Each excluded row carries its name, email and option label.
- [ ] **Step 2: Run** `tests/audience-preview.test.ts` → FAIL.
- [ ] **Step 3: Implement** as in Interfaces. Export `pzIdsFor`; add the two `Candidate` fields (optional, so existing callers compile).
- [ ] **Step 4: Run** the new test plus `tests/participant-campaigns-data.test.ts` → PASS; `tsc --noEmit` 0 errors.
- [ ] **Step 5: Commit** `feat: recipient preview with reasons`.

### Task 4: Class emails obey the audience

**Files:**
- Modify: `src/lib/data/session-emails.ts` (`createSessionSend`, `SessionSendResult`)
- Modify: `src/lib/data/session-cron.ts` (`listDueReminderSessionIds`)
- Modify: `src/components/admin/classes/email-status.ts` (new status line)
- Modify: the place that turns `SessionSendResult.reason` into owner wording (search for `"no_recipients"` in `src/components/admin/classes/` and `src/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/actions.ts`)
- Test: extend `tests/attendance-session-email.test.ts`, add `tests/session-cron-audience.test.ts`

**Interfaces:**
- Consumes: `getSessionAudience` (Task 2), `matchAudience`/`parseOption` (Task 1), `Candidate.optionLabel` (Task 3).
- Produces: `SessionSendResult` reason union gains `"no_audience"`.

- [ ] **Step 1: Write the failing tests**: (a) `createSessionSend` for a class with `audience = null` returns `{ok:false,reason:"no_audience"}` for kinds `reminder`, `update` and `feedback`, and creates no send row; (b) with audience `presetLiveWithModule(1)` the planned recipients are only the live full-course and live Module 1 candidates (recorded and M4 never appear); (c) `listDueReminderSessionIds` ignores a due, enabled class whose audience is null (add `.not("audience","is",null)` to its query; the test asserts the query builder receives that filter); (d) `emailStatusLine` for a class with email on and no audience reads "Choose who gets this email" (switched-off wording unchanged).
- [ ] **Step 2: Run** those tests → FAIL.
- [ ] **Step 3: Implement.** In `createSessionSend`, right after the session loads: read `getSessionAudience(session)`; return `no_audience` when null. Extend the `keep` function: status paid/free AND `matchAudience(parseOption(c.optionLabel ?? ""), audience).include`. Owner wording for `no_audience`: "Choose who gets this email first."
- [ ] **Step 4: Run** the three test files → PASS; `tsc --noEmit` 0 errors.
- [ ] **Step 5: Commit** `feat: class emails only go to the chosen audience`.

### Task 5: "Who gets this" on the class card

**Files:**
- Create: `src/components/admin/classes/AudiencePicker.tsx`
- Create: `src/components/admin/shared/RecipientPreviewLists.tsx` (the two lists, reused in Task 6)
- Modify: `src/components/admin/classes/TodayPanel.tsx` (show the picker in the email area)
- Modify: `src/components/admin/classes/EditClassDialog.tsx` (the email switch cannot be turned on while no audience is chosen; show "Choose who gets this email" instead)
- Modify: `src/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/sessions/actions.ts` (`saveClassAudience`, `previewClassAudience`)
- Test: `tests/audience-picker-ui.test.tsx`

**Interfaces:**
- Consumes: `AUDIENCE_PRESETS`, `presetLiveWithModule` (Task 1); `setSessionAudience` (Task 2); `previewRecipients`, `RecipientPreview` (Task 3).
- Produces:
  - Server actions (admin only, `requireAdmin`): `saveClassAudience(pageId: string, sessionId: string, audience: Audience): Promise<{ ok: true } | { ok: false; message: string }>` and `previewClassAudience(pageId: string, sessionId: string, audience: Audience): Promise<RecipientPreview>`.
  - `RecipientPreviewLists({ preview, receivingTitle, notReceivingTitle }: { preview: RecipientPreview; receivingTitle: string; notReceivingTitle: string })`: two collapsible lists with counts; each excluded person shows a plain reason ("Recorded student", "Other module", "No ID yet", "Unsubscribed", "Option not recognised", "No email").

- [ ] **Step 1: Write the failing tests**: the picker shows four choices ("Live full course + Module N" with a module number field, "All live students", "Everyone with an ID") and no choice is selected when the class has no audience; choosing one calls `previewClassAudience` and renders both lists with counts; a "Save who gets this" button calls `saveClassAudience`; the lists show the plain-reason text for an excluded person; the actions return `{ok:false}` for a non-admin.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** the components and actions. Module number is a 1 to 12 number field defaulting to the class number's module if unknown (builder's call: default empty and required). Phone layout: choices stacked full width, lists are collapsed by default.
- [ ] **Step 4: Run** the test and the existing class-panel tests (`tests/classes-*.test.tsx` if present) → PASS; `tsc --noEmit` and `eslint` on changed files clean.
- [ ] **Step 5: Commit** `feat: choose who gets each class email, with a preview`.

### Task 6: Quick filters, selected ID PDF, and "Email their IDs"

**Files:**
- Modify: `src/lib/data/landing-registration-admin.ts` (`RegistrationListFilters` gains `optionScopes?: ("full" | number)[]` (any of them matches); `applyHeadFilters` applies it with `optionPatterns`)
- Modify: where list filters are parsed from the address (search for `optionLabel` in `src/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/page.tsx` and the filters component) so `optionScopes` round-trips
- Modify: `src/components/admin/registrations/RegistrationFilters.tsx` (three quick buttons)
- Modify: `src/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/id-actions.ts` (add `getSelectionIdList`)
- Modify: `src/components/admin/registrations/CampaignRegistrations.tsx` (`downloadIds`, new "Email their IDs" action)
- Modify: `src/components/admin/registrations/MessageBuilder.tsx` and `src/lib/data/participant-sends.ts` (preview lists, PZ ID requirement)
- Test: `tests/registration-id-selection.test.tsx`, extend `tests/landing-registrations-data.test.ts`

**Interfaces:**
- Consumes: `optionPatterns` (Task 1); `previewRecipients`, `RecipientPreviewLists` (Tasks 3 and 5); `CampaignSelection` (existing: `{mode:"ids",ids}` or `{mode:"filter",filters}`); `resolveCandidates`, `pzIdsFor`.
- Produces:
  - `getSelectionIdList(pageId: string, selection: CampaignSelection | null): Promise<Array<{ name: string; pzId: string }>>` in `id-actions.ts` (admin only; `null` means the whole batch, as today; only people with a PZ ID; no emails returned).
  - `plan()` option `requirePzId?: boolean`: when true, candidates without a PZ ID are dropped before sending. `createSend` and `previewSend` set it automatically when the subject or body uses the `pz_id` tag.
  - Quick buttons: "Live full course" (`mode=live`, `optionScopes=[full]`), "Live + Module N" (asks for N; `mode=live`, `optionScopes=[full, N]`), "All live" (`mode=live`).

- [ ] **Step 1: Write the failing tests**: (a) `applyHeadFilters` with `optionScopes: ["full"]` adds an `or` of the full-course patterns, with `optionScopes: [1]` the Module 1 patterns, and with `["full", 1]` both sets; (b) the "Live + Module N" quick button yields live full-course and live Module N rows only; (c) `getSelectionIdList` for 3 ticked ids returns only those who have a PZ ID and no `email` key; for a filter selection it returns the filtered people; for `null` it returns the whole batch; (d) the PDF button label shows the number selected ("Download IDs (3 selected)") and "(whole batch)" when nothing is ticked and no filter is set; (e) "Email their IDs" opens the builder with the selection and a ready subject and body using `{{first_name}}` and `{{pz_id}}` and "Track your attendance and results with this ID"; (f) the builder shows both recipient lists before the confirm button and the confirm is disabled until the owner has seen them; (g) a send whose body uses `{{pz_id}}` never includes a person without a PZ ID (planner test).
- [ ] **Step 2: Run** these tests → FAIL.
- [ ] **Step 3: Implement.** Keep `getBatchIdList` for any caller that still needs it. The ID email uses the existing send pipeline, so a second press the same minute hits the existing "just sent" guard; "Send again" later is a normal new send. The email body must not contain a link that does not exist yet (no Track Your Progress link in this project).
- [ ] **Step 4: Run** the new tests plus `tests/landing-registrations-list-ui.test.tsx`, `tests/participant-builder-ui.test.tsx`, `tests/participant-campaigns-data.test.ts` → PASS (known failing files excepted); `tsc --noEmit` 0 errors; `eslint` clean on changed files.
- [ ] **Step 5: Commit** `feat: pick students for the ID PDF and ID email`.

### Task 7: Owner steps and branch check

**Files:**
- Create: `docs/superpowers/plans/2026-10-30-id-audience-picker-owner-steps.md`
- Modify: `CLAUDE.md` "Project state" (0092 awaiting paste, next free 0093; batch classes merged)

- [ ] **Step 1:** Write the owner steps in plain words: paste `0092_class_audience.sql`; then for Batch 3, on each class card choose "Live full course + Module 1" (Day 1 to Day 3 are Module 1 if the owner confirms) and look at both lists before turning email on; test the ID PDF with three ticked students and with the "Live full course" quick button; test "Email their IDs" by selecting only the owner's own test student.
- [ ] **Step 2:** Run the full focused set for every changed area, `tsc --noEmit` (0 errors) and `eslint` on all changed files. Report the real output.
- [ ] **Step 3: Commit** `docs: owner steps for the audience picker`. Do not push; the owner says when.
