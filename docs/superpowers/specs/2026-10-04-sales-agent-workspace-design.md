# Sales Agent Role and Sales Workspace

**Status:** Draft for review
**Date:** 2026-10-04
**Branch:** sales-workspace (from master)

## Problem

The CRM (`/dashboard/admin/crm`) is being handed to a non-technical sales team whose daily work is messaging contacts on WhatsApp and replying. It has eight tabs (Contacts, Import, Merge Review, Campaigns, Cohorts, WhatsApp, Conversion, Agents), mixes power tools with daily work, and gives no guidance on what to do next. There is also no login role for sales staff: the CRM is admin-only, and the existing `agents` table holds lead-capture tokens, not user accounts.

## Goals

1. A `sales_agent` role whose users can reach only a purpose-built Sales Workspace and nothing else in `/dashboard`.
2. A guided, task-based workspace usable on phone and desktop by non-technical people: one obvious next action per screen, plain words.
3. Agents can create and send their own WhatsApp campaigns to their own contacts.
4. Hand-over between agents is possible: every contact has a timeline of what happened.
5. The admin CRM is left as it is, for power tasks.

## Decisions (agreed with the owner)

- Replies stay in WhatsApp. The CRM records outcomes with one tap and keeps a per-contact timeline (no inbox).
- Contact visibility is hybrid: agents see all contacts, may act only on their own, may claim unassigned ones; admin assigns and reassigns.
- Campaign freedom: free wording, own contacts only. WhatsApp click-to-chat batches only. Bulk email stays admin-only (assumption, confirm at review).
- Devices: phone and desktop equally (responsive, two-pane on desktop).
- Approach: a separate Sales Workspace at `/dashboard/sales`; the admin CRM is not reskinned.
- Lead capture (paste a WhatsApp chat, save a lead) is available inside the workspace.

## Non-goals

Email campaigns for agents, an inbox for incoming replies, push or email reminders, team leaderboards, changes to Import, Merge Review, Cohorts, Conversion or the automatic conversion matching.

## Section 1: Role and access

- Add `sales_agent` to the `user_role` enum and to `Role` in `src/lib/roles.ts`. `roleHome("sales_agent")` returns `/dashboard/sales`.
- `src/middleware.ts`: a `sales_agent` may reach only `/dashboard/sales/**` and the shared profile and settings pages; any other `/dashboard` path redirects to `/dashboard/sales`. Existing admin and mentor gates are unchanged. Admin and super_admin may also open `/dashboard/sales/**`.
- Today the CRM tables have RLS enabled with no policies; all access goes through server code using the service role, and `/api/admin/crm/*` routes call `requireAdmin()`. The real security boundary is therefore server code. Add `requireSalesAgent()` (accepts `sales_agent`, `admin`, `super_admin`) beside `requireAdmin()` in `src/lib/auth/`.
- Sales routes live under `/api/sales/*`. `/api/admin/*` routes stay admin-only and are not modified.
- Ownership rule: one helper, `assertCanActOn(contact, user)`, allows an action only when `contact.owner_id` equals the user's id, or the user is admin. Claiming is allowed only when `owner_id` is null. Every sales route that reads or writes a contact, activity or batch calls it. It is the most heavily tested unit.
- Admin-only: import, merge, cohorts, conversion, bulk email, assign and reassign, creating and deactivating sales agent users.
- Admin creates a sales agent from an "Add sales agent" form on the admin side (a normal user with role `sales_agent`). The old `agents` table (lead-capture tokens) is unchanged.

## Section 2: Workspace screens

Principle: one obvious next action, plain words, no jargon. Phone: bottom nav. Desktop: left nav, two-pane layouts.

1. **Today** (home): "Message next" queue of contacts due for follow-up, oldest due first. Each card: name, last note, a large WhatsApp button (click-to-chat with the message prefilled), and four outcome buttons: Replied, Interested, Bought, Not interested. Counter ("5 left today"). Empty state: "All caught up" with a link to claim more contacts.
2. **My Contacts**: tabs Mine, Unclaimed, All; search; one-tap Claim on unclaimed rows. A contact opens a timeline (sent, replied, notes, outcomes) with a note box; on desktop it opens in a right-hand pane.
3. **Campaigns**: 3-step guided flow. Step 1 Who (from my contacts, simple filters such as course and last outcome). Step 2 What to say (message box, "Use a saved message" picker, `{name}` shown as a chip). Step 3 Review and send ("You'll message 24 people. Open WhatsApp for each, one at a time."). Progress is saved so an agent can stop and resume.
4. **Add lead**: paste a chat, check the extracted name and phone, save (reuses the lead-capture logic).
5. **Help**: short "How do I..." list and a one-time 4-step tour on first login.

Admin gets a link from the admin CRM to see each agent's activity.

## Section 3: Data and server logic

New table `contact_activities` (append-only): `id`, `contact_id`, `agent_id`, `kind` (`sent | replied | interested | bought | not_interested | note | claimed | reassigned`), `body`, `created_at`.

New columns on `contacts`: `owner_id` (nullable user id), `claimed_at`, `next_followup_at`, `last_outcome`. Follow-up defaults on logging an outcome: Replied +1 day, Interested +2 days, Not interested clears it, Bought clears it. A newly claimed contact is due immediately. Existing contacts stay unassigned (no backfill beyond nulls).

`whatsapp_batches` gains `created_by`; a batch is visible only to its creator and admin. The existing templates (`crm_message_templates`), merge tags (`lib/crm/merge-tags.ts`), click-to-chat builder (`lib/crm/whatsapp-link.ts`) and phone normaliser (`lib/crm/phone.ts`) are reused. Agents can use shared templates and save their own.

Today queue: contacts where `owner_id` is the user and (`next_followup_at` is due or null), oldest due first.

Safeguards:
- Suppressed or do-not-contact contacts (the existing `is_sendable` guard) never enter a queue or a batch.
- Sending limits are governed by Section 5 (WhatsApp safety), not by a batch-size cap. A contact messaged in the last 24 hours shows a "recently contacted" warning.
- Every action writes a timeline row, so admin can audit the team.

Migration note: a new enum value cannot be used in the transaction that adds it, so the enum change and the columns and table that rely on it are separate migration steps. `src/lib/supabase/database.types.ts` is hand-edited for the new entries, never regenerated wholesale.

## Section 4: Delivery, design source, testing

Three phases, each on its own branch with its own plan:

1. **Phase A, role and access:** migration, `Role`, middleware, `requireSalesAgent()`, `assertCanActOn()`, the admin "Add sales agent" form, an empty `/dashboard/sales` shell.
2. **Phase B, workspace screens and WhatsApp safety:** Today, My Contacts with timeline, Add lead, Help and tour, and the whole Section 5 safety layer. The safety layer ships in B, before any agent can send, because Today already has a WhatsApp button.
3. **Phase C, Campaigns flow:** the 3-step guided send and the admin view of agent activity.

Design source: search the Stitch project first. Then write one prompt per screen group; the owner generates the screens and the code is extracted through the Stitch MCP. Screens in order: Today (phone and desktop), My Contacts with timeline pane, Campaign wizard (3 steps), Add lead, Help and tour. All use the existing PZ palette, so dark mode follows from the token system.

Testing:
- Unit tests: `assertCanActOn`, follow-up date rules, queue ordering.
- Route tests: a sales agent gets 403 on every `/api/admin/*` route; middleware redirects a sales agent from every non-sales page.
- Isolation tests: agent A cannot read or act on agent B's contacts, activities or batches.
- Browser click-through as a test sales agent on phone and desktop. Test accounts: create a dedicated test sales agent; do not use the off-limits Test Data emails.

## Section 5: WhatsApp safety (protect the sending numbers)

Trigger: on 2026-10-03 the owner's WhatsApp number used for "DMC campaign number 2" was restricted while sending manual click-to-chat messages: about 20 first-contact messages at 3 pm, 10-20 one to two hours later, then about 30 two hours after that (roughly 65 new chats in about 5 hours). Click-to-chat is manual, but WhatsApp's systems judge the account's behaviour (volume of new chats to people who have not saved the number, identical text, replies, blocks and reports), not whether a human tapped send. The exact WhatsApp limits are not published, so every number below is a conservative default, adjustable by admin, and not a guarantee.

**Limits are per sending WhatsApp number, not per agent.** The app tracks which number each agent sends from (`whatsapp_numbers`: label, owner/agent, status, warm-up start date). Counting uses `contact_activities` rows of kind `sent` to contacts with no prior two-way history ("new chats"), per number.

Server-enforced guardrails (not just UI hints; the send-link route refuses when a limit is hit):
1. **Daily cap of new chats per number:** default 25. Replies to people who already messaged first are not counted.
2. **Hourly cap:** default 8 new chats per rolling hour.
3. **Spacing:** a random delay of 60-120 seconds between sends; the WhatsApp button stays locked with a visible countdown ("Next message unlocks in 74s").
4. **Burst pause:** after 8 sends, a forced 15-minute break.
5. **Warm-up for a new or just-recovered number:** start at 10 new chats a day and rise by 5 a day to the cap over 3 days.
6. **Quiet hours:** no sends between 21:00 and 09:00 local time.
7. **Message variety:** the Campaign step blocks sending the exact same text to more than 3 people in a row; the `{name}` tag and rotating saved variants satisfy this. A short per-agent "opt-out" line is suggested in templates ("Reply STOP to opt out").
8. **Warm contacts first:** the Today queue ranks people who messaged first or replied before cold contacts, so the daily cap is spent on the safest sends first.
9. **Stop on bad signals:** Not interested logs a permanent do-not-contact if the agent also taps "Asked me to stop". A one-tap "My WhatsApp warns or restricts me" button freezes that number for 48 hours, shows the owner a banner, and writes an admin alert.
10. **Visible budget:** every agent screen shows "12 of 25 new chats used today" and the next unlock time, so they never guess.

Admin controls (admin-only settings page): view each number's status and usage, adjust the caps, hours and warm-up per number, unfreeze a number, and see the log of blocked attempts.

Because the guardrails are enforced server-side with the sent-activity log as the source of truth, they hold even if an agent opens WhatsApp directly: the app can only control sends made through it, so agents are also told in Help not to message new numbers outside the CRM.

## Open points for review

- Bulk email for agents: assumed admin-only.
- WhatsApp safety numbers (25 per day, 8 per hour, 60-120 s spacing, 15-minute break per 8 sends, quiet hours 21:00-09:00, warm-up 10 rising by 5): conservative defaults chosen without published WhatsApp limits; tune with real results.
- Follow-up day defaults (+1, +2): tunable later by admin.
