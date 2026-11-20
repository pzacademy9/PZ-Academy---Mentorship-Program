# Menu tidy-up, collapsible sidebar and covers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shorten the admin menu (move five items into Settings and Notifications), let the PC sidebar collapse to icons, and show course covers on the Registrations campaign cards and the Programs list.

**Architecture:** Menu content stays in `src/components/dashboard/nav.ts`; five entries are removed and their pages stay at the same addresses. A new `ADMIN_TOOLS` list (same file) feeds link cards on the Settings page and the active-item alias map. Sidebar collapse is local state in `Sidebar.tsx` saved in localStorage. Covers reuse `isAllowedCoverUrl` + `coverProxyUrl` through one small shared component.

**Tech Stack:** Next.js 14.2.5 App Router, TypeScript, Tailwind (pz-* tokens), Supabase (service-role reads), vitest + Testing Library, lucide-react.

**Spec:** `docs/superpowers/specs/2026-11-19-menu-and-covers-design.md`

## Global Constraints

- No database change. No page address changes. Every moved page keeps its current area permission (`src/lib/team/areas.ts` route map is untouched).
- Never regenerate `src/lib/supabase/database.types.ts` (not needed here).
- Colours: backgrounds and borders use pz-solid-* or landing-* tokens, or the existing pz-primary / pz-surface-container-* family; pz-deep, pz-mid, pz-danger are text only. No `eslint-disable` for `@typescript-eslint`.
- Owner copy: short plain words, calm, no exclamation marks, no sales words.
- Source files often use CRLF: keep each file's existing line endings.
- Run tools directly (the `&` in the path breaks `npm run`): `node node_modules/typescript/bin/tsc --noEmit`, `node node_modules/vitest/vitest.mjs run tests/<file>`, `node node_modules/eslint/bin/eslint.js <paths>`.
- Colours and layout of new UI: check Stitch project `11811490301995978699` first. If no screen exists, STOP at the UI step and hand the owner a phone (390px) and a PC (1440px) prompt (see Task 0).
- Branch: `menu-and-covers` from `main`. Do not push or merge without the owner's yes.

## Review Focus

- A manager with only some areas opens Settings: sees only the tool cards for areas they have; a student/mentor/sales agent sees none and no "Admin tools" heading.
- localStorage unavailable or throws (private window): sidebar renders expanded, no crash.
- Course has no cover, a broken URL, a non-allowed host, or a Drive URL: card still renders; Drive goes through `/api/cover/<id>`; disallowed host shows the placeholder.
- Sales Hub and Affiliates hub modes of the sidebar still work after the Sales Hub item leaves the normal list.
- Notice page and the four tool pages highlight "Notifications" and "Settings" (not nothing) in the menu.
- Collapsed sidebar: every icon link still has an accessible name and a visible focus ring.

---

### Task 0: Stitch check (controller, not an implementer)

- [ ] Search Stitch project `11811490301995978699` (and `list_projects`) for: collapsed sidebar, Settings "Admin tools" cards, campaign card with cover, Programs row with cover. Port any screen that exists.
- [ ] For each missing screen, give the owner a phone and a PC prompt, one at a time, and wait for the screens before Tasks 3 to 6 UI steps. Tasks 1 and 2 (logic) may start meanwhile.

### Task 1: Shared cover component

**Files:**
- Create: `src/components/ui/CoverThumb.tsx`
- Test: `tests/cover-thumb.test.tsx`

**Interfaces:**
- Consumes: `isAllowedCoverUrl(url)` from `src/lib/classes/cover.ts`; `coverProxyUrl(url)` from `src/lib/feedback/cover-url.ts`.
- Produces: `export function CoverThumb(props: { url: string | null | undefined; title: string; className?: string }): JSX.Element`. Renders a fixed-aspect box (`aspect-[16/9]`, `overflow-hidden`, rounded top). With an allowed URL it renders `<img src={coverProxyUrl(url)} alt="" loading="lazy" className="h-full w-full object-cover">`. Otherwise a `bg-pz-surface-container-high` block showing the first letter of `title` (uppercase, `aria-hidden`). On image `onError` it falls back to the placeholder (needs `"use client"`).

- [ ] **Step 1: Write failing tests** in `tests/cover-thumb.test.tsx`: (a) allowed Supabase URL renders an `img` with that src (set `process.env.NEXT_PUBLIC_SUPABASE_URL` in the test); (b) a Drive URL `https://drive.google.com/thumbnail?id=ABC123` renders `src="/api/cover/ABC123"`; (c) `null`, `""` and `https://evil.example/x.png` render no `img` and show the title's first letter; (d) firing `error` on the `img` swaps to the placeholder.
- [ ] **Step 2: Run it, show RED.** `node node_modules/vitest/vitest.mjs run tests/cover-thumb.test.tsx`
- [ ] **Step 3: Implement `CoverThumb`** in the file above using local `useState` for the error flag. Show GREEN.
- [ ] **Step 4: Commit** `feat(ui): CoverThumb with safe cover and placeholder`.

### Task 2: Covers on Registrations campaign cards

**Files:**
- Modify: `src/lib/data/participant-campaigns.ts` (`Campaign` interface, `listCampaigns` page query)
- Modify: `src/components/admin/registrations/CampaignList.tsx` (`CampaignCard`)
- Test: `tests/campaign-list-cover.test.tsx`

**Interfaces:**
- Consumes: `CoverThumb` (Task 1).
- Produces: `Campaign.coverUrl: string | null`. Source: the linked course's `thumbnail_url` (`landing_pages.course_id` -> `courses.thumbnail_url`); if the page has no course or the course has none, use `landing_pages.class_cover_url`; else `null`.

- [ ] **Step 1: Write failing test** rendering `CampaignList` with two campaigns, one with `coverUrl` (allowed host) and one `null`: first shows an `img`, second shows the placeholder letter; both still link to the campaign.
- [ ] **Step 2: Run, show RED.**
- [ ] **Step 3: Extend `listCampaigns`**: select `id, title, status, course_id, class_cover_url` from `landing_pages`, then one chunked `courses` lookup (`id, thumbnail_url`) for the distinct non-null `course_id`s; set `coverUrl` per rule above. Update the `Campaign` literal at the creation site (`coverUrl: null`).
- [ ] **Step 4: Render `CoverThumb` at the top of `CampaignCard`** (card padding moves inside; cover is full width, `rounded-t-xl`). Keep the status chip and "Open campaign" row below it. Stitch screen wins over this layout if one exists.
- [ ] **Step 5: Run the test (GREEN), `tsc`, eslint on the three files.** Commit `feat(registrations): show course cover on campaign cards`.

### Task 3: Covers on the Programs list

**Files:**
- Modify: `src/lib/data/admin-lms.ts` (`ProgramListRow`, `listPrograms`)
- Modify: `src/components/admin/program/ProgramLibraryTable.tsx`
- Test: `tests/program-library-cover.test.tsx`

**Interfaces:**
- Consumes: `CoverThumb`.
- Produces: `ProgramListRow.thumbnailUrl: string | null` (from `courses.thumbnail_url`).

- [ ] **Step 1: Write failing test**: a row with a cover shows an `img`; a row without shows the placeholder; the row still links to the program.
- [ ] **Step 2: Run, show RED.**
- [ ] **Step 3: Add `thumbnail_url` to the `courses` select and map it** in `listPrograms`. In `ProgramLibraryTable`, show a small cover (about 64px wide, same aspect) next to the title. The list is a table today: if the file renders cards on phone width, use the full-width cover there. Report in the finish note which it was.
- [ ] **Step 4: GREEN, `tsc`, eslint.** Commit `feat(programs): show course cover in the program list`.

### Task 4: Move five items out of the main menu

**Files:**
- Modify: `src/components/dashboard/nav.ts`
- Modify (tests): `tests/dashboard-nav.test.ts`, `tests/team-nav.test.ts`, `tests/sales-hub-nav.test.ts`, `tests/admin-people-move.test.ts` (check each for the removed labels)
- Test: `tests/nav-admin-tools.test.ts`

**Interfaces:**
- Produces in `nav.ts`:
  - `export interface AdminToolCard { label: string; description: string; href: string; icon: NavItem["icon"]; areas: readonly Area[] }`
  - `export const ADMIN_TOOLS: AdminToolCard[]` in this order: Agent Leaderboard (`/dashboard/admin/agent-leaderboard`, `["sales_hub"]`), Sales Hub (`SALES_HUB_BASE`, `["sales_hub"]`), Payment Accounts (`/dashboard/admin/payment-accounts`, `["payment_accounts"]`), Terms and Conditions (`/dashboard/admin/terms`, `["terms"]`). One plain-word description each (for example "See how each agent is doing." / "Contacts, cohorts, audiences and campaigns." / "Where students send their payments." / "The terms students agree to when they register.").
  - `export function toolsForRole(role: Role, areas?: readonly Area[]): AdminToolCard[]` with the same rules as `navForRole`: only admin, manager, super_admin; super_admin sees all; with `areas` undefined a manager sees none; otherwise any card whose `areas` intersect.
  - `ROUTE_ALIASES` (rename of `HUB_PATH_ALIASES`, still used by `activeHrefFor`) gains prefix rules: the four tool addresses -> `/dashboard/settings`, and `/dashboard/admin/notifications` -> `/dashboard/notifications`. Sales Hub sub-pages are already handled by hub mode.
- Removes from `NAV_ITEMS`: Payment Accounts, Terms and Conditions, Agent Leaderboard, Sales Hub, Send Notice.

- [ ] **Step 1: Write failing tests** in `tests/nav-admin-tools.test.ts`: (a) `navForRole("super_admin")` labels contain none of the five; (b) `toolsForRole("super_admin")` returns all four in order; (c) a manager with `["payment_accounts"]` gets only Payment Accounts; (d) manager with `undefined` areas, a student, a mentor and a sales agent get `[]`; (e) `activeHrefFor` returns `/dashboard/settings` for `/dashboard/admin/terms` and `/dashboard/admin/payment-accounts`, and `/dashboard/notifications` for `/dashboard/admin/notifications`, given the normal item list; (f) hub mode: `isSalesHubPath` still true for `SALES_HUB_BASE`.
- [ ] **Step 2: Run it, show RED.**
- [ ] **Step 3: Implement** the list changes. The alias lookup must support prefixes (match `pathname === key || pathname.startsWith(key + "/")`), not only exact keys; keep the existing Import / Merge exact aliases working. Remove now-unused icon imports.
- [ ] **Step 4: Update the four existing nav tests** so removed labels are asserted absent from the main menu (and `Settings`/`Notifications` present). Keep each test's intent: no permission loosened.
- [ ] **Step 5: Run those tests plus `tests/dashboard-nav.test.ts tests/team-nav.test.ts tests/sales-hub-nav.test.ts tests/admin-people-move.test.ts`. All GREEN, `tsc` 0.**
- [ ] **Step 6: Commit** `feat(nav): move five admin items into Settings and Notifications`.

### Task 5: Admin tools on Settings, notice button on Notifications

**Files:**
- Create: `src/components/dashboard/AdminToolCards.tsx`
- Modify: `src/app/dashboard/settings/page.tsx`, `src/app/dashboard/notifications/page.tsx`
- Test: `tests/settings-admin-tools.test.tsx`, `tests/notifications-notice-button.test.tsx`

**Interfaces:**
- Consumes: `toolsForRole`, `ADMIN_TOOLS` (Task 4); `effectiveAreas(role, await getCustomAccess(userId))` as used in `src/app/dashboard/layout.tsx:38`; the person's role from the same source the layout uses.
- Produces: `export function AdminToolCards({ tools }: { tools: AdminToolCard[] }): JSX.Element | null` (returns `null` when `tools` is empty; otherwise an "Admin tools" heading and a responsive grid of cards, each a `Link` with icon, label, description, min height 48px).
- Notifications page: a link button "Send a notice" to `/dashboard/admin/notifications` shown only when the person's areas include `notifications` (super_admin always).

- [ ] **Step 1: Write failing tests**: (a) `AdminToolCards` renders four links with the right hrefs, nothing for `[]`; (b) Settings page content for a manager with `["terms"]` shows only the Terms card (render the page with its data helpers mocked, as other page tests in `tests/` do); (c) the Notifications header shows "Send a notice" for super_admin and not for a student.
- [ ] **Step 2: Run, show RED.**
- [ ] **Step 3: Implement** `AdminToolCards`; in the Settings page compute role and areas the same way the layout does (reuse, do not copy logic: extract a tiny helper only if the layout code is a short pure function); render the cards below `SettingsForm`. Add the notice button in the Notifications header row (right side, wraps under the title on phone).
- [ ] **Step 4: GREEN, `tsc`, eslint.** Commit `feat(settings): admin tool cards, notice button on Notifications`.

### Task 6: Collapsible sidebar (PC)

**Files:**
- Modify: `src/components/dashboard/Sidebar.tsx`
- Test: `tests/sidebar-collapse.test.tsx`

**Interfaces:**
- Produces: inside `Sidebar`, state `collapsed` (boolean). Storage key `pz.sidebar.collapsed` with value `"1"` or `"0"`. Read once after mount in a `useEffect` inside try/catch (default expanded, so server and first client render match); written on toggle in try/catch.
- Collapsed desktop: `<aside>` width `w-16` (expanded `w-60`), transition on width; each link shows only the icon, keeps `aria-label={item.label}` and `title={item.label}`; the logo block shows only the PZ circle; hub section headings and the "Sales Hub" / "Affiliates" sub-heading are hidden. A toggle `button` at the bottom with `aria-label` "Collapse menu" / "Expand menu" and `aria-expanded`, min 44px, visible focus ring. Mobile bottom bar unchanged.

- [ ] **Step 1: Write failing tests**: (a) default expanded, labels visible; (b) clicking the toggle hides the text labels, keeps each link's accessible name, and writes `"1"`; (c) with `localStorage.getItem` returning `"1"` the sidebar mounts collapsed; (d) with `localStorage` methods throwing, it renders expanded and the toggle does not crash; (e) the toggle is reachable by keyboard (`Tab`, `Enter`) and flips `aria-expanded`.
- [ ] **Step 2: Run, show RED.**
- [ ] **Step 3: Implement** in `Sidebar.tsx` for all three desktop modes (normal, Sales Hub, Affiliates hub). Keep the mobile code untouched.
- [ ] **Step 4: GREEN, `tsc`, eslint.** Commit `feat(sidebar): collapsible to icons on PC`.

### Task 7: Whole-branch checks

- [ ] `node node_modules/typescript/bin/tsc --noEmit` returns 0 errors.
- [ ] Focused tests: every test file named above plus `tests/client-boundary-values.test.ts`. Known failing tests that are not ours stay as they are.
- [ ] Stop any dev server, then `node node_modules/next/dist/bin/next build` (pages changed). Then a phone and a PC browser look on localhost (admin test login): sidebar collapse and reload, Settings cards, Notifications button, both cover places with and without a cover, and no sideways scroll on these pages.
- [ ] Strict-UTF-8 scan of every changed file (`python -I`). Opus whole-branch review. Do not push.
