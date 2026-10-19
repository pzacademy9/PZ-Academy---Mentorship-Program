# Landing builder Phase 3: Registrations, access, emails, participants

Date: 2026-10-19. Builds on `2026-10-12-landing-page-builder-design.md` (tracking, sheet sync sections) and Phase 2 (`plans/2026-10-13-landing-page-builder-phase-2.md`).

## Why

The owner registered on the live Diabetes page. The row reached the Google Sheet and the table `landing_registrations` (status `pending`), but the app has no screen to act on it, no Paid emails, and a Paid set in the sheet never reaches the app. The app must become the main place to run registrations end to end. The sheet stays as a backup.

## Users and people words

Non-technical team. Visible text uses plain words ("link", "country", "module"). Never "variant", "override", "resolve", "schema", "YAML".

- **Admin and super admin** (same access here; "manager" means admin): see all registrations, change status, press Batch finished, email the portal link, use the Participants sheet and email builder, manage payment accounts, see the agent leaderboard.
- **Sales agent:** sees only registrations that came through their own link (`agent_id`), and may change status (Pending, Reserved, Underpaid, Paid). Agents cannot email participants and cannot use Batch finished.
- Owner ruling: no extra confirmation for an agent's Paid. Instead every status change records who, when, and the source (app or sheet); admin can see this history.

## Goals

1. Run registrations in the app: list, filter, search, change status, history.
2. Status emails and course access that match what was sold (Live or Recorded, whole course or chosen modules).
3. Admin tools to open the portal for Live participants after the batch, and to email any group on demand.
4. Sheet edits reach the app (backup path), and app changes reach the sheet.
5. Meta Purchase on Paid.
6. Payment accounts screen and agents' "My links".

## Non-goals and anti-goals

- Do NOT merge `landing_registrations` with `enrollments`. Two tables stay.
- No commission payouts. No ad spend or ROAS reports.
- No separate "approve" step. The statuses are exactly **Pending, Reserved, Underpaid, Paid** (plus the existing `free`, unchanged).
- Anti-goal: one sale counted twice or one student enrolled twice. Anti-goal: an email or a Meta Purchase fired twice for the same registration and status.
- Do not invent UI. The Stitch "Admin: Enrollment Review — Clinical Excellence" screens (project `11811490301995978699`, screen ids `d5483d0f798c46959c35b4e4c871643c`, `73c60cf341794e0a934b91c138d11d72`) are the design source for list and detail. For anything they do not cover, produce a Stitch generation prompt for the owner (the Stitch MCP generate call is unreliable) and stop for the screen.

## Data model decisions (owner's, as stated)

- Two funnels, two tables, one place for course access: **a Paid registration whose page has a course creates or updates a normal `enrollments` row** (no second row if one exists for that student and course). Guests are linked to accounts by email (existing `linkRegistrationsToStudent`); a guest who signs up later is linked and enrolled then.
- Status mapping to enrollments: Paid becomes `active`, Underpaid and Pending become `pending`, Reserved becomes `reserved`. The Registrations screen shows the registration words.
- Reports read both sources and show one total with a source column (app sign-up, ad page, agent). Currency is shown per row; no silent conversion (builder's call: totals grouped by currency).
- Existing `contact_purchases` write on Paid (spec line ~209) stays in scope so CRM conversion tracking reflects agent sales.

## Access rules (owner's)

One course, same portal. Two levels:

| Bought | Gets | Portal |
|---|---|---|
| **Recorded** | portal only | opens immediately when Paid |
| **Live** | live sessions and the portal | portal opens only after the owner presses **Batch finished** |

- A buyer of a single module, or several chosen modules, gets access to those modules only. **Batch finished works per module** (and for the whole course).
- The owner presses the button themselves (they keep updating lecture videos). No automatic date.
- Enrollment must carry the level (live or recorded) and which modules are covered, and whether the portal is open. Today `enrollments` has only `course_id`, so this needs new columns or a child table (builder decides the shape; must not break the existing Enrollments page).
- How live participants receive live sessions today (in app, WhatsApp group, Zoom link by email) is NOT decided; assume outside the app (existing WhatsApp group and email details already on the page). The portal is the only in-app access this phase.
- Batch finished and Email portal link act on one page's batch. "Batch" = the landing page; if the owner reuses one page for two batches, builder to propose a batch marker (open question for the plan, not blocking).

## Part 1: Registrations screen

- Placement: **my call** (owner undecided): a second tab inside the Enrollments menu so everyone looks in one place ("App sign-ups" / "Page registrations"), same look and status words style; agents get the page under their Sales workspace, scoped to their link. Easy to change later.
- List columns: name, page, country, option bought, Live or Recorded, amount and currency, status, agent, date. Filters: page, status, Live/Recorded, agent (admin only). Search by name, email, ref id.
- Detail: voucher, price breakdown (discounts, promo code), group lead with members together, status history (who, when, source), email history.
- Status change: Pending, Reserved, Underpaid, Paid. Underpaid asks for the amount received. Changing the lead changes the whole group (my guess from the group cascade in the original spec; builder confirm against the PPC/MDC script behavior).
- Each change writes `landing_status_events`, updates `status_source`, `status_changed_at`, and queues an update of column P (and O for amount) in the event sheet through the existing outbox (`landing_jobs`).
- Reuse `applyEnrollmentStatus`-style patterns (guarded transitions, atomic, plain result messages) from `src/lib/data/admin-enrollments.ts`. Authorization for agents is enforced server-side per registration (`agent_id`), never only in the UI.

## Part 2: Status emails and access

- Emails sent by the app through Brevo (existing `src/lib/brevo.ts`, `src/lib/landing/registration/job-handlers.ts`): Paid, Pending, Underpaid, Reserved, member versions, admin alert (ported from the three sheet scripts; text from the page's region settings). Fire only on a real transition, guarded per registration and status.
- Paid + Recorded: Paid email carries the portal link; enrollment active, portal open.
- Paid + Live: Paid email has session details, no portal link; enrollment active, portal closed.
- **Batch finished** button (admin): per page, per module or whole course. Opens the portal for every Paid Live participant covered and emails each the link. Idempotent; shows how many were opened and emailed.
- **Email portal link** button (admin): sends the link on demand to all Live, all Recorded, or both (Paid only). Logged per send.
- Editable email text (Emails tab) stays out of Part 2 unless the plan finds it cheap; default templates in code.

## Part 3: Participants sheet and email builder

- Admin and super admin only.
- One organized table of participants who registered through landing pages, filterable by page, status, Live or Recorded, module, country, and agent; a search bar for name (and email); row select for one person or many; "select all in this filter".
- Email builder: same behavior family as Sales Hub campaigns (reuse `src/lib/crm/campaign-email.ts`, `merge-tags.ts`, send-limit ideas where they fit). Free subject and body, merge tags (name, ref id, portal link, session link), any link (Zoom, update, ID). Preview, test send to self, send, per-recipient result log.
- Uses a separate Brevo account: a new env key (name chosen by the plan, e.g. `BREVO_API_KEY_PARTICIPANTS`). The owner adds the key to Vercel and local env by hand; it is never pasted into chat or committed. Unsubscribe handling follows the existing campaign email approach.
- Sending respects a per-send recipient cap and a visible sent/failed count (builder proposes limits from Brevo's plan).

## Part 4: Sheet to app sync

- Owner ruling: the **app is main**; the sheet is a backup for when the app is down.
- Trigger (my call, matches the original spec proposal): one time-driven Apps Script trigger that scans all registered event sheets about every 5 minutes and posts changes (status column P, amount column O) to a new webhook keyed by `sheetId`. Reason: the per-sheet `onEdit` trigger cap (~20) would be hit. The plan must confirm against Apps Script quotas.
- Rows match by Ref ID plus email, never row number. Latest change wins; each change records its source. A sheet-originated Paid triggers the same email, enrollment and Meta Purchase, once.
- During an app outage the sheet works for marking Paid; sessions emails, access and Meta Purchase happen when the app is back and the scan runs.
- Failures queue with retries; admin sees "Sheet sync: N waiting", Retry, Rebuild sheet from app (per original spec).
- GAS changes deploy only via clasp (`gas/clasp-project/`) and only after the owner says yes.

## Part 5: Meta Purchase

Server-side Conversions API Purchase on a real Paid transition, real value and currency, once per registration, guarded by `landing_status_events`, hashed email and phone, `fbp`/`fbc` already stored. Works for Paid set in the app or the sheet. Meta accepts events up to 7 days old; older ones are not sent (logged).

## Part 6: Payment accounts and My links

- Admin screen to manage payment accounts (table `landing_payment_accounts`, existing data module `landing-payment-accounts.ts`).
- Sales workspace "My links" panel for agents: link per page with copy, views, registrations, paid. Admin per-agent leaderboard (registrations, paid, revenue).

## Constraints and project gotchas

- Work on branch `landing-registrations`, cut from origin/main f12a036. Never merge or push to main without the owner's yes. Leave untracked `docs/lead-capture-go-live-guide.md` alone.
- `npm run` is broken: use `node node_modules/typescript/bin/tsc --noEmit` (baseline 0) and `node node_modules/vitest/vitest.mjs run tests/<file>`. Dev server `node node_modules/next/dist/bin/next dev -p 3945`; never `next build` while dev runs.
- Never regenerate `database.types.ts`; hand-add entries. The Supabase MCP is read-only: migrations are written as files and the owner pastes the SQL.
- Known failing tests not ours: `tests/pz-tokens.test.ts`, `tests/landing-route-hardening*`.
- Row-level security and server-side checks on every new table and route; agents see only their own rows.

## Calls made from the builder check (mine, not the owner's)

- **Sync conflicts:** each registration stores the last status/amount the app wrote to the sheet. The scan acts only when the sheet value differs from that stored value; app-originated writes are never echoed back as sheet edits. Apps Script time triggers give no edit timestamps, so "latest wins" means: a sheet value that differs from the last app-written value is a human sheet edit and is applied at scan time, unless the app changed the status after the last scan (then the app wins and the sheet is rewritten).
- **Page to course, option to level and modules:** a page already has `course_id` (nullable) and registration `modes` (live, recorded); each registration stores `mode` and `option_keys`. The plan adds a way to link each page option to course modules (like price cards link to options); no link means the whole course. A page with no `course_id`: Paid skips enrollment and the registration detail says "No course on this page". Existing pages are not backfilled automatically; the admin links them when needed.
- **Unsubscribe:** the Participants builder keeps its own unsubscribe record and honors it for builder emails only. Transactional emails (status, portal link, Batch finished) always send.
- **Paid amount and revenue:** revenue and Meta value = amount received if entered, else the expected price. Agents cannot edit the expected price. Underpaid requires an amount received.
- **Meta Purchase** fires once per registration ever (first Paid). **Emails** fire once per registration per status.

## Owner rulings after the builder check

1. **Paid after Batch finished:** the portal opens immediately and the link is emailed. The page/module stores a "batch finished" state (per page, per module, whole course) so later Paid Live buyers open at once.
2. **Group members each get their own access.** Correction after checking the code: the registration form ALREADY collects each member's name, own email (unique per person, validated in `form-state.ts`), WhatsApp and profession, and each member is stored as its own row with its own email (`landing-registrations.ts` member rows). So NO form change is needed. Each member gets their own enrollment, status emails and portal link, and appears as their own row in Participants. Members share the lead's ref id, and a status change on the lead cascades to members. Members are not enrolled until Paid, same as the lead. Owner note (2026-10-19): custom landing page forms must keep requiring each group member's details; Phase 3 must not weaken that.
3. **Paid changed back:** the enrollment goes back to `pending` and the portal closes for that registration. The Paid email is not re-sent on a second Paid (once per registration per status); Meta Purchase is never re-sent. The status history records the reversal.

## Left to the builder

Table and column shapes (enrollment level, modules, portal-open flag, status events, email log, participants queries), module-level portal opening mechanics, build order inside each part, sheet-scan quota math, exact email copy (port from the scripts), test strategy.

## Open items (not blocking)

- How live sessions are delivered (assumed outside the app).
- Batch marker if one page serves two batches.
- Final menu placement (my call above).
- Real pending test registration on the Diabetes page: owner decides.
