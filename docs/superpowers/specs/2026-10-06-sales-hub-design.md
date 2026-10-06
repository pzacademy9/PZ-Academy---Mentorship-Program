# Sales Hub: design

Date: 2026-10-06. Branch: `sales-hub` (off `origin/main`). Status: awaiting review.

## Goal

1. Admin assigns a list (an import batch / cohort, or hand-picked contacts) to a sales agent. The agent then works those contacts in the Sales Workspace.
2. Merge the admin sidebar items CRM, Sales Team and WhatsApp Safety into one **Sales Hub** area. Entering it swaps the whole sidebar to a Sales-only menu, so it feels like a separate system. The legacy CRM "Agents" tab is removed.
3. Agent claiming of unassigned contacts becomes an admin on/off setting, default off.

## Findings that shaped this

- CRM "Agents" tab is the legacy no-login lead-capture system (migration 0058: `agents` table, `/leads/add/<token>`). Dev DB: 3 agents (2 active), **0 leads ever captured**. Sales Workspace "Add a Lead" replaces it. Tables stay in the DB; routes and UI are deleted.
- Ownership already exists: `contacts.owner_id`, `claimed_at` (0062) and timeline events `claimed` / `reassigned` / `released` (0063).
- A "list" maps to an import batch (`import_batches`, 17 exist). Contacts link via `contact_purchases.import_batch_id`; a contact can be in several batches, so overlaps happen.

## Rulings (from brainstorming)

- List = cohort (import batch) **and** hand-picked contacts.
- Assign skips contacts already owned by someone else, by default. A checkbox "also reassign owned contacts" overrides it and is logged as `reassigned`. Do-not-contact contacts are always skipped.
- Agent claiming is an admin setting `agents_can_claim`, default **off**. This overrides the earlier ruling "agents may claim unassigned".
- Area name: **Sales Hub**. Approach: move routes under `/dashboard/admin/sales-hub/*` with redirects from old URLs.
- Unchanged rulings: agents see all contacts but another agent's contact is restricted (name/owner/status, masked phone); Add a Lead makes the agent the owner; replies stay in WhatsApp.

## 1. Navigation and routes

Routes under `/dashboard/admin/sales-hub`:

| Route | Source today |
|---|---|
| `/` | new Overview |
| `/contacts`, `/contacts/[id]` | `/crm?tab=contacts`, `/crm/contacts/[id]` |
| `/import` | `/crm?tab=import` |
| `/merge` | `/crm?tab=merge` |
| `/cohorts`, `/cohorts/[id]` | `/crm?tab=cohorts`, `/crm/cohorts/[id]` |
| `/campaigns`, `/campaigns/[id]` | `/crm?tab=campaigns`, `/crm/campaigns/[id]` |
| `/whatsapp`, `/whatsapp/[id]` | `/crm?tab=whatsapp`, `/crm/whatsapp/[id]` |
| `/conversion` | `/crm?tab=conversion` |
| `/assign` | new |
| `/team` | `/sales-team` |
| `/safety` | `/sales-safety` |

- `/crm?tab=agents` and `/crm/agents/[id]` are deleted along with `AgentsPanel`, `AgentDetailClient`, and their data helpers if unused elsewhere.
- Permanent redirects in `next.config` from `/dashboard/admin/crm/**`, `/sales-team`, `/sales-safety`, including `?tab=` forms and `[id]` routes. A test asserts every old URL resolves to an existing new route.
- One `sales-hub/layout.tsx`: admin guard plus the Sales sidebar. Grouped menu: Overview; **Audience** (Contacts, Import, Merge Review, Cohorts); **Outreach** (Campaigns, WhatsApp Batches, Conversion); **Team** (Assign Lists, Sales Team, WhatsApp Safety). "Back to Admin" at the top. The mobile bottom bar swaps the same way.
- The main admin nav (`src/components/dashboard/nav.ts`) replaces the three items with one "Sales Hub" entry. Sales agents never see any of this.
- Overview page: counts (unassigned contacts, active agents, safety/freeze status) and links. It leaves room for the Phase C agent-activity view.
- Pages and components move as they are; only paths and links change in this step.

## 2. Assignment

**Assign Lists page** (`/sales-hub/assign`):
- Source: a cohort, or hand-picked contacts. Hand-picked uses a "Select" mode in the Contacts table and an "Assign to..." bar.
- Target: an active sales agent.
- Preview before commit: counts to assign, already owned (skipped), do-not-contact (skipped). Optional checkbox "also reassign owned contacts" with the count that would move.
- Commit is one DB function (atomic). It sets `owner_id` and `claimed_at`, writes a `claimed` (was unowned) or `reassigned` (was owned) timeline event per contact with the admin as actor, and returns counts.
- The same page lists each agent's assigned counts. Bulk release/reassign of an agent's contacts is deferred to a follow-up (removing an agent already releases their contacts; "also reassign owned contacts" covers reassigning within a cohort or selection).
- Commit runs chunked conditional updates from code rather than one DB function; a failure midway keeps earlier chunks assigned, still notifies the agent, and reports partial counts. Re-running is safe.

**Agent side:**
- Assigned contacts show in My Contacts and Today like any owned contact. The agent gets a notification: "N contacts assigned to you".
- Claim button and `/api/sales/contacts/[id]/claim` check `agents_can_claim`. When off, the button is hidden and the API returns 403.
- "Hand back" releases a contact to unassigned with a `released` event.
- `agents_can_claim` is a switch on the Sales Team page, stored with the existing sales settings.

**Migration 0065:** assign function, `agents_can_claim` setting. Applied by the user through the SQL editor; verified read-only afterwards. `database.types.ts` is hand-edited only.

## 3. Phasing, testing, risks

Phases, each reviewed separately:
1. Shell and move: routes, layout, redirects, nav, Overview, Agents deletion. No behavior change.
2. Assignment: migration 0065, Assign Lists page, hand-picked select mode, agent notification.
3. Agent side: claim toggle enforced in API and UI, Hand back.

Testing:
- Unit: nav grouping and active-link logic, redirect map, assignment preview math and skip rules.
- API: claim 403 when off, hand back, assign authorization (admin only).
- Playwright click-through: admin enters Sales Hub, assigns a cohort to the test agent, agent sees the contacts, claim hidden, hand back works; then clean up the test data.

Risks:
- Redirects must cover dynamic `[id]` routes and `?tab=` forms.
- Hardcoded `/dashboard/admin/crm` links in components, emails and notifications need a repo-wide sweep.
- Light and dark mode must not shift; reuse `pz-*` tokens, no raw hex.
- Atomic assign on large cohorts: single statement, fine at thousands of rows.

## Out of scope

Phase C (campaign wizard, Sending Session screens, agent-saved templates, agent-activity view).
