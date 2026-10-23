# Website and landing page connection: steps for the owner

Do these in order. Step 1 must come before the new code goes live.

1. **Paste the database file.** Open the Supabase SQL editor and paste the whole of `supabase/migrations/0084_landing_main_page.sql`. It is safe to run twice. Tell Claude when done; Claude checks it worked.
2. **Open the pull request and merge it** (only when you say so). Branch: `website-landing-connection`.
3. **Tie Diabetes Batch 1 to its course.** Admin > Landing pages > Diabetes Management & Pharmacotherapy – Batch 1. At the top, choose the course "Diabetes Management Course – Dr Christine".
   - Tick "Main page for this course" only if you want the website to show "Live batch open" for it now. That course is currently marked draft on the website, so decide first.
4. **Tell the 3 paid Batch 1 buyers** to log in with the same email they registered with. Their access links up automatically. Their portal stays closed until you mark the Batch 1 modules as finished.
5. **For each new live batch (for example PPC Batch 3):** open its landing page, choose the PPC course, set "Batch start date", and tick "Main page for this course". The website banner, the course card tag and the home page strip appear by themselves. Close or finish the page and they disappear by themselves.

Notes
- Recorded-only ad pages work already: switch Live off on that landing page and set the recorded price.
- Registrations that come from the website carry "Came from: website" in their details.
- If the same student paid on the website and on a landing page, the enrollments list shows "Also paid on a landing page".
