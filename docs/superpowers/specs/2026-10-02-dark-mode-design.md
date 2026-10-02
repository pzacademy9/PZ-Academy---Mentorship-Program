# Dark mode pass — design

Date: 2026-10-02. Branch: `dark-mode-pass` (from `master` at 90de8d2). Local only.

## Intent

Make dark mode usable on the app screens (dashboard, admin, mentor, student portal): every text and surface readable, colours consistent with the brand. Light mode must look unchanged.

Found during UI Polish Spec 1 live checks: contrast scan failed on 21 of 22 authenticated pages in dark. Spec 1's new `EmptyState` renders white text on a white legacy card.

## Root cause

- The `pz-*` palette in `tailwind.config.ts` is fixed hex with no dark values. It is used about 2,700 times.
- About 75 `bg-white`, 92 `text-white`, ~50 hardcoded grays and 43 hex literals in classes do not adapt.
- Only 13 files have any `dark:` styling.
- `next-themes` (class strategy, `enableSystem` off) applies `dark` to `<html>` everywhere, including public pages, which have no toggle and were never styled for it.

## Decisions (user-approved)

- **Scope:** app screens only. Public marketing pages are forced to light.
- **Approach:** semantic `pz-*` tokens become CSS variables with light and dark values. Class names do not change, so the 2,700 usages need no edits. A sweep fixes hardcoded colours.
- **Palette:** Stitch project "PZ Academy Feedback System" (dark, green-tinted). Its token names match ours 1:1.

## Design

### 1. Token layer

`tailwind.config.ts`: each semantic `pz-*` colour becomes `rgb(var(--pz-<name>) / <alpha-value>)` so opacity modifiers (`/60`) keep working.

`globals.css`: `:root` holds today's exact hex values as space-separated RGB triplets (light mode is pixel-identical). `.dark` holds:

| token | dark |
|---|---|
| surface, surface-dim, academy-background, background | #10150c |
| surface-container-lowest | #0a1008 |
| surface-container-low | #181d14 |
| surface-container | #1c2118 |
| surface-container-high | #262c22 |
| surface-container-highest, surface-variant | #31362c |
| surface-bright | #353b31 |
| on-surface, on-background | #dfe5d6 |
| on-surface-variant | #bfcab5 |
| outline | #8a9481 |
| outline-variant | #404a3a |
| inverse-surface | #dfe5d6 |
| inverse-on-surface | #2c3228 |
| primary | #99f670 |
| surface-tint | #81dc5a |
| primary-container | #7ed957 |
| on-primary | #0f3900 |
| on-primary-container | #1d5d00 |
| secondary | #a2d2ac |
| secondary-container | #265235 |
| on-secondary-container | #94c49f |
| tertiary | #ffdb95 |
| tertiary-container | #f3bb38 |
| on-tertiary-container | #684c00 |
| academy-error / error | #ffb4ab |
| error-container | #93000a |
| on-error-container | #ffdad6 |

The `*-fixed` and `*-fixed-dim` tokens keep the same value in both themes (Material semantics). Note: in light mode `pz-secondary` is gold (`#7a5900`) and `pz-tertiary` is green; the Stitch dark values above come from the Feedback project, whose roles differ, so each secondary/tertiary dark value is chosen by how the app uses the token (heading gold vs green text) and verified by the contrast scan, not copied blindly.

Legacy aliases (`deep`, `forest`, `mid`, `pale`, `offwhite`, `pine`, `sage`, `lime`, `mint`, `frost`, `ink`, `muted`, `border`) get role-based values after checking whether each usage is text, background or border.

Fixed in both themes: `bright`, `gold`, `gold-light`, `maroon`, `success`, `warning`, `danger`, and `brand-*` (mentorship only).

### 2. Scoping

`ThemeProvider` becomes route-aware (`usePathname`): `forcedTheme="light"` outside `/dashboard` and `/portal`, free choice inside. The toggle exists only in those areas.

### 3. Hardcode sweep (one commit per area)

- `bg-white` and `bg-pz-surface-container-lowest` on cards use tokens (`bg-card` or the pz surface token).
- `text-white` stays on coloured or image backgrounds, otherwise becomes a token.
- Grays map to `text-muted-foreground`, `border-border` or the matching `pz-*` token.
- Hex literals in classes become tokens, except one-off brand art.
- Existing `dark:bg-[#101412]`, `dark:text-[#e0e3df]` are replaced by tokens.
- Review separately: SVG and chart colours, receipt and PDF thumbnails, the gradient hero, third-party widgets (rich text editor, date pickers, Drive picker).
- Text on the bright-green button stays dark in both themes.

### 4. Verification

- Automated contrast scan (WCAG AA: 4.5 body, 3 large) over ~50 authenticated routes at 390px in dark. Target 0 failures; any remainder listed with a reason.
- Light mode: before/after screenshots of key routes, plus tsc and the 588 existing tests.
- New unit test: every `pz-*` token defined in the Tailwind config has both a `:root` and a `.dark` definition.
- Screenshots of dashboard, admin and CRM at 390px and desktop in both themes.

## Out of scope

Dark mode for public marketing pages; system-preference "auto" mode; any redesign (this is colour only).

## Risks

- Third-party widget styles may not follow the tokens. Handle one by one and list any that cannot be fixed.
- Role-based values for legacy aliases may need adjusting after the scan.
- Pre-existing issue, not part of this work: `/dashboard/admin/students` and `/dashboard/certificates` 404 (separate branch).
