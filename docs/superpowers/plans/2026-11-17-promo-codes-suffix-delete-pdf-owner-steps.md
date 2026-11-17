# Promo codes: percent after a code, Delete, PDF lists. Owner steps

Plain steps. Do them in this order. Nothing is live until you push and merge.

There is no SQL to paste. There is no database change. You only need to look at the new things once the code is live.

## What is new

- Any ordinary code now accepts a percent after it, like `PZ10-20%`.
- Ordinary codes that nobody has used now have a Delete button.
- A "Download as PDF" box on the Promo codes page, with three PDF buttons.

## 1. Make a test code

1. Open the Promo codes page.
2. Press "New promo code".
3. Make a plain test code, for example `ZZTEST`. Give it a discount and pick a test page.
4. Press "Create code".

Use only a test page and a test code. Never use a real participant's registration.

## 2. Try a percent after the code

1. Open your test page.
2. In the registration form, type the code with a percent after it, like `ZZTEST-20%`.
3. The price should drop by 20 percent, if 20 is not above the highest allowed percent.
4. Now type a bigger percent than the highest allowed, like `ZZTEST-99%`. It should not give that discount.

## 3. The highest percent allowed

1. On the Promo codes page, find the box "Highest percent anyone may type".
2. This box controls how far a percent after a code can go.
3. Change it, save, and try again on the test page if you like.

## 4. See Delete on an unused code

1. On the Promo codes page, find `ZZTEST`. Nobody has used it yet.
2. It shows a Delete button next to Pause.
3. Do not press it yet.

## 5. See Delete missing on a used code

1. Find any ordinary code that has been used. It shows Pause or Resume, but no Delete.
2. Under the list you will see: "Used codes cannot be deleted. Pause them instead."
3. Agent codes and affiliate codes never show Delete.

If you register on your test page with `ZZTEST` to try it, that code counts as used. After that, Delete goes away for it. Pause it instead.

## 6. Delete the test code

1. If `ZZTEST` is still unused, press Delete next to it.
2. A box asks "Delete ZZTEST?". Press "Delete code".
3. If it was used, press Pause instead.

## 7. Download the PDFs

On the Promo codes page, find the box "Download as PDF". It has three buttons.

1. "Ordinary codes (PDF)". The file downloads at once. Open it. It shows each code, its discount, where it works, and its last date. This list is public, so it is fine to share.
2. "Sales agent codes (PDF)". A box asks "Who will see this file?". Pick one option.
3. "Affiliate codes (PDF)". The same box appears. Pick one option.

The agent and affiliate buttons show only if you have Sales Hub access.

The two choices:

- "Share in a group". The file shows names and codes only. Anyone you send it to will see those names and codes.
- "For me". The file also shows the discount and whether the code is on. This file is private. Keep it to yourself.

Open each file and check it matches the words above.

## 8. One known limit

Names written in Urdu or Arabic may not print correctly in the PDF. This is a limit of the PDF font. English names are fine.

## 9. Pushing

Tell me "push" and I push the branch `promo-codes-suffix-delete-pdf`. I never merge. You open the pull request and merge it yourself.

The Vercel free plan is close to its limit. Merge once, not in pieces.
