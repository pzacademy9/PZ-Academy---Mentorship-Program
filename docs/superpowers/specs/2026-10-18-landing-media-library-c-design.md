# Landing builder Easy Mode, C: shared media library

Parent spec: `2026-10-16-landing-builder-easy-mode-design.md` (section C). Branch `landing-media-library`, cut from `landing-hero` so the hero image fields from B are reused. Approved by the owner 2026-10-18.

## Why

Teammates re-upload the same hero, instructor and poster pictures on every page. One shared library lets them pick instead of upload, and stops a picture that a live page still shows from being removed by accident.

## Goals

- One library shared by all admin teammates: upload, search, rename, move between folders, delete.
- Every image field in the page builder offers "Choose from library" and "Upload new". Upload new also adds the file to the library.
- Hero image fields (PC 16:9, phone 9:16) show a fit tag and list matching shapes first.
- Deleting a picture that any page still uses is blocked, with the page names shown.

## Non-goals

- No import of images already on existing pages. The library starts empty.
- No editing, cropping or resizing tools beyond the existing `compressImage`.
- No new roles. Gate is `requireAdmin`, kept in one helper so a role can be added later.
- No change to how visitors receive images.
- Deleting a library entry does not delete the Drive file.

## Anti-goals

- A picture used by a live page disappearing or breaking.
- Hand-pasted image links stopping to work.
- Any change to how existing pages look.

## Decisions

- **Storage.** Files stay in Google Drive via the existing upload route `/api/admin/uploads/image` (GAS `uploadCourseImage`, public link). Only records go in Supabase. Display goes through `/api/cover/[fileId]` as `LandingImage` does today (Drive `uc?export=view` is blocked by CORP).
- **Table `landing_media`.** Drive file id, public url, display name, folder (`heroes` | `instructors` | `misc`, default `misc`), width, height, orientation (`wide` | `tall` | `square`, derived), size in bytes, uploaded by, created at. Migration is pasted by the owner; Supabase MCP is read-only. Hand-add the types to `database.types.ts`, never regenerate.
- **Where.** A "Media" page in the admin sidebar, plus a picker pop-up opened from every image field (`LandingImageField`, hero fields from B).
- **Picker.** Search box, folder tabs (All, Heroes, Instructors, Misc), picture grid. Hero fields show "fits PC" / "fits phone" tags and sort matching shapes first.
- **Upload.** Reuses `compressImage` and the upload route; limit 5 MB. Dimensions are read in the browser and sent with the library record.
- **In-use check.** Before delete, look for the file id in draft and published content of every page, including per-link edits. Old saved versions are ignored, or nothing could ever be deleted. The block lists page names.
- **Permissions.** `requireAdmin` through one helper such as `canManageMedia`. Because every user is admin today, the in-use block is the main safeguard.
- **Hand-pasted links.** The text link box keeps working. A pasted link does not enter the library.
- **Visible words.** No jargon. Use "picture", "folder", "Choose from library", "Upload new", "Used by".

## Left to the builder

- Exact column types, indexes, RLS (admin-only read and write via server routes).
- API route shapes, pagination, search method.
- Component split and where the helper lives.
- How to read the Drive file id out of a stored url for the in-use scan.
- Test plan and browser checks (PC 1280, phone 390).

## Calls made by the designer (owner to review)

1. The library starts empty. Images enter it from uploads and from the picker only.
2. Old saved versions do not count as "in use".
3. Delete removes the library entry only. The Drive file stays.
4. 5 MB limit, same as today.
5. Pasting a link by hand still works and is not added to the library.
