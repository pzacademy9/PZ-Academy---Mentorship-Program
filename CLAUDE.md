# PZ Academy — Project Instructions

## Stitch is the design source of truth

Before building or redesigning ANY UI, check the relevant Stitch project for an existing
screen covering the requirement:

- `11811490301995978699` — "PZ Academy website" (screens generated through Phase 8)
- `8093496535280885471` — "PZ Academy Feedback System"
- `963183329053087808` — "PZ Academy Mentorship Portal"
- Run `mcp__stitch__list_projects` for the full list if the need falls outside these.

If a screen exists, extract its layout and copy exhaustively — port every section, don't
simplify or drop pieces because they look secondary or their backing feature isn't built yet
(stub the feature, but keep the real layout/copy from the screen).

**If no screen exists for the need, stop and hand over a generation prompt rather than
improvising a design.** Screen generation via `generate_screen_from_text` has repeatedly timed
out on this account — hand the user a prompt to run themselves rather than fighting the MCP
tool.

`mcp__stitch__get_screen` / `list_screens` return `htmlCode.downloadUrl`, not inline markup —
fetch that URL for the actual frontend code.

## Build gotchas

- `npm run <script>` is broken by the `&` in this workspace's path
  (`...\PZ Academy\PZ Academy LMS & Site\...`) — call the binary directly instead, e.g.
  `./node_modules/.bin/vitest run`, `./node_modules/.bin/tsc --noEmit`.
- `next build` corrupts the live dev server — don't run it while a dev server is up.
- Google Drive image URLs need `/thumbnail?id=` proxied through this app's own `/api/cover`
  route, not `uc?export=view` directly — Drive's CORP header blocks the latter when hotlinked.
