# Contacts Guided Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Contacts page a guided three-step page with paging, a clean list, and a clear "what do you want to do" area.

**Architecture:** Keep `ContactsPanel` as the owner of state (search, filters, page, selection) and the existing handlers. Split the view into small components: a results list with pager, and an action area. No new route; the existing `GET /api/admin/crm/contacts` already takes `offset` and `limit`.

**Tech Stack:** Next.js 14.2.5, React client components, Tailwind pz tokens, vitest + testing-library.

**Spec:** `docs/superpowers/specs/2026-11-18-contacts-guided-design.md` (read first). Stitch: project 13117286791417011091, "Contacts - Sales Hub (Desktop 1440px)" and "(Mobile 390px)".

## Global Constraints

- Tests first. Focused tests only: `node node_modules/vitest/vitest.mjs run tests/<file>`; `npm run` and `npx` are broken (the `&` in the path).
- Before each commit: `node node_modules/typescript/bin/tsc --noEmit` (0 errors) and `node node_modules/eslint/bin/eslint.js <changed paths>`.
- Keep CRLF if sibling files use it. No `eslint-disable` for `@typescript-eslint`. Never touch `database.types.ts`. No migration, no new API route.
- Colours: backgrounds and borders use `pz-solid-*`/`landing-*` or the `pz-primary` / `pz-surface-container-*` family already in ContactsPanel; `pz-deep`, `pz-mid`, `pz-danger` are text only.
- Calm plain words, no exclamation marks, no jargon. Do not copy invented Stitch content (fake names, "Updated just now", fake bottom menu).
- Menus and panels: Escape closes, focus returns to the opener. 44px tap targets on phone. No horizontal scroll at 390px.
- Do not export non-component values from "use client" files for server use.
- Never commit contact data; test data uses fake `example.com` emails. Stage by path only. Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Leave untracked docs files alone. Branch `contacts-guided`; do not push.

## Review Focus

- Selected people stay ticked across pages and searches; "Select all shown" only affects the current page; the "N selected" number counts all picks.
- Page beyond the end (the total shrinks after a new search): never shows an empty page 5 of 3; Next is off on the last page, Previous off on the first.
- An older search answer arriving after a newer one never paints stale rows (keep the existing ticket guard), including when paging quickly.
- Failed list request: calm error with Try again, old rows stay; never a blank page.
- A contact with no name, no phone or no email still reads clearly ("Name not given", "Phone needs review", no "undefined").
- More menu: Escape closes and focus returns to the More button; arrow/Tab reachable; the converted form can be cancelled.

---

### Task 1: Find people and the list with paging

**Files:**
- Create: `src/components/admin/crm/ContactsList.tsx` (list: phone cards, PC 4-column rows, empty state, pager)
- Modify: `src/components/admin/crm/ContactsPanel.tsx` (state: `page`, error; step 1 "Find people" card; calls the list component)
- Test: `tests/contacts-guided-list.test.tsx`

**Interfaces:**
- Produces: `ContactsList({ rows, total, page, pageSize, busy, error, selected, onToggle, onToggleAllShown, onPage, onRetry })` where `rows: ContactRow[]` (type from `@/lib/data/admin-crm-contacts`, import type only), `selected: Set<string>`, `page` is 1-based.
- Produces in the panel: `loadPage(page: number, next?: { courseName?: string; importBatchId?: string })` that calls `GET /api/admin/crm/contacts?limit=50&offset=(page-1)*50&...`, with the existing ticket guard.

- [ ] **Step 1: Write failing tests** (`tests/contacts-guided-list.test.tsx`, mock `fetch`, `next/navigation`, `sonner`): renders "1 Find people" with a search box, a Course dropdown and a "Class group" dropdown; shows "Showing 1 to 50 of 2,111 people"; Next calls the contacts URL with `offset=50` and shows "Showing 51 to 100 of 2,111 people"; Previous is disabled on page 1 and Next disabled on the last page; a search or filter change fetches `offset=0` and resets to page 1; ticks persist after Next and back; "Select all shown" ticks only the current page; a list answer from an older request that arrives last does not replace newer rows; a failed request shows an alert with "Try again" and keeps the old rows; a contact with empty `fullName` and null phone shows "Name not given" and "Phone needs review" and never "undefined"; an unsubscribed contact shows "Unsubscribed"; each person links to `/dashboard/admin/sales-hub/contacts/<id>`; zero rows shows "No one matches. Try a shorter search." when a search or filter is active, and the existing "No contacts yet" with the import link when nothing is filtered; course chips show course names (via `courseNameFromLabel`) with duplicates removed.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** `ContactsList` and the panel changes. Phone: cards with a large tick box, name bold, email, phone, course chips, country tag. PC (md and up): rows with tick box, Person (name link, email and phone under it), Registered for (chips), Country; Source and Purchases columns are dropped. Pager row under the list with Previous and Next and the "Showing X to Y of N people" line. Total shrinking below the current page jumps to the last page that exists.
- [ ] **Step 4: Run test, tsc, eslint; expect PASS.**
- [ ] **Step 5: Commit** `feat(contacts): find people step and paged list`.

### Task 2: The "What do you want to do?" area

**Files:**
- Create: `src/components/admin/crm/ContactsActions.tsx`
- Modify: `src/components/admin/crm/ContactsPanel.tsx` (move the hand-off handlers and the mark-as-converted form here or pass them in)
- Test: `tests/contacts-guided-actions.test.tsx`

**Interfaces:**
- Consumes: the panel's `selected: Set<string>`, `useSelectedInCampaign`, `useSelectedInWhatsApp`, `assignSelectedToAgent`, and the mark-converted state and `markSelectedConverted` already in ContactsPanel.
- Produces: `ContactsActions({ count, onEmail, onWhatsApp, onAssign, onClear, convert })` where `convert: { open: boolean; onOpenChange: (o: boolean) => void; children: React.ReactNode }` or an equivalent that renders the existing form inside a panel opened from More.

- [ ] **Step 1: Write failing tests:** with 0 picks the area shows "Tick people to see what you can do" and no buttons; with 3 picks it shows "3 people selected" (singular "1 person selected"), a primary "Send an email" button, and a "More" button; "Send an email" writes the picked ids to sessionStorage under `SELECTED_CONTACTS_STORAGE_KEY` and goes to `/dashboard/admin/sales-hub/campaigns`; More opens a menu with "Send on WhatsApp", "Give to a sales agent", "Mark as converted"; Escape closes the menu and focus returns to More; WhatsApp writes the same key and goes to `/dashboard/admin/sales-hub/whatsapp`; Give to a sales agent writes `ASSIGN_CONTACTS_STORAGE_KEY` and goes to `/dashboard/admin/sales-hub/assign`, and with more than 5000 picks shows the toast "Select 5000 contacts or fewer at a time." and does not navigate; "Mark as converted" opens the existing form (course or program name, date) with its Cancel returning focus to More; a sessionStorage failure shows "Could not hand off the selection — try again."; "Clear" empties the picks.
- [ ] **Step 2: Run, expect FAIL.**
- [ ] **Step 3: Implement** the component in the Stitch card style. Phone: sticky bottom bar `bottom-[calc(4.5rem+env(safe-area-inset-bottom))]`, capped to about half the viewport with scroll. PC: sticky card in a right column (list left, card right). Reuse existing handler logic; do not change what each action does.
- [ ] **Step 4: Run test, tsc, eslint; expect PASS.**
- [ ] **Step 5: Commit** `feat(contacts): what do you want to do area`.

### Task 3: Page frame, step headings, finish

**Files:**
- Modify: `src/app/dashboard/admin/sales-hub/contacts/page.tsx` (heading and intro line), `src/components/admin/crm/ContactsPanel.tsx` (step headings "1. Find people", "2. Pick people", "3. What do you want to do?" with focus not stolen on load)
- Create: `docs/superpowers/plans/2026-11-18-contacts-guided-owner-steps.md`
- Test: `tests/contacts-guided-page.test.tsx`

- [ ] **Step 1: Write failing tests:** the intro reads "Everyone who has registered or bought. Find people, then choose what to do."; the three step headings exist in order; the whole flow works: type a search, press Search, tick two people, the area says "2 people selected"; page change keeps the picks.
- [ ] **Step 2: Run, expect FAIL. Step 3: implement. Step 4: run all three new test files plus `tests/client-boundary-values.test.ts`, tsc (0 errors), eslint.**
- [ ] **Step 5:** Run `node node_modules/next/dist/bin/next build` once (no dev server must be up); expect success. Write the owner steps (no paste needed; how to look; what to check on a phone) and commit `docs(contacts): owner steps`.
