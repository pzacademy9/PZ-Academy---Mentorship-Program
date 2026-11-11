# Affiliate leaderboards: your steps

Short and plain. Do them in this order, after the code is live.

## 1. Paste two SQL files (Supabase SQL editor)

1. `supabase/migrations/0111_leaderboard_revenue_price.sql`
   Fixes the sales-agent leaderboard revenue. Until you paste it, the agent leaderboard still shows
   the old (mixed) amounts. Safe to run twice.
2. `supabase/migrations/0112_affiliate_leaderboard.sql`
   Adds the affiliate board numbers and the public link. Safe to run twice. It makes the public link
   once; running it again does NOT change the link.
3. Then paste `supabase/checks/0112_affiliate_leaderboard_check.sql`. It only reads. Send me what it
   shows if anything looks odd.

## 2. Look at the admin tab

1. Open Admin, Affiliates, tab **Leaderboard**.
2. Switch **This month** and **All time**. Check a few names and counts against what you know.
3. Press **Share podium**. Pick Square or Story. Check the picture (top three, first name and last
   initial, paid count, no money).
4. Press **Copy for WhatsApp**. Paste it somewhere and read it.
5. Find **Public link**. Copy it and open it in a private window. This is what affiliates see.

## 3. Look at it on your phone (390px) and PC

- The public board: podium, list, team race.
- One affiliate's private page (open one real private link): the new **Your rank** card sits under the
  stat tiles. Try **This month** and **All time**.

## 4. Things to know

- **Teams are ranked by paid sales per active member.** Active = at least one paid sale in that period.
  Pink has only 2 accepted affiliates, so this keeps it fair.
- **All time includes the old imported sales. This month does not** (old sales have no date).
- **Change link** in the admin tab kills the old public link at once. Anyone with the old link sees a
  "no longer active" page. Use it only if the link leaks.
- The desktop (1440px) design of the Your rank card did not finish in Stitch. I built the PC layout as
  three columns from the phone design. Send me a design later if you want it changed.
- Still paused: Progress and Motivation emails, payouts.
