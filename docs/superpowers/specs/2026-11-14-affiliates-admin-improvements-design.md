# Affiliates admin improvements: design (2026-11-14)

Size: a project (three screens, one migration, one bug). Branch: `affiliates-admin-improvements`, cut from `origin/main`.

## Why
The owner runs the affiliate programme from Admin, Affiliates. Three tabs feel thin or hide information:
- Affiliates tab: no search, and no quick way to message a person.
- Emails tab: no record of what was sent.
- Applications tab: looks empty; no record of who was decided and why.
- Bug: every tab shows the Applications subtitle.

## Goals
1. Affiliates tab: search (name, code, email); per-row WhatsApp and Email buttons that open a template picker with a preset message, filled with name and code, editable before use. WhatsApp and Email template lists are separate.
2. Emails tab: Send / History switch. History lists each motivation send (date, subject, exact email as sent, recipient count, failed count, recipient names); tap to read.
3. Applications tab: count strip (Waiting / Accepted / Dropped), Waiting list, Decided list (Accepted / Dropped / Left, date, code, reason). Dropping now asks for a required reason. "Clear old email history" becomes a quiet link at the foot.
4. Subtitle is per tab.

## Non-goals
- No sending of real emails during development. Test affiliate TE324 only.
- No template editor screen (templates are edited in the picker for one send only). Later project.
- No change to hosting, cron, or email sending limits.
- No change to the Payouts and Leaderboard tabs.

## Screens (Stitch project 13117286791417011091, the source of truth)
- Affiliates Admin - Affiliates (Mobile 390px): `dd38a258805d49308d1c30a3beb25f66`; (Desktop 1440px): `7475cf81aa80480ead17b41ffb864736`
- Affiliates Admin - Emails History (Mobile): `abcc3f9abf984363be08b2727cfca117`; (Desktop): `30c26a02075a4d7ebef8c387029a7a01`
- Affiliates Admin - Applications (Mobile): `df3b3f9e50b44933968044acaed8204e`; (Desktop): `8fe640d0377c4f64bea0ff8992d8de82`

## Approaches considered
- Templates: (A) reuse the Sales Hub table `crm_message_templates`; (B) a new table `affiliate_message_templates`. Picked B: affiliate wording never mixes with sales-lead wording, and the Sales Hub list stays clean. The picker UI pattern (pick, copy into a box, edit the copy) is reused from the Sales Hub.
- History: (A) rebuild from `affiliate_emails` (one row per person, only the kind); (B) a new table `affiliate_motivation_sends`. Picked B: `affiliate_emails` cannot hold subject, body or a recipient count.
- Email button: (A) open the owner's mail app with `mailto:` and the message; (B) send through Brevo from the app. Picked A: nothing is sent by the system, no daily limit used, no risk of emailing a real affiliate by a mis-tap.

## Data (migration 0115, the owner pastes it; hand-add `database.types.ts` entries, never regenerate)
- `affiliates.drop_reason text null`. Required by the app on every new drop. Old drops show "No reason recorded".
- `affiliate_message_templates (id, channel in ('whatsapp','email'), name, subject null, body, sort_order, created_at)`, RLS on, service role only. Seeded: welcome, how to share your code, payout ready, thank you, for each channel. Variables `{name}`, `{code}`.
- `affiliate_motivation_sends (id, created_at, subject, html, recipient_count, failed_count, recipients jsonb)`, RLS on, service role only.

## Behaviour notes
- Search is on the page, over the rows already loaded. No new request.
- A motivation send is saved as ONE history row even though the screen sends in chunks of 25. The builder decides how (for example one id per button press).
- History saving never blocks or undoes a send (same rule as `logAffiliateEmail`).
- Calm wording, no exclamation marks, no sales words. Colours: backgrounds and borders use pz-solid-* or landing-* tokens.

## My rulings (owner may correct)
1. Email button opens `mailto:`; it does not send.
2. Drop reason is required for new drops, including Drop from the Accepted detail sheet. Left has no reason.
3. Templates are fixed starters, editable per send only.
4. New tables are service-role only, like the other affiliate tables.
5. Phone numbers for WhatsApp use the number already stored on the affiliate, cleaned to digits.

## Left to the builder
File layout, test names, the exact chunk-to-one-row method, wa.me number cleaning (reuse the Sales Hub helper if one fits), loading states.

## Cost if wrong
One migration to adjust before it is pasted. No live data changes until the owner pastes 0115.
