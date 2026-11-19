# Purchase choices (match, hold, warn) — design (2026-11-19)

Builds on Portal access (branch `portal-access`). The owner approved approach A on 2026-11-19.

## Intent and why
The system decides what a paid person may open from a hidden record on their registration, `option_keys` (the options they chose, each linked to modules on the registration page). Registrations brought in from the old Google sheets have only the text label (for example "Live — Modules: M3 – Individual") and an EMPTY `option_keys`. Empty means "whole course". So an imported module-only buyer would be given the whole course.

Found on PPC Batch 3 (read-only check, 2026-11-19): 158 paid, all with empty `option_keys`; 59 bought the full course, 99 bought one module; the page also has no purchase options saved and no portal attached; 1 of 158 has an app account. The owner sells modules as workshops, will give older students (Batch 1 and 2) access to their portals in the new app, and registrations will keep arriving both through the app (keys recorded) and through old sheets (labels only). So the fix must work for every course and every batch, with no one-off SQL.

## Goals
1. Safety hold: a paid person whose registration has a label but NO recorded choice is never given access by guess. They are held and counted.
2. Match panel: on each Portal access screen, list the labels that have no recorded choice (label, mode, count), suggest the matching option(s) by reading the label, let the admin confirm each line once, then apply it to every person with that label.
3. Automatic matching for future sheet imports: when the sheet mirror creates a registration and the label matches the page's options with certainty, it records the choice.
4. A plain warning on Portal access when people are held ("158 paid people have no recorded choice. Nobody gets access until you match them.").

## Non-goals / anti-goals
- No change for registrations made through the app (keys always recorded) or for rows with no label and no keys on a page with no options (whole course, as today).
- No editing of people one by one; no auto-creating the page's purchase options (the existing Registration setup editor does that).
- No emails are sent by matching or by the hold. Anti-goal: a person ever getting MORE access than they bought because of this work.
- Existing enrollments are never reduced or reverted by this work.

## Approaches
A (chosen): match panel + hold + import matching. B one-off SQL per batch: rejected, repeated work and typo risk. C hold and flag only: rejected, one-by-one fixing.

## Design

### Hold (access rules)
In `resolveAccess` / `desiredEnrollment` (`src/lib/data/landing-enrollment.ts`, `src/lib/landing/registration/access-rules.ts`): for a Paid, non-test, non-free registration where the LEAD's `optionKeys` is empty AND the lead's `optionLabel` is non-empty, return a new action `"hold"`: no enrollment is created or changed, `syncEnrollmentForRegistration` returns the new outcome `"needs-choice"`. Group members use the lead's choice (as today). A registration with an empty label and empty keys behaves exactly as today. Existing enrollments are untouched. `finishBatch` and the portal-link email count held people under a new `needsChoice` number in `BatchResult` and `LinkResult`, shown as a calm line ("N people have no recorded choice yet"). Never emails them.

### Label matcher (pure function)
`src/lib/landing/registration/match-choice.ts`: `suggestOptions(label: string, options: {key,label,kind,moduleIds}[]): { keys: string[]; confident: boolean }`. It reads the app label format (`Mode - option names, comma separated - Tier`, see `labels.ts`) and the old-sheet format (`Live — Modules: M3 – Individual`, `Live — Full Course – Group of 3`, see `mirror/rows.ts parseOption`). Rules: text for the full course (full course / full) maps to the page's bundle option; `M3`, `Module 3`, `Modules: M2, M3` map to module options whose label or key carries the same module number; each token must match exactly one option or the result is not confident and returns the matches found so far. Case, dash and spacing differences are ignored.

### Admin panel and routes
- `GET /api/admin/landing/portal/choices?pageId` (gate `requireAdmin("enrollments")`): returns `{ options: [...page options], groups: [{ label, mode, count, paidCount, suggestedKeys, confident }], hasOptions: boolean }` for registrations of the page with empty `option_keys` and non-empty `option_label` (any status, group members included as their own rows; count by label).
- `POST /api/admin/landing/portal/choices` (same gate): body `{ pageId, label, optionKeys }` (zod; keys must belong to the page's options; at least one key). Sets `option_keys` on every registration of that page whose label equals `label` and whose keys are empty, then queues `enrollment_sync` for the Paid ones (no email; same background call as `link-student.ts`). Returns `{ updated, queued }`. Idempotent: a second press updates 0.
- Data helpers in `src/lib/data/portal-choices.ts`. No migration (the column exists).
- Card "Match purchase choices" on `PortalAccessScreen` above "Open modules and emails": one row per label with count, a select for the option(s) (pre-filled with the suggestion and marked "Suggested" when confident), and an "Apply" button per row with a confirm dialog ("Apply to 24 people? People who already have an app account get their access right away. Nobody is emailed."). When the page has no options the card says "Set up purchase options on the registration page first" with a link. The warning line at the top of the card shows the total held. Phone first (390px) and PC (1440px). A Stitch design comes before the UI task (the owner rule).

### Import matching
In `landing-mirror.ts` `doInsert`: load the page's options once per run; on a confident `suggestOptions` result set `option_keys` on the new row; otherwise leave empty (held until matched). Existing rows are never changed by the mirror.

## Edge cases
- A label that matches two options, or no option: shown unmatched, the admin picks.
- The admin picks more keys than the label implies: allowed (confirm text shows the choice).
- Same label on a page with options saved later: panel works after the options exist.
- People without an account: key saved, access arrives when they sign in (existing flow).
- Pre-existing wrongly granted whole-course enrollments (if any) are NOT fixed here; a read-only count will be given to the owner.

## Calls I made (owner can change)
- Hold applies on label-present + keys-empty for any page, so Batch 3 is protected before its options exist.
- Applying a match also queues access for people who already have an account, without emailing.
- The mirror auto-matches only on a confident match; otherwise it holds.
- The panel is a card on Portal access (not a separate page).

## Left to the builder
File names beyond the ones named, exact copy for the calm lines, test layout.
