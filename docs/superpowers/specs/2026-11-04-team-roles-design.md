# Team roles and access screen: design

Date: 2026-11-04. Owner: PZ Academy owner (not technical). Status: waiting for owner approval.

## Why

Today every person with the `admin` role can do everything the owner can. The owner wants to hand parts of the work to other people without giving them the keys: a lighter Admin, a Manager for programs, and Sales Agents. There is no screen for giving someone access, so roles are set by hand in the database. The owner wants one screen to do it, with room for custom access per person.

## Goals

1. A new role `manager`, and a real difference between `admin` and `super_admin`.
2. One "Team" screen, for the super admin only: add a person by email, pick a role, tick extra areas on or off for that person (custom access), switch the person off.
3. Access is checked on the server for every admin page and every admin API, not only by hiding menu items.
4. Menu items a person cannot open are not shown to them.

## Non-goals

- No finer control inside an area (no "can view but not delete"). Access is per area, on or off. (Owner confirmed.)
- No change to students, mentors, or the sales agent experience. A sales agent still only sees the Sales area, settings and notifications.
- No audit log, no approval flows, no per-record ownership rules for managers.

## Anti-goals (a failure even if it "works")

- A person reaches an area they were not given by typing the web address or calling the API directly.
- The owner locks themselves out. The super admin can never lose access, and can never be edited or switched off from the Team screen.
- Anyone silently loses or gains access without the owner seeing it first.

## Roles and areas

Roles: `student`, `mentor`, `sales_agent`, `admin`, `manager`, `super_admin` (the owner).

Areas (one per admin menu entry today): students, certificates, courses, enrollments (registrations), landing_pages (including promo codes and the media library), classes (sessions, attendance, quiz results), feedback, mentors, mentorship, marketing, crm, sales_hub (including the agent leaderboard and agent links), notifications, payment_accounts, sheet_sync, terms, team.

The builder maps each admin page path and each `/api/admin/*` route to exactly one area. Every route must end up in one area; a route with no area is denied.

Starting sets per role. These are the designer's guess; the owner checks them (see "Owner checks"):

- `super_admin`: everything, including `team`. Fixed, cannot be changed.
- `admin`: everything except `payment_accounts`, `sheet_sync`, `terms`, `team`.
- `manager`: courses, landing_pages, classes, enrollments, students, certificates, feedback, mentorship, notifications. Not marketing, crm, sales_hub, mentors, payment_accounts, sheet_sync, terms, team.
- `sales_agent`: unchanged (Sales area only). Custom access does not apply to sales agents in this project.

Custom access: per person, a list of extra areas added and a list of areas removed on top of the role's starting set. `team` can never be granted to anyone but the super admin.

## The Team screen

- Lives under the admin area, area `team`, visible and usable by the super admin only.
- A list of everyone with a staff role: name, email, role, "custom" tag when they differ from their role's starting set, active or switched off.
- Add person: enter an email. If the person already has an account, give them the role. If not, the screen says they must create an account first (the builder decides whether an invite email is worth building; the owner did not ask for one).
- Edit person: change role, tick or untick areas. The screen shows the result in words, for example "Manager, plus Marketing, minus Landing pages".
- Switch off: the person goes back to a plain student account and loses all staff access. Reversible by adding them again.
- Phone-first: the owner checks pages on a phone. Big tap targets, no sideways scroll, one main action per screen.
- Follows the existing admin design system (`pz-*` tokens, existing components). No Stitch screen exists for this; the owner has said before that they may skip Stitch for admin screens, but the builder should hand over a screen prompt if they want one rather than improvising, per CLAUDE.md. Treat that as an open point for the plan.

## Enforcement

- One shared "may this person open this area" check, used in three places: the middleware for `/dashboard/admin/*` pages, the existing `requireAdmin` and `requireAdminPage` helpers (139 API routes and 62 pages call them today), and the menu builder.
- The existing helpers keep working for callers that are not migrated yet only if they fail closed for managers (a manager is not an "admin" for any route that has no area mapping yet).
- Some older database tables use Postgres row-level rules that name `admin` and `super_admin` (see migration 0002). A manager must be added there wherever a manager's area reads those tables directly. Tables read through the service-role client behind a server check need no change. The builder lists which is which.
- `isAdminRole` and any "is admin" test elsewhere (sales workspace, mentor pages, API helpers) must be reviewed once: a manager is not an admin for them unless the area says so.

## Data

- `user_role` enum gains `manager`. Migration written in `supabase/migrations/` (next free number: 0099). The owner pastes it by hand.
- Custom access is stored per person (extra areas, removed areas, switched-off flag). Table or columns: the builder's choice. Service-role only, read behind guards, like the other recent tables.
- `database.types.ts` is never regenerated: hand-add the new entries.

## Facts checked in the live database (2026-11-04, read-only)

- Staff accounts today: 1 `admin`, 1 `mentor`, 1 `sales_agent`. There is NO `super_admin` yet: the owner is the one `admin`.
- So migration 0099 must promote the owner's account to `super_admin` (the builder confirms which row by SELECT before writing it). With only one admin and it being the owner, there is nobody to "grandfather".
- The middleware reads the role from the database on every request (`profiles.role`), not from a cached token. A role change or switch-off therefore takes effect on the person's next click.

## Calls made while writing (designer's, not the owner's)

- The Team screen lists and manages only `admin`, `manager` and `sales_agent` people. Mentors are not listed there; a mentor account stays a mentor (one role per person).
- A route may accept any of several areas, so shared routes work. The media library accepts landing_pages, courses, mentors and marketing.
- Switch-off keeps the person's custom lists; adding them again restores the previous role and lists.
- The row-level-rule edits for managers go in their own migration (0100), pasted separately from 0099.

## Rollout

- Part 1: migration 0099 (new role, owner promoted to `super_admin`, custom-access storage), the area map, the shared check, the Team screen. Nothing else changes yet.
- Part 2: enforce areas on every admin page, API and menu entry; add tests that each route denies a person without its area.
- Each part is its own branch and its own review. The owner opens and merges the PRs.

## Constraints

- Owner is not technical: plain words on every screen.
- No migration is applied by the builder; SQL goes to the owner.
- Never merge to main without the owner's yes. Tests use fake people only.
- Keep all existing tests passing; the known failing test files are listed in CLAUDE.md.

## Left to the builder

- The exact area-to-path map and where it lives.
- Table or columns for custom access.
- How the menu hides entries.
- Whether adding a person by email sends an invite.

## Owner checks (the designer's calls, to confirm when reading)

1. The starting sets for `admin` and `manager` above.
2. Your own account becomes `super_admin` when the migration is pasted (today you are a plain `admin`).
3. Switching a person off makes them a plain student.
4. Custom access does not apply to sales agents in this project.
