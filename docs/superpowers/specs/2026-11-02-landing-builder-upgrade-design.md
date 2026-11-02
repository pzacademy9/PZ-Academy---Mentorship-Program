# Landing page builder upgrade: design

Date: 2026-11-02. Owner: PZ Academy owner (not technical). Status: draft for approval.

## Why

The builder makes a page fast, but the owner cannot trust it. Three things hurt:

1. They cannot verify that the right WhatsApp group link goes to the right buyer, or that a country link (for example UAE) shows that country's prices and form. There is no check and no test.
2. The Page settings and Links screens look too complicated for a non-technical person.
3. The page itself does not look premium. The hero looks like a template, the instructor section looks poor on a laptop, and the top bar shows a logo that is not PZ Academy's.

Success means: after building any page, the owner presses one button and is told in plain words whether everything is in place; a wrong link cannot be published; settings can be understood without help; and the page looks like a premium brand.

## Goals

- A "Check this page" step plus automated tests, covering group links, portal links and country pricing, that blocks Publish while a check fails.
- Each page can offer Live only, Recorded only, or Both.
- Recorded buyers get a portal link, never a WhatsApp group link. The portal link is sent when the person is marked Paid in the app.
- Publish stays manual after every change. Undo and Redo work in the builder.
- Page settings and Links redone as simple step cards. Links gets "Copy all links" for the sales team.
- A switch to turn "Create account" on or off (at the end of the form and in the success message).
- One site-wide PZ Academy logo, set once, used in the landing page top bar.
- Three hero layouts the owner can choose from. Style 1 has a "Photo fade" control.
- A better instructor section (1 to 4 instructors), with two layouts.

## Non-goals

- No change to prices, payment accounts, the registration form fields, the Sheet sync, or the Meta tracking.
- No new analytics, no stats, no "conversion tips".
- No redesign of other landing sections (curriculum, benefits, pricing cards, FAQ).
- No per-page logo.

## Anti-goals (a failure even if it technically works)

- A page that passes the checks but still sends a recorded buyer a group link.
- Any screen that shows made-up numbers, names or claims. The Stitch mockups contain invented content (listed below). None of it may ship.
- Jargon in the builder. Words like "CTA", "redirect URL", "endpoint", "territory routing", "GeoIP" must not appear.
- Changing what an already-published page shows to students without the owner pressing Publish.

## Order of work (three builds, each its own branch, review and merge)

1. **Safety first.** Manual Publish and Undo/Redo, Live/Recorded/Both, the portal link on Paid, "Check this page" and its tests.
2. **Simple settings.** New Page settings step cards, new Links screen with Copy all links, Create account switch, site-wide logo.
3. **Looks.** Three hero styles with Photo fade, the new instructor section.

One written plan per build.

## Decisions made by the owner

- Publish is manual after every change. Edits stay hidden from students until Publish is pressed; students see the last published version meanwhile.
- Undo and Redo must work.
- Recorded buyers: a portal link, chosen from portals already in the app, or pasted if the app has none. Never a group link. It is sent when the person is marked Paid in the app.
- Each landing page can be set to Live only, Recorded only, or Both. The page, the form and the checks follow that choice.
- Create account is a switch (on or off) that controls both the end of the form and the success message.
- One site-wide logo. Not per page.
- Three hero styles, all offered to the user as a choice. Style 1 has a user-controlled fade: Light, Medium, Strong.
- Instructor section: Layout A (portrait left, text right) is the default; Layout B (dark green band) is optional; two to four instructors show as side-by-side cards.
- The front end is designed in Google Stitch first (project "PZ Academy Platform 2", id 4651274386787527431). Builders download the screens and match them. Skip anything in the screens that is demo or invented.

## What exists today (so the builder does not rediscover it)

- Draft and published copies already exist: the editor autosaves a draft (`useAutosaveDraft`, `LandingEditor.tsx`) and Publish is a separate action (`PublishSlot.tsx`). Link variants have their own publish slot (`variants/LinkPublishSlot.tsx`). There is no Undo/Redo today.
- A page's registration settings live in `RegistrationConfig` (`src/lib/landing/registration/types.ts`): `modes: ("live"|"recorded")[]`, `options[]` each with a single `waGroupUrl`, `regions[]`, and `prices[option][region]`. Recorded is a mode applied to the same option (price is a percent of regular), so today a recorded buyer of an option can receive that option's group link. That is the bug behind the owner's worry.
- Group buttons come from `src/lib/landing/registration/wa-groups.ts` and are used by `SuccessScreen.tsx` and the paid email (`src/lib/emails/landing-registration.ts`).
- "Create account" is in `src/components/landing/registration/SuccessScreen.tsx` and also appears at the end of the form (builder to find the exact place).
- The marketing nav logo is a hard-coded image URL in `src/components/marketing/MarketingNav.tsx`. The landing page top bar has its own logo.
- Page settings is `PageSettingsPanel.tsx`; Links is `variants/LinksPanel.tsx`; readiness checks are in `ReadinessPanel.tsx` and `config.ts` (`computeReadiness`).

## Build 1: Safety first

**Publish and Undo/Redo.** Scope (my call): Undo/Redo and the single Publish button cover the page draft (sections, settings, registration, prices). Country and module links keep their own Publish switch and their own history on the Links screen. Page columns that are not part of the draft today (`course_id`, `is_main_page`, `show_in_portal`) stay outside Publish; no migration. The top bar shows a status chip ("Draft changes not published" or "Published, nothing new"), Undo, Redo, Preview, Versions and one Publish button, with the line "Students see the last published version until you press Publish." Undo and Redo cover every edit to the page draft (text, sections, settings, prices, links). The history is kept for the current editing session and is cleared on reload (my call, to keep it simple); Versions remains the way back across sessions. Keyboard: Ctrl+Z / Ctrl+Shift+Z.

**Live / Recorded / Both.** A per-page choice stored in `registration.modes`. Live only hides recorded choices on the page and form; Recorded only hides live choices and group links.

**Links by mode (owner decision: keep the current model).** Recorded stays a price percent on the same options; it does not become separate options. No data or pricing change. Today's code already gives recorded buyers no group button (`selectWaGroups` returns `[]` for recorded, and the success screen, `status-email.ts` and the Paid warning all pass the buyer's mode). Build 1 does not change that behaviour; it adds checks and tests that prove it stays true, and shows it on the Page settings screen (recorded options show the portal, never a group link).

**Portal link (my call).** Today a page linked to a course sends `/portal/{courseSlug}` when the buyer is marked Paid (`access-rules.ts`; the buyer needs an account, and the email tells them how to create one). Keep that. "Portals in the app" therefore means the course the page is linked to; it is shown and picked from the linked course, not typed. For a page with no linked course, the owner can paste a portal link instead; that link is used for all recorded buyers on the page. One portal setting per page (module buyers still only get their own modules through the existing access rules). The Paid email and the Check use this.

**Check this page.** A button and a results list in plain words. Each check is a pure function so it can be tested without a browser. Checks:
- Every live option that can be bought has a valid group link.
- Two options with the same group link give a warning, not a block (owner decision: groups are sometimes shared on purpose). The warning is a **popup** (owner decision) that appears when Publish is pressed, names both options in plain words (for example "Module 1 and Full Course use the same WhatsApp group"), and has two buttons: "Go back and fix" and "Publish anyway". The same note also shows in yellow on Check this page.
- A recorded buyer's result never contains a group link (proved by tests on the real selection code, not by data shape).
- When the page offers recorded, it has a portal: a linked course, or a pasted portal link.
- Each country link shows only that country's prices, currency and payment details, and the form for that country; no price or account from another country appears.
- Every option offered in a country has a price there.
- Live only pages have no portal requirement; Recorded only pages have no group requirement.
A failing check says what is wrong and where, with a "Fix this" button that jumps to the setting. Publish is disabled while any red check fails; warnings do not block (they show the popup above). Existing readiness problems stay.

**Automated tests.** Unit tests for each check using fake people and fake links (never real student data). A test that builds the paid-email and success-screen data for each buyer type (live module 1, live full, recorded module, recorded full, group) and asserts the exact links they receive. A test for the country rule using the real pricing and region code. These run in the normal test suite and must pass before merge.

## Build 2: Simple settings

**Page settings** becomes five step cards (Stitch screens listed below), each with a one-line explanation and a "Ready" or "Needs attention" tag: Who can register (Live only / Recorded only / Both), Register button, After registering (Create account switch), WhatsApp and portal links, Countdown and start date. Sharing preview stays, collapsed. Words: "Button text", "What the button does", "Which portal they get".

**Links** is one row per country or module: name, link, Copy, a check mark from "Check this page", and the Publish switch. "Add a country or module" stays. **Copy all links** copies an organised text list for the sales team: page name on the first line, then one line per country or module with its link. The text is shown in a preview before copying. Only links that are published are included (my call; unpublished ones would send customers to a page that does not exist).

**Create account switch (owner decision).** One setting, default on (keeps today's behaviour). When off, only two things go: the "Create account" prompt in the success message and the one at the end of the form (builder to find the exact place; only the success message was found in the code review). The Paid email to recorded students still explains how to create an account, so nobody is locked out of the portal.

**Site-wide logo (my call).** Today the landing top bar shows a "PZ" letter block and the page title (`LandingRenderer.tsx`), not the real logo. One logo is set once in site settings and replaces the letter block on every landing page. Default: the existing PZ Academy logo image used by `MarketingNav.tsx`, so the owner's complaint is fixed with no upload. This is the one change that applies to already-published pages at once, because the owner asked for the logo to be fixed everywhere; it changes only the logo, nothing else.

## Build 3: Looks

**Hero, three styles (my call on how they join today's styles).** The hero already has a `heroStyle` choice (photo, poster, classic). The three new styles are added as new choices; the existing ones stay selectable and untouched, so no published page changes until the owner picks a new style and publishes. New pages default to the new Style 1. Owner picks per page: Style 1 photo behind the text; Style 2 split (text left, portrait right); Style 3 editorial (large serif headline on flat deep green, wide photo below). All three have a phone layout. Style 1 has a "Photo fade" control with three steps (Light, Medium, Strong) and a live preview. Text always comes from the owner's fields. The phone fact labels show their full text.

**Instructor section.** Layout A is the default, Layout B optional. Today's limit of 8 instructors stays (my call; the mockups show up to 4, so 5 to 8 wrap into more cards). Two or more show as side-by-side cards. Fields: photo, name, title, short bio, and a new optional credentials list. The current single "title / credentials" text (`role`) stays as the title and is not split, so published pages keep rendering the same. No stats, no overlay badges.

## Stitch screens to match (project 4651274386787527431)

Hero, refined: Style 1 desktop `89085a13055d4ed28dce8e2404c9cae8`, mobile `0d9b7753c55747ae9b20ca815365f742`; Style 2 desktop `3b4ead71456f4205926e9faf13f0653a`, mobile `4e540f688dc14a5cbd719062c41b28ee`; Style 3 desktop `64f6415c4535454abc4dc2655aac3810`, mobile `3427f2e6ac0b43f0b7b51221154a7f9d`.

Instructor: Layout A `3c6b70d3dd2e4335a08ac50d020752df`, Layout B `fd337639a37f49449612db5e6a4f5d3b`, two instructors `76ac7bd9efcf48c691ba844bfe535da5`, mobile A `fc33ed650653435c9859a23b33d03d0f`, mobile B `f40337945bfc45428506dc953cec443f`.

Builder: Page settings desktop `c59ec329b05d491ba96062fb253976a5`, mobile `e0ea550368c64351ae9096f44a0ebde0`; Links desktop `978baf02ea0b4fbf8f8b5a8f2c9a8010`, mobile `ed5668e31ce34bb5bd43b0dffaadbfea`; Check this page desktop `9619b2e4bbf34869bbed04beec006125`, mobile `83526386ba1648078e157cd922f351dc`.

## Parts of the Stitch screens to skip (invented or demo)

- Hero: "Masterclass" tag, "Cohort 14 Enrolling", "Limited to 45", the course-director card, caption lines like "Interactive rounds" or "CE credits awarded".
- Instructor: stats such as "14+ years", "2,400+", "98.4%", "4.9/5", "Cohort 14 Capped at 40", "Upcoming Teaching Module", "Direct weekly Q&A", "Office hours", "Trials run", the "PharmaZyme" brand name and logo, and the "Course Landing Detail" app bar on phones.
- Builder: "Course Funnel Engine", "Traffic distribution", "Live visitor sandbox", "741 Sales Rep Dispatches", the "+18.4% conversion" tip, Stripe/JazzCash/Mashreq/GeoIP wording, the second left menu on Links, and the "Save Draft Settings" button on phones (changes already save as drafts).
- "Simulate Student Checkout Flow" and the post-checkout preview panel on Check this page: not in scope.

## Constraints

- Plain words in every label, button and message.
- No change to migrations without the owner pasting SQL; each migration safe to run twice with a check query.
- Existing published pages must keep rendering exactly the same until the owner re-publishes.
- Tests use fake people only. No student data in the repo.

## Left to the builder

- Where the site-wide logo setting lives, and how the landing top bar reads it.
- The exact data shape for the portal link and the Live/Recorded/Both choice, and a safe default for existing pages (existing pages keep their current `modes`).
- How Undo/Redo is stored (in memory in the editor).
- The text format of Copy all links beyond the outline above.
- How "Fix this" jumps to the right setting.
