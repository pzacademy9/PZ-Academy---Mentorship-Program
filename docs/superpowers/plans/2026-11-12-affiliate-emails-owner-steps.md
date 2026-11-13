# Affiliate emails: owner steps

What was built: affiliates get a **Progress email** by themselves each time one of their sales turns Paid. You can
send a **Motivation email** to affiliates with no paid sale yet. One **message box** adds a note to Progress and Welcome
emails. Do the steps in order. Nothing goes live until step 3.

## Step 1. Paste the database change (0113)

1. Open the Supabase SQL editor.
2. Paste the whole file `supabase/migrations/0113_affiliate_emails_progress.sql` and press Run.
3. It is safe to run twice. It marks every sale that is already Paid as "already emailed", so nobody gets an email
   about old sales.
4. Tell me when done. I will check it with a read-only look.

## Step 2. Check two settings (no typing needed if they exist)

- In Vercel, `CRON_SECRET` must exist (the sheet mirror already uses it).
- In Supabase, the secret named `session_cron_secret` must exist (the sheet mirror already uses it).
- The affiliate email settings (`BREVO_API_KEY_AFFILIATES`, sender email and name) already work for the Welcome email.

## Step 3. Turn on the automatic Progress email (only after the code is live on the site)

Paste this in the Supabase SQL editor. It checks for new Paid sales every 5 minutes:

```sql
select cron.schedule('affiliate-progress','*/5 * * * *', $$ select net.http_get(url := 'https://pz-academy.pharmacozyme.com/api/cron/affiliate-progress', timeout_milliseconds := 60000, headers := jsonb_build_object('Authorization','Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='session_cron_secret'))); $$);
```

Check it is scheduled:

```sql
select jobname, schedule from cron.job;
```

Off switch (stops the Progress emails completely):

```sql
select cron.unschedule('affiliate-progress');
```

## Step 4. One careful test before real use

1. Use a TEST affiliate that has your own email address. Never test on the real list.
2. In Admin, Affiliates, Emails: send the Motivation email to that one test person only. Check your inbox. If it is in
   Promotions or Spam, tell me: rich emails can land there.
3. Turn one test registration of that test affiliate to Paid. Within about 5 minutes the Progress email arrives.
4. Fill the message box with a short note and a link. Check the next Progress email shows it, and the link is a button.

## Limits to know

- Your affiliate email account allows 300 emails a day. Progress emails always go first. The Motivation send stops at 250
  a day and tells you how many people are left for tomorrow.
- If several of one person's sales turn Paid together, they get one email.
- Someone who is dropped, left or not accepted gets no Progress email, and does not get a catch-up if accepted again later.
- A sale that is cancelled and then turned Paid again does not send a new Progress email.
- If an email fails 5 times for one affiliate, it stops trying and shows as failed in their email history.

## Stitch prompts for the new "Emails" tab (Admin, Affiliates)

## Stitch prompts for the new "Emails" tab (Admin, Affiliates)

Run both in the project "PZ Academy Mentorship Portal" or the one you use for admin screens. Keep the same look as the
existing Admin Affiliates screen (tabs Applications, Affiliates, Leaderboard) and add a fourth tab called **Emails**.
Send me the screen names when done.

### Phone (390px)

Design the **Emails** tab of the admin Affiliates page, phone width 390px. Same admin look as the existing Affiliates page:
page title "Affiliates", a row of four tab buttons (Applications, Affiliates, Leaderboard, Emails) with Emails selected.

Section 1, a white rounded card titled "Message for all affiliates". One line of help text: "This message is added to every
Progress email and Welcome email. Leave it empty to switch it off." A large text box (5 lines tall) with a counter
"0 / 1000" under it. A full-width green button "Save message". A small green "Saved" confirmation state.

Section 2, a white rounded card titled "Send Motivation emails". Help text: "For affiliates with no paid sale yet. Each
person gets it once." A switch row: "Also show people who already got it" (off). A line "42 people" with a "Select all /
Select none" link. Then a list of rows, each a big tick-box (44px tall touch area), the affiliate name, and a small grey
line under the name saying "Not sent yet" or "Sent 3 Nov". A sticky green button at the bottom: "Send to 42 people".
Show a second state while sending: a progress bar and "Sent 25 of 42", and a third state at the end: "Done. Sent 42." in
green, or "Daily limit reached. 17 people left for tomorrow." in amber. Also an empty state: a friendly icon and "Everyone
has at least one paid sale."

Plain words, no jargon, large touch targets, light look only.

### PC (1440px)

Design the **Emails** tab of the admin Affiliates page, desktop width 1440px, same admin look and left menu as the existing
Affiliates page. Four tab buttons (Applications, Affiliates, Leaderboard, Emails), Emails selected.

Two columns. Left column (about 40 percent): the card "Message for all affiliates" with help text "This message is added to
every Progress email and Welcome email. Leave it empty to switch it off.", a large text box, a counter "0 / 1000", and a
green "Save message" button with a "Saved" confirmation state.

Right column (about 60 percent): the card "Send Motivation emails" with help text "For affiliates with no paid sale yet.
Each person gets it once.", a switch "Also show people who already got it" (off), a header line "42 people" with "Select all
/ Select none", then a table-like list with a tick-box, the affiliate name, and a status "Not sent yet" or "Sent 3 Nov". A
green button "Send to 42 people" at the top right of the card. Show the sending state (progress bar, "Sent 25 of 42"), the
finished state ("Done. Sent 42." in green or "Daily limit reached. 17 people left for tomorrow." in amber), and an empty
state ("Everyone has at least one paid sale.").

Plain words, no jargon, light look only.
