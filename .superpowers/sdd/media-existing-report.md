# Add pictures already on the website

## Changes
- src/lib/data/landing-media.ts: `importExistingMedia(userId)`. Pages reads 1000 rows at a time (order id, range). Sources: courses (thumbnail_url, banner_url, mentor_avatar_url), mentors (name, photo_url), banners (slot, image_url), landing_pages and landing_page_variants (draft/published walked generically). First source wins per Drive file id; existing landing_media ids counted as alreadyThere; non-Drive column links counted as skipped (distinct links). Upsert in chunks of 200, onConflict drive_file_id, ignoreDuplicates; added = rows actually returned. Any read or write error throws; all reads happen before any write.
- src/app/api/admin/landing-media/import-existing/route.ts: POST, requireAdmin, maxDuration 60, 200 counts or 500 plain message.
- src/components/admin/landing/MediaLibrary.tsx: outline button, "Looking..." and disabled while running, toast, list reload.
- Tests: tests/landing-media-import.test.ts (12), tests/landing-media-import-route.test.ts (3), tests/landing-media-import-ui.test.tsx (4).

## TDD evidence
Red (before implementation): `node node_modules/vitest/vitest.mjs run tests/landing-media-import` gave "Test Files 3 failed (3)", "importExistingMedia is not a function".
Green: `node node_modules/vitest/vitest.mjs run tests/landing-media-*.test.ts tests/landing-media-library.test.tsx tests/library-image-field.test.tsx tests/landing-media-import-ui.test.tsx` gave "Test Files 7 passed (7), Tests 61 passed (61)".
`node node_modules/typescript/bin/tsc --noEmit` gave no output (0 errors). eslint on all touched files gave no output.

## Concerns
- Column names checked against database.types.ts: mentors.name, banners.slot (enum value, e.g. "home_hero", is used as is in the name), courses.title. landing_media columns per 0072 (name 1..80, folder check, unique drive_file_id); inserted fields match.
- Landing JSON walk requires a string starting with http(s):// containing "google" with no whitespace and a Drive file id, so YouTube `?id=` links and prose containing a URL are ignored. Non-Drive strings in landing JSON are not counted as skipped (cannot tell which are pictures).
- Mock hides `.upsert(...).select()` semantics: with ignoreDuplicates PostgREST returns only inserted rows, which `added` relies on. Not run against the live DB.
- `from(table as "courses")` cast in the paging helper to satisfy the typed client with a dynamic table name.
- New route file uses LF; sibling files are CRLF.
