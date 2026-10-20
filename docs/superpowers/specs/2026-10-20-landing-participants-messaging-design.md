# Landing Plan 3: Campaign participants and messaging (design)

Date 2026-10-20. Parent: `2026-10-19-landing-registrations-phase3-design.md` (Part 3). This document replaces that Part 3 where they differ. Owner decisions are marked **Owner**; guesses the builder can see are marked **My call**.

## Why

The owner currently sends batch updates by hand: posts in the WhatsApp group and emails the Zoom link manually. Registrations already hold everyone who signed up through a landing page. Plan 3 lets the owner message the people of one course batch from the same Registrations area, with status editing in the same place. The worst mistake it could make is sending a Zoom link or other paid-only information to someone who has not paid.

## Goals

- **Owner:** No new "Participants" section. Participants are the Registrations, organised per campaign (landing page / course batch, e.g. "TMC Batch 1").
- The Registrations front door becomes a **list of campaigns** with counts. Clicking one opens that campaign's own page with the campaign name at the top. An "All registrations" view stays (today's flat list with the Page filter).
- On a campaign page: the existing table, filters, and status/amount change, plus ticking rows ("select all in this filter" too) and two new actions: **Send email** and **Send WhatsApp**.
- Filters must be exact and helpful (status, Live or Recorded, module, country, agent, search by name, email or reference). **Owner:** no default filter and no pre-ticked Paid; the owner picks.
- **Owner:** if any recipient of a send is not Paid, show a strong warning before sending that says how many are not Paid and in which status. Sending is still allowed after the owner confirms.
- Email builder: free subject and body; merge tags; any link pasted in the text; preview; test send to the owner; send; per-person result (sent / failed) visible afterwards.
- **Owner:** saved message templates (name, subject, email body, WhatsApp text), reusable and editable per send. **My call:** shared by all admins.
- WhatsApp: the same message with tags filled in, one click-to-chat link per person, same behaviour as Sales Hub WhatsApp (a person taps each). **Owner:** no send limits yet.
- Email sends through a **separate Brevo account** with a new env key (the builder names it, e.g. `BREVO_API_KEY_PARTICIPANTS`). The owner adds it to Vercel and local env by hand; it is never pasted in chat or committed.

## Non-goals

- A separate "Participants" navigation entry or a second copy of registration data.
- Automatic WhatsApp sending or posting into WhatsApp groups (people are messaged one by one via links).
- Send limits, throttling and daily caps (owner: not yet; the per-recipient log leaves room to add them later).
- Sheet-to-app sync (Plan 4), Meta Purchase (Plan 5), payment accounts and My links (Plan 6).
- Editing the automatic status emails (Paid, Underpaid, Reserved, portal link). They stay as they are and always send.
- Agents sending anything.

## Anti-goals (a failure even if it works)

- A message reaches someone it should not: wrong campaign, an unpaid person without the warning, a test registration, or a person who unsubscribed from builder emails.
- The same person gets the same send twice because of a double click or a retry.
- Filters that silently drop or include people. The count shown at send time must equal the people actually messaged.

## Behaviour

**Who can use it.** Admin and super_admin only (`requireAdmin()` on every new route and page). Agents keep today's own-link registrations page: no ticking, no sending, no campaign list.

**Campaign list (front of Registrations).** One card or row per landing page that has registrations: name, total, and counts by status (Pending, Reserved, Underpaid, Paid), plus "All registrations". **My call:** pages with no registrations are not listed; unpublished or closed pages that do have registrations are listed.

**Campaign page.** The heading is the campaign name. It reuses the current registrations table and filters, scoped to that page. It adds a checkbox per row, a header checkbox for the visible rows, and "Select all N in this filter" across pages. Test registrations (`is_test`) can never be ticked and are never messaged. **My call:** group members appear as their own rows if they have an email, because each member has their own access; a lead row and its members can all be ticked.

**Send flow (email and WhatsApp).** With rows ticked, the bar shows the count and the two buttons. The builder opens with a template picker. Before the final send a summary appears: campaign name, channel, exact number of people, a breakdown by status, and the warning if any are not Paid. The owner confirms, then it sends. The recipient list is fixed at confirm time, so a status change mid-send does not alter it.

**Merge tags.** Name, first name, reference number, portal link (the login link used by the portal-link email). **My call:** no separate session-link tag; the Zoom link is typed or pasted into the message or template.

**Email.** Preview with the first recipient's data. "Send test to me" (to the admin's own email) before sending. Each recipient gets a result row (queued, sent, or failed with a short reason). Failed ones can be re-sent without re-sending to the ones already sent. A double press must not duplicate sends (idempotent per send and recipient). Unsubscribe: the builder keeps its own unsubscribe record and honors it for builder emails only; a skipped person is counted and shown as "unsubscribed", not as a failure. Transactional emails always send.

**WhatsApp.** A list of people, each with a click-to-chat link built from the message and the person's phone, reusing the Sales Hub link and phone helpers and the "open in web or app" choice. Each person can be marked sent; a person without a usable phone is shown as skipped. A send record stores who, when, and the template used.

**History.** Each send is stored (campaign, channel, who sent, when, subject and body as sent, recipients with result). The campaign page has a "Messages sent" list. A registration's detail page shows what that person was sent (extend the existing Emails sent card with builder emails and WhatsApp marks). **My call.**

**Status editing.** Unchanged: same control, same rules, same history, available from the campaign table.

## Constraints

- Non-technical team. Visible text uses plain words ("link", "country", "module"). Never "variant", "override", "resolve", "schema", "YAML".
- UI is ported from Stitch project "PZ Academy Platform 2" (4651274386787527431). Screens needed first: campaign list, campaign page with ticking and send bar, email builder with template picker and send summary/warning, WhatsApp link list, "Messages sent" list. The plan gives the owner Stitch prompts and stops at each UI task until the screens exist.
- Reuse, do not copy: `src/lib/crm/campaign-email.ts`, `merge-tags.ts`, `whatsapp-link.ts`, `phone.ts`, `whatsapp-mode.ts`, and the existing registrations table, filters, query and status control. The Brevo account differs, so the email sender must take its key as input.
- Migrations are files the owner pastes (Supabase MCP is read-only). `database.types.ts` is never regenerated, only hand-edited.
- Branch `landing-participants`, cut from `landing-batch-2b` because that PR is not merged yet. The base moves to main once it is.

## Left to the builder

Table and column names for templates, sends and recipients; whether email goes out inline or through the existing job outbox; Brevo batching and any soft limit it recommends (shown only, not enforced); the name of the env key; layout details inside the Stitch screens; whether the campaign list is a page or a tab.
