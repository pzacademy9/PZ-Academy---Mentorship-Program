# Batch registrations page redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the batch registrations page calm: search, status tabs and people first; every other filter behind one "Filters" button; every tool link behind one "Batch tools" menu.

**Architecture:** A new campaign-only toolbar replaces `RegistrationFilters` on the campaign page (the All registrations page keeps the old one). Status tabs are extracted so both share them. Filters stay in the web address (plain GET form and links), so the Back-button fix keeps working. The two ID buttons leave the page.

**Tech Stack:** Next.js App Router, React, Tailwind with `pz-*` tokens, existing `src/components/ui/dropdown-menu.tsx`, vitest + testing-library.

**Spec:** `docs/superpowers/specs/2026-11-20-registrations-page-redesign-design.md`

**Stitch gate:** the owner's phone and PC screens go in the same Stitch project ("PZ Academy Platform 2", id `4651274386787527431`). Task 3 and Task 4 take their markup, spacing and copy from those screens. If the screens do not exist when you reach Task 3, stop and ask the owner. Do not invent the look.

## Global Constraints

- Plain words in the UI, no exclamation marks. Touch targets at least 44px tall on phone (`max-md:min-h-11` or `min-h-12`).
- Light and dark theme: use existing `pz-*` tokens only, no hard-coded colours.
- Shared lists and constants live in non-client files (a server page must not import plain values from a "use client" file).
- Never regenerate `src/lib/supabase/database.types.ts`. No database change in this plan.
- Tools: `node node_modules/typescript/bin/tsc --noEmit` must stay at 0 errors; `node node_modules/eslint/bin/eslint.js <paths>` clean; `node node_modules/vitest/vitest.mjs run tests/<file>`. (`npm run` is broken by the `&` in the path.) Files use CRLF line endings: keep them.
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Work on branch `registrations-page-redesign`. Never push or merge without the owner's yes.

## Review Focus

- Searching while a filter is on must keep that filter (today only status and scopes are carried). Test it.
- Pressing a status tab while a search and filters are on keeps them (existing `registrationHref` behaviour; test it on the new toolbar).
- Filter badge counts filters, not the search text and not the status tab; "Reset" clears filters and search but keeps the status tab.
- A batch with no `publicSlug` shows no "Copy public ID page link" on the Student IDs page.
- The tools menu is keyboard reachable (opens with Enter, closes with Escape) and every link carries the batch id.

---

### Task 1: Filter count helper

**Files:**
- Modify: `src/components/admin/registrations/query.ts`
- Test: `tests/registration-query.test.ts` (create)

**Interfaces:**
- Produces: `activeFilterCount(q: RegistrationQuery): number` — counts set values among `mode`, `region`, `optionLabel`, `optionScopes`. Ignores `status`, `q`, `p`, `pageId`, `agentId`.

- [ ] **Step 1: Write the failing tests** in `tests/registration-query.test.ts`: `activeFilterCount({})` is 0; `({ status: "paid", q: "ali" })` is 0; `({ mode: "live", optionScopes: "full,1" })` is 2; `({ region: "PK", optionLabel: "Recorded — Modules: M4", mode: "recorded" })` is 3; empty strings count as 0.
- [ ] **Step 2: Run** `node node_modules/vitest/vitest.mjs run tests/registration-query.test.ts`. Expected: FAIL (not exported).
- [ ] **Step 3: Implement** `activeFilterCount` in `query.ts`.
- [ ] **Step 4: Run the test again.** Expected: PASS.
- [ ] **Step 5: Commit** `feat(registrations): count active filters`.

### Task 2: Extract status tabs

**Files:**
- Create: `src/components/admin/registrations/StatusTabs.tsx`
- Modify: `src/components/admin/registrations/RegistrationFilters.tsx` (use `StatusTabs` instead of its inline tab list)
- Test: `tests/registration-status-tabs.test.tsx` (create)

**Interfaces:**
- Produces: `StatusTabs({ basePath, filters, counts, scroll }: { basePath: string; filters: RegistrationQuery; counts: Record<RegistrationStatus | "all", number>; scroll?: boolean })`. Same links and `aria-current` as today. `scroll` makes the row one line that slides sideways (`overflow-x-auto`, no wrap) for the campaign page; default keeps today's wrapping.

- [ ] **Step 1: Write failing tests**: renders six tabs with counts; the active tab has `aria-current="page"`; a tab link keeps `q` and `region` from `filters` and resets `p`; with `scroll` the container has `overflow-x-auto`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Move the tab markup out of `RegistrationFilters.tsx` into `StatusTabs.tsx` and render it there.** The All registrations page must look unchanged.
- [ ] **Step 4: Run these tests plus `tests/landing-registrations-list-ui.test.tsx`.** Expected: PASS.
- [ ] **Step 5: Commit** `refactor(registrations): extract status tabs`.

### Task 3: Batch tools menu

**Files:**
- Create: `src/components/admin/registrations/BatchToolsMenu.tsx`
- Test: `tests/batch-tools-menu.test.tsx` (create)

**Interfaces:**
- Produces: `BatchToolsMenu({ pageId, base }: { pageId: string; base: string })` where `base` is `/dashboard/admin/enrollments/registrations`. A button labelled "Batch tools" opening a menu (built on `components/ui/dropdown-menu.tsx`) with these links, in this order and these words: "Sheet sync" `${base}/sheet/${pageId}`, "Classes" `${base}/campaign/${pageId}/sessions`, "Student IDs" `${base}/campaign/${pageId}/ids`, "Progress reports" `${base}/campaign/${pageId}/reports`, "Portal access" `${base}/campaign/${pageId}/portal`.

- [ ] **Step 1: Write failing tests**: button "Batch tools" exists; after click, five menuitems with the exact hrefs above; Escape closes it.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** the component with the Stitch screen's look (menu width, icons, spacing).
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat(registrations): batch tools menu`.

### Task 4: Campaign toolbar (search, Filters, tabs)

**Files:**
- Create: `src/components/admin/registrations/CampaignToolbar.tsx` (client)
- Test: `tests/campaign-toolbar.test.tsx` (create)

**Interfaces:**
- Consumes: `StatusTabs`, `activeFilterCount`, `QuickFilters` (unchanged, reused inside the panel), `registrationHref`.
- Produces: `CampaignToolbar({ basePath, filters, counts, options }: { basePath: string; filters: RegistrationQuery; counts: Record<RegistrationStatus | "all", number>; options: { regions: string[]; optionLabels: string[] } })`.
  - Search form: GET to `basePath`, input `q` (placeholder "Search name, email or reference"), plus hidden inputs carrying `status`, `mode`, `region`, `optionLabel`, `optionScopes` so a search never drops a filter.
  - "Filters" button with a count badge from `activeFilterCount(filters)` (badge hidden at 0). It opens a panel (bottom sheet on phone, dropdown panel on PC, per the Stitch screen) holding: a GET form with Country, What they bought, Live or recorded selects, `QuickFilters`, an Apply button (label from the Stitch screen), hidden `q` and `status`, and a "Reset" link to `registrationHref(basePath, { status: filters.status })`.
  - Then `<StatusTabs ... scroll />`.

- [ ] **Step 1: Write failing tests**: badge shows "2" for `{ mode: "live", optionScopes: "full" }` and is absent for `{}`; search form contains hidden inputs for every set filter; panel is closed until "Filters" is pressed, then shows the three selects and the three quick buttons; Reset href keeps only `status`.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** the toolbar from the Stitch screens. The panel closes on Escape.
- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** `feat(registrations): campaign toolbar with filters panel`.

### Task 5: Rewire the campaign page and remove the ID buttons

**Files:**
- Modify: `src/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/page.tsx` (remove the five-link row; pass `pageId` and `DETAIL_BASE` down)
- Modify: `src/components/admin/registrations/CampaignRegistrations.tsx` (header gets `BatchToolsMenu` on the right; replace `RegistrationFilters` with `CampaignToolbar`; delete the Download IDs button, "People without an ID" text, Copy public ID page link button, `idNote`/`idBusy` state, `downloadIds`, `copyIdLink`, `idSelection`, `idLabel`, `filterActive` and now-unused imports)
- Modify: `src/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/id-actions.ts` (delete `getSelectionIdList` and the file if nothing else uses it; check with a search first)
- Modify tests: `tests/participant-campaign-page-ui.test.tsx` (lines about the ID buttons now expect them absent and "Batch tools" present), delete `tests/registration-id-selection.test.tsx` (it tests the removed button)

**Interfaces:**
- Consumes: `BatchToolsMenu`, `CampaignToolbar` (Tasks 3 and 4). `CampaignRegistrations` props stay the same; `publicSlug` is no longer used by it, so drop it from the props and from the page.

- [ ] **Step 1: Update tests first**: in `participant-campaign-page-ui.test.tsx` assert no button named `/^Download IDs/` and no "Copy public ID page link"; assert "Batch tools" and "Filters" buttons exist; delete `registration-id-selection.test.tsx`.
- [ ] **Step 2: Run both, expect FAIL.**
- [ ] **Step 3: Make the edits above.** Keep selection, message bar, row status pop-up and "Messages sent" exactly as they are.
- [ ] **Step 4: Run** `tsc --noEmit`, eslint on the touched paths, and `tests/participant-campaign-page-ui.test.tsx tests/landing-registrations-list-ui.test.tsx tests/participant-builder-ui.test.tsx tests/registration-back-link.test.ts`. Expected: all pass, 0 type errors.
- [ ] **Step 5: Commit** `feat(registrations): calm batch page with filters panel and tools menu`.

### Task 6: Copy public ID page link on the Student IDs page

**Files:**
- Modify: `src/app/dashboard/admin/enrollments/registrations/campaign/[pageId]/ids/page.tsx` (read the slug with `getRegistrationPageSlug(pageId)` from `@/lib/data/landing-registration-admin`, pass `publicSlug` down)
- Modify: `src/components/admin/ids/StudentIdsPanel.tsx` (new optional prop `publicSlug?: string | null`; when set, a "Copy public ID page link" button next to "Download ID PDF", copies `${window.location.origin}/ids/${publicSlug}`, shows "Link copied." or the same failure sentence the old button used: "Could not copy the link. Please copy it from the address of the public page.")
- Test: `tests/student-ids-panel.test.tsx` (add cases)

**Interfaces:**
- Produces: `StudentIdsPanel({ pageTitle, rows, publicSlug }: { pageTitle: string; rows: IdRow[]; publicSlug?: string | null })`.

- [ ] **Step 1: Write failing tests**: with `publicSlug="ppc-batch-3"` the button exists and writes `<origin>/ids/ppc-batch-3` to the clipboard; with no slug the button is absent; a blocked clipboard shows the failure sentence and does not throw.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** the prop, the button and the page change. Update `tests/student-ids-page.test.tsx` if it mocks the data layer (add the slug function to the mock).
- [ ] **Step 4: Run both test files, `tsc --noEmit` and eslint.** Expected: PASS, 0 errors.
- [ ] **Step 5: Commit** `feat(ids): copy public ID page link lives on Student IDs`.

### Task 7: Check in a real browser

**Files:** none (verification only).

- [ ] **Step 1:** Start `node node_modules/next/dist/bin/next dev -p 3000`, sign in with the admin test login (localhost only), open the PPC Batch 3 campaign page.
- [ ] **Step 2:** At 390px and 1440px: first screen shows only title, count, search, Filters, Batch tools, status tabs, list. Open Filters: pick a country, Apply, badge shows 1, list narrows, a status tab press keeps it, a search keeps it, Reset clears it. Open Batch tools: all five links open the right page; Student IDs shows the Copy public ID page link. Open a person and press Back: returns to the same filtered list. Change nothing on live data (open the status pop-up and close it without saving).
- [ ] **Step 3:** Stop the dev server. Run `tsc --noEmit`, eslint on `src/components/admin src/app/dashboard/admin/enrollments`, and `node node_modules/next/dist/bin/next build` only if no dev server is running (build changes a page).
- [ ] **Step 4:** Report what was seen, with phone and PC results, to the owner. Do not push.
