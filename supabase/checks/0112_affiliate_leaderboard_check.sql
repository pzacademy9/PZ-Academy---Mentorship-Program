-- 0112_affiliate_leaderboard_check.sql
-- A read-only check for migration 0112. Paste it in the Supabase SQL editor AFTER pasting 0112.
-- It only reads. It changes nothing. Read the result boxes:
--   1. accepted      = how many accepted affiliates there are
--   2. all_time_rows = rows the board gives for "all time"   (must equal accepted)
--   3. month_rows    = rows the board gives for this month   (must equal accepted)
--   4. token_ok      = true when the public link token exists and has the right shape (must be true)

select count(*) as accepted from public.affiliates where status = 'accepted';

select count(*) as all_time_rows from public.affiliate_leaderboard(null);

select count(*) as month_rows
  from public.affiliate_leaderboard(
    (date_trunc('month', now() at time zone 'Asia/Karachi')) at time zone 'Asia/Karachi'
  );

select count(*) = 1 and bool_and(token ~ '^[A-Za-z0-9_-]{20,64}$') as token_ok
  from public.affiliate_board_link;
