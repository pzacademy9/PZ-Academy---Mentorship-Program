# Promo codes: PDF menu and "invalid" wording: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** (1) Hide the three PDF download buttons behind one menu button on the Promo codes page, phone and PC. (2) A percent typed after a code that is above what that code allows shows "invalid", never the limit.

**Architecture:** Small follow-up to PR #129 (branch from main 8e5dc417). Task 1 changes the wording and the per-code limit in the existing resolver. Task 2 replaces the bordered download box with a dropdown menu in the toolbar row.

**Tech Stack:** Next.js 14.2.5, vitest, existing `DropdownMenu` (`src/components/ui/dropdown-menu.tsx`), `Dialog`, `Button`.

**Spec:** Owner request 2026-11-17 (chat). Earlier design: `docs/superpowers/specs/2026-11-17-promo-codes-suffix-delete-pdf-design.md`.

## Global Constraints

- Branch `promo-pdf-menu-and-invalid` from `origin/main`. Never push or merge to main. Commit trailer `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Stage by path only. Leave untracked `docs/lead-capture-go-live-guide.md` and the two `docs/superpowers/plans/2026-11-02-*.md` alone.
- `npm run`/`npx` are broken by `&` in the path. Run tools directly: `node node_modules/typescript/bin/tsc --noEmit` (0 errors), `node node_modules/vitest/vitest.mjs run tests/<file>`, `node node_modules/eslint/bin/eslint.js <paths>`.
- Preserve each existing file's line endings (CRLF). No `eslint-disable` for `@typescript-eslint`. Never touch `database.types.ts`. No migration.
- Wording calm and plain, no exclamation marks. Backgrounds and borders on existing pz tokens; `pz-deep`, `pz-mid`, `pz-danger` text only. Touch targets min 44px on phone (`max-md:min-h-11`).
- Dialog/menu behaviour is reviewed: Escape closes, focus returns to the control that opened it.
- No Stitch screen exists for this page; the owner agreed to build from existing parts.
- Known failing tests not ours: landing-event-sheet, landing-hero-render, landing-polish-3, landing-route-hardening, pz-tokens, participant-recipients, participant-whatsapp-ui, gas-apply-registration-status.

## Review Focus

1. A code with its own cap of 20% and a typed 25% is invalid; the same code typed plain still gives its stored discount (Task 1).
2. A code with cap 0 (no cap) is limited only by the global ceiling (Task 1).
3. The invalid text never contains a percent or the word "maximum", in the quote answer shown to the buyer and in the register answer (Task 1).
4. Owner (agent/affiliate) codes keep their own `maxPercent` rule; only the wording changes for them (Task 1).
5. Keyboard: Escape closes the menu; picking Sales agent or Affiliate opens the Share/For me dialog and Escape on that dialog returns focus to the menu button (Task 2).
6. Phone width: menu opens inside the screen, items 44px high, no sideways scroll (Task 2).

---

### Task 1: "Invalid" wording and per-code limit

**Files:**
- Modify: `src/lib/landing/registration/promo.ts` (the `over_max` message)
- Modify: `src/lib/landing/registration/promo-suffix.ts` (`effectiveOrdinaryPromo`)
- Modify: `src/components/landing/registration/RegistrationFlow.tsx` and `src/app/api/landing/[slug]/register/route.ts` only if they must stop passing the maximum to the message
- Modify: `docs/superpowers/plans/2026-11-17-promo-codes-suffix-delete-pdf-owner-steps.md` (step 4 quotes the old text)
- Test: `tests/landing-promo-suffix.test.ts`, `tests/landing-promo-resolve.test.ts`, the test that covers `promoMessage` (find with grep for `over_max`/`maximum discount`), and any registration test asserting the old text

**Interfaces:**
- Consumes: `PromoCode.maxDiscountPercent` (0 = no cap), `effectiveOrdinaryPromo(p: { code: PromoCode; typed: string; percent: number; globalMax: number })`.
- Produces: `effectiveOrdinaryPromo` ceiling is `Math.min(globalMax, code.maxDiscountPercent > 0 ? code.maxDiscountPercent : globalMax)`; a typed percent above it returns `{ ok: false, reason: "over_max", max: <that ceiling> }` (the `max` stays in the data, unused by the buyer text). `promoMessage("over_max", anything)` returns exactly `This promo code is invalid.`

- [ ] **Step 1: Write failing tests.** `promoMessage("over_max")` and `promoMessage("over_max", 30)` both equal `This promo code is invalid.` and contain no digit and not the word "maximum". `effectiveOrdinaryPromo`: code with `maxDiscountPercent` 20, percent 25, globalMax 30 gives `over_max` with max 20; percent 20 is ok; code with `maxDiscountPercent` 0, percent 30 is ok and 31 is `over_max` max 30; code with `maxDiscountPercent` 50 and globalMax 30 uses 30. Resolver: stored `PZ-AFT` (10% plain, cap 30) typed `PZ-AFT-40%` gives `{ promo: null, overMax: 30 }`; typed plain `PZ-AFT` still 10%. Update any existing assertion of the old text.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement** the message and the ceiling. Check how `RegistrationFlow.tsx:103` and `register/route.ts:161` use the message; they may keep passing `max`. **Step 4:** change owner-steps doc step 4 to say the page should say "This promo code is invalid." and should not give a discount. **Step 5:** run the promo tests (`tests/*promo*`, `tests/landing-registration*` that mention promo, `tests/client-boundary-values.test.ts`), tsc, eslint on touched files. **Step 6: Commit** `fix: promo code over the limit shows invalid, per-code limit applies`.

---

### Task 2: One "Download PDF" menu in the toolbar row

**Files:**
- Modify: `src/components/admin/landing/promo/PromoDownloads.tsx` (box becomes a menu)
- Modify: `src/components/admin/landing/promo/PromoCodesManager.tsx` (placement: in the row with "New promo code", phone and PC)
- Modify: owner steps doc (the PDF section names the new menu)
- Test: `tests/landing-promo-downloads.test.tsx`, `tests/landing-promo-admin.test.tsx`

**Interfaces:**
- Consumes: existing `PromoDownloads` props and its builders and dialog (`Who will see this file?`, `Share in a group`, `For me`); `DropdownMenu` parts from `src/components/ui/dropdown-menu.tsx`.
- Produces: one button labelled `Download PDF` (with the `Download` icon from lucide-react) that opens a menu with items `Ordinary codes`, `Sales agent codes`, `Affiliate codes` (the last two only when `canDownloadPeople`). The bordered "Download as PDF" box and its heading are removed. Behaviour of each download is unchanged (ordinary downloads at once; agent/affiliate open the Share/For me dialog; empty list toast; busy state).

- [ ] **Step 1: Write failing tests:** the three old buttons are not visible until `Download PDF` is clicked; the menu then shows the three items (two when `canDownloadPeople` is false); choosing `Ordinary codes` downloads with the same file name as before; choosing `Sales agent codes` opens the `Who will see this file?` dialog; Escape on that dialog closes it and focus returns to the `Download PDF` button; Escape on the open menu closes it and focus returns to the button; the empty-list toast still appears; while a file is being made the button is disabled with a busy state and a second click does nothing.
- [ ] **Step 2: Run, expect FAIL.** **Step 3: Implement.** Known Radix trap: a Dialog opened from a DropdownMenu item can lose focus or leave the page unclickable (`pointer-events: none` on body); open the dialog after the menu has closed (for example set state in `onSelect` and render the dialog outside the menu content) and remember the trigger button in a ref for `onCloseAutoFocus`, as the existing delete dialog in `PromoCodesManager.tsx` does. Place `Download PDF` in the toolbar row beside `New promo code`; on phone the row wraps and both buttons stay 44px high; the menu must stay inside the screen at 390px width.
- [ ] **Step 4:** update the owner steps doc PDF section to say "Press Download PDF, then pick the list". **Step 5:** run the new/changed tests, all `tests/*promo*`, `tests/affiliate-promo-sync.test.ts`, `tests/agent-promo-summary.test.ts`, `tests/client-boundary-values.test.ts`, tsc, eslint. Run `node node_modules/next/dist/bin/next build` once only if no dev server answers on ports 3000/3001. **Step 6: Commit** `feat: promo PDF downloads behind one menu button`.
