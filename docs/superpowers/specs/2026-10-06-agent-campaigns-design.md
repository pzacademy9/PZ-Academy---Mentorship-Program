# Agent campaigns: design

Date: 2026-10-06. Branch: `agent-campaigns` (off `origin/main` 6b45778). Status: awaiting review.

## Goal

A sales agent can run a "Message my contacts" WhatsApp campaign over their own contacts: choose who, write the message, then work through the list one person at a time with the existing sending limits. This is the first slice of Phase C of the Sales Workspace (see `2026-10-04-sales-agent-workspace-design.md`, section 4 "Campaigns" and section 5 "WhatsApp safety").

## Scope

In: campaign wizard (3 steps), sending session, "My campaigns" list with resume, agent campaigns visible to admin in Sales Hub, WhatsApp Batches.
Out (follow-ups): agent-saved message templates (agents use the existing shared templates now), a full admin agent-activity dashboard, email campaigns for agents, scheduling a campaign for a future time.

## Rulings carried in (do not re-ask)

- Own contacts only; admin sees all campaigns. Replies stay in WhatsApp. Phone and desktop equal.
- Safety defaults and behaviour come from the existing layer (`requestSend`, `send-limits`): 60 new chats a day, 20 an hour with a warning from the 15th, 90-180 s spacing, a 10-minute break per 10 sends, quiet hours 21:00-09:00 Asia/Karachi, warm-up, 48 h panic freeze. Never claim the limits are safe or guaranteed.
- After a send the person picks the follow-up: 8 hours / 1 day / 2 days / 3 days, default 1 day. The campaign exposes this choice once for the whole batch ("Bring them back in"), default 1 day, passed as `followupInHours` on every send. Reuse `FOLLOWUP_CHOICES`, `DEFAULT_FOLLOWUP_HOURS`, `isFollowupHours`, `nextFollowupAfterSend` from `src/lib/crm/followup.ts`.
- The same text must not go to more than 3 people in a row.
- Do-not-contact, unsubscribed and phone-less contacts never enter a campaign.
- Claiming is an admin setting (default off); campaigns work only on contacts the agent owns (assigned or added by them).

## Design

### 1. Data and rules

Approach: reuse `whatsapp_batches` and `whatsapp_batch_recipients` (spec decision from the sales workspace design), extended by migration 0066. Existing admin batches are untouched.

- New columns on `whatsapp_batches`: `owner_agent_id uuid null` (null = admin batch), `number_id uuid null`, `followup_in_hours integer null`, `status text not null default 'active'` (`draft | active | paused | done`), `paused_reason text null`, `updated_at timestamptz`. `created_by` already exists.
- `whatsapp_send_status` enum gains `skipped` and `blocked`. Existing `pending` and `sent` unchanged.
- Recipients are snapshotted at creation (name, phone) from contacts the agent owns. Dropped contacts (do-not-contact, unsubscribed, no phone, not owned) are counted and shown to the agent, never silently lost.
- Variety rule: if the message has no name tag, a campaign over 3 recipients cannot start. The agent is told to add the name tag or use a saved message variant.
- Sending: each "Open WhatsApp" calls `requestSend` (ownership, do-not-contact, number assignment, budget, quiet hours, spacing, breaks, follow-up). The recipient becomes `sent` only when a link is issued, with a guarded update (`status = pending`) so two taps or two tabs cannot send the same recipient twice. A blocked send leaves the recipient `pending`, sets the campaign `paused` with `paused_reason` and the time it can resume. Nothing is lost.
- Resume: an agent can leave and return to an `active` or `paused` campaign from "My campaigns". A campaign larger than today's budget pauses at the cap and continues the next day without re-sending anyone.
- Visibility: an agent can read or act on a campaign only when `owner_agent_id` is theirs. Every read and write of an agent campaign re-checks it on the server (service-role client). Admins read all.
- `database.types.ts` is hand-edited only. Migration 0066 is applied by the owner in the SQL editor and verified read-only afterwards.

### 2. Screens and flow

Built from the Stitch project "PZ Academy Platform 2" (wizard steps 1-3 and Sending Session, desktop and mobile). Use the `pz-*` tokens, no raw hex, light mode unchanged.

- Navigation: new **Campaigns** item in the agent sidebar after My Contacts. On the phone bottom bar it takes the third slot (Today, Contacts, Campaigns, Add lead), so Help & Safety moves into More.
- **My campaigns** (`/dashboard/sales/campaigns`): list with status, "7 of 46 sent", Resume; "New campaign" button.
- **Wizard** (`/dashboard/sales/campaigns/new`), one page with a stepper:
  1. Who: my contacts only; filters course, last outcome, search; select all; live count. Info line: "You can send N more today; the rest wait for tomorrow" (information only, not a limit).
  2. What to say: message box, tag chips (First name, Course), saved-message picker using the existing shared templates, live WhatsApp preview with the first person's name. A calm note says messages go out one at a time with pauses and promises nothing about safety.
  3. Check and send: who, how many today and tomorrow, number picker (preselects the number with the most budget left), "Bring them back in" 8 hours / 1 day / 2 days / 3 days (default 1 day), a warm-up notice for new numbers, and **Start sending**. An agent with no assigned number sees why and cannot start.
- **Sending session** (`/dashboard/sales/campaigns/[id]`): current contact card, a large **Open WhatsApp** button, progress "7 of 46", a countdown to the next send, **Skip**, **Pause**, and the existing red "Something is wrong, stop" panic flow. When the number is blocked (quiet hours, daily cap, break), a clear card says why and when to come back. A finished campaign shows sent, skipped and remaining counts.
- **Admin:** agent campaigns appear in Sales Hub, WhatsApp Batches, with the agent's name and progress. The admin can open one but cannot send from it.

### 3. Delivery, testing, risks

Phases, each reviewed separately:
1. Backend: migration 0066, pure campaign rules, data layer (create from selection, list, get, mark sent/skipped, pause, resume), API routes.
2. Wizard: Campaigns nav item, My campaigns list, the 3-step wizard.
3. Sending session and the admin WhatsApp Batches owner and progress columns.

Testing:
- Unit: creation rules (own contacts only; dropped contacts counted), variety rule, status transitions, nav order for `sales_agent`.
- API: ownership isolation (agent A cannot read or act on agent B's campaign, even with the id), 403s, resume after a block.
- Data layer with a fake client: a recipient becomes `sent` only when `requestSend` issues a link; a blocked send leaves it `pending`; a double tap sends once.
- Browser click-through (Playwright): create a campaign of 3 test contacts, run the session using only the link (no real message), pause and resume, confirm it shows in admin WhatsApp Batches, then clean up test data.

Risks:
- Double tap or two tabs: guarded update per recipient.
- No number assigned: blocked with an explanation.
- A campaign bigger than the day's cap: pauses and resumes without re-sending.
- Phone layout of the session screen must stay thumb-friendly: base it on the Stitch mobile screens.
- Existing admin WhatsApp batch code must keep working with the new columns and enum values (default values and nullability keep it unchanged; add a regression test).

## Success

An agent can select some of their own contacts, write or pick a message, and step through sending with the existing limits, pause and resume, and the admin can see it. No agent can see or act on another agent's campaign.
