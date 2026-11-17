# Promo codes: percent after any code, delete, PDF downloads: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every ordinary promo code accepts `CODE-NN%`, admin can delete unused ordinary codes, and admin can download Ordinary / Sales agent / Affiliate code lists as PDF.

**Architecture:** The suffix rule extends the existing resolver (`resolvePromoWith`) with one pure helper beside the owner-code one. Delete is a new `DELETE` handler plus a data function that refuses used and owner codes. PDFs are built in the browser with the existing `jspdf` dependency from pure row-builder functions, so the Vercel free plan does no extra work. No migration.

**Tech Stack:** Next.js 14.2.5, Supabase (service role via `createAdminSupabase()`), vitest, jsPDF 4, existing `Dialog`/`Button` UI components.

**Spec:** `docs/superpowers/specs/2026-11-17-promo-codes-suffix-delete-pdf-design.md`

## Global Constraints

- Branch: `promo-codes-suffix-delete-pdf`, made from `origin/main`. Never push or merge to main. The spec and this plan are committed first on this branch (stage by path).
- Ceiling: `landing_promo_settings.max_percent` (default 30), read with `getPromoSettings()`. A typed percent above it is refused with the existing `over_max` result.
- Typed plain, an ordinary code behaves exactly as today. Exact stored code is always tried first.
- Delete: only ordinary codes (`isOwnerCode` false) with zero `landing_registrations` rows pointing at them (test rows count). The server decides; the UI only hides the button.
- PDF Share versions contain no use counts, status, internal limits, or emails. Agent/affiliate PDFs show names.
- Wording: calm, plain, no exclamation marks, no sales words. Owner is not technical.
- Source files often use CRLF: preserve each file's line endings. New files: LF is fine.
- `npm run`/`npx` are broken by `&` in the path. Run directly: `node node_modules/typescript/bin/tsc --noEmit` (0 errors), `node node_modules/vitest/vitest.mjs run tests/<file>`, `node node_modules/eslint/bin/eslint.js <paths>`.
- Never regenerate `src/lib/supabase/database.types.ts` (no schema change here). No `eslint-disable` for `@typescript-eslint`.
- Shared constants/helpers imported by server pages must not live in a `"use client"` file.
- Stitch: no screen exists for the Promo codes admin page (checked 2026-11-17, project 13117286791417011091 has only affiliate screens). Owner ruling needed: build the buttons and dialog from existing components with no new screen. Do not start Tasks 4 and 5 until the controller confirms the owner agreed.
- Commit trailer: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Stage by path only. Leave untracked `docs/lead-capture-go-live-guide.md` and the two `docs/superpowers/plans/2026-11-02-*.md` files alone.
- Known failing tests that are not ours: landing-event-sheet, landing-hero-render, landing-polish-3, landing-route-hardening, pz-tokens, participant-recipients, participant-whatsapp-ui, gas-apply-registration-status, migrations-segment-source-dnc, participant-campaign-page-ui, registration-id-selection. landing-registrations-list-ui is flaky (re-run alone).

## Review Focus

Each line below has its test in the task named after it.

1. A suffix on a code that is off, expired, used up, or limited to another page must still be refused (Task 1).
2. `SAVE-10` is itself an ordinary code and `SAVE-10-5%` is typed: the last `-NN%` is the suffix, the base is `SAVE-10` (Task 1).
3. Typed with spaces and lowercase (`save -10 %`) works (Task 1).
4. A fixed-amount code with a suffix becomes a percent discount, ignoring its own fixed amounts and cap (Task 1).
5. Delete of a code whose only registrations are test rows is refused (Task 2).
6. Delete of a live agent or affiliate owner code is refused even with zero registrations (Task 2).
7. An empty list (no eligible codes) gives a plain message, never an empty PDF (Task 5).
8. A name with characters Helvetica cannot print does not crash the PDF; long names are cut to fit (Task 5).
9. More rows than fit one page add pages with the header repeated (Task 5).

---

### Task 1: Suffix on ordinary codes

**Files:**
- Modify: `src/lib/landing/registration/promo-suffix.ts`
- Modify: `src/lib/landing/registration/promo-resolve.ts`
- Modify: `src/components/admin/landing/promo/PromoCodesManager.tsx` (CeilingBox help line only)
- Test: `tests/landing-promo-suffix.test.ts`, `tests/landing-promo-resolve.test.ts`

**Interfaces:**
- Consumes: `parsePromoSuffix(typed)`, `effectiveOwnerPromo`, `PromoResolveDeps`, `isLiveOwnerCode` (all existing).
- Produces: `effectiveOrdinaryPromo(p: { code: PromoCode; typed: string; percent: number; globalMax: number }): { ok: true; promo: PromoCode } | { ok: false; reason: "over_max"; max: number }` in `promo-suffix.ts`. `resolvePromoWith` behaviour: exact stored code first (unchanged); else parse suffix; base found and live owner code, as today; base found and not a live owner code, now uses `effectiveOrdinaryPromo`; base missing, `NONE`.

- [ ] **Step 1: Write failing tests** in `tests/landing-promo-suffix.test.ts` for `effectiveOrdinaryPromo`: percent 15 under max 30 returns `{ ok: true }` with `promo.type === "percent"`, `value === 15`, `fixedAmounts` `{}`, `maxDiscountPercent === 0`, `code === typed`, same `id` as the base; percent 31 with max 30 returns `{ ok: false, reason: "over_max", max: 30 }`; a base with `type: "fixed"` and a `maxDiscountPercent` of 5 still gives value = typed percent. In `tests/landing-promo-resolve.test.ts`: ordinary `SAVE` (10%) plus typed `save -20 %` resolves to a promo with value 20 and id of `SAVE`; typed `SAVE` plain stays value 10; typed `SAVE-40%` returns `{ promo: null, overMax: 30 }`; `SAVE-10` stored as its own ordinary code plus typed `SAVE-10-5%` uses base `SAVE-10`; a stored code literally named `SAVE-5%` is matched exactly first; unknown base returns `{ promo: null, overMax: null }`; an inactive base with a suffix resolves (resolver does not judge) and `applyPromo` on the result returns `{ ok: false, reason: "inactive" }`, likewise for expired, used up, and a page not in `pageIds`.
- [ ] **Step 2: Run both files.** Expected: new tests FAIL.
- [ ] **Step 3: Implement `effectiveOrdinaryPromo`** in `promo-suffix.ts`, ceiling is `globalMax` only. In `resolvePromoWith`, replace the `!isLiveOwnerCode(owner)` rejection with a branch: owner code, `fromOwner`; otherwise, `effectiveOrdinaryPromo` mapped to `ResolvedPromo`. Rename the local `owner` variable to `base`. Update the file header comment (it says "on an owner code").
- [ ] **Step 4: Update the CeilingBox help line** from "For personal codes like ALI-1-20%. Anything higher is refused." to "Applies to every code typed with a percent after it, like PZ10-20%. Anything higher is refused."
- [ ] **Step 5: Run** `landing-promo-suffix`, `landing-promo-resolve`, `landing-registration-promo`, `promo-affiliate-owner`, `landing-promo-owner-admin`, `landing-promo-admin`. Expected: all PASS (owner behaviour unchanged). Then `tsc --noEmit` and eslint on the touched files.
- [ ] **Step 6: Commit** (spec, this plan, and the task's files) `feat: any promo code accepts a percent after it`.

---

### Task 2: Delete: data function and route

**Files:**
- Modify: `src/lib/data/landing-promo-codes.ts`
- Modify: `src/app/api/admin/landing-promo-codes/[id]/route.ts`
- Test: `tests/landing-admin-promo-routes.test.ts`, `tests/landing-promo-delete.test.ts` (new, data function with a mocked admin client; copy the mocking style of `tests/agent-promo-summary.test.ts`)

**Interfaces:**
- Consumes: `getPromoById(id)`, `createAdminSupabase()`, `requireAdmin("landing_pages")`, `isPageId`.
- Produces: `deletePromoCode(id: string): Promise<{ ok: true } | { ok: false; reason: "not-found" | "owner-code" | "used" | "db-error" }>` and `export async function DELETE(req, { params })` returning 200 `{ id }`, 404 `{ error: "Promo code not found" }`, 409 `{ error }` for used and owner-code, 500 on db-error.

- [ ] **Step 1: Write failing tests.** Data: unused ordinary code is deleted; missing code gives `not-found`; `isOwnerCode: true` gives `owner-code` and no delete call; one registration pointing at it gives `used`, no delete call; the count query does not filter `is_test` (a test-only row still gives `used`); a count error gives `db-error` and no delete. Route: non-admin gets 403; non-uuid id gets 404; each reason maps to its status; the 409 messages are "This code has been used, so it cannot be deleted. Pause it instead." and "This code belongs to a person. Change it from their own screen." (calm, plain).
- [ ] **Step 2: Run both files.** Expected: FAIL.
- [ ] **Step 3: Implement `deletePromoCode`.** Order: read the code (`getPromoById`), `not-found`; refuse owner codes; count `landing_registrations` where `promo_code_id = id` (head count, all rows); count error gives `db-error`; count above 0 gives `used`; delete by id and return ok. Add `DELETE` to the route file with the same guard and uuid check as `PATCH`. Add `deletePromoCode` to the mock list in the routes test.
- [ ] **Step 4: Run both files, tsc, eslint.** Expected: PASS, 0 errors.
- [ ] **Step 5: Commit** `feat: delete an unused promo code`.

---

### Task 3: Delete button in the admin list

Blocked until the controller confirms the Stitch ruling.

**Files:**
- Modify: `src/components/admin/landing/promo/PromoCodesManager.tsx`
- Test: `tests/landing-promo-admin.test.tsx`

**Interfaces:**
- Consumes: `DELETE /api/admin/landing-promo-codes/[id]`; `useAsyncAction`; the existing `Dialog` pieces.
- Produces: a Delete button in the `actions(p)` block for codes with `!p.isOwnerCode && p.usedCount === 0`; a confirm dialog.

- [ ] **Step 1: Write failing tests** (follow the file's existing render and fetch-mock style): an unused ordinary code shows "Delete"; a used code does not and shows the line "Used codes cannot be deleted. Pause them instead."; an owner code shows no Delete; clicking Delete opens a dialog "Delete PZ10?" with the text "This removes the code for good. People who already used it are not affected." and buttons "Delete code" and "Keep it"; Escape closes it and returns focus to the Delete button; "Delete code" calls `DELETE` on the right id, then `toast.success` and `router.refresh`; a 409 shows the server's message via `toast.error` and keeps the row.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement.** Hold the code being deleted in state next to `editing`; the dialog uses the same `Dialog` as the edit form; the destructive button is `variant="destructive"` if the `Button` component has it, else the nearest existing style. On phone width the card actions already wrap: keep a minimum 44px touch height as the other buttons do.
- [ ] **Step 4: Run, tsc, eslint.** **Step 5: Commit** `feat: promo code delete button with confirm`.

---

### Task 4: PDF row builders and renderer

**Files:**
- Create: `src/lib/landing/registration/promo-pdf.ts`
- Modify: `src/lib/landing/registration/promo-form.ts` (move `whereText` here from the manager as an exported function; keep behaviour; the manager imports it)
- Modify: `src/components/admin/landing/promo/PromoCodesManager.tsx` (import `whereText` instead of defining it)
- Test: `tests/landing-promo-pdf.test.ts`

**Interfaces:**
- Consumes: `PromoCode`, `PromoPageOption`, `promoState`, `describeDiscount`, existing `renderBatchPdf` layout constants as a style reference (`src/lib/pzid/batch-pdf.ts`).
- Produces, all pure except the renderer:
  - `publicCodeRows(codes: PromoCode[], pages: PromoPageOption[], now: Date): { code: string; discount: string; where: string; until: string }[]`: only codes with `!isOwnerCode` (any live owner code is excluded), `promoState(p, now) === "active"`. `discount` is `describeDiscount(p)`; `where` is `whereText(p, pages)` with "All pages" shown as "All courses"; `until` is `"Until 30 Nov 2026"` (Pakistan time, date only) or `""`.
  - `personCodeRows(kind: "agent" | "affiliate", codes: PromoCode[], people: { id: string; name: string }[], mode: "share" | "me"): { name: string; code: string; discount: string; status: string }[]`: owner codes whose `ownerAgentId` (agent) or `ownerAffiliateId` (affiliate) matches a person. `share` keeps only `active` codes and leaves `discount` and `status` as `""`. `me` keeps all, `discount` = `"<plainPercent>% off plain"`, `status` = `"On"` or `"Off"`. Sorted by name, case-insensitive.
  - `renderPromoPdf(spec: { title: string; madeOn: Date; columns: { label: string; x: number }[]; rows: string[][] }): jsPDF`: A4, title, "Made on 17 Nov 2026" line, header repeated on each page, rows cut to fit their column, new page at the bottom margin. Mirrors `renderBatchPdf`; Helvetica only.
  - `publicPdfSpec(rows)`, `personPdfSpec(kind, rows, mode)`: build the title and columns. Titles: "PZ Academy promo codes", "PZ Academy sales agent codes", "PZ Academy affiliate codes". Share personal PDFs have two columns (Name, Code); Me adds Discount and Status. Public has Code, Discount, Works on, Valid until.
  - `promoPdfFileName(kind: "public" | "agent" | "affiliate", madeOn: Date): string` as `pz-promo-codes-2026-11-17.pdf`, `pz-agent-codes-...`, `pz-affiliate-codes-...`.

- [ ] **Step 1: Write failing tests.** Rows: a live owner code, a paused code, an expired code, and a used-up code are all absent from `publicCodeRows`; a fixed-amount code reads "PKR 2,000 off"; an owner code whose owner is deleted (both owner ids null) counts as ordinary and is included; `until` shows the PKR-date. `personCodeRows`: share mode drops paused codes and has empty `discount`/`status`; me mode keeps them with "Off"; sorting is case-insensitive; a code with no matching person is dropped. Renderer: 100 rows gives more than one page (`pdf.getNumberOfPages()`); a 300-character name does not throw; a name with Urdu characters does not throw. File names carry the date.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement.** Move `whereText` first and keep its test green (`landing-promo-owner-admin`, `landing-promo-admin`).
- [ ] **Step 4: Run all promo tests, tsc, eslint, `tests/client-boundary-values.test.ts`.** Expected: PASS.
- [ ] **Step 5: Commit** `feat: promo code PDF builders`.

---

### Task 5: Download buttons on the Promo codes page

Blocked until the controller confirms the Stitch ruling.

**Files:**
- Create: `src/components/admin/landing/promo/PromoDownloads.tsx`
- Modify: `src/components/admin/landing/promo/PromoCodesManager.tsx` (render `PromoDownloads` under `CeilingBox` when codes exist; new optional props `affiliates?: { id: string; name: string }[]`, `canDownloadPeople?: boolean`)
- Modify: `src/app/dashboard/admin/landing-promo-codes/page.tsx` (when `canMakeLinks`, also read `listAffiliates()`, map to `{ id, name }`, pass both; otherwise pass empty and `canDownloadPeople={false}`)
- Test: `tests/landing-promo-downloads.test.tsx`

**Interfaces:**
- Consumes: Task 4 builders, loaded with a dynamic `import("@/lib/landing/registration/promo-pdf")` on click so jsPDF stays out of the page bundle; `jsPDF.save(fileName)`.
- Produces: `PromoDownloads({ codes, pages, agents, affiliates, canDownloadPeople })`.

- [ ] **Step 1: Write failing tests** (mock the dynamic import and `save`): three buttons "Ordinary codes (PDF)", "Sales agent codes (PDF)", "Affiliate codes (PDF)"; the last two are absent when `canDownloadPeople` is false; Ordinary downloads straight away with the `publicPdfSpec` rows; Agent and Affiliate open a dialog "Who will see this file?" with "Share in a group" (helper line "Shows name and code only.") and "For me" ("Also shows the discount and whether the code is on."), Escape closes it with focus returned, picking one saves the right file name; an empty row list shows `toast.error("There are no codes to put in this file.")` and calls no `save`; the button shows a busy state while the PDF is being made.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement** using existing `Button`, `Dialog`, `useAsyncAction`, and the layout classes of `CeilingBox` (a bordered box, buttons wrap on phone width, 44px touch height). Heading text: "Download as PDF".
- [ ] **Step 4: Run the new test plus all promo tests, tsc, eslint, `node node_modules/next/dist/bin/next build` once (only when no dev server is up).** Expected: PASS, build succeeds.
- [ ] **Step 5: Commit** `feat: promo code PDF downloads`.

---

### Task 6: Owner steps and final checks

**Files:**
- Create: `docs/superpowers/plans/2026-11-17-promo-codes-suffix-delete-pdf-owner-steps.md`

- [ ] **Step 1: Write the owner steps.** No SQL to paste. Plain words: how to try a suffix on an ordinary code on a test page (use a test code the owner makes, never a real participant's), how to see Delete on an unused code and the missing Delete on a used one, how to open each PDF and what each should show; say that "For me" files are private.
- [ ] **Step 2: Full check:** tsc 0 errors; eslint on all touched paths; run every `tests/*promo*` file and `tests/affiliate-promo-sync.test.ts`, `tests/agent-promo-summary.test.ts`.
- [ ] **Step 3: Commit** `docs: promo codes owner steps`. Do not push.

---

## Self-review notes

- Spec coverage: suffix (Task 1), ceiling text (Task 1), delete rules and UI (Tasks 2, 3), three PDFs with Share/Me versions (Tasks 4, 5), owner steps (Task 6). Constraints on Stitch, CRLF, and no migration are in Global Constraints.
- Names used across tasks: `effectiveOrdinaryPromo`, `deletePromoCode`, `publicCodeRows`, `personCodeRows`, `renderPromoPdf`, `publicPdfSpec`, `personPdfSpec`, `promoPdfFileName`, `whereText`, `PromoDownloads`.
- Unchecked by me: that `Button` has a destructive variant (Task 3 says to use the nearest existing style); that `CODE_RE` in `promo-form.ts` allows the same characters as `BASE_RE` in `promo-suffix.ts` (both appear to be A-Z, 0-9, `-`, `_`, 2 to 40; Task 1 implementer confirms and widens `BASE_RE` only if they differ).
