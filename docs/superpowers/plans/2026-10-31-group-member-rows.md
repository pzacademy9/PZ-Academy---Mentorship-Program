# Group members as their own rows - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the admin registration lists, every group member shows as a normal row with its own tick-box, and sends, counts and the ID PDF treat each person individually.

**Architecture:** The admin list, the campaign counts and `resolveCandidates` read `individual`, `lead` AND `member` rows. Today they read heads only and `resolveCandidates` then adds a lead's members. Sales-agent scope stays heads only. No migration, no change to how people register or to who is Paid.

**Tech Stack:** Next.js route/server code, Supabase service-role client, vitest with fake clients, React testing library.

**Spec:** Approved in chat on 2026-10-31 (owner: "yes individual", "ok"). Requirements are in the Global Constraints below. Related code: `src/lib/data/landing-registration-admin.ts`, `src/lib/data/participant-campaigns.ts`, `src/components/admin/registrations/`.

## Global Constraints

- Each member is a normal row with a small line "Group member of <lead name>" under the name. Counts include members (a batch with 88 heads and 2 members reads 90).
- Each member's tick-box works on its own. Ticking a lead sends to the lead only. Ticking a member sends to that member only. "Select all in this filter" includes members and its count equals the number sent.
- The lead's "+N members" tag stays (owner-approved guess).
- Sales-agent scope (`scope.kind === "agent"`) and `src/app/dashboard/sales/registrations/page.tsx` stay heads only.
- A member's status is never changed on its own (existing `member-row` guard in `changeRegistrationStatus` stays). Members only ever get the Received and Paid status emails (`manualKindsFor("member")`, unchanged).
- Clicking a member row opens its LEAD's detail page (`getRegistrationDetail` returns null for a member id, so the member id would 404).
- Do not touch `src/lib/data/landing-mirror.ts`, registration submit code, or migrations. Never edit `database.types.ts` (no schema change).
- Tests use invented data only. Never put student data in the repo.
- Checks run directly (the "&" in the path breaks npm run): `node node_modules/typescript/bin/tsc --noEmit` (baseline 0 errors), `node node_modules/vitest/vitest.mjs run <files>`, `node node_modules/eslint/bin/eslint.js <paths>`. Known unrelated failing test files: pz-tokens, participant-recipients, participant-whatsapp-ui, landing-route-hardening, gas-apply-registration-status, landing-event-sheet.
- Source files are often CRLF: use the Edit tool, never a rewrite.
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.

## Review Focus

- A lead and its member both ticked: each gets exactly one message (no double send, no "merged" email dedupe between them, since a member has its own email).
- "Select all in this filter" then send: the number sent equals the "N selected" shown, members included, test rows excluded.
- Class and feedback emails (`session-emails.ts` calls `plan()` with filters, never ids) still reach each enrolled person exactly once, with no member skipped or doubled.
- Searching a member's own name or email finds the member row; searching a member's name no longer surfaces the lead.
- A member row of a test lead is hidden like any test row (`is_test` is on the member row).
- The member row link goes to the lead's detail page, never 404.
- The sales-agent list shows no member rows.

---

### Task 1: Read members in the admin list, the counts and the send resolver

**Files:**
- Modify: `src/lib/data/landing-registration-admin.ts` (`HEAD_ROW_TYPES` region ~line 117, `applyHeadFilters` ~line 153, `RegistrationListRow` ~line 40, `listRegistrations` ~line 225)
- Modify: `src/lib/data/participant-campaigns.ts` (`listCampaigns`, `resolveCandidates`)
- Modify: `src/lib/landing/participants/types.ts` (comment on `Candidate` only)
- Test: the existing data tests that assert heads-only behaviour: `tests/landing-registration-admin-data.test.ts`, `tests/landing-registration-list-rows.test.ts`, `tests/participant-campaigns-data.test.ts`, `tests/participant-option-scopes.test.ts`, `tests/participant-sends-data.test.ts`, `tests/participant-sends-pzid.test.ts`, `tests/audience-preview.test.ts`, `tests/registration-id-selection-data.test.ts` (find the ones that fail, update their expectations, add the new tests below to the closest of them)

**Interfaces:**
- Produces in `landing-registration-admin.ts`:
  - `export const LIST_ROW_TYPES = ["individual", "lead", "member"];`
  - `export function applyHeadFilters<T extends { in: any; eq: any; or: any }>(query: T, scope: Scope, f: RegistrationListFilters, rowTypes: string[] = HEAD_ROW_TYPES): T`. The `.in("row_type", ...)` uses `rowTypes`.
  - `RegistrationListRow` gains `rowType: "individual" | "lead" | "member"`, `leadId: string | null` (the lead's id for a member, else null), `leadName: string | null` (the lead's name for a member, else null).
  - `listRegistrations` passes `LIST_ROW_TYPES` when `scope.kind === "all"` and `HEAD_ROW_TYPES` for an agent scope, for the rows AND for all six counts.
- Produces in `participant-campaigns.ts`: `resolveCandidates` returns one `Candidate` per matching row of any type, in `created_at desc, id asc` order, with NO member expansion.

- [ ] **Step 1: Write the failing tests**

  In the admin-data test file (fake Supabase client style already used there):
  - `listRegistrations includes member rows for an admin scope`: fake data has one lead and one member of it; expect `rows` to contain both, `counts.all === 2`, the member row has `rowType === "member"`, `leadId === <lead id>`, `leadName === <lead name>`, and the lead row has `rowType === "lead"`, `leadId === null`, `leadName === null`.
  - `listRegistrations keeps member rows out of an agent scope`: same data with `{ kind: "agent", agentId }` expect the query used the `["individual","lead"]` row types (assert on the fake's recorded `in("row_type", ...)` argument) and no `rowType: "member"` row.
  - `applyHeadFilters uses the given row types`: default call records `["individual","lead"]`; with `LIST_ROW_TYPES` records all three.

  In the campaigns-data test file:
  - `resolveCandidates with ids returns exactly the rows asked for`: ids of one lead only returns one candidate (`isMember: false`); ids of one member only returns one candidate (`isMember: true`, `leadId` is its lead's id, `refId` is the LEAD's ref id, `registrationId` is the member's id); ids of both return two, once each.
  - `resolveCandidates rejects an id that is not on the campaign` (existing behaviour, member id from another page throws "A selected registration is not on this campaign").
  - `resolveCandidates with filters returns heads and members once each`: fake data lead + 2 members, filters `{}` returns 3 candidates, none duplicated.
  - `resolveCandidates filter q matches the member's own name`: q equal to a member's name returns only the member; the lead is not returned for that q.
  - `listCampaigns counts members`: one lead + one member on a page gives `total === 2`.

- [ ] **Step 2: Run the new tests to verify they fail**

  Run: `node node_modules/vitest/vitest.mjs run tests/landing-registration-admin-data.test.ts tests/participant-campaigns-data.test.ts`
  Expected: the new tests FAIL (no `LIST_ROW_TYPES`, members not returned).

- [ ] **Step 3: Implement the data changes**

  - `landing-registration-admin.ts`: add `LIST_ROW_TYPES`, the `rowTypes` parameter, the three new row fields, and the lead-name lookup: after the page's rows are read, collect `lead_registration_id` of member rows and read `id, name` of those leads in chunks of `ID_CHUNK` (the file's existing `chunks` helper); a failed lookup throws like the other reads in this function. Do not change status filtering, paging or ordering.
  - `participant-campaigns.ts`: `listCampaigns` uses `LIST_ROW_TYPES`. In `resolveCandidates`: in ids mode read the rows with `.in("row_type", LIST_ROW_TYPES)` (keep the page, `is_test false` and "not on this campaign" checks); in filter mode call `applyHeadFilters(..., LIST_ROW_TYPES)`; delete the member lookup and `byLead` expansion. For each row build the candidate: `registrationId = id`, `leadId = lead_registration_id ?? id`, `isMember = row_type === "member"`, `mode` and `optionLabel` from the row itself, `status` from the row itself, `refId` is the row's `ref_id` for a head and the lead's `ref_id` for a member (read the leads of the member rows in chunks of `paging.idChunk`; a member whose lead cannot be read is skipped). Update the comment above `resolveCandidates` and on `Candidate` ("Member candidates carry the lead's refId").
  - `listCampaignFilterOptions` and everything under `applyHeadFilters` callers other than the two above stay as they are.

- [ ] **Step 4: Run all the data-side tests and fix expectations that assumed heads-only**

  Run: `node node_modules/vitest/vitest.mjs run tests/landing-registration-admin-data.test.ts tests/landing-registration-list-rows.test.ts tests/participant-campaigns-data.test.ts tests/participant-option-scopes.test.ts tests/participant-sends-data.test.ts tests/participant-sends-pzid.test.ts tests/audience-preview.test.ts tests/registration-id-selection-data.test.ts tests/attendance-session-email.test.ts tests/classes-feedback-email.test.ts`
  Expected: PASS. Any test that failed only because it expected the old "lead takes its members along" shape is updated to the new rule (one candidate per row); do not weaken any assertion about test rows, status filters or option scopes.

- [ ] **Step 5: Type check, lint, commit**

  Run: `node node_modules/typescript/bin/tsc --noEmit` (0 errors) and `node node_modules/eslint/bin/eslint.js src/lib/data src/lib/landing/participants`.
  Commit: `feat: admin lists, counts and sends read group members as their own rows`.

### Task 2: Show member rows and open their lead

**Files:**
- Modify: `src/components/admin/registrations/RegistrationsTable.tsx`
- Modify: `src/components/admin/registrations/RowActions.tsx` (comment on line 16 and the `StatusEmailDialog` `rowType` prop)
- Test: `tests/landing-registrations-list-ui.test.tsx`, `tests/landing-list-actions-ui.test.tsx`, `tests/participant-campaign-page-ui.test.tsx`, `tests/landing-sales-registrations.test.tsx` (update to the new row fields where fixtures need them; add the new tests to the closest one)

**Interfaces:**
- Consumes: `RegistrationListRow.rowType`, `leadId`, `leadName` from Task 1.
- Produces: no new exports.

- [ ] **Step 1: Write the failing tests**

  - `a member row shows "Group member of <lead name>" under the name and its own tick-box` (desktop table and the mobile card both show the line; the tick-box label is `Select <member name>`).
  - `a member row links to the lead's detail page` (`href` ends with `/<leadId>`, not the member id), and a lead or individual row still links to its own id.
  - `a member row has no "+N members" tag, a lead row keeps it`.
  - `a member row's Status email dialog offers only Received and Paid` (render `RowActions` for a member row, open Status email, expect the two kinds).
  - `the sales table shows no member line` (rows with `rowType` of lead or individual render exactly as before).

- [ ] **Step 2: Run to verify they fail**

  Run: `node node_modules/vitest/vitest.mjs run tests/landing-registrations-list-ui.test.tsx tests/landing-list-actions-ui.test.tsx`
  Expected: FAIL on the new tests.

- [ ] **Step 3: Implement the UI**

  - `RegistrationsTable.tsx`: `href` becomes `${detailHrefBase}/${r.leadId ?? r.id}`. Add a small `MemberOfLine({ row })` component rendering `Group member of {row.leadName}` (text-[10px], same muted style as the Ref line) shown in the name cell (under the email) and as a meta line on the mobile card, only when `row.rowType === "member"`. `MembersChip` renders only when `row.rowType !== "member"` and `groupSize > 1`. Members have no `refId`, so the Ref line stays hidden for them.
  - `RowActions.tsx`: pass `rowType={row.rowType}` to `StatusEmailDialog`; update the line-16 comment (members now appear).

- [ ] **Step 4: Run all the UI tests**

  Run: `node node_modules/vitest/vitest.mjs run tests/landing-registrations-list-ui.test.tsx tests/landing-list-actions-ui.test.tsx tests/participant-campaign-page-ui.test.tsx tests/landing-sales-registrations.test.tsx tests/participant-builder-ui.test.tsx tests/registration-id-selection.test.tsx`
  Expected: PASS (participant-whatsapp-ui is a known unrelated failure).

- [ ] **Step 5: Type check, lint, commit**

  Run: `node node_modules/typescript/bin/tsc --noEmit` (0 errors) and `node node_modules/eslint/bin/eslint.js src/components/admin/registrations`.
  Commit: `feat: member rows in the admin lists with their own line and lead link`.

### Task 3: Live check and notes

**Files:**
- Modify: `CLAUDE.md` ("Project state": one bullet; keep next free migration at 0094)

- [ ] **Step 1: Read-only live check** against the real database with a SELECT (project whqdasotjlhvrjmgiffk): count rows per page by `row_type` and confirm members have their own `option_label`, `mode`, `region` and `person_id`, so the list filters work on them. Report only counts, never names or emails.

- [ ] **Step 2: Whole-suite and lint run**

  Run: `node node_modules/vitest/vitest.mjs run` then `node node_modules/typescript/bin/tsc --noEmit` and `node node_modules/eslint/bin/eslint.js src`.
  Expected: only the known unrelated failing files fail.

- [ ] **Step 3: Update CLAUDE.md** with one bullet saying member rows now appear in the admin lists and sends are per person, then commit: `docs: project state for group member rows`.
