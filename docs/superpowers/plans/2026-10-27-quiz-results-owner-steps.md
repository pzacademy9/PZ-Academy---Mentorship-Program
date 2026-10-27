# Quiz results: what you need to do

Plain steps. Nothing here changes the live site until you do step 1.

## Step 1: paste the database change

1. Open the Supabase SQL editor.
2. Open the file `supabase/migrations/0090_quiz_results.sql` from this branch, copy all of it, paste it, press Run.
3. It is safe to run twice.

## Step 2: try the screen

Built straight from the look of the Sessions screen (no separate Stitch design, at your request). If you want it restyled later, tell me.

## Your first real try

1. Open a batch, then "Sessions and attendance", then "Quiz results" on one session.
2. Upload the Kahoot file.
3. Fix the problem rows. Saving stays off until every problem has an answer.
4. Save, then check the ranking.
5. Saving the same session again replaces its results. Nothing doubles.

## Things to know

- The quiz maximum is suggested as number of questions times 1,000 (20 questions: 20,000). You can type another number.
- A student who took the quiz but did not check in shows in a list. One click marks them present.
- Recorded students are saved but never appear in the live ranking.
