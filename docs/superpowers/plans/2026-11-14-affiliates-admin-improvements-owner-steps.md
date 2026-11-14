# Affiliates admin improvements: owner steps

Plain steps. Do them in this order. Nothing is live until you push and merge.

## 1. Paste the database change (once)

1. Open the Supabase SQL editor for the PZ Academy project.
2. Open `supabase/migrations/0115_affiliate_admin_improvements.sql`, copy all of it, paste it, and press Run.
3. It is safe to run twice. It adds: a place to save the reason for a drop, a list of saved messages (8 starters), and a log of motivation sends.

Do this BEFORE the new code goes live. The Drop button on the new code needs the new column.

## 2. What to look at (phone and PC)

- **Affiliates:** the search box finds a person by name, code or email. Each row has WhatsApp and Email buttons. Pick a message, change the words if you like, then open it. WhatsApp opens a chat. Email opens your mail app. Nothing is sent by the system.
- **Emails:** two tabs, Send and History. History lists each motivation send. Tap one to read it. The email shown is the first person's copy.
- **Applications:** three counts at the top, a Waiting list, and a Decided list with a filter. Dropping someone now asks for a reason. Old dropped people show "No reason recorded".
- **Subtitles:** every tab now has its own line under the title.

## 3. Tests that touch live data (ask me first)

- Drop reason: use the test affiliate TE324 only. I will ask before any live change.
- Motivation send history: needs one real send. Only to TE324. I will ask first.

## 4. Pushing

Tell me "push" and I push the branch `affiliates-admin-improvements`. I never merge. You open the pull request from this link and merge it yourself:
https://github.com/pzacademy9/PZ-Academy---Mentorship-Program/compare/main...affiliates-admin-improvements

The Vercel free plan is close to its limit. Merge once, not in pieces.
