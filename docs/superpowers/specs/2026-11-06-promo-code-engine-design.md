# Promo code engine (project 1 of 3: engine, sales agents, affiliates)

Date: 2026-11-06. Status: draft for owner approval.

## Why

Affiliates (about 188 selected, codes like `AS47`) and sales agents need personal promo codes that (a) give a customer a discount and (b) credit the owner. Today only the admin can make codes, one at a time. The owner wants an owner to type `THEIRCODE-10%` and have 10% applied with no admin work, up to a ceiling the admin controls.

This project builds only the engine. The agent screens (project 2) and the affiliate system (project 3) sit on top of it.

## What the owner decided

- A code with a percent on the end gives that percent: `TEST-111-10%` = 10% off, `TEST-111-20%` = 20% off.
- A plain code with no percent gives 10%. Same rule for sales agents and affiliates. The admin can set a single person's plain discount to 0%.
- The admin sets the maximum percent: 30% overall.
- The old affiliate codes (`JM145`, `AS149`, ...) stay as they are; they become `JM145`, `JM145-10%` etc.
- The sale is credited to the owner of the base code, whatever percent is typed.
- Affiliates never log in; their codes are owned by an affiliate record (added in project 3).

## What the engine does

1. **Reading the code.** Customer types a code. The engine first looks for an exact match (so every existing code behaves exactly as today). Only if there is no exact match does it look for a trailing `-NN%` (whole number, letters not case-sensitive, `%` required), remove it, and look up the base code.
2. **Base codes.** A base code is a promo code marked as "owner code". It has an owner (a sales agent now; an affiliate in project 3), a plain discount (default 10%), and an optional own ceiling lower than the global one.
3. **Ceiling.** One global maximum (default 30%) the admin can change. Asking for more than the ceiling is refused with a plain message ("The maximum discount is 30%"), not silently reduced. The lower of the global and the person's own ceiling wins.
4. **Credit.** Registration is credited to the base code's owner, using the existing rule (personal link wins; otherwise the code owner).
5. **Everything else stays the same.** Active/expired/page/option limits, one-per-email, use counts and the server-side check at registration all work on the base code exactly as today. Stored codes keep the current `A-Z 0-9 _ -` rule; the `%` suffix is never stored.
6. **Admin screen.** The Promo Codes screen gets: a "this is an owner code" choice with owner and plain discount, and one place for the global maximum.
7. **Views fix (My links).** Page views from link previews and crawlers should not count. Best effort: ignore view events whose browser name looks like a bot or link preview. Old stored views are not rewritten.

## Not in this project

Agent screens for making codes (project 2). Anything for affiliates: application page, private links, commission, payouts, import (project 3). Commission maths. Changing how existing admin codes work.

## Calls made by me (owner can overrule)

- Exact match first, suffix second: protects every existing code, including odd ones.
- Over-ceiling is an error, not a silent cap, so an agent is never surprised by a smaller discount than they promised the customer.
- Whole-number percents only, 1 to 100 before the ceiling applies.
- Bot filter is by browser name only; it will not catch every preview tool.
- Database changes are written as a new numbered SQL file that the owner pastes; no table is created for affiliates yet.

## Checks before it counts as done

Tests first for: exact match wins over suffix; `-10%` and `-30%` work; `-35%` refused; plain code gives 10%; plain code of a person set to 0% gives nothing; unknown base is "not found"; credit goes to the base owner; expired/inactive base still blocks the suffix form; bot visits not counted. Then one fresh whole-branch review, one fix pass, and a live test with a test agent code before any push.
