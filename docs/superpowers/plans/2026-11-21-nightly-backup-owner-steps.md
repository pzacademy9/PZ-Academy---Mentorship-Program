# Nightly backup: owner steps

What it does: every night at 02:00 Pakistan time, GitHub takes an encrypted copy of your data and keeps it.
Sunday night it takes a full copy and proves it can be restored.

- Nightly copy: everything except the bulky email and log tables. Kept 7 days.
- Sunday copy: everything. Kept 28 days. Then a test restore runs on a throwaway database.
- Cost: no money. About 2 minutes of GitHub time per run, and about 0.1 to 0.3 GB a month of Supabase egress.

## Do these once, after the pull request is merged

The schedule only starts once the code is on `main`.

### Step 1. Check the GitHub repo is private
GitHub, your repo, Settings, scroll to the bottom: "Danger Zone" shows "Change visibility".
It must say the repo is **Private**. If it is Public, stop and tell me. Do not continue.

### Step 2. Copy the database address from Supabase
1. Supabase, project "PZ Academy Platform", press **Connect** (top bar).
2. Choose **Session pooler**.
3. Copy the address that starts with `postgresql://postgres.`.
4. Put your database password where it says `[YOUR-PASSWORD]`.

### Step 3. Save two secrets in GitHub
GitHub, your repo, Settings, Secrets and variables, Actions, **New repository secret**.

| Name | Value |
|---|---|
| `SUPABASE_DB_URL` | the address from Step 2, with your password in it |
| `BACKUP_PASSPHRASE` | a long random phrase (I will give you one) |

**Keep a copy of the passphrase in your password manager.** Without it, no backup can be opened.

### Step 4. Run it once by hand
GitHub, your repo, **Actions**, "Database backup", **Run workflow**, choose **weekly**, press the button.
It takes about 3 minutes. A green tick means the copy was taken and the test restore passed.
Send me the result (green or red). If red, open the run and send me the red lines.

### Step 5. After the first month
Supabase, Usage, Egress. If it is above 3.5 GB, upgrade Supabase to Pro.

## How to restore (if data is ever lost)
Do not do this alone. Tell me, and I will do it with you:
1. GitHub, Actions, pick the latest green run, download the `pz-backup-...` file.
2. Decrypt it with the passphrase.
3. Restore into a fresh Supabase project (the old one stays untouched until you are sure).
