# Purchase choices: your steps

Do these in order. Stop after any step if something looks odd, and tell me what you see.

Why this exists: some paid people were brought in from the old sheets with only a text label such as "Live - Modules: M3 - Individual". The app has no recorded choice for them. So the app holds them and waits for you to match each label to the right option. Nobody is given the whole course by mistake.

## Step 1: Set up the purchase options first

1. Open Registrations, then the campaign, then its registration page setup.
2. Make sure the purchase options are saved and published there (for example the full course and each module). The registration page reads the published version.
3. For each module option, tick its module. An option with no module ticked would mean the whole course, so the app will not let you match people to it.
4. If the options are not there yet, the card says "Set up purchase options on the registration page first". Do that, then come back.

## Step 2: Find the card

1. Open the campaign and press "Portal access".
2. Look at the top of the screen for the card "Match purchase choices".
3. If you do not see the card, nobody on this page needs matching. That is fine.

## Step 3: Read a row

Each row is one label from the old sheets. It shows:

- The label itself, in the words the sheet used.
- A count, for example "24 people". This is how many people have that label.
- The mode, for example Live or Recorded.
- A "Suggested" tag, when the app is sure which option the label means. It already ticks that option for you.

## Step 4: Pick the option and press Apply

1. In the row, tick the option or options that match the label. If "Suggested" shows, check the tick is right.
2. Press "Apply". A window asks you to confirm. Read the number, then confirm.
3. Do this once for each label. After it is done the row shows "Saved for N people".

Pressing Apply again for the same label changes nobody. It is safe.

## What the hold means

- A paid person with no recorded choice gets no access until you match their label.
- They are not given the whole course instead. This is on purpose.
- The line at the top of the card says how many paid people are held.
- Nobody already in a portal loses anything. Existing access is never taken away by this.

## People without an app account

If a person has not made an app account yet, their choice is saved now. Their access arrives when they sign in. People who already have an account get access right away.

Nobody is emailed by matching or by the hold.

## Batch 3: please wait

Do not attach the Batch 3 portal, and do not press "Open for students", until:

1. The purchase options exist on the registration page, and
2. Every label on the card is matched.

Then the held number should be 0.

## Step 5: Check the numbers yourself (read only)

These only read. They change nothing. Paste each one in the Supabase SQL Editor and press Run. Replace `PAGE-ID-HERE` with the page id (the long code in the campaign page address).

Paid people with a label but no recorded choice (held, and shown on the card):

```sql
select count(*) from public.landing_registrations
where page_id = 'PAGE-ID-HERE' and status = 'paid' and is_test = false
  and option_keys = '{}' and option_label <> '';
```

Paid people with no label and no recorded choice. They are held too, but the card cannot show them because there is no label to match. Fix the label in the sheet, or ask me:

```sql
select count(*) from public.landing_registrations
where page_id = 'PAGE-ID-HERE' and status = 'paid' and is_test = false
  and option_keys = '{}' and option_label = '';
```

Enrollments for this page's registrations whose registration has no recorded choice. These may be whole-course access given earlier by mistake. Tell me the number and do not change anything:

```sql
select count(*) from public.enrollments e
join public.landing_registrations r on r.id = e.landing_registration_id
where r.page_id = 'PAGE-ID-HERE' and r.option_keys = '{}';
```

## Live check

1. Before you press any Apply, run the first query above.
2. Compare it with the number of paid held people at the top of the card "Match purchase choices".
3. They should match. If they do not, tell me the two numbers.
4. After you apply every row, run the first query again. It should drop to 0 for people who had a label.

## If something looks wrong

- The card says to set up purchase options first: do Step 1, then reload the page.
- No option is suggested: the app was not sure. Pick the option yourself, or send me the label.
- A red message appears: copy the words and send them to me.
- The numbers do not match: do not press Apply. Tell me the numbers you see.
- You applied the wrong option: tell me the label and the option. Do not apply again, I will fix it.
- The second query shows more than 0: do not change anything. Send me the number.
