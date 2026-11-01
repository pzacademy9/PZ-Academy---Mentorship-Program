# Lead Capture — Going Live: Beginner's Guide

This guide walks through everything left to do before the Sales Lead Capture
feature is usable by real agents. The code is done, tested, and merged to
`master`. Nothing here requires touching code — it's all dashboard clicks,
SQL, and one deploy command.

Do the parts in order. Part 5 (Sheets sync) is the most involved and is
optional to do on day one — the capture page, duplicate detection, and
offline queue all work fully without it. You can ship Parts 1–3 today and
come back to Part 5 later.

---

## Part 1: Add your real sales agents

Right now only one test agent exists (`Test Agent`, token
`test-agent-token-001`). Each real agent needs their own unique,
unguessable link — that link IS their login (there's no password, the link
itself is the credential, so treat each one like one).

This no longer needs SQL — any admin or super_admin can do it from the
dashboard:

1. Log into the admin dashboard, go to **CRM → Agents** tab
   (`/dashboard/admin/crm?tab=agents`).
2. Type the agent's name in **Agent name**, click **Generate link**.
3. Click **Copy link** next to their new row — that copies their personal
   capture link (`https://<your-domain>/leads/add/<their-token>`) straight
   to your clipboard.

Send each agent their own link (WhatsApp, email — however you'd share a
bookmark). Bookmark it on their phone; that's the whole "login."

**To deactivate an agent later** (they leave, or a link leaks), don't
delete them — click **deactivate** next to their row in the same Agents
tab, so their historical leads stay linked to their name:

Every request re-checks this on every single page load and every save — a
deactivated link stops working immediately, no logout needed anywhere else.
(There's no "reactivate" button gap to worry about either — the same
button flips back to "activate" once a row is inactive.)

---

## Part 2: Add your real campaigns (optional but recommended)

The "Campaign" dropdown on the capture page is populated from a table your
agents pick from. Without any rows here, the dropdown just shows "— none —"
and still works fine — but tagging leads by campaign is what makes the data
useful later (which ad/push actually brought this lead in).

```sql
insert into lead_campaigns (name) values ('Instagram — Diabetes Course Oct 2026');
insert into lead_campaigns (name) values ('Facebook — DPC Batch 4');
```

Add as many as you're currently running. To retire one without breaking old
leads that reference it:

```sql
update lead_campaigns set active = false where name = 'Facebook — DPC Batch 4';
```

---

## Part 3 (optional): Turn on the keep-alive cron's auth check

`vercel.json` already schedules a call to `/api/keep-alive` every 3 days —
this alone is enough to stop the free-tier Supabase project from
auto-pausing, and it works with zero configuration.

If you want to make sure nobody *else* can hit that endpoint (harmless
either way — it only does a trivial read — but tidy):

1. Vercel Dashboard → your project → Settings → Environment Variables.
2. Add `CRON_SECRET` = any random string (e.g. another `openssl rand -hex 16`).
3. Redeploy.

Vercel automatically sends that value as a `Bearer` token on its own cron
calls, and the route already checks for it when it's set. Nothing to do on
the Supabase side.

---

## Part 4: Verify the capture page and duplicate detection work for real

Before touching Sheets sync, confirm the core feature works on your actual
deployed site (not just localhost):

1. Open one real agent's link on a phone.
2. Paste a real (test) WhatsApp-style message, tap "Extract fields," confirm
   Name/Email/Profession fill in and Phone is empty (it's never
   auto-trusted — always confirm it manually).
3. Fill in the phone, pick a campaign, tap "Save lead." You should see a
   quick "Lead saved" toast.
4. Paste the exact same message again with the same phone — this time you
   should see "Existing lead found" with an "Update this lead" / "Add as
   new" choice.
5. In Supabase SQL Editor: `select * from leads order by created_at desc
   limit 5;` — confirm the row(s) look right, then delete your test row(s):
   `delete from leads where phone = '<the test phone number>';`

If all of that works, the feature is live and usable today, independent of
everything below.

---

## Part 5: Two-way Google Sheets sync (optional, more involved)

This lets your ops team see every lead in a familiar spreadsheet and update
its status/notes there, with changes flowing back into the app automatically.
Skip this section entirely if a spreadsheet view isn't needed yet — nothing
else in the feature depends on it.

### 5a. Create the Sheet

1. Create a new Google Sheet (or a new tab in an existing ops spreadsheet).
2. Row 1 (the header row) needs one column per field you want visible. Use
   these exact header texts (you choose the wording, just note it down —
   you'll type it into a config value in step 5c):

   | Column | Required? |
   |---|---|
   | a column for the lead's ID | **required** |
   | a column for Status | **required** |
   | a column for Notes | **required** |
   | Name | optional |
   | Email | optional |
   | Phone | optional |
   | Profession | optional |
   | Campaign | optional |
   | Agent | optional |

   A simple header row: `ID, Name, Email, Phone, Profession, Campaign, Agent, Status, Notes`

3. Copy the Sheet's ID out of its URL:
   `https://docs.google.com/spreadsheets/d/`**`THIS_PART_IS_THE_ID`**`/edit`

### 5b. Deploy the code changes to the live Apps Script project

The Google Apps Script project behind this is shared with your existing
enrollment-sync feature — it's one script serving multiple integrations.
**Do not** use the Apps Script web editor's "Deploy → New version" — it
silently keeps stale code from before this feature existed. Use these exact
steps instead:

```bash
cd gas/clasp-project
../../node_modules/.bin/clasp pull
```

This downloads whatever is *currently* live into this folder. Now overwrite
the sync file with the new code from this repo:

```bash
cp ../sheets-sync/Code.gs "Sheet Sync.js"
```

(On Windows PowerShell: `Copy-Item ..\sheets-sync\Code.gs "Sheet Sync.js"`)

```bash
../../node_modules/.bin/clasp push -f
```

Now find the ID of the deployment your app is already pointed at (you're
about to update it in place, not create a new one — a new deployment would
have a new URL and break the existing enrollment sync's env var):

```bash
../../node_modules/.bin/clasp deployments
```

This lists one or more deployment IDs. The one currently live is whichever
one matches the `/exec` URL in your `.env.local`'s `GAS_SHEETS_SYNC_URL`
value (the ID is the long string right before `/exec` in that URL, or you
can match by "which deployment is marked active"). Copy that ID, then:

```bash
../../node_modules/.bin/clasp redeploy <that-deployment-id>
```

This updates the *existing* live URL in place — no env var changes needed.

### 5c. Configure the new script properties

In the Apps Script editor (script.google.com), open this project → ⚙️
Project Settings → Script Properties → Add the following (these are new;
your existing `SYNC_SECRET`, `WEBHOOK_URL`, `COL_*` properties for
enrollment sync stay exactly as they are — don't touch them):

| Property | Value |
|---|---|
| `WEBHOOK_URL_LEADS` | `https://<your-domain>/api/sync/from-sheets` |
| `LEADS_COL_ID` | the exact header text of your ID column |
| `LEADS_COL_STATUS` | the exact header text of your Status column |
| `LEADS_COL_NOTES` | the exact header text of your Notes column |
| `LEADS_COL_NAME` | (optional) header text of your Name column |
| `LEADS_COL_EMAIL` | (optional) header text of your Email column |
| `LEADS_COL_PHONE` | (optional) header text of your Phone column |
| `LEADS_COL_PROFESSION` | (optional) header text of your Profession column |
| `LEADS_COL_CAMPAIGN` | (optional) header text of your Campaign column |
| `LEADS_COL_AGENT` | (optional) header text of your Agent column |

Do **not** set `LEADS_SHEET_ID` by hand — the next step sets it
automatically.

### 5d. Register the Sheet

There's no button in the app for this (it's a one-time setup action, not
something agents ever touch). Run this once from your terminal, filling in
your own values — `<GAS_SHEETS_SYNC_URL>` and `<SHEETS_SYNC_SECRET>` are the
same values already sitting in your `.env.local`, and `<SHEET_ID>` is from
step 5a:

```bash
curl -X POST "<GAS_SHEETS_SYNC_URL>" \
  -H "Content-Type: application/json" \
  -d '{"token":"<SHEETS_SYNC_SECRET>","action":"registerLeadSheet","sheetId":"<SHEET_ID>"}'
```

A successful response looks like:
```json
{"status":"success","message":"Lead sheet registered"}
```

That's it — the Sheet now has a watcher installed on it, and the app knows
where to push leads.

### 5e. Set up the Supabase → app webhook

This is what pushes a lead's data OUT to the Sheet whenever it's created or
updated. It needs your app to be reachable at a real public URL (a Vercel
production or preview deployment — not `localhost`).

1. Supabase Dashboard → Database → Webhooks → **Create a new hook**.
2. Table: `leads`. Events: check **Insert** and **Update**.
3. Type: **HTTP Request**. Method: **POST**.
   URL: `https://<your-domain>/api/sync/to-sheets`
4. Under HTTP Headers, add: `x-sync-secret` = (the same `SHEETS_SYNC_SECRET`
   value from `.env.local`).
5. Save.

### 5f. Test the whole loop

1. On the capture page, save a test lead.
2. Within a few seconds, a new row should appear in your Sheet.
3. In the Sheet, manually change that row's Status cell.
4. Within a few seconds, `select status from leads where id = '<that
   lead's id>';` in Supabase should show the new status.
5. Edit any OTHER cell in that row (e.g. the Name) — confirm it does
   **not** trigger anything (only Status/Notes edits sync back; every
   other column is app-owned and Sheet edits to it are ignored by design).
6. Clean up your test lead when done:
   `delete from leads where phone = '<test phone>';`

If step 2 or step 4 doesn't happen, check (in this order): the script
properties in 5c are spelled exactly like your header row, the webhook in
5e is actually enabled, and the Apps Script project's **Executions** log
(left sidebar in script.google.com) for any red error entries.

---

## Quick reference: what's already done vs. what's above

| Already shipped, no action needed | You still need to do |
|---|---|
| Capture page, extraction, duplicate detection, offline queue, rate limiting | Part 1 — add real agents (CRM → Agents tab) |
| Agent link creation/deactivation UI (CRM → Agents tab) | Part 2 — add real campaigns (optional) |
| Keep-alive cron (already scheduled) | |
| From-sheets and to-sheets API routes | Part 3 — `CRON_SECRET` (optional, cosmetic) |
| GAS script changes (written, not yet live) | Part 5b — deploy them via clasp |
| — | Part 5c/5d — configure + register your Sheet |
| — | Part 5e — turn on the Supabase webhook |
