# Quiz results: what you need to do

Plain steps. Nothing here changes the live site until you do step 1.

## Step 1: paste the database change

1. Open the Supabase SQL editor.
2. Open the file `supabase/migrations/0090_quiz_results.sql` from this branch, copy all of it, paste it, press Run.
3. It is safe to run twice.

## Step 2: wait for the screen

The behind-the-scenes parts are done and tested: reading the Kahoot file, matching IDs (including the `n` rejoin), the review rules, saving, and the live ranking. The admin screen is not built yet. It needs a design first (see below). Until then there is nothing to click.

## Step 3: get the design made (one copy and paste)

Open the Stitch project "PZ Academy website" and paste the prompt from `docs/superpowers/plans/2026-10-27-quiz-results-stitch-prompt.md`. Tell me when the screen exists and I build it exactly like the design.

## When the screen is built: your first real try

1. Open a batch, then "Sessions and attendance", then "Quiz results" on one session.
2. Upload the Kahoot file.
3. Fix the problem rows. Saving stays off until every problem has an answer.
4. Save, then check the ranking.
5. Saving the same session again replaces its results. Nothing doubles.

## Things to know

- The quiz maximum is suggested as number of questions times 1,000 (20 questions: 20,000). You can type another number.
- A student who took the quiz but did not check in shows in a list. One click marks them present.
- Recorded students are saved but never appear in the live ranking.
