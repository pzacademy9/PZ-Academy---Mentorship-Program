# Messaging campaign participants: setup note

This is a short checklist for turning on "Send email" and "Send WhatsApp" on a campaign's participant list. Do the steps in order.

## Before you deploy (important)

This work sits on top of the Plan 2b branch. Two database files must be pasted into Supabase **before this branch goes live**:

1. `supabase/migrations/0076_landing_batch_access.sql` (from Plan 2b, paste it at deploy time if you have not already).
2. `supabase/migrations/0077_participant_messaging.sql` (this plan).

Paste 0076 first, then 0077. Without 0077 the Send buttons will not work.

## 1. Add the database changes in Supabase

1. Open your Supabase project and go to the **SQL editor**.
2. Open `supabase/migrations/0077_participant_messaging.sql`, copy everything, paste it into a new query and press **Run**. It should finish with "Success".
3. Now open `supabase/tests/0077_participant_messaging_smoke.sql`, copy everything, paste it into a new query and press **Run**.
4. A **red error box** will appear. That is expected: the test is built to end with an error so it undoes all of its own test data. Read the box. It starts with "RESULTS (this error is expected, it undoes the test data)" and lists one line per check.
5. A good result is every line starting with **[PASS]**. If any line says **[FAIL]**, stop and send me that line.

## 2. Add three settings by hand

Participant messages go out through a second Brevo account. Add these three settings:

| Name | What to put |
|---|---|
| `BREVO_API_KEY_PARTICIPANTS` | The API key from the second Brevo account |
| `BREVO_SENDER_EMAIL_PARTICIPANTS` | The "from" email address. It must already be **verified** in the second Brevo account |
| `BREVO_SENDER_NAME_PARTICIPANTS` | The "from" name people will see |

Add them in two places:

- **Vercel:** Project, Settings, Environment Variables. Add each one for **Production** and **Preview**. Redeploy afterwards so they take effect.
- **Your computer:** the `.env.local` file in the project folder, one line each, like `BREVO_SENDER_NAME_PARTICIPANTS=PZ Academy`.

Keep the key private: do not paste it into chat or any message, and do not save it in any file that gets committed. (`.env.local` is not committed.)

## 3. Try it safely on yourself first

1. Open a campaign in the Registrations area.
2. Tick **one** person only: yourself (use a test registration with your own email).
3. Press **Send email**.
4. Write your message and press **Send test to me** first. Check that it arrives and looks right.
5. Now send the real message to your one ticked person (yourself).
6. In the email you received, click the **unsubscribe** link. It should open a page confirming you are unsubscribed. After that, you will be skipped on future emails.
7. Go back, tick yourself again and press **Send WhatsApp**. Open the link for your row and check the message appears ready to send in WhatsApp.
8. Check the **Messages sent** list on the campaign page shows what you just sent.

Only after this works, send to a bigger group.

## 4. The "not paid" warning

If anyone you ticked has not paid, a warning shows how many (and why), for example "not paid (...). They will get this message too." You must tick **"I understand that people who have not paid will get this message"** before sending. It is only a safety check: if you meant to message only paid people, go back and untick the others.

## 5. If something goes wrong

- **"Sending paused"**: some people are still waiting. Press **Continue sending**. It carries on where it stopped. Nobody is sent twice.
- **People marked "Failed"**: press **Resend failed**. Be careful: some of those may already have gone out (for example if your connection dropped), so check before you resend.
- **"Email sending is not set up yet."**: one of the settings in step 2 is missing, or the site has not been redeployed since you added them. Check the settings and redeploy.
- **"This message was just sent. Check Messages sent before sending again."**: the same message was sent a moment ago. Look at the Messages sent list first.
