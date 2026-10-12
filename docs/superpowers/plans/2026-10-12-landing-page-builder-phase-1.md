# Landing Page Builder — Phase 1 (Builder + Renderer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** An admin can create, edit (guided forms + live laptop/phone preview), publish, roll back, duplicate and close a landing page for a course, workshop or webinar, and visitors see it, fast, at `/e/<slug>`.

**Architecture:** A page is a `LandingContent` JSON (page settings, SEO, ordered section blocks) stored in `landing_pages.draft`; Publish copies it to `published` and snapshots it in `landing_page_versions`. Section types are declared once in a registry of field descriptors; the zod schema, defaults, editor form and publish-readiness checks are all derived from that registry. A server-rendered, edge-cached route `/e/[slug]` renders the published copy with plain React components (no `dangerouslySetInnerHTML`; admin text goes through a small safe mini-markup parser). Registration is NOT in this phase: Register buttons open a configurable link (the existing registration page) until Phase 2 swaps in the shared registration widget.

**Tech Stack:** Next.js 14.2.5 App Router, React 18, TypeScript, Tailwind with `pz-*` tokens, Supabase (service-role from server routes), zod 4, vitest 4 + @testing-library/react (jsdom), lucide-react, sonner toasts, existing `ImageUploadField`, `useAsyncAction`, `useConfirm`.

**Spec:** `docs/superpowers/specs/2026-10-12-landing-page-builder-design.md` (this plan covers its "Phase 1" and the "Page builder (admin UI)" and "Performance and responsive" sections; Phase 2 and 3 are separate plans).

## Global Constraints

- Branch `landing-page-builder`, created off `origin/main`, upstream unset. Never push or merge to `main`. No push without the user asking.
- `npm run` is broken in this workspace path. Run `node node_modules/typescript/bin/tsc --noEmit` and `node node_modules/vitest/vitest.mjs run tests/<file>`.
- Never run `next build` while the dev server runs. Start dev with `node node_modules/next/dist/bin/next dev` (background).
- Never regenerate `src/lib/supabase/database.types.ts`; hand-add the two new table entries only.
- The Supabase MCP declines writes. The user pastes migration SQL into the Supabase SQL editor (project id `whqdasotjlhvrjmgiffk`, region ap-northeast-1; ignore `octmwoddikksgaicxchz`); you verify read-only afterwards with `execute_sql`.
- Every new table has RLS enabled. These two tables are service-role only (RLS on, zero policies), matching 0058/0066.
- All writes go through `createAdminSupabase()` behind `requireAdmin()` in route handlers.
- Landing pages are **light theme only** and keep the **existing landing-page brand**, which differs from the app's `pz-*` palette: primary `#04704D`, deep `#023122`, mint `#80D8AD`, near-black `#0D1B13`, surface `#F8F9FA`, text `#191C1D` (copied from the `tailwind.config` block in `Landing pages/Course/PPC-B3-Landing.html`), headline font Montserrat, body font Inter. These values are defined ONCE as a `landing` colour group in `tailwind.config.ts` (e.g. `bg-landing-primary`, `text-landing-on-surface`, `bg-landing-deep`, `text-landing-mint`) and components use only those token classes; no raw hex anywhere else. The admin screens (list, editor) use the app's `pz-*` tokens and its dark-mode rules. Light mode of the existing app must not change.
- Admin text fields allow only bold (`**x**`), bullets (`- x`) and links (`[x](https://...)`). Never use `dangerouslySetInnerHTML` for admin-authored text.
- Links accepted only if `http:`, `https:`, `mailto:`, `tel:`, or relative starting `#` or `/`. Anything else is rendered inert.
- Performance targets: LCP < 2.5 s on a mid-range Android phone on 4G, CLS < 0.1 (measured in Task 12).
- **UI must come from Stitch.** No Stitch screens for the builder or the public landing page exist yet. The user generates them from `docs/superpowers/stitch-prompts-landing-page-builder.md`. Tasks 7–11 start with a gate: the implementer must fetch and port the named Stitch screens (see `CLAUDE.md` "Stitch is the design source of truth") and stop and report if a screen is missing. The logic/tests in those tasks are authoritative; the Stitch screens supply layout, spacing and copy only.
- Commit trailer on every commit: `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`. Fixes get NEW commits, never `git commit --amend`.
- Known pre-existing failure: `tests/pz-tokens.test.ts` (SalesTeamPanel.tsx adaptive danger token). Ignore it; add no new violations.
- Parallel implementers must `git add` explicit paths only.

## Review Focus

Spec-implied failure modes no happy-path test covers. Each has a pinning test in the task named in brackets.

1. **Older or damaged saved content** (draft saved before a section type or field existed, an unknown section type, a field with the wrong type) must never crash the editor or the public page; unknown sections are dropped and bad fields fall back to defaults. [Task 2, Task 3, Task 7]
2. **Hostile text and links** (`<script>`, `javascript:` URLs, `data:` URLs, `//evil.com`) in any admin field must render inert and never reach the DOM as markup or as a clickable unsafe `href`. [Task 4, Task 7]
3. **Two tabs or two admins saving over each other** (autosave race, stale tab) must produce a 409 conflict the editor reports, not a silent overwrite; and a slow older response must never overwrite a newer revision. [Task 5, Task 9]
4. **Slugs:** reserved words (`api`, `new`, `preview`…), uppercase, spaces, punctuation, non-Latin names, and duplicates must produce a clear message, never a broken URL or a 500. [Task 4, Task 5]
5. **Publishing an incomplete page** must be blocked by the server, not only the disabled button (direct API call). [Task 5]
6. **Missing or Drive-hosted images** must not leave a broken-image icon or layout shift; empty image fields render nothing. [Task 7]

---

## File Structure

New files (responsibility in parentheses):

- `supabase/migrations/0067_landing_pages.sql` (tables)
- `src/lib/landing/simple-text.ts` (safe URL check, YouTube id, mini-markup parser)
- `src/lib/landing/slug.ts` (slugify, validateSlug, reserved words)
- `src/lib/landing/sections.ts` (section registry: field descriptors, schema builder, defaults, normalizer)
- `src/lib/landing/content.ts` (content types, normalizeContent, section operations, kind templates, readiness, change detection)
- `src/lib/landing/templates.ts` (blank + three seeded starter templates)
- `src/lib/landing/image-size.ts` (`fitWithin` for client-side downscale)
- `src/lib/validations/landing.ts` (API request schemas)
- `src/lib/data/landing-pages.ts` (server-only data layer)
- `src/app/api/admin/landing-pages/route.ts` (POST create)
- `src/app/api/admin/landing-pages/[id]/route.ts` (PATCH save draft)
- `src/app/api/admin/landing-pages/[id]/publish/route.ts`
- `src/app/api/admin/landing-pages/[id]/rollback/route.ts`
- `src/app/api/admin/landing-pages/[id]/duplicate/route.ts`
- `src/app/api/admin/landing-pages/[id]/status/route.ts`
- `src/components/landing/LandingRenderer.tsx` (dispatcher: nav, banner, sections, footer)
- `src/components/landing/SimpleText.tsx` (renders parsed mini-markup as React nodes)
- `src/components/landing/Countdown.tsx` (client countdown banner)
- `src/components/landing/sections/*.tsx` (one file per section type)
- `src/app/e/[slug]/page.tsx` (public route + metadata)
- `src/app/dashboard/admin/landing-pages/page.tsx` (list)
- `src/app/dashboard/admin/landing-pages/[id]/page.tsx` (editor shell, server)
- `src/app/dashboard/admin/landing-pages/[id]/preview/page.tsx` (iframe preview target)
- `src/components/admin/landing/*.tsx` (list, dialogs, editor, section list, section form, settings panel, readiness panel, versions panel, preview frame)
- `src/hooks/useAutosaveDraft.ts`
- tests: `tests/landing-simple-text.test.ts`, `landing-slug.test.ts`, `landing-sections.test.ts`, `landing-content.test.ts`, `landing-routes.test.ts`, `landing-renderer.test.tsx`, `landing-templates.test.ts`, `landing-autosave.test.tsx`, `landing-admin-ui.test.tsx`

Modified: `src/lib/supabase/database.types.ts` (two table entries), `src/components/dashboard/nav.ts` (one admin item).

---

### Task 1: Migration and types

**Files:**
- Create: `supabase/migrations/0067_landing_pages.sql`
- Modify: `src/lib/supabase/database.types.ts` (add `landing_pages` and `landing_page_versions` inside `public.Tables`, alphabetically placed like the neighbours)

**Interfaces:**
- Produces: tables `landing_pages(id, slug, kind, title, status, draft, published, revision, published_at, created_by, created_at, updated_at)` and `landing_page_versions(id, page_id, version, content, created_by, created_at)`; Typescript `Database["public"]["Tables"]["landing_pages"]` / `["landing_page_versions"]` with `Row`/`Insert`/`Update`/`Relationships`.

- [ ] **Step 1: Write the migration**

```sql
-- 0067_landing_pages.sql
-- Landing page builder (Phase 1). A page's content is one jsonb document:
-- draft is what the admin edits; published is what visitors see. Publish
-- copies draft -> published and snapshots it in landing_page_versions.
-- Both tables are service-role only (RLS on, zero policies), the convention
-- from 0033/0047/0058/0066: all access goes through createAdminSupabase()
-- behind requireAdmin() / the public render route.

create table if not exists public.landing_pages (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique
               check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) between 3 and 60),
  kind         text not null check (kind in ('course', 'workshop', 'webinar')),
  title        text not null check (char_length(title) between 1 and 120),
  status       text not null default 'draft' check (status in ('draft', 'published', 'closed')),
  draft        jsonb not null,
  published    jsonb,
  revision     integer not null default 1,
  published_at timestamptz,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (status = 'draft' or published is not null)
);

create table if not exists public.landing_page_versions (
  id          uuid primary key default gen_random_uuid(),
  page_id     uuid not null references public.landing_pages(id) on delete cascade,
  version     integer not null,
  content     jsonb not null,
  created_by  uuid references public.profiles(id) on delete set null,
  created_at  timestamptz not null default now(),
  unique (page_id, version)
);

create index if not exists landing_page_versions_page_idx
  on public.landing_page_versions (page_id, version desc);

alter table public.landing_pages enable row level security;
alter table public.landing_page_versions enable row level security;
```

- [ ] **Step 2: Hand-add the types.** Open `src/lib/supabase/database.types.ts`, find the `banners` entry for the exact shape (Row / Insert / Update / Relationships). Add (alphabetical position among tables):

```ts
      landing_page_versions: {
        Row: {
          content: Json
          created_at: string
          created_by: string | null
          id: string
          page_id: string
          version: number
        }
        Insert: {
          content: Json
          created_at?: string
          created_by?: string | null
          id?: string
          page_id: string
          version: number
        }
        Update: {
          content?: Json
          created_at?: string
          created_by?: string | null
          id?: string
          page_id?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "landing_page_versions_page_id_fkey"
            columns: ["page_id"]
            isOneToOne: false
            referencedRelation: "landing_pages"
            referencedColumns: ["id"]
          },
        ]
      }
      landing_pages: {
        Row: {
          created_at: string
          created_by: string | null
          draft: Json
          id: string
          kind: string
          published: Json | null
          published_at: string | null
          revision: number
          slug: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          draft: Json
          id?: string
          kind: string
          published?: Json | null
          published_at?: string | null
          revision?: number
          slug: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          draft?: Json
          id?: string
          kind?: string
          published?: Json | null
          published_at?: string | null
          revision?: number
          slug?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
```

- [ ] **Step 3: Type-check.** Run `node node_modules/typescript/bin/tsc --noEmit`. Expected: no NEW errors (the repo has known pre-existing drift errors; compare against `git stash`-free baseline by noting the count before your edit).

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/0067_landing_pages.sql src/lib/supabase/database.types.ts
git commit -m "feat(landing): landing_pages and landing_page_versions tables"
```

- [ ] **Step 5: HAND-OFF TO USER (controller does this, not the implementer).** Tell the user: "Paste `supabase/migrations/0067_landing_pages.sql` into the Supabase SQL editor for project `whqdasotjlhvrjmgiffk` and run it." After they confirm, verify read-only with `mcp__claude_ai_Supabase__execute_sql` (load via ToolSearch): `select table_name from information_schema.tables where table_schema='public' and table_name like 'landing_page%';` Expected: both rows; and `select tablename, rowsecurity from pg_tables where tablename like 'landing_page%';` Expected: `rowsecurity = true` for both. Tasks 5+ that touch the database cannot be browser-verified until this is applied.

---

### Task 2: Mini-markup, safe URLs, slugs

**Files:**
- Create: `src/lib/landing/simple-text.ts`, `src/lib/landing/slug.ts`
- Test: `tests/landing-simple-text.test.ts`, `tests/landing-slug.test.ts`

**Interfaces:**
- Produces:
  - `isSafeUrl(url: string): boolean`
  - `youtubeId(url: string): string | null`
  - `type Inline = { t: "text"; v: string } | { t: "bold"; v: string } | { t: "link"; v: string; href: string }`
  - `type Block = { t: "p"; inline: Inline[] } | { t: "ul"; items: Inline[][] }`
  - `parseSimpleText(src: string): Block[]`
  - `RESERVED_SLUGS: readonly string[]`, `slugify(input: string): string`, `validateSlug(slug: string): { ok: true } | { ok: false; message: string }`

- [ ] **Step 1: Write the failing tests**

```ts
// tests/landing-simple-text.test.ts
import { describe, it, expect } from "vitest";
import { isSafeUrl, youtubeId, parseSimpleText } from "@/lib/landing/simple-text";

describe("isSafeUrl", () => {
  it.each(["https://a.com/x", "http://a.com", "mailto:a@b.com", "tel:+923001234567", "#registration", "/e/ppc-b3"])(
    "accepts %s", (u) => expect(isSafeUrl(u)).toBe(true));
  it.each(["", "javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,<script>", "//evil.com", "vbscript:x", "ftp://a.com", "not a url"])(
    "rejects %s", (u) => expect(isSafeUrl(u)).toBe(false));
});

describe("youtubeId", () => {
  it.each([
    ["https://youtu.be/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5", "dQw4w9WgXcQ"],
    ["https://youtube.com/shorts/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
    ["https://www.youtube.com/embed/dQw4w9WgXcQ", "dQw4w9WgXcQ"],
  ])("extracts from %s", (u, id) => expect(youtubeId(u)).toBe(id));
  it.each(["", "https://vimeo.com/123", "https://youtube.com/watch?v=short", "javascript:alert(1)"])(
    "returns null for %s", (u) => expect(youtubeId(u)).toBeNull());
});

describe("parseSimpleText", () => {
  it("splits paragraphs on blank lines and joins wrapped lines", () => {
    expect(parseSimpleText("Line one\nstill one\n\nSecond")).toEqual([
      { t: "p", inline: [{ t: "text", v: "Line one still one" }] },
      { t: "p", inline: [{ t: "text", v: "Second" }] },
    ]);
  });
  it("groups '- ' lines into one list", () => {
    expect(parseSimpleText("- a\n- b")).toEqual([
      { t: "ul", items: [[{ t: "text", v: "a" }], [{ t: "text", v: "b" }]] },
    ]);
  });
  it("parses bold and safe links", () => {
    const [p] = parseSimpleText("Hi **there** [site](https://a.com)");
    expect(p).toEqual({ t: "p", inline: [
      { t: "text", v: "Hi " }, { t: "bold", v: "there" }, { t: "text", v: " " },
      { t: "link", v: "site", href: "https://a.com" },
    ] });
  });
  it("renders an unsafe link as plain text, never as a link", () => {
    const [p] = parseSimpleText("[click](javascript:alert(1))");
    expect(JSON.stringify(p)).not.toContain('"t":"link"');
    expect(JSON.stringify(p)).toContain("click");
  });
  it("keeps HTML as literal text", () => {
    const [p] = parseSimpleText("<script>alert(1)</script>");
    expect(p).toEqual({ t: "p", inline: [{ t: "text", v: "<script>alert(1)</script>" }] });
  });
  it("returns [] for empty or whitespace input", () => {
    expect(parseSimpleText("")).toEqual([]);
    expect(parseSimpleText("  \n \n")).toEqual([]);
  });
});
```

```ts
// tests/landing-slug.test.ts
import { describe, it, expect } from "vitest";
import { slugify, validateSlug, RESERVED_SLUGS } from "@/lib/landing/slug";

describe("slugify", () => {
  it.each([
    ["PPC Batch 3", "ppc-batch-3"],
    ["  Practical   Pharmacology — Batch #4!! ", "practical-pharmacology-batch-4"],
    ["Café Crème", "cafe-creme"],
    ["---x---", "x"],
  ])("%s -> %s", (i, o) => expect(slugify(i)).toBe(o));
  it("returns '' for a name with no latin letters or digits", () => {
    expect(slugify("دورة")).toBe("");
  });
  it("caps at 60 chars with no trailing dash", () => {
    const s = slugify("a".repeat(59) + " b");
    expect(s.length).toBeLessThanOrEqual(60);
    expect(s.endsWith("-")).toBe(false);
  });
});

describe("validateSlug", () => {
  it("accepts a normal slug", () => expect(validateSlug("ppc-b4")).toEqual({ ok: true }));
  it.each(["ab", "PPC-B4", "has space", "-x-", "a--b", "x".repeat(61), ""])("rejects %j", (s) => {
    expect(validateSlug(s).ok).toBe(false);
  });
  it.each([...RESERVED_SLUGS])("rejects reserved word %s", (s) => {
    const r = validateSlug(s.length >= 3 ? s : s + "xx");
    if (s.length >= 3) expect(r.ok).toBe(false);
  });
  it("gives a plain-language message", () => {
    const r = validateSlug("api");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/reserved|taken|different/i);
  });
});
```

- [ ] **Step 2: Run to verify FAIL.** `node node_modules/vitest/vitest.mjs run tests/landing-simple-text.test.ts tests/landing-slug.test.ts` → FAIL, module not found.

- [ ] **Step 3: Implement**

```ts
// src/lib/landing/simple-text.ts
/**
 * The only "rich text" admin-authored landing copy supports: **bold**, lines
 * starting "- " as bullets, and [label](url) links. Output is a small AST
 * rendered as React elements (see SimpleText.tsx) so admin text can never
 * become markup. URLs are allow-listed here, once.
 */

export function isSafeUrl(url: string): boolean {
  const v = url.trim();
  if (v === "") return false;
  if (v.startsWith("#")) return true;
  if (v.startsWith("/") && !v.startsWith("//")) return true;
  try {
    return ["http:", "https:", "mailto:", "tel:"].includes(new URL(v).protocol);
  } catch {
    return false;
  }
}

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

export function youtubeId(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.replace(/^www\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0] || null;
  else if (host === "youtube.com" || host === "m.youtube.com") {
    if (u.pathname === "/watch") id = u.searchParams.get("v");
    else {
      const m = u.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/);
      id = m ? m[1] : null;
    }
  }
  return id && YT_ID.test(id) ? id : null;
}

export type Inline =
  | { t: "text"; v: string }
  | { t: "bold"; v: string }
  | { t: "link"; v: string; href: string };
export type Block = { t: "p"; inline: Inline[] } | { t: "ul"; items: Inline[][] };

const INLINE = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

function parseInline(line: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of line.matchAll(INLINE)) {
    const at = m.index ?? 0;
    if (at > last) out.push({ t: "text", v: line.slice(last, at) });
    if (m[1] !== undefined) out.push({ t: "bold", v: m[1] });
    else if (isSafeUrl(m[3])) out.push({ t: "link", v: m[2], href: m[3] });
    else out.push({ t: "text", v: m[2] });
    last = at + m[0].length;
  }
  if (last < line.length) out.push({ t: "text", v: line.slice(last) });
  return out;
}

export function parseSimpleText(src: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: string[] = [];
  const flushPara = () => {
    if (para.length) blocks.push({ t: "p", inline: parseInline(para.join(" ")) });
    para = [];
  };
  const flushList = () => {
    if (list.length) blocks.push({ t: "ul", items: list.map(parseInline) });
    list = [];
  };
  for (const raw of src.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { flushPara(); flushList(); continue; }
    if (line.startsWith("- ")) { flushPara(); list.push(line.slice(2)); continue; }
    flushList();
    para.push(line);
  }
  flushPara();
  flushList();
  return blocks;
}
```

```ts
// src/lib/landing/slug.ts
export const RESERVED_SLUGS = [
  "api", "new", "preview", "admin", "dashboard", "login", "register", "auth",
  "e", "courses", "workshops", "webinars", "enroll", "portal", "leads",
] as const;

export function slugify(input: string): string {
  const s = input
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return s;
}

export function validateSlug(slug: string): { ok: true } | { ok: false; message: string } {
  if (slug.length < 3) return { ok: false, message: "The link must be at least 3 characters." };
  if (slug.length > 60) return { ok: false, message: "The link must be 60 characters or fewer." };
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug)) {
    return { ok: false, message: "Use only lowercase letters, numbers and single dashes (for example ppc-batch-4)." };
  }
  if ((RESERVED_SLUGS as readonly string[]).includes(slug)) {
    return { ok: false, message: "That link is reserved. Please choose a different one." };
  }
  return { ok: true };
}
```

- [ ] **Step 4: Run to verify PASS.** Same command. Expected: all pass.
- [ ] **Step 5: Commit** — `git add src/lib/landing/simple-text.ts src/lib/landing/slug.ts tests/landing-simple-text.test.ts tests/landing-slug.test.ts && git commit -m "feat(landing): safe mini-markup, URL allow-list, slug rules"`

---

### Task 3: Section registry

**Files:**
- Create: `src/lib/landing/sections.ts`
- Test: `tests/landing-sections.test.ts`

**Interfaces:**
- Consumes: `isSafeUrl`, `youtubeId` (Task 2).
- Produces:
  - `SECTION_TYPES` (readonly tuple), `type SectionType`
  - `type FieldKind`, `interface FieldDef`, `interface SectionDef`
  - `SECTION_DEFS: Record<SectionType, SectionDef>`
  - `defaultSectionData(type): Record<string, unknown>`
  - `sectionDataSchema(type): z.ZodObject`
  - `normalizeSectionData(type, raw: unknown): Record<string, unknown>` (never throws)

- [ ] **Step 1: Write the failing test**

```ts
// tests/landing-sections.test.ts
import { describe, it, expect } from "vitest";
import {
  SECTION_TYPES, SECTION_DEFS, defaultSectionData, sectionDataSchema, normalizeSectionData,
} from "@/lib/landing/sections";

describe("section registry", () => {
  it("every type has a def with a unique key per field", () => {
    for (const t of SECTION_TYPES) {
      const keys = SECTION_DEFS[t].fields.map((f) => f.key);
      expect(new Set(keys).size).toBe(keys.length);
      expect(SECTION_DEFS[t].label.length).toBeGreaterThan(0);
    }
  });
  it("default data passes its own schema for every type", () => {
    for (const t of SECTION_TYPES) {
      const r = sectionDataSchema(t).safeParse(defaultSectionData(t));
      expect(r.success, t).toBe(true);
    }
  });
  it("hero defaults the primary button label", () => {
    expect(defaultSectionData("hero").primaryCtaLabel).toBe("Register now");
  });
});

describe("normalizeSectionData (never throws)", () => {
  it("fills missing fields with defaults", () => {
    const d = normalizeSectionData("hero", { headline: "Hi" });
    expect(d.headline).toBe("Hi");
    expect(d.primaryCtaLabel).toBe("Register now");
  });
  it("drops unknown keys", () => {
    expect(normalizeSectionData("faq", { heading: "Q", evil: "x" })).not.toHaveProperty("evil");
  });
  it("replaces a wrong-typed field with its default", () => {
    expect(normalizeSectionData("hero", { headline: 123 }).headline).toBe("");
    expect(normalizeSectionData("faq", { items: "nope" }).items).toEqual([]);
  });
  it("replaces an unsafe url with empty", () => {
    expect(normalizeSectionData("hero", { image: "javascript:alert(1)" }).image).toBe("");
    expect(normalizeSectionData("hero", { secondaryCtaUrl: "javascript:alert(1)" }).secondaryCtaUrl).toBe("");
  });
  it("normalizes list items individually", () => {
    const d = normalizeSectionData("faq", { items: [{ q: "A?", a: "B" }, { q: 5, a: null }, "junk"] });
    expect(d.items).toEqual([
      { q: "A?", a: "B" },
      { q: "", a: "" },
      { q: "", a: "" },
    ]);
  });
  it("survives null and non-object input", () => {
    expect(() => normalizeSectionData("hero", null)).not.toThrow();
    expect(() => normalizeSectionData("hero", "x")).not.toThrow();
  });
  it("caps list length at maxItems", () => {
    const many = Array.from({ length: 500 }, () => ({ q: "q", a: "a" }));
    expect((normalizeSectionData("faq", { items: many }).items as unknown[]).length).toBeLessThanOrEqual(40);
  });
});

describe("schema validation (API side)", () => {
  it("rejects an unsafe link", () => {
    expect(sectionDataSchema("hero").safeParse({ ...defaultSectionData("hero"), secondaryCtaUrl: "javascript:x" }).success).toBe(false);
  });
  it("accepts an incomplete draft (required is a publish rule, not a save rule)", () => {
    expect(sectionDataSchema("hero").safeParse(defaultSectionData("hero")).success).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify FAIL** (`node node_modules/vitest/vitest.mjs run tests/landing-sections.test.ts`).

- [ ] **Step 3: Implement**

```ts
// src/lib/landing/sections.ts
import { z } from "zod";
import { isSafeUrl, youtubeId } from "./simple-text";

/**
 * The single source of truth for landing-page sections. The editor form, the
 * save-time schema, the defaults, the tolerant render-time normalizer and the
 * publish-readiness checks are ALL derived from these descriptors, so adding a
 * field or a section type is a one-place change.
 *
 * "required" means "needed to publish" (see computeReadiness), NOT "needed to
 * save": drafts are allowed to be incomplete.
 */

export const SECTION_TYPES = [
  "hero", "stats", "rich_text", "feature_cards", "curriculum", "instructors",
  "pricing_cards", "schedule", "video_reviews", "testimonials", "faq", "final_cta",
] as const;
export type SectionType = (typeof SECTION_TYPES)[number];

export type FieldKind = "text" | "textarea" | "image" | "youtube" | "url" | "list";

export interface FieldDef {
  key: string;
  label: string;
  kind: FieldKind;
  help?: string;
  example?: string;
  required?: boolean;
  max?: number;
  defaultValue?: string;
  itemFields?: FieldDef[];
  itemLabel?: string;
  maxItems?: number;
}

export interface SectionDef {
  type: SectionType;
  label: string;
  description: string;
  /** Short label for the page's top navigation anchor, when this section is enabled. */
  navLabel?: string;
  fields: FieldDef[];
}

const MARKUP_HELP = "Tip: put **two stars** around words to make them bold, start a line with - for a bullet.";

const text = (key: string, label: string, o: Partial<FieldDef> = {}): FieldDef => ({ key, label, kind: "text", max: 200, ...o });
const area = (key: string, label: string, o: Partial<FieldDef> = {}): FieldDef => ({ key, label, kind: "textarea", max: 2000, ...o });
const image = (key: string, label: string, o: Partial<FieldDef> = {}): FieldDef => ({ key, label, kind: "image", ...o });
const link = (key: string, label: string, o: Partial<FieldDef> = {}): FieldDef => ({ key, label, kind: "url", ...o });
const list = (key: string, label: string, itemFields: FieldDef[], o: Partial<FieldDef> = {}): FieldDef => ({
  key, label, kind: "list", itemFields, maxItems: 40, ...o,
});

export const SECTION_DEFS: Record<SectionType, SectionDef> = {
  hero: {
    type: "hero", label: "Hero (top of page)", description: "The big opening: headline, short text, picture and the Register button.",
    fields: [
      text("eyebrow", "Small line above the headline", { example: "LIVE WORKSHOP · 4–7 SEPTEMBER" }),
      text("headline", "Headline", { required: true, max: 120, example: "Master Diabetes Pharmacotherapy" }),
      area("subheadline", "Short description", { max: 400, help: "One or two sentences under the headline." }),
      image("image", "Picture", { help: "Best at least 1200 px wide. It is resized for phones automatically." }),
      text("primaryCtaLabel", "Main button text", { defaultValue: "Register now", max: 40 }),
      text("secondaryCtaLabel", "Second button text (optional)", { max: 40, example: "Watch preview" }),
      link("secondaryCtaUrl", "Second button link (optional)", { help: "Starts with https://" }),
      text("dateLine", "Date and time line", { example: "Wednesday, 16 September · 7:30 PM PKT" }),
      list("badges", "Highlights under the buttons", [text("text", "Highlight", { max: 60 })], { itemLabel: "Highlight", maxItems: 6 }),
    ],
  },
  stats: {
    type: "stats", label: "Numbers bar", description: "A strip of big numbers, like '500+ students'.",
    fields: [list("items", "Numbers", [text("value", "Number", { required: true, max: 20, example: "500+" }), text("label", "What it means", { required: true, max: 60, example: "Pharmacists trained" })], { required: true, itemLabel: "Number", maxItems: 6 })],
  },
  rich_text: {
    type: "rich_text", label: "Text block", description: "A heading with paragraphs and bullets. Good for the problem, the story or 'who is this for'.",
    navLabel: "About",
    fields: [text("heading", "Heading", { required: true }), area("body", "Text", { required: true, max: 6000, help: MARKUP_HELP }), image("image", "Picture (optional)")],
  },
  feature_cards: {
    type: "feature_cards", label: "Benefit cards", description: "A grid of cards: what you will learn, what you get, why it matters.",
    navLabel: "Benefits",
    fields: [
      text("heading", "Heading", { required: true }),
      text("subheading", "Line under the heading", { max: 300 }),
      list("items", "Cards", [text("title", "Card title", { required: true, max: 80 }), area("text", "Card text", { max: 400 })], { required: true, itemLabel: "Card", maxItems: 12 }),
    ],
  },
  curriculum: {
    type: "curriculum", label: "Curriculum / outline", description: "Modules or days, each with a short list of topics.",
    navLabel: "Curriculum",
    fields: [
      text("heading", "Heading", { required: true, example: "What you will learn" }),
      list("items", "Modules or days", [
        text("title", "Title", { required: true, max: 100, example: "Day 1 — Basics" }),
        text("subtitle", "Small line (optional)", { max: 120 }),
        area("points", "Topics", { max: 1500, help: "One topic per line starting with -. " + MARKUP_HELP }),
      ], { required: true, itemLabel: "Module", maxItems: 20 }),
    ],
  },
  instructors: {
    type: "instructors", label: "Instructors", description: "Who is teaching, with photo and a short bio.",
    navLabel: "Instructor",
    fields: [
      text("heading", "Heading", { defaultValue: "Meet your instructor" }),
      list("items", "People", [
        text("name", "Name", { required: true, max: 80 }),
        text("role", "Title / credentials", { max: 160 }),
        area("bio", "Short bio", { max: 1200, help: MARKUP_HELP }),
        image("photo", "Photo"),
      ], { required: true, itemLabel: "Person", maxItems: 8 }),
    ],
  },
  pricing_cards: {
    type: "pricing_cards", label: "Prices", description: "Plans or options with their price. (Shown for information; registration opens through the Register button.)",
    navLabel: "Pricing",
    fields: [
      text("heading", "Heading", { defaultValue: "Choose your plan" }),
      text("note", "Note under the heading", { max: 300, example: "Early Bird ends 15 October" }),
      list("items", "Plans", [
        text("name", "Plan name", { required: true, max: 80 }),
        text("price", "Price", { required: true, max: 40, example: "PKR 4,800" }),
        text("oldPrice", "Crossed-out old price (optional)", { max: 40 }),
        text("badge", "Badge (optional)", { max: 30, example: "Best value" }),
        area("features", "What is included", { max: 1200, help: "One per line starting with -." }),
      ], { required: true, itemLabel: "Plan", maxItems: 8 }),
    ],
  },
  schedule: {
    type: "schedule", label: "Schedule / agenda", description: "When things happen: dates, times, session topics.",
    navLabel: "Schedule",
    fields: [
      text("heading", "Heading", { defaultValue: "Schedule" }),
      list("items", "Entries", [
        text("when", "When", { required: true, max: 80, example: "Fri 30 Oct · 7:30 PM" }),
        text("title", "What", { required: true, max: 120 }),
        text("detail", "Extra detail (optional)", { max: 300 }),
      ], { required: true, itemLabel: "Entry", maxItems: 30 }),
    ],
  },
  video_reviews: {
    type: "video_reviews", label: "Video reviews", description: "Student video feedback from YouTube or YouTube Shorts.",
    navLabel: "Reviews",
    fields: [
      text("heading", "Heading", { defaultValue: "What students say" }),
      list("items", "Videos", [
        { key: "url", label: "YouTube link", kind: "youtube", required: true, help: "Paste the YouTube or Shorts link." },
        text("caption", "Caption (optional)", { max: 120 }),
      ], { required: true, itemLabel: "Video", maxItems: 12 }),
    ],
  },
  testimonials: {
    type: "testimonials", label: "Written testimonials", description: "Quotes from past students.",
    navLabel: "Testimonials",
    fields: [
      text("heading", "Heading", { defaultValue: "Loved by pharmacists" }),
      list("items", "Quotes", [
        area("quote", "Quote", { required: true, max: 600 }),
        text("name", "Name", { required: true, max: 80 }),
        text("role", "Role (optional)", { max: 120 }),
        image("photo", "Photo (optional)"),
      ], { required: true, itemLabel: "Quote", maxItems: 20 }),
    ],
  },
  faq: {
    type: "faq", label: "Questions and answers", description: "Common questions, answered.",
    navLabel: "FAQ",
    fields: [
      text("heading", "Heading", { defaultValue: "Frequently asked questions" }),
      list("items", "Questions", [text("q", "Question", { required: true, max: 200 }), area("a", "Answer", { required: true, max: 1500, help: MARKUP_HELP })], { required: true, itemLabel: "Question", maxItems: 40 }),
    ],
  },
  final_cta: {
    type: "final_cta", label: "Closing call to action", description: "A last push to register, near the bottom.",
    fields: [
      text("headline", "Headline", { required: true, max: 120, example: "Ready to join?" }),
      area("text", "Text", { max: 400 }),
      text("buttonLabel", "Button text", { defaultValue: "Register now", max: 40 }),
    ],
  },
};

// ---------------------------------------------------------------- derived

function defaultForField(f: FieldDef): unknown {
  if (f.kind === "list") return [];
  return f.defaultValue ?? "";
}

function itemSchema(f: FieldDef) {
  return z.object(Object.fromEntries((f.itemFields ?? []).map((i) => [i.key, fieldSchema(i)])));
}

export function fieldSchema(f: FieldDef): z.ZodTypeAny {
  switch (f.kind) {
    case "text":
    case "textarea":
      return z.string().max(f.max ?? 500);
    case "image":
      return z.string().max(1000).refine((v) => v === "" || isSafeUrl(v), "Enter a full link starting with https://");
    case "url":
      return z.string().max(1000).refine((v) => v === "" || isSafeUrl(v), "Enter a full link starting with https://");
    case "youtube":
      return z.string().max(300).refine((v) => v === "" || youtubeId(v) !== null, "Paste a YouTube or YouTube Shorts link.");
    case "list":
      return z.array(itemSchema(f)).max(f.maxItems ?? 40);
  }
}

export function defaultSectionData(type: SectionType): Record<string, unknown> {
  return Object.fromEntries(SECTION_DEFS[type].fields.map((f) => [f.key, defaultForField(f)]));
}

export function sectionDataSchema(type: SectionType) {
  return z.object(Object.fromEntries(SECTION_DEFS[type].fields.map((f) => [f.key, fieldSchema(f)])));
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function normalizeField(f: FieldDef, raw: unknown): unknown {
  if (f.kind === "list") {
    if (!Array.isArray(raw)) return [];
    return raw.slice(0, f.maxItems ?? 40).map((item) => normalizeItem(f.itemFields ?? [], item));
  }
  const parsed = fieldSchema(f).safeParse(raw);
  return parsed.success ? parsed.data : defaultForField(f);
}

function normalizeItem(fields: FieldDef[], raw: unknown): Record<string, unknown> {
  const src = isRecord(raw) ? raw : {};
  return Object.fromEntries(fields.map((f) => [f.key, normalizeField(f, src[f.key])]));
}

/** Tolerant: per-field fallback to defaults, unknown keys dropped, never throws. */
export function normalizeSectionData(type: SectionType, raw: unknown): Record<string, unknown> {
  return normalizeItem(SECTION_DEFS[type].fields, raw);
}
```

- [ ] **Step 4: Run to verify PASS.**
- [ ] **Step 5: Commit** — `git add src/lib/landing/sections.ts tests/landing-sections.test.ts && git commit -m "feat(landing): section registry with derived schemas and tolerant normalizer"`

---

### Task 4: Content model, operations, readiness

**Files:**
- Create: `src/lib/landing/content.ts`
- Test: `tests/landing-content.test.ts`

**Interfaces:**
- Consumes: `SECTION_TYPES`, `SECTION_DEFS`, `defaultSectionData`, `normalizeSectionData`, `sectionDataSchema`, `type SectionType`, `type FieldDef` (Task 3); `isSafeUrl` (Task 2); `validateSlug` (Task 2).
- Produces:
  - `type PageKind = "course" | "workshop" | "webinar"`, `type PageStatus = "draft" | "published" | "closed"`
  - `interface LandingSettings { registerUrl; registerLabel; whatsappNumber; countdownTo; countdownLabel }` (all `string`)
  - `interface LandingSeo { title; description; ogImage }`
  - `interface LandingSection { id: string; type: SectionType; enabled: boolean; data: Record<string, unknown> }`
  - `interface LandingContent { settings: LandingSettings; seo: LandingSeo; sections: LandingSection[] }`
  - `contentSchema` (zod, for API), `normalizeContent(raw: unknown): LandingContent`
  - `KIND_SECTIONS: Record<PageKind, SectionType[]>`, `emptyContent(kind): LandingContent`
  - ops (immutable): `newSection(type, id?)`, `addSection(c, type, index?)`, `removeSection(c, id)`, `moveSection(c, id, dir: -1 | 1)`, `toggleSection(c, id)`, `updateSectionData(c, id, data)`, `updateSettings(c, patch)`, `updateSeo(c, patch)`
  - `interface Problem { message: string; sectionId?: string }`, `computeReadiness(c, page: { title: string; slug: string }): { ready: boolean; problems: Problem[] }`
  - `hasUnpublishedChanges(draft: LandingContent, published: LandingContent | null): boolean`
  - `MAX_CONTENT_BYTES = 200_000`

- [ ] **Step 1: Write the failing test**

```ts
// tests/landing-content.test.ts
import { describe, it, expect } from "vitest";
import {
  emptyContent, normalizeContent, addSection, removeSection, moveSection, toggleSection,
  updateSectionData, computeReadiness, hasUnpublishedChanges, contentSchema, KIND_SECTIONS,
} from "@/lib/landing/content";

const ids = (c: ReturnType<typeof emptyContent>) => c.sections.map((s) => s.id);

describe("emptyContent", () => {
  it("starts every kind with a hero and uses the kind's section list", () => {
    for (const kind of ["course", "workshop", "webinar"] as const) {
      const c = emptyContent(kind);
      expect(c.sections[0].type).toBe("hero");
      expect(c.sections.map((s) => s.type)).toEqual(KIND_SECTIONS[kind]);
      expect(new Set(ids(c)).size).toBe(c.sections.length);
    }
  });
  it("passes the API schema", () => {
    expect(contentSchema.safeParse(emptyContent("course")).success).toBe(true);
  });
});

describe("normalizeContent", () => {
  it("drops unknown section types and fills defaults", () => {
    const c = normalizeContent({ sections: [{ id: "a", type: "nope", enabled: true, data: {} }, { id: "b", type: "faq", enabled: true, data: { heading: "H" } }] });
    expect(c.sections.map((s) => s.type)).toEqual(["faq"]);
    expect(c.settings.registerLabel).toBe("Register now");
    expect(c.seo.title).toBe("");
  });
  it("survives null, strings and garbage", () => {
    for (const bad of [null, undefined, "x", 5, [], { sections: "no" }]) {
      expect(() => normalizeContent(bad)).not.toThrow();
      expect(normalizeContent(bad).sections).toEqual([]);
    }
  });
  it("assigns an id to a section that has none and removes duplicate ids", () => {
    const c = normalizeContent({ sections: [{ type: "faq", enabled: true, data: {} }, { id: "x", type: "faq", enabled: true, data: {} }, { id: "x", type: "faq", enabled: true, data: {} }] });
    expect(new Set(ids(c)).size).toBe(3);
  });
});

describe("operations are immutable and safe at the edges", () => {
  const base = emptyContent("webinar");
  it("moveSection swaps neighbours and no-ops at the ends", () => {
    const second = base.sections[1].id;
    const moved = moveSection(base, second, -1);
    expect(moved.sections[0].id).toBe(second);
    expect(ids(moveSection(base, base.sections[0].id, -1))).toEqual(ids(base));
    expect(ids(moveSection(base, base.sections[base.sections.length - 1].id, 1))).toEqual(ids(base));
    expect(ids(base)[1]).toBe(second); // original untouched
  });
  it("moveSection ignores an unknown id", () => {
    expect(ids(moveSection(base, "nope", 1))).toEqual(ids(base));
  });
  it("toggleSection flips enabled only for that section", () => {
    const id = base.sections[2].id;
    const t = toggleSection(base, id);
    expect(t.sections[2].enabled).toBe(!base.sections[2].enabled);
    expect(t.sections[1].enabled).toBe(base.sections[1].enabled);
  });
  it("addSection inserts at the index (default end) with default data", () => {
    const a = addSection(base, "stats", 1);
    expect(a.sections[1].type).toBe("stats");
    expect(addSection(base, "stats").sections.at(-1)?.type).toBe("stats");
  });
  it("removeSection removes by id", () => {
    const id = base.sections[0].id;
    expect(removeSection(base, id).sections.find((s) => s.id === id)).toBeUndefined();
  });
  it("updateSectionData normalizes the data it stores", () => {
    const id = base.sections[0].id;
    const u = updateSectionData(base, id, { headline: "Hello", junk: 1 });
    expect(u.sections[0].data.headline).toBe("Hello");
    expect(u.sections[0].data).not.toHaveProperty("junk");
  });
});

describe("computeReadiness", () => {
  const page = { title: "PPC Batch 4", slug: "ppc-b4" };
  it("is not ready for a blank page and speaks plainly", () => {
    const r = computeReadiness(emptyContent("course"), page);
    expect(r.ready).toBe(false);
    expect(r.problems.some((p) => /headline/i.test(p.message))).toBe(true);
    expect(r.problems.some((p) => /register/i.test(p.message) && /link/i.test(p.message))).toBe(true);
    expect(r.problems.some((p) => /description/i.test(p.message))).toBe(true);
  });
  it("attaches the section id so the UI can jump to it", () => {
    const c = emptyContent("webinar");
    const r = computeReadiness(c, page);
    const heroProblem = r.problems.find((p) => /headline/i.test(p.message));
    expect(heroProblem?.sectionId).toBe(c.sections[0].id);
  });
  it("ignores disabled sections", () => {
    let c = emptyContent("webinar");
    for (const s of c.sections) if (s.type !== "hero") c = toggleSection(c, s.id);
    const r = computeReadiness(c, page);
    expect(r.problems.every((p) => !p.sectionId || p.sectionId === c.sections[0].id)).toBe(true);
  });
  it("is ready when every required thing is filled", () => {
    let c = emptyContent("webinar");
    for (const s of c.sections) if (s.type !== "hero") c = removeSection(c, s.id);
    c = updateSectionData(c, c.sections[0].id, { headline: "Diabetes webinar" });
    c = { ...c, settings: { ...c.settings, registerUrl: "https://pharmacozyme.com/register" }, seo: { ...c.seo, description: "A one hour webinar." } };
    expect(computeReadiness(c, page)).toEqual({ ready: true, problems: [] });
  });
  it("flags a list item missing its required field by position", () => {
    let c = emptyContent("webinar");
    const faq = c.sections.find((s) => s.type === "faq")!;
    c = updateSectionData(c, faq.id, { items: [{ q: "Q1", a: "A1" }, { q: "", a: "A2" }] });
    const r = computeReadiness(c, page);
    expect(r.problems.some((p) => p.sectionId === faq.id && /2/.test(p.message))).toBe(true);
  });
  it("rejects a bad slug, a bad register link, a bad WhatsApp number and a bad countdown date", () => {
    let c = emptyContent("webinar");
    c = { ...c, settings: { ...c.settings, registerUrl: "javascript:x", whatsappNumber: "12", countdownTo: "not a date" } };
    const msgs = computeReadiness(c, { title: "x", slug: "api" }).problems.map((p) => p.message).join("|");
    expect(msgs).toMatch(/reserved|different/i);
    expect(msgs).toMatch(/Register button/i);
    expect(msgs).toMatch(/WhatsApp/i);
    expect(msgs).toMatch(/countdown/i);
  });
});

describe("hasUnpublishedChanges", () => {
  it("is true when never published", () => expect(hasUnpublishedChanges(emptyContent("course"), null)).toBe(true));
  it("is false for identical content and true after an edit", () => {
    const a = emptyContent("course");
    expect(hasUnpublishedChanges(a, structuredClone(a))).toBe(false);
    expect(hasUnpublishedChanges(updateSectionData(a, a.sections[0].id, { headline: "x" }), a)).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify FAIL.**

- [ ] **Step 3: Implement**

```ts
// src/lib/landing/content.ts
import { z } from "zod";
import { isSafeUrl } from "./simple-text";
import { validateSlug } from "./slug";
import {
  SECTION_DEFS, SECTION_TYPES, defaultSectionData, normalizeSectionData, sectionDataSchema,
  type FieldDef, type SectionType,
} from "./sections";

export type PageKind = "course" | "workshop" | "webinar";
export type PageStatus = "draft" | "published" | "closed";

export interface LandingSettings {
  registerUrl: string;
  registerLabel: string;
  whatsappNumber: string;
  countdownTo: string;
  countdownLabel: string;
}
export interface LandingSeo { title: string; description: string; ogImage: string }
export interface LandingSection { id: string; type: SectionType; enabled: boolean; data: Record<string, unknown> }
export interface LandingContent { settings: LandingSettings; seo: LandingSeo; sections: LandingSection[] }

export const MAX_CONTENT_BYTES = 200_000;

export const KIND_SECTIONS: Record<PageKind, SectionType[]> = {
  course: ["hero", "stats", "feature_cards", "curriculum", "instructors", "pricing_cards", "schedule", "video_reviews", "testimonials", "faq", "final_cta"],
  workshop: ["hero", "stats", "rich_text", "feature_cards", "instructors", "curriculum", "pricing_cards", "schedule", "testimonials", "faq", "final_cta"],
  webinar: ["hero", "rich_text", "schedule", "instructors", "pricing_cards", "faq", "final_cta"],
};

const DEFAULT_SETTINGS: LandingSettings = {
  registerUrl: "", registerLabel: "Register now", whatsappNumber: "", countdownTo: "", countdownLabel: "",
};
const DEFAULT_SEO: LandingSeo = { title: "", description: "", ogImage: "" };

const safeUrlOrEmpty = z.string().max(1000).refine((v) => v === "" || isSafeUrl(v), "Enter a full link starting with https://");

export const contentSchema = z
  .object({
    settings: z.object({
      registerUrl: safeUrlOrEmpty,
      registerLabel: z.string().max(40),
      whatsappNumber: z.string().max(30),
      countdownTo: z.string().max(40),
      countdownLabel: z.string().max(80),
    }),
    seo: z.object({
      title: z.string().max(120),
      description: z.string().max(300),
      ogImage: safeUrlOrEmpty,
    }),
    sections: z
      .array(z.object({
        id: z.string().min(1).max(64),
        type: z.enum(SECTION_TYPES),
        enabled: z.boolean(),
        data: z.record(z.string(), z.unknown()),
      }))
      .max(40),
  })
  .superRefine((c, ctx) => {
    const seen = new Set<string>();
    c.sections.forEach((s, i) => {
      if (seen.has(s.id)) ctx.addIssue({ code: "custom", path: ["sections", i, "id"], message: "Duplicate section id" });
      seen.add(s.id);
      const r = sectionDataSchema(s.type).safeParse(s.data);
      if (!r.success) ctx.addIssue({ code: "custom", path: ["sections", i, "data"], message: r.error.issues[0]?.message ?? "Invalid section" });
    });
  });

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
const str = (v: unknown, fallback: string, max: number) => (typeof v === "string" ? v.slice(0, max) : fallback);
const newId = () => globalThis.crypto.randomUUID();

/** Tolerant loader for anything read from the database or a snapshot. Never throws. */
export function normalizeContent(raw: unknown): LandingContent {
  const r = isRecord(raw) ? raw : {};
  const s = isRecord(r.settings) ? r.settings : {};
  const seo = isRecord(r.seo) ? r.seo : {};
  const settings: LandingSettings = {
    registerUrl: safeUrlOrEmpty.safeParse(s.registerUrl).success ? str(s.registerUrl, "", 1000) : "",
    registerLabel: str(s.registerLabel, DEFAULT_SETTINGS.registerLabel, 40),
    whatsappNumber: str(s.whatsappNumber, "", 30),
    countdownTo: str(s.countdownTo, "", 40),
    countdownLabel: str(s.countdownLabel, "", 80),
  };
  const seoOut: LandingSeo = {
    title: str(seo.title, "", 120),
    description: str(seo.description, "", 300),
    ogImage: safeUrlOrEmpty.safeParse(seo.ogImage).success ? str(seo.ogImage, "", 1000) : "",
  };
  const used = new Set<string>();
  const sections: LandingSection[] = [];
  for (const item of Array.isArray(r.sections) ? r.sections.slice(0, 40) : []) {
    if (!isRecord(item)) continue;
    if (!(SECTION_TYPES as readonly string[]).includes(item.type as string)) continue;
    const type = item.type as SectionType;
    let id = typeof item.id === "string" && item.id.length > 0 && item.id.length <= 64 ? item.id : newId();
    if (used.has(id)) id = newId();
    used.add(id);
    sections.push({ id, type, enabled: item.enabled !== false, data: normalizeSectionData(type, item.data) });
  }
  return { settings, seo: seoOut, sections };
}

export function newSection(type: SectionType, id: string = newId()): LandingSection {
  return { id, type, enabled: true, data: defaultSectionData(type) };
}

export function emptyContent(kind: PageKind): LandingContent {
  return {
    settings: { ...DEFAULT_SETTINGS },
    seo: { ...DEFAULT_SEO },
    sections: KIND_SECTIONS[kind].map((t) => newSection(t)),
  };
}

export function addSection(c: LandingContent, type: SectionType, index?: number): LandingContent {
  const sections = [...c.sections];
  sections.splice(index === undefined ? sections.length : Math.max(0, Math.min(index, sections.length)), 0, newSection(type));
  return { ...c, sections };
}
export function removeSection(c: LandingContent, id: string): LandingContent {
  return { ...c, sections: c.sections.filter((s) => s.id !== id) };
}
export function moveSection(c: LandingContent, id: string, dir: -1 | 1): LandingContent {
  const i = c.sections.findIndex((s) => s.id === id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= c.sections.length) return c;
  const sections = [...c.sections];
  [sections[i], sections[j]] = [sections[j], sections[i]];
  return { ...c, sections };
}
export function toggleSection(c: LandingContent, id: string): LandingContent {
  return { ...c, sections: c.sections.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s)) };
}
export function updateSectionData(c: LandingContent, id: string, data: Record<string, unknown>): LandingContent {
  return {
    ...c,
    sections: c.sections.map((s) => (s.id === id ? { ...s, data: normalizeSectionData(s.type, data) } : s)),
  };
}
export function updateSettings(c: LandingContent, patch: Partial<LandingSettings>): LandingContent {
  return { ...c, settings: { ...c.settings, ...patch } };
}
export function updateSeo(c: LandingContent, patch: Partial<LandingSeo>): LandingContent {
  return { ...c, seo: { ...c.seo, ...patch } };
}

// ------------------------------------------------------------- readiness

export interface Problem { message: string; sectionId?: string }

function isBlank(v: unknown): boolean {
  return typeof v !== "string" || v.trim() === "";
}

function fieldProblems(section: LandingSection, fields: FieldDef[], data: Record<string, unknown>, out: Problem[]) {
  const label = SECTION_DEFS[section.type].label;
  for (const f of fields) {
    if (!f.required) continue;
    if (f.kind === "list") {
      const items = Array.isArray(data[f.key]) ? (data[f.key] as Record<string, unknown>[]) : [];
      if (items.length === 0) {
        out.push({ message: `Add at least one ${(f.itemLabel ?? "item").toLowerCase()} in "${label}".`, sectionId: section.id });
        continue;
      }
      items.forEach((item, n) => {
        for (const sub of f.itemFields ?? []) {
          if (sub.required && isBlank(item[sub.key])) {
            out.push({ message: `${f.itemLabel ?? "Item"} ${n + 1} in "${label}" needs "${sub.label}".`, sectionId: section.id });
          }
        }
      });
    } else if (isBlank(data[f.key])) {
      out.push({ message: `Fill in "${f.label}" in "${label}".`, sectionId: section.id });
    }
  }
}

export function computeReadiness(c: LandingContent, page: { title: string; slug: string }): { ready: boolean; problems: Problem[] } {
  const problems: Problem[] = [];
  if (page.title.trim() === "") problems.push({ message: "Give the page a name." });
  const slug = validateSlug(page.slug);
  if (!slug.ok) problems.push({ message: slug.message });
  if (c.seo.description.trim() === "") problems.push({ message: "Add a short description for Google and WhatsApp previews (Page settings)." });
  if (!isSafeUrl(c.settings.registerUrl)) problems.push({ message: "Add the link the Register button should open (Page settings). It must start with https://." });
  if (c.settings.whatsappNumber.trim() !== "") {
    const digits = c.settings.whatsappNumber.replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) problems.push({ message: "The WhatsApp number looks wrong. Include the country code, for example 923001234567." });
  }
  if (c.settings.countdownTo.trim() !== "" && Number.isNaN(Date.parse(c.settings.countdownTo))) {
    problems.push({ message: "The countdown date is not a valid date and time." });
  }
  const enabled = c.sections.filter((s) => s.enabled);
  if (enabled.length === 0) problems.push({ message: "Turn on at least one section." });
  for (const s of enabled) fieldProblems(s, SECTION_DEFS[s.type].fields, s.data, problems);
  return { ready: problems.length === 0, problems };
}

export function hasUnpublishedChanges(draft: LandingContent, published: LandingContent | null): boolean {
  if (!published) return true;
  return JSON.stringify(draft) !== JSON.stringify(published);
}
```

- [ ] **Step 4: Run to verify PASS.** Fix any failing assertion by correcting the code, not the test (the tests encode the spec). One expected rough edge: the "ready" test removes all non-hero sections, so the hero's `headline` is the only required field; confirm the message text matches `/headline/i`.
- [ ] **Step 5: Commit** — `git add src/lib/landing/content.ts tests/landing-content.test.ts && git commit -m "feat(landing): content model, section operations, publish readiness"`

---

### Task 5: Data layer, request schemas, API routes

**Files:**
- Create: `src/lib/validations/landing.ts`, `src/lib/data/landing-pages.ts`, `src/app/api/admin/landing-pages/route.ts`, `[id]/route.ts`, `[id]/publish/route.ts`, `[id]/rollback/route.ts`, `[id]/duplicate/route.ts`, `[id]/status/route.ts` (all under `src/app/api/admin/landing-pages/`)
- Test: `tests/landing-routes.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 2–4; `createAdminSupabase`, `requireAdmin`.
- Produces (data layer, all `server-only`):

```ts
export interface LandingPage {
  id: string; slug: string; kind: PageKind; title: string; status: PageStatus;
  draft: LandingContent; published: LandingContent | null; revision: number;
  publishedAt: string | null; createdAt: string; updatedAt: string;
}
export interface LandingPageSummary { id; slug; kind; title; status; revision; publishedAt: string|null; updatedAt: string; hasUnpublishedChanges: boolean }
export interface LandingVersion { version: number; createdAt: string }
export type CreateResult = { ok: true; id: string } | { ok: false; reason: "slug-taken" | "db-error" };
export type SaveResult = { ok: true; revision: number } | { ok: false; reason: "conflict" | "not-found" | "db-error" };
export type PublishResult = { ok: true } | { ok: false; reason: "not-found" | "db-error" } | { ok: false; reason: "not-ready"; problems: Problem[] };
export type SimpleResult = { ok: true } | { ok: false; reason: "not-found" | "not-published" | "db-error" };
listLandingPages(): Promise<LandingPageSummary[]>
getLandingPage(id): Promise<LandingPage | null>
getPublishedLandingPage(slug): Promise<{ page: Pick<LandingPage,"id"|"slug"|"kind"|"title"|"status">; content: LandingContent } | null>
listVersions(id): Promise<LandingVersion[]>
createLandingPage(userId, input: { title; slug; kind; content: LandingContent }): Promise<CreateResult>
duplicateLandingPage(userId, id, input: { title; slug }): Promise<CreateResult | { ok: false; reason: "not-found" }>
saveDraft(id, content: LandingContent, baseRevision: number): Promise<SaveResult>
publishLandingPage(userId, id): Promise<PublishResult>
rollbackLandingPage(userId, id, version: number): Promise<PublishResult>   // same result shape
setPageStatus(id, status: "closed" | "published"): Promise<SimpleResult>
```
- Request schemas (`validations/landing.ts`): `createPageSchema`, `saveDraftSchema`, `rollbackSchema`, `duplicateSchema`, `statusSchema`.

- [ ] **Step 1: Write the failing route test** (mocks the data layer exactly like `tests/admin-agent-campaigns-routes.test.ts`)

```ts
// tests/landing-routes.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/require-admin", () => ({ requireAdmin: async () => ({ ok: true, user: { id: "admin-user" } }) }));

const createLandingPage = vi.fn();
const saveDraft = vi.fn();
const publishLandingPage = vi.fn();
const rollbackLandingPage = vi.fn();
const duplicateLandingPage = vi.fn();
const setPageStatus = vi.fn();
vi.mock("@/lib/data/landing-pages", () => ({
  createLandingPage: (...a: unknown[]) => createLandingPage(...a),
  saveDraft: (...a: unknown[]) => saveDraft(...a),
  publishLandingPage: (...a: unknown[]) => publishLandingPage(...a),
  rollbackLandingPage: (...a: unknown[]) => rollbackLandingPage(...a),
  duplicateLandingPage: (...a: unknown[]) => duplicateLandingPage(...a),
  setPageStatus: (...a: unknown[]) => setPageStatus(...a),
}));

import { POST as create } from "@/app/api/admin/landing-pages/route";
import { PATCH as patchDraft } from "@/app/api/admin/landing-pages/[id]/route";
import { POST as publish } from "@/app/api/admin/landing-pages/[id]/publish/route";
import { POST as rollback } from "@/app/api/admin/landing-pages/[id]/rollback/route";
import { POST as duplicate } from "@/app/api/admin/landing-pages/[id]/duplicate/route";
import { POST as status } from "@/app/api/admin/landing-pages/[id]/status/route";
import { emptyContent } from "@/lib/landing/content";

const req = (body: unknown, method = "POST") => new Request("http://x", { method, body: JSON.stringify(body) }) as never;
const ctx = { params: Promise.resolve({ id: "p1" }) };

beforeEach(() => {
  for (const m of [createLandingPage, saveDraft, publishLandingPage, rollbackLandingPage, duplicateLandingPage, setPageStatus]) m.mockReset();
});

describe("POST /api/admin/landing-pages", () => {
  it("creates a page and returns its id", async () => {
    createLandingPage.mockResolvedValue({ ok: true, id: "new-id" });
    const res = await create(req({ title: "PPC Batch 4", kind: "course" }));
    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ id: "new-id" });
    expect(createLandingPage.mock.calls[0][1]).toMatchObject({ title: "PPC Batch 4", slug: "ppc-batch-4", kind: "course" });
  });
  it("rejects a reserved slug with a plain message", async () => {
    const res = await create(req({ title: "x", kind: "course", slug: "api" }));
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/reserved|different/i);
    expect(createLandingPage).not.toHaveBeenCalled();
  });
  it("rejects a title that makes no usable slug", async () => {
    const res = await create(req({ title: "دورة", kind: "course" }));
    expect(res.status).toBe(400);
  });
  it("maps slug-taken to 409", async () => {
    createLandingPage.mockResolvedValue({ ok: false, reason: "slug-taken" });
    const res = await create(req({ title: "PPC", kind: "course", slug: "ppc-b3" }));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/already/i);
  });
  it("rejects an unknown kind", async () => {
    expect((await create(req({ title: "x", kind: "party" }))).status).toBe(400);
  });
});

describe("PATCH draft", () => {
  it("saves and returns the new revision", async () => {
    saveDraft.mockResolvedValue({ ok: true, revision: 5 });
    const res = await patchDraft(req({ content: emptyContent("course"), baseRevision: 4 }, "PATCH"), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ revision: 5 });
  });
  it("maps a stale revision to 409 conflict", async () => {
    saveDraft.mockResolvedValue({ ok: false, reason: "conflict" });
    const res = await patchDraft(req({ content: emptyContent("course"), baseRevision: 1 }, "PATCH"), ctx);
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("conflict");
  });
  it("rejects content with an unsafe link before touching the database", async () => {
    const c = emptyContent("course");
    c.settings.registerUrl = "javascript:alert(1)";
    const res = await patchDraft(req({ content: c, baseRevision: 1 }, "PATCH"), ctx);
    expect(res.status).toBe(400);
    expect(saveDraft).not.toHaveBeenCalled();
  });
  it("rejects oversized content with 413", async () => {
    const c = emptyContent("course");
    c.sections[0].data.subheadline = "x".repeat(400);
    c.sections[0].data.badges = Array.from({ length: 6 }, () => ({ text: "y".repeat(60) }));
    const huge = { ...c, seo: { ...c.seo, description: "z".repeat(300) } };
    // Force the byte cap path with a payload over the limit using many sections' text.
    const big = JSON.stringify({ content: huge, baseRevision: 1, padding: "p".repeat(210_000) });
    const res = await patchDraft(new Request("http://x", { method: "PATCH", body: big }) as never, ctx);
    expect([400, 413]).toContain(res.status);
    expect(saveDraft).not.toHaveBeenCalled();
  });
  it("maps not-found to 404", async () => {
    saveDraft.mockResolvedValue({ ok: false, reason: "not-found" });
    expect((await patchDraft(req({ content: emptyContent("course"), baseRevision: 1 }, "PATCH"), ctx)).status).toBe(404);
  });
});

describe("publish", () => {
  it("returns 422 with the plain-language problems when the server finds the page incomplete", async () => {
    publishLandingPage.mockResolvedValue({ ok: false, reason: "not-ready", problems: [{ message: "Fill in \"Headline\"" }] });
    const res = await publish(req({}), ctx);
    expect(res.status).toBe(422);
    expect((await res.json()).problems).toEqual([{ message: "Fill in \"Headline\"" }]);
  });
  it("returns ok when published", async () => {
    publishLandingPage.mockResolvedValue({ ok: true });
    expect((await publish(req({}), ctx)).status).toBe(200);
    expect(publishLandingPage).toHaveBeenCalledWith("admin-user", "p1");
  });
  it("404s a missing page", async () => {
    publishLandingPage.mockResolvedValue({ ok: false, reason: "not-found" });
    expect((await publish(req({}), ctx)).status).toBe(404);
  });
});

describe("rollback / duplicate / status", () => {
  it("rollback needs a positive integer version", async () => {
    expect((await rollback(req({ version: 0 }), ctx)).status).toBe(400);
    rollbackLandingPage.mockResolvedValue({ ok: true });
    expect((await rollback(req({ version: 2 }), ctx)).status).toBe(200);
    expect(rollbackLandingPage).toHaveBeenCalledWith("admin-user", "p1", 2);
  });
  it("duplicate creates a copy and returns its id; slug-taken is 409", async () => {
    duplicateLandingPage.mockResolvedValue({ ok: true, id: "copy" });
    const ok = await duplicate(req({ title: "PPC Batch 4" }), ctx);
    expect(ok.status).toBe(201);
    expect(await ok.json()).toEqual({ id: "copy" });
    duplicateLandingPage.mockResolvedValue({ ok: false, reason: "slug-taken" });
    expect((await duplicate(req({ title: "PPC Batch 4" }), ctx)).status).toBe(409);
  });
  it("status accepts only closed/published; closing an unpublished page is 409", async () => {
    expect((await status(req({ status: "draft" }), ctx)).status).toBe(400);
    setPageStatus.mockResolvedValue({ ok: false, reason: "not-published" });
    expect((await status(req({ status: "closed" }), ctx)).status).toBe(409);
    setPageStatus.mockResolvedValue({ ok: true });
    expect((await status(req({ status: "closed" }), ctx)).status).toBe(200);
  });
});
```

- [ ] **Step 2: Run to verify FAIL** (module not found).

- [ ] **Step 3: Implement request schemas**

```ts
// src/lib/validations/landing.ts
import { z } from "zod";
import { contentSchema, MAX_CONTENT_BYTES } from "@/lib/landing/content";
import { slugify, validateSlug } from "@/lib/landing/slug";

export const PAGE_KINDS = ["course", "workshop", "webinar"] as const;

/** A slug is optional on create/duplicate: derived from the title, then validated. */
function resolveSlug(title: string, slug: string | undefined, ctx: z.RefinementCtx): string {
  const s = (slug ?? "").trim() === "" ? slugify(title) : slug!.trim();
  const v = validateSlug(s);
  if (!v.ok) ctx.addIssue({ code: "custom", path: ["slug"], message: v.message });
  return s;
}

export const createPageSchema = z
  .object({
    title: z.string().trim().min(1, "Give the page a name.").max(120),
    kind: z.enum(PAGE_KINDS),
    slug: z.string().optional(),
    templateId: z.string().max(60).optional(),
  })
  .transform((v, ctx) => ({ ...v, slug: resolveSlug(v.title, v.slug, ctx) }));

export const duplicateSchema = z
  .object({ title: z.string().trim().min(1, "Give the copy a name.").max(120), slug: z.string().optional() })
  .transform((v, ctx) => ({ ...v, slug: resolveSlug(v.title, v.slug, ctx) }));

export const saveDraftSchema = z.object({
  content: contentSchema,
  baseRevision: z.number().int().min(1),
});

export const rollbackSchema = z.object({ version: z.number().int().min(1) });
export const statusSchema = z.object({ status: z.enum(["closed", "published"]) });

export { MAX_CONTENT_BYTES };
```

- [ ] **Step 4: Implement the data layer**

```ts
// src/lib/data/landing-pages.ts
import "server-only";
import { revalidatePath } from "next/cache";
import { createAdminSupabase } from "@/lib/supabase/admin";
import type { Database, Json } from "@/lib/supabase/database.types";
import {
  computeReadiness, hasUnpublishedChanges, normalizeContent,
  type LandingContent, type PageKind, type PageStatus, type Problem,
} from "@/lib/landing/content";

type Row = Database["public"]["Tables"]["landing_pages"]["Row"];

export interface LandingPage {
  id: string; slug: string; kind: PageKind; title: string; status: PageStatus;
  draft: LandingContent; published: LandingContent | null; revision: number;
  publishedAt: string | null; createdAt: string; updatedAt: string;
}
export interface LandingPageSummary {
  id: string; slug: string; kind: PageKind; title: string; status: PageStatus; revision: number;
  publishedAt: string | null; updatedAt: string; hasUnpublishedChanges: boolean;
}
export interface LandingVersion { version: number; createdAt: string }

export type CreateResult = { ok: true; id: string } | { ok: false; reason: "slug-taken" | "db-error" };
export type SaveResult = { ok: true; revision: number } | { ok: false; reason: "conflict" | "not-found" | "db-error" };
export type PublishResult =
  | { ok: true }
  | { ok: false; reason: "not-found" | "db-error" }
  | { ok: false; reason: "not-ready"; problems: Problem[] };
export type SimpleResult = { ok: true } | { ok: false; reason: "not-found" | "not-published" | "db-error" };

const UNIQUE_VIOLATION = "23505";
const COLUMNS = "id, slug, kind, title, status, draft, published, revision, published_at, created_by, created_at, updated_at";

function mapRow(r: Row): LandingPage {
  return {
    id: r.id, slug: r.slug, kind: r.kind as PageKind, title: r.title, status: r.status as PageStatus,
    draft: normalizeContent(r.draft), published: r.published ? normalizeContent(r.published) : null,
    revision: r.revision, publishedAt: r.published_at, createdAt: r.created_at, updatedAt: r.updated_at,
  };
}

const asJson = (c: LandingContent) => c as unknown as Json;

export async function listLandingPages(): Promise<LandingPageSummary[]> {
  const admin = createAdminSupabase();
  const { data } = await admin.from("landing_pages").select(COLUMNS).order("updated_at", { ascending: false });
  return (data ?? []).map((r) => {
    const p = mapRow(r);
    return {
      id: p.id, slug: p.slug, kind: p.kind, title: p.title, status: p.status, revision: p.revision,
      publishedAt: p.publishedAt, updatedAt: p.updatedAt,
      hasUnpublishedChanges: hasUnpublishedChanges(p.draft, p.published),
    };
  });
}

export async function getLandingPage(id: string): Promise<LandingPage | null> {
  const admin = createAdminSupabase();
  const { data } = await admin.from("landing_pages").select(COLUMNS).eq("id", id).maybeSingle();
  return data ? mapRow(data) : null;
}

/** Public read. Only published or closed pages with a published copy are visible. */
export async function getPublishedLandingPage(slug: string) {
  const admin = createAdminSupabase();
  const { data } = await admin.from("landing_pages").select(COLUMNS).eq("slug", slug).maybeSingle();
  if (!data || data.status === "draft" || !data.published) return null;
  const p = mapRow(data);
  return {
    page: { id: p.id, slug: p.slug, kind: p.kind, title: p.title, status: p.status },
    content: p.published as LandingContent,
  };
}

export async function listVersions(id: string): Promise<LandingVersion[]> {
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("landing_page_versions")
    .select("version, created_at")
    .eq("page_id", id)
    .order("version", { ascending: false })
    .limit(50);
  return (data ?? []).map((v) => ({ version: v.version, createdAt: v.created_at }));
}

export async function createLandingPage(
  userId: string,
  input: { title: string; slug: string; kind: PageKind; content: LandingContent },
): Promise<CreateResult> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("landing_pages")
    .insert({ slug: input.slug, kind: input.kind, title: input.title, draft: asJson(input.content), created_by: userId })
    .select("id")
    .single();
  if (error) return { ok: false, reason: error.code === UNIQUE_VIOLATION ? "slug-taken" : "db-error" };
  if (!data) return { ok: false, reason: "db-error" };
  return { ok: true, id: data.id };
}

export async function duplicateLandingPage(
  userId: string,
  id: string,
  input: { title: string; slug: string },
): Promise<CreateResult | { ok: false; reason: "not-found" }> {
  const source = await getLandingPage(id);
  if (!source) return { ok: false, reason: "not-found" };
  return createLandingPage(userId, { title: input.title, slug: input.slug, kind: source.kind, content: source.draft });
}

/**
 * Optimistic concurrency: the update only matches when `revision` is still the
 * one the client loaded. A stale tab, or a slow older request landing after a
 * newer one, matches nothing and is reported as a conflict, never overwritten.
 */
export async function saveDraft(id: string, content: LandingContent, baseRevision: number): Promise<SaveResult> {
  const admin = createAdminSupabase();
  const { data, error } = await admin
    .from("landing_pages")
    .update({ draft: asJson(content), revision: baseRevision + 1, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("revision", baseRevision)
    .select("revision")
    .maybeSingle();
  if (error) return { ok: false, reason: "db-error" };
  if (data) return { ok: true, revision: data.revision };
  const { data: exists } = await admin.from("landing_pages").select("id").eq("id", id).maybeSingle();
  return { ok: false, reason: exists ? "conflict" : "not-found" };
}

async function applyPublish(
  userId: string,
  page: LandingPage,
  content: LandingContent,
  resetDraft: boolean,
): Promise<PublishResult> {
  const admin = createAdminSupabase();
  const { data: last } = await admin
    .from("landing_page_versions")
    .select("version")
    .eq("page_id", page.id)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  const version = (last?.version ?? 0) + 1;
  const { error: vErr } = await admin
    .from("landing_page_versions")
    .insert({ page_id: page.id, version, content: asJson(content), created_by: userId });
  if (vErr) return { ok: false, reason: "db-error" };

  const now = new Date().toISOString();
  const { error } = await admin
    .from("landing_pages")
    .update({
      published: asJson(content),
      ...(resetDraft ? { draft: asJson(content), revision: page.revision + 1 } : {}),
      // Publishing edits to a closed page must not silently reopen registration.
      status: page.status === "closed" ? "closed" : "published",
      published_at: now,
      updated_at: now,
    })
    .eq("id", page.id);
  if (error) return { ok: false, reason: "db-error" };
  revalidatePath(`/e/${page.slug}`);
  return { ok: true };
}

export async function publishLandingPage(userId: string, id: string): Promise<PublishResult> {
  const page = await getLandingPage(id);
  if (!page) return { ok: false, reason: "not-found" };
  // The server re-checks readiness: the disabled Publish button is not a security boundary.
  const readiness = computeReadiness(page.draft, { title: page.title, slug: page.slug });
  if (!readiness.ready) return { ok: false, reason: "not-ready", problems: readiness.problems };
  return applyPublish(userId, page, page.draft, false);
}

export async function rollbackLandingPage(userId: string, id: string, version: number): Promise<PublishResult> {
  const page = await getLandingPage(id);
  if (!page) return { ok: false, reason: "not-found" };
  const admin = createAdminSupabase();
  const { data } = await admin
    .from("landing_page_versions")
    .select("content")
    .eq("page_id", id)
    .eq("version", version)
    .maybeSingle();
  if (!data) return { ok: false, reason: "not-found" };
  return applyPublish(userId, page, normalizeContent(data.content), true);
}

export async function setPageStatus(id: string, status: "closed" | "published"): Promise<SimpleResult> {
  const page = await getLandingPage(id);
  if (!page) return { ok: false, reason: "not-found" };
  if (!page.published) return { ok: false, reason: "not-published" };
  const admin = createAdminSupabase();
  const { error } = await admin
    .from("landing_pages")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return { ok: false, reason: "db-error" };
  revalidatePath(`/e/${page.slug}`);
  return { ok: true };
}
```

- [ ] **Step 5: Implement the routes**

```ts
// src/app/api/admin/landing-pages/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createLandingPage } from "@/lib/data/landing-pages";
import { createPageSchema } from "@/lib/validations/landing";
import { emptyContent } from "@/lib/landing/content";
import { buildTemplate } from "@/lib/landing/templates";

export async function POST(req: NextRequest) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;

  const parsed = createPageSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const { title, slug, kind, templateId } = parsed.data;
  const content = (templateId && buildTemplate(templateId, kind)) || emptyContent(kind);

  const result = await createLandingPage(auth.user.id, { title, slug, kind, content });
  if (!result.ok) {
    if (result.reason === "slug-taken") {
      return NextResponse.json({ error: "A page with that link already exists. Please choose a different link." }, { status: 409 });
    }
    return NextResponse.json({ error: "Could not create the page" }, { status: 500 });
  }
  return NextResponse.json({ id: result.id }, { status: 201 });
}
```

```ts
// src/app/api/admin/landing-pages/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { saveDraft } from "@/lib/data/landing-pages";
import { saveDraftSchema, MAX_CONTENT_BYTES } from "@/lib/validations/landing";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const text = await req.text().catch(() => "");
  if (text.length > MAX_CONTENT_BYTES) {
    return NextResponse.json({ error: "This page has too much content to save." }, { status: 413 });
  }
  let body: unknown = null;
  try { body = JSON.parse(text); } catch { /* falls through to 400 */ }

  const parsed = saveDraftSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const result = await saveDraft(id, parsed.data.content, parsed.data.baseRevision);
  if (!result.ok) {
    if (result.reason === "conflict") {
      return NextResponse.json(
        { error: "Someone else changed this page. Reload to see their changes.", code: "conflict" },
        { status: 409 },
      );
    }
    if (result.reason === "not-found") return NextResponse.json({ error: "Page not found" }, { status: 404 });
    return NextResponse.json({ error: "Could not save changes" }, { status: 500 });
  }
  return NextResponse.json({ revision: result.revision });
}
```

```ts
// src/app/api/admin/landing-pages/[id]/publish/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { publishLandingPage } from "@/lib/data/landing-pages";

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const result = await publishLandingPage(auth.user.id, id);
  if (!result.ok) {
    if (result.reason === "not-ready") {
      return NextResponse.json({ error: "The page is not ready to publish yet.", problems: result.problems }, { status: 422 });
    }
    if (result.reason === "not-found") return NextResponse.json({ error: "Page not found" }, { status: 404 });
    return NextResponse.json({ error: "Could not publish" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
```

```ts
// src/app/api/admin/landing-pages/[id]/rollback/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { rollbackLandingPage } from "@/lib/data/landing-pages";
import { rollbackSchema } from "@/lib/validations/landing";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const parsed = rollbackSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const result = await rollbackLandingPage(auth.user.id, id, parsed.data.version);
  if (!result.ok) {
    if (result.reason === "not-found") return NextResponse.json({ error: "Version not found" }, { status: 404 });
    return NextResponse.json({ error: "Could not restore that version" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
```

```ts
// src/app/api/admin/landing-pages/[id]/duplicate/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { duplicateLandingPage } from "@/lib/data/landing-pages";
import { duplicateSchema } from "@/lib/validations/landing";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const parsed = duplicateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const result = await duplicateLandingPage(auth.user.id, id, parsed.data);
  if (!result.ok) {
    if (result.reason === "slug-taken") {
      return NextResponse.json({ error: "A page with that link already exists. Please choose a different link." }, { status: 409 });
    }
    if (result.reason === "not-found") return NextResponse.json({ error: "Page not found" }, { status: 404 });
    return NextResponse.json({ error: "Could not duplicate the page" }, { status: 500 });
  }
  return NextResponse.json({ id: result.id }, { status: 201 });
}
```

```ts
// src/app/api/admin/landing-pages/[id]/status/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-admin";
import { setPageStatus } from "@/lib/data/landing-pages";
import { statusSchema } from "@/lib/validations/landing";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin();
  if (!auth.ok) return auth.response;
  const { id } = await params;

  const parsed = statusSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid input" }, { status: 400 });

  const result = await setPageStatus(id, parsed.data.status);
  if (!result.ok) {
    if (result.reason === "not-published") {
      return NextResponse.json({ error: "Publish the page first." }, { status: 409 });
    }
    if (result.reason === "not-found") return NextResponse.json({ error: "Page not found" }, { status: 404 });
    return NextResponse.json({ error: "Could not change the status" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
```

Note: the create route imports `buildTemplate` from Task 8. To keep this task green, **create a stub in this task** `src/lib/landing/templates.ts` exporting only `export function buildTemplate(_id: string, _kind: PageKind): LandingContent | null { return null; }` (with the `PageKind`/`LandingContent` imports); Task 8 replaces it.

- [ ] **Step 6: Run to verify PASS** (`node node_modules/vitest/vitest.mjs run tests/landing-routes.test.ts`), then `node node_modules/typescript/bin/tsc --noEmit` (no new errors).
- [ ] **Step 7: Commit** — `git add src/lib/validations/landing.ts src/lib/data/landing-pages.ts src/lib/landing/templates.ts src/app/api/admin/landing-pages tests/landing-routes.test.ts && git commit -m "feat(landing): data layer and admin API routes (create, save with revision check, publish, rollback, duplicate, status)"`

---

### Task 6: Image sizing helper and autosave hook

**Files:**
- Create: `src/lib/landing/image-size.ts`, `src/hooks/useAutosaveDraft.ts`
- Test: `tests/landing-autosave.test.tsx`

**Interfaces:**
- Produces:
  - `fitWithin(width: number, height: number, max: number): { width: number; height: number }` (never upscales, keeps aspect ratio, integers)
  - `type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict"`
  - `useAutosaveDraft({ pageId, initialRevision, delayMs? }): { state: SaveState; schedule(content: LandingContent): void; saveNow(): Promise<boolean> }`

- [ ] **Step 1: Write the failing test**

```tsx
// tests/landing-autosave.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAutosaveDraft } from "@/hooks/useAutosaveDraft";
import { fitWithin } from "@/lib/landing/image-size";
import { emptyContent } from "@/lib/landing/content";

describe("fitWithin", () => {
  it("scales the long side down to max, keeping aspect ratio", () => {
    expect(fitWithin(4000, 2000, 1600)).toEqual({ width: 1600, height: 800 });
    expect(fitWithin(2000, 4000, 1600)).toEqual({ width: 800, height: 1600 });
  });
  it("never upscales", () => expect(fitWithin(800, 600, 1600)).toEqual({ width: 800, height: 600 }));
});

const c = emptyContent("course");
let fetchMock: ReturnType<typeof vi.fn>;
const ok = (revision: number) => Promise.resolve({ ok: true, status: 200, json: async () => ({ revision }) });

beforeEach(() => { vi.useFakeTimers(); fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("useAutosaveDraft", () => {
  it("debounces: many schedules produce one PATCH with the latest content and base revision", async () => {
    fetchMock.mockImplementation(() => ok(2));
    const { result } = renderHook(() => useAutosaveDraft({ pageId: "p1", initialRevision: 1, delayMs: 500 }));
    act(() => { result.current.schedule(c); result.current.schedule({ ...c, seo: { ...c.seo, title: "A" } }); result.current.schedule({ ...c, seo: { ...c.seo, title: "AB" } }); });
    expect(result.current.state).toBe("dirty");
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.baseRevision).toBe(1);
    expect(body.content.seo.title).toBe("AB");
    expect(result.current.state).toBe("saved");
  });
  it("uses the returned revision as the next base", async () => {
    fetchMock.mockImplementationOnce(() => ok(2)).mockImplementationOnce(() => ok(3));
    const { result } = renderHook(() => useAutosaveDraft({ pageId: "p1", initialRevision: 1, delayMs: 100 }));
    act(() => result.current.schedule(c));
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    act(() => result.current.schedule({ ...c, seo: { ...c.seo, title: "B" } }));
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).baseRevision).toBe(2);
  });
  it("never sends two requests at once; an edit made while saving is sent after", async () => {
    let release!: () => void;
    fetchMock.mockImplementationOnce(() => new Promise((r) => { release = () => r({ ok: true, status: 200, json: async () => ({ revision: 2 }) }); }));
    fetchMock.mockImplementationOnce(() => ok(3));
    const { result } = renderHook(() => useAutosaveDraft({ pageId: "p1", initialRevision: 1, delayMs: 100 }));
    act(() => result.current.schedule(c));
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(result.current.state).toBe("saving");
    act(() => result.current.schedule({ ...c, seo: { ...c.seo, title: "late" } }));
    await act(async () => { await vi.advanceTimersByTimeAsync(300); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await act(async () => { release(); await vi.advanceTimersByTimeAsync(0); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).baseRevision).toBe(2);
  });
  it("reports a conflict on 409 and stops retrying", async () => {
    fetchMock.mockImplementation(() => Promise.resolve({ ok: false, status: 409, json: async () => ({ code: "conflict" }) }));
    const { result } = renderHook(() => useAutosaveDraft({ pageId: "p1", initialRevision: 1, delayMs: 100 }));
    act(() => result.current.schedule(c));
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(result.current.state).toBe("conflict");
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("reports error on a network failure and keeps the content to retry via saveNow", async () => {
    fetchMock.mockImplementationOnce(() => Promise.reject(new Error("offline"))).mockImplementationOnce(() => ok(2));
    const { result } = renderHook(() => useAutosaveDraft({ pageId: "p1", initialRevision: 1, delayMs: 100 }));
    act(() => result.current.schedule(c));
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(result.current.state).toBe("error");
    let saved = false;
    await act(async () => { saved = await result.current.saveNow(); });
    expect(saved).toBe(true);
    expect(result.current.state).toBe("saved");
  });
  it("saveNow with nothing pending resolves true without a request", async () => {
    const { result } = renderHook(() => useAutosaveDraft({ pageId: "p1", initialRevision: 1 }));
    let saved = false;
    await act(async () => { saved = await result.current.saveNow(); });
    expect(saved).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify FAIL.**

- [ ] **Step 3: Implement**

```ts
// src/lib/landing/image-size.ts
export function fitWithin(width: number, height: number, max: number): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= max) return { width, height };
  const scale = max / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}
```

```ts
// src/hooks/useAutosaveDraft.ts
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { LandingContent } from "@/lib/landing/content";

export type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict";

/**
 * Debounced, strictly serial autosave with optimistic concurrency.
 *  - one request in flight at a time (so a slow older response can never
 *    arrive after, and overwrite, a newer save);
 *  - each request carries the revision returned by the previous one;
 *  - 409 = someone else saved: stop, surface "conflict", never retry;
 *  - network/5xx = keep the content and surface "error"; saveNow() retries.
 */
export function useAutosaveDraft({ pageId, initialRevision, delayMs = 800 }: { pageId: string; initialRevision: number; delayMs?: number }) {
  const [state, setState] = useState<SaveState>("saved");
  const revision = useRef(initialRevision);
  const pending = useRef<LandingContent | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef<Promise<boolean> | null>(null);
  const conflicted = useRef(false);

  const run = useCallback((): Promise<boolean> => {
    if (inFlight.current) return inFlight.current;
    if (conflicted.current) return Promise.resolve(false);
    if (!pending.current) return Promise.resolve(true);

    const p = (async () => {
      let allOk = true;
      while (pending.current && !conflicted.current) {
        const content = pending.current;
        pending.current = null;
        setState("saving");
        try {
          const res = await fetch(`/api/admin/landing-pages/${pageId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content, baseRevision: revision.current }),
          });
          if (res.status === 409) {
            conflicted.current = true;
            setState("conflict");
            allOk = false;
            break;
          }
          if (!res.ok) throw new Error(String(res.status));
          const json = (await res.json()) as { revision: number };
          revision.current = json.revision;
        } catch {
          pending.current = pending.current ?? content;
          setState("error");
          allOk = false;
          break;
        }
      }
      if (allOk) setState(pending.current ? "dirty" : "saved");
      return allOk;
    })().finally(() => {
      inFlight.current = null;
    });
    inFlight.current = p;
    return p;
  }, [pageId]);

  const schedule = useCallback(
    (content: LandingContent) => {
      if (conflicted.current) return;
      pending.current = content;
      setState((s) => (s === "saving" ? s : "dirty"));
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void run(), delayMs);
    },
    [run, delayMs],
  );

  const saveNow = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    if (inFlight.current) await inFlight.current;
    return run();
  }, [run]);

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return { state, schedule, saveNow };
}
```

- [ ] **Step 4: Run to verify PASS.** If the "edit made while saving" test is flaky under fake timers, adjust only the `act`/timer plumbing in the TEST, not the serial guarantee.
- [ ] **Step 5: Commit** — `git add src/lib/landing/image-size.ts src/hooks/useAutosaveDraft.ts tests/landing-autosave.test.tsx && git commit -m "feat(landing): serial autosave hook with revision conflicts, image fit helper"`

---

### Task 7: Public renderer and `/e/[slug]` route

> **GATE (read first):** Fetch the Stitch screens named "Landing page — laptop" and "Landing page — phone" (project `11811490301995978699` or the project the user names; `mcp__stitch__list_screens`, then fetch `htmlCode.downloadUrl`). If they do not exist, STOP and report to the controller; do not improvise a design. The behavior, props, safety rules and tests below are authoritative; Stitch supplies layout, spacing, typography and copy-style only. Convert colours to the `landing-*` tokens defined in `tailwind.config.ts` (Global Constraints); no raw hex in components; light theme only. `tests/pz-tokens.test.ts` must show no new violations.

**Files:**
- Create: `src/components/landing/SimpleText.tsx`, `src/components/landing/Countdown.tsx`, `src/components/landing/LandingRenderer.tsx`, `src/components/landing/sections/{Hero,Stats,RichText,FeatureCards,Curriculum,Instructors,PricingCards,Schedule,VideoReviews,Testimonials,Faq,FinalCta}.tsx`, `src/components/landing/LandingImage.tsx`, `src/app/e/layout.tsx` (loads Inter via `next/font/google` as `--font-inter`, scoped to `/e/*` only so the rest of the app is unaffected), `src/app/e/[slug]/page.tsx`
- Modify: `tailwind.config.ts` (add the `landing` colour group and `fontFamily.landing-body` using `var(--font-inter)`; headline uses the existing `var(--font-montserrat)`)
- Test: `tests/landing-renderer.test.tsx`

**Interfaces:**
- Consumes: `LandingContent`, `normalizeContent`, `SECTION_DEFS`, `parseSimpleText`, `isSafeUrl`, `youtubeId`, `coverProxyUrl` (`src/lib/feedback/cover-url.ts`), `getPublishedLandingPage`.
- Produces:
  - `SimpleText({ text, className? })`: renders `parseSimpleText` output as `<p>`, `<ul><li>`, `<strong>`, `<a>`; links get `rel="noopener noreferrer"` and `target="_blank"` only when absolute http(s).
  - `LandingImage({ src, alt, priority?, className?, width, height })`: returns `null` when `src` is empty; applies `coverProxyUrl`; `loading="lazy"` + `decoding="async"` unless `priority` (then `fetchPriority="high"`, `loading="eager"`); always passes `width`/`height` so layout does not shift.
  - `Countdown({ to, label })` (client): renders nothing on the server and until mounted; shows days/hours/minutes; renders nothing when `to` is invalid or in the past.
  - `LandingRenderer({ content, status, kind })`: renders, in order: countdown banner (if `settings.countdownTo`), top nav (page title + anchor links for enabled sections with `navLabel` + Register button), each enabled section wrapped in `<section id={section.id}>`..., closing footer (reuse `MarketingFooter`), floating WhatsApp button (if `settings.whatsappNumber`), sticky mobile Register bar. When `status === "closed"` the Register buttons are replaced by a "Registration is closed" notice.
  - Route `/e/[slug]`: static (`export const revalidate = 3600`; **does not read cookies or headers**), `generateMetadata` from `content.seo` (falls back to the page title), `notFound()` when `getPublishedLandingPage` returns null.

- [ ] **Step 1: Write the failing test**

```tsx
// tests/landing-renderer.test.tsx
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));
vi.mock("next/link", () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));

import { SimpleText } from "@/components/landing/SimpleText";
import { LandingImage } from "@/components/landing/LandingImage";
import { Countdown } from "@/components/landing/Countdown";
import { LandingRenderer } from "@/components/landing/LandingRenderer";
import { emptyContent, updateSectionData, toggleSection, updateSettings } from "@/lib/landing/content";

afterEach(() => vi.useRealTimers());

describe("SimpleText", () => {
  it("renders bold, bullets and safe links as elements", () => {
    const { container } = render(<SimpleText text={"Hi **there**\n\n- one\n- two\n\n[site](https://a.com)"} />);
    expect(container.querySelector("strong")?.textContent).toBe("there");
    expect(container.querySelectorAll("li")).toHaveLength(2);
    const a = container.querySelector("a")!;
    expect(a.getAttribute("href")).toBe("https://a.com");
    expect(a.getAttribute("rel")).toContain("noopener");
  });
  it("never creates a script element or an unsafe href from hostile text", () => {
    const { container } = render(<SimpleText text={"<script>alert(1)</script> [x](javascript:alert(1)) [y](//evil.com)"} />);
    expect(container.querySelector("script")).toBeNull();
    for (const a of Array.from(container.querySelectorAll("a"))) {
      expect(a.getAttribute("href")).not.toMatch(/^javascript:|^\/\//i);
    }
    expect(container.textContent).toContain("<script>alert(1)</script>");
  });
});

describe("LandingImage", () => {
  it("renders nothing for an empty src", () => {
    const { container } = render(<LandingImage src="" alt="" width={100} height={100} />);
    expect(container.firstChild).toBeNull();
  });
  it("sets dimensions and lazy loading by default, eager+high priority when priority", () => {
    const { container, rerender } = render(<LandingImage src="https://a.com/x.jpg" alt="x" width={1200} height={800} />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("width")).toBe("1200");
    expect(img.getAttribute("loading")).toBe("lazy");
    rerender(<LandingImage src="https://a.com/x.jpg" alt="x" width={1200} height={800} priority />);
    expect(container.querySelector("img")!.getAttribute("loading")).toBe("eager");
    expect(container.querySelector("img")!.getAttribute("fetchpriority")).toBe("high");
  });
  it("proxies a Drive link through /api/cover", () => {
    const { container } = render(<LandingImage src="https://drive.google.com/thumbnail?id=ABC123_x" alt="x" width={10} height={10} />);
    expect(container.querySelector("img")!.getAttribute("src")).toBe("/api/cover/ABC123_x");
  });
});

describe("Countdown", () => {
  it("shows remaining days/hours for a future date and nothing for a past or invalid one", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-12T00:00:00Z"));
    const { container, rerender } = render(<Countdown to="2026-10-15T03:00:00Z" label="Early Bird ends" />);
    await vi.advanceTimersByTimeAsync(0);
    expect(container.textContent).toMatch(/Early Bird ends/);
    expect(container.textContent).toMatch(/3\s*d/i);
    rerender(<Countdown to="2026-10-01T00:00:00Z" label="x" />);
    await vi.advanceTimersByTimeAsync(0);
    expect(container.textContent).toBe("");
    rerender(<Countdown to="garbage" label="x" />);
    await vi.advanceTimersByTimeAsync(0);
    expect(container.textContent).toBe("");
  });
});

describe("LandingRenderer", () => {
  const base = () => {
    let c = emptyContent("webinar");
    c = updateSectionData(c, c.sections[0].id, { headline: "Diabetes <b>Webinar</b>", subheadline: "Hello" });
    return updateSettings(c, { registerUrl: "https://pharmacozyme.com/register" });
  };
  it("renders the headline as text, never as markup", () => {
    const { container } = render(<LandingRenderer content={base()} status="published" kind="webinar" />);
    expect(screen.getAllByText(/Diabetes <b>Webinar<\/b>/).length).toBeGreaterThan(0);
    expect(container.querySelector("h1 b")).toBeNull();
  });
  it("skips disabled sections", () => {
    let c = base();
    const faq = c.sections.find((s) => s.type === "faq")!;
    c = updateSectionData(c, faq.id, { heading: "UNIQUE-FAQ-HEADING", items: [{ q: "Q", a: "A" }] });
    expect(render(<LandingRenderer content={c} status="published" kind="webinar" />).container.textContent).toContain("UNIQUE-FAQ-HEADING");
    c = toggleSection(c, faq.id);
    expect(render(<LandingRenderer content={c} status="published" kind="webinar" />).container.textContent).not.toContain("UNIQUE-FAQ-HEADING");
  });
  it("points the Register buttons at the configured link", () => {
    const { container } = render(<LandingRenderer content={base()} status="published" kind="webinar" />);
    const links = Array.from(container.querySelectorAll("a")).filter((a) => a.getAttribute("href") === "https://pharmacozyme.com/register");
    expect(links.length).toBeGreaterThan(0);
  });
  it("shows a closed notice and no Register link when status is closed", () => {
    const { container } = render(<LandingRenderer content={base()} status="closed" kind="webinar" />);
    expect(container.textContent).toMatch(/registration is closed/i);
    expect(Array.from(container.querySelectorAll("a")).some((a) => a.getAttribute("href") === "https://pharmacozyme.com/register")).toBe(false);
  });
  it("does not crash on a section whose data is damaged", () => {
    const c = base();
    (c.sections[0] as { data: unknown }).data = { headline: 42, badges: "nope" };
    expect(() => render(<LandingRenderer content={c} status="published" kind="webinar" />)).not.toThrow();
  });
  it("renders a WhatsApp float only when a number is set, with digits only in the link", () => {
    const none = render(<LandingRenderer content={base()} status="published" kind="webinar" />).container;
    expect(none.querySelector('a[href^="https://wa.me/"]')).toBeNull();
    const c = updateSettings(base(), { whatsappNumber: "+92 300-1234567" });
    const { container } = render(<LandingRenderer content={c} status="published" kind="webinar" />);
    expect(container.querySelector('a[href="https://wa.me/923001234567"]')).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify FAIL.**

- [ ] **Step 3: Implement the non-visual pieces exactly; port the visuals from Stitch.**

```tsx
// src/components/landing/SimpleText.tsx
import { Fragment } from "react";
import { parseSimpleText, type Inline } from "@/lib/landing/simple-text";

function InlineNodes({ nodes }: { nodes: Inline[] }) {
  return (
    <>
      {nodes.map((n, i) => {
        if (n.t === "bold") return <strong key={i}>{n.v}</strong>;
        if (n.t === "link") {
          const external = /^https?:\/\//i.test(n.href);
          return (
            <a key={i} href={n.href} className="underline underline-offset-2" rel="noopener noreferrer" {...(external ? { target: "_blank" } : {})}>
              {n.v}
            </a>
          );
        }
        return <Fragment key={i}>{n.v}</Fragment>;
      })}
    </>
  );
}

/** Renders admin-authored mini-markup as React elements. No HTML is ever injected. */
export function SimpleText({ text, className }: { text: string; className?: string }) {
  const blocks = parseSimpleText(text);
  if (blocks.length === 0) return null;
  return (
    <div className={className}>
      {blocks.map((b, i) =>
        b.t === "p" ? (
          <p key={i} className="mb-3 last:mb-0"><InlineNodes nodes={b.inline} /></p>
        ) : (
          <ul key={i} className="mb-3 list-disc pl-5 last:mb-0">
            {b.items.map((item, j) => <li key={j}><InlineNodes nodes={item} /></li>)}
          </ul>
        ),
      )}
    </div>
  );
}
```

```tsx
// src/components/landing/LandingImage.tsx
import { coverProxyUrl } from "@/lib/feedback/cover-url";

export function LandingImage({
  src, alt, width, height, priority = false, className,
}: { src: string; alt: string; width: number; height: number; priority?: boolean; className?: string }) {
  if (!src) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- Drive images go through /api/cover; explicit width/height prevent layout shift
    <img
      src={coverProxyUrl(src)}
      alt={alt}
      width={width}
      height={height}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      {...(priority ? { fetchPriority: "high" as const } : {})}
      className={className}
    />
  );
}
```

```tsx
// src/components/landing/Countdown.tsx
"use client";

import { useEffect, useState } from "react";

function remaining(to: string, now: number) {
  const t = Date.parse(to);
  if (Number.isNaN(t) || t <= now) return null;
  const mins = Math.floor((t - now) / 60000);
  return { d: Math.floor(mins / 1440), h: Math.floor((mins % 1440) / 60), m: mins % 60 };
}

/** Renders nothing on the server / before mount, so it can never cause a hydration mismatch. */
export function Countdown({ to, label }: { to: string; label: string }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(id);
  }, []);
  if (now === null) return null;
  const r = remaining(to, now);
  if (!r) return null;
  return (
    <div role="status" className="bg-landing-primary text-landing-on-primary text-center text-sm font-semibold py-2 px-4">
      {label ? `${label} ` : ""}
      <span className="tabular-nums">{r.d}d {r.h}h {r.m}m</span>
    </div>
  );
}
```

`LandingRenderer.tsx` dispatcher (structure authoritative; markup/styling from Stitch):

```tsx
// src/components/landing/LandingRenderer.tsx
import { SECTION_DEFS, type SectionType } from "@/lib/landing/sections";
import { normalizeContent, type LandingContent, type LandingSection, type PageKind, type PageStatus } from "@/lib/landing/content";
import { Countdown } from "./Countdown";
import { Hero } from "./sections/Hero";
import { Stats } from "./sections/Stats";
import { RichText } from "./sections/RichText";
import { FeatureCards } from "./sections/FeatureCards";
import { Curriculum } from "./sections/Curriculum";
import { Instructors } from "./sections/Instructors";
import { PricingCards } from "./sections/PricingCards";
import { Schedule } from "./sections/Schedule";
import { VideoReviews } from "./sections/VideoReviews";
import { Testimonials } from "./sections/Testimonials";
import { Faq } from "./sections/Faq";
import { FinalCta } from "./sections/FinalCta";

export interface SectionProps {
  data: Record<string, unknown>;
  register: { url: string; label: string; closed: boolean };
}

const SECTION_COMPONENTS: Record<SectionType, (p: SectionProps) => React.ReactNode> = {
  hero: Hero, stats: Stats, rich_text: RichText, feature_cards: FeatureCards, curriculum: Curriculum,
  instructors: Instructors, pricing_cards: PricingCards, schedule: Schedule, video_reviews: VideoReviews,
  testimonials: Testimonials, faq: Faq, final_cta: FinalCta,
};

export function LandingRenderer({
  content, status, kind: _kind, pageTitle,
}: { content: LandingContent; status: PageStatus; kind: PageKind; pageTitle?: string }) {
  // Re-normalize so a damaged snapshot can never crash the page (Review Focus 1).
  const c = normalizeContent(content);
  const closed = status === "closed";
  const register = { url: c.settings.registerUrl, label: c.settings.registerLabel || "Register now", closed };
  const enabled = c.sections.filter((s) => s.enabled);
  const navItems = enabled
    .filter((s) => SECTION_DEFS[s.type].navLabel)
    .map((s) => ({ id: s.id, label: SECTION_DEFS[s.type].navLabel as string }));
  const wa = c.settings.whatsappNumber.replace(/\D/g, "");

  // PORT FROM STITCH: top nav (title + navItems anchors + Register button / closed notice),
  // the sections list below, footer (reuse MarketingFooter), WhatsApp float, sticky mobile Register bar.
  return (
    <div className="landing-root bg-landing-surface text-landing-on-surface font-landing-body">
      {c.settings.countdownTo ? <Countdown to={c.settings.countdownTo} label={c.settings.countdownLabel} /> : null}
      {/* nav: use navItems, pageTitle, register */}
      <main>
        {enabled.map((s: LandingSection) => {
          const Component = SECTION_COMPONENTS[s.type];
          return (
            <section key={s.id} id={s.id} className="scroll-mt-20">
              {Component({ data: s.data, register })}
            </section>
          );
        })}
      </main>
      {closed ? <p role="status">Registration is closed.</p> : null}
      {wa ? <a href={`https://wa.me/${wa}`} aria-label="Chat on WhatsApp" target="_blank" rel="noopener noreferrer" /> : null}
    </div>
  );
}
```

Each `sections/*.tsx` is a pure function `(props: SectionProps) => ReactNode` reading `props.data` (already normalized) and rendering text through plain JSX (`{value}`) or `SimpleText`. Register/CTA buttons render `<a href={register.url}>` when `!register.closed`, and the text "Registration is closed" in place of the button when closed. Section-specific rules the tests/Review Focus rely on: Hero's main image uses `LandingImage priority` with `width={1200} height={800}`; every other image uses lazy `LandingImage`; `VideoReviews` renders a thumbnail button that swaps to the `https://www.youtube-nocookie.com/embed/<id>` iframe only after a click (use a small client component `YouTubeFacade`); `Faq` uses native `<details>/<summary>` (no JS); empty arrays render nothing (no empty headings).

Route:

```tsx
// src/app/e/[slug]/page.tsx
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getPublishedLandingPage } from "@/lib/data/landing-pages";
import { LandingRenderer } from "@/components/landing/LandingRenderer";

// Static + cached: this route must NOT read cookies() or headers(), or it becomes
// dynamic. Phase 2's registration widget detects the logged-in user client-side.
export const revalidate = 3600;

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const found = await getPublishedLandingPage(slug);
  if (!found) return { title: "Page not found" };
  const { seo } = found.content;
  const title = seo.title || found.page.title;
  return {
    title,
    description: seo.description || undefined,
    openGraph: { title, description: seo.description || undefined, images: seo.ogImage ? [seo.ogImage] : undefined },
  };
}

export default async function LandingPublicPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = await getPublishedLandingPage(slug);
  if (!found) notFound();
  return <LandingRenderer content={found.content} status={found.page.status} kind={found.page.kind} pageTitle={found.page.title} />;
}
```

- [ ] **Step 4: Run to verify PASS** (`tests/landing-renderer.test.tsx`), `tsc --noEmit`, and `node node_modules/vitest/vitest.mjs run tests/pz-tokens.test.ts` (no NEW violations versus the known SalesTeamPanel one).
- [ ] **Step 5: Commit** — `git add src/components/landing src/app/e tests/landing-renderer.test.tsx && git commit -m "feat(landing): public renderer and /e/[slug] route"`

---

### Task 8: Starter templates (blank + the three existing pages)

**Files:**
- Modify (replace stub): `src/lib/landing/templates.ts`
- Test: `tests/landing-templates.test.ts`

**Interfaces:**
- Consumes: `emptyContent`, `normalizeContent`, `computeReadiness`, `LandingContent`, `PageKind`.
- Produces:
  - `interface TemplateInfo { id: string; kind: PageKind; label: string; description: string }`
  - `TEMPLATES: TemplateInfo[]` — `blank-course`, `blank-workshop`, `blank-webinar`, `ppc-batch-3` (course), `mdc-batch-3` (workshop), `w20-diabetes` (webinar)
  - `buildTemplate(id: string, kind: PageKind): LandingContent | null` — returns a fresh deep copy with NEW section ids; `null` when the id is unknown or its `kind` differs from the requested `kind`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/landing-templates.test.ts
import { describe, it, expect } from "vitest";
import { TEMPLATES, buildTemplate } from "@/lib/landing/templates";
import { computeReadiness, contentSchema } from "@/lib/landing/content";

describe("templates", () => {
  it("lists blank templates for every kind plus the three seeded pages", () => {
    const ids = TEMPLATES.map((t) => t.id);
    for (const id of ["blank-course", "blank-workshop", "blank-webinar", "ppc-batch-3", "mdc-batch-3", "w20-diabetes"]) expect(ids).toContain(id);
  });
  it("every template builds content that passes the API schema", () => {
    for (const t of TEMPLATES) {
      const c = buildTemplate(t.id, t.kind);
      expect(c, t.id).not.toBeNull();
      expect(contentSchema.safeParse(c).success, t.id).toBe(true);
    }
  });
  it("seeded templates are publishable once they have a slug and title", () => {
    for (const id of ["ppc-batch-3", "mdc-batch-3", "w20-diabetes"]) {
      const t = TEMPLATES.find((x) => x.id === id)!;
      const r = computeReadiness(buildTemplate(id, t.kind)!, { title: t.label, slug: id });
      expect(r.problems, id).toEqual([]);
    }
  });
  it("gives fresh section ids on every build", () => {
    const a = buildTemplate("ppc-batch-3", "course")!;
    const b = buildTemplate("ppc-batch-3", "course")!;
    expect(a.sections[0].id).not.toBe(b.sections[0].id);
  });
  it("returns null for an unknown id or a kind mismatch", () => {
    expect(buildTemplate("nope", "course")).toBeNull();
    expect(buildTemplate("ppc-batch-3", "webinar")).toBeNull();
  });
  it("seeded copy comes from the real pages", () => {
    const ppc = buildTemplate("ppc-batch-3", "course")!;
    const text = JSON.stringify(ppc);
    expect(text).toMatch(/Practical Pharmacology/i);
    expect(ppc.settings.registerUrl).toMatch(/^https:\/\//);
  });
});
```

- [ ] **Step 2: Run to verify FAIL** (the Task 5 stub returns null for everything).

- [ ] **Step 3: Implement.** Replace the stub with the `TemplateInfo`/`TEMPLATES`/`buildTemplate` API. `blank-*` use `emptyContent(kind)`. For each seeded template, **read the named source file and copy the page's real copy verbatim** into the matching section types, using this mapping (omit a source section that has no matching type; do not invent copy):

| Source file | Source sections → section type |
|---|---|
| `Landing pages/Course/PPC-B3-Landing.html` (`id="..."`) | hero → `hero`; stats strip → `stats`; `#curriculum` → `curriculum`; `#benefits` → `feature_cards`; `#instructors` → `instructors`; `#video-reviews` → `video_reviews` (YouTube links only); `#pricing` → `pricing_cards` (the PKR Early Bird/After-EB names and prices as display text); `#schedule` → `schedule`; `#reviews` → `testimonials`; `#faq` → `faq`; closing CTA → `final_cta` |
| `Landing pages/Workshop/MDC-B3-Landing.html` | `#hero`; `#stats`; `#problem` → `rich_text`; `#workbook`/benefits marquee → `feature_cards`; `#instructor`; `#curriculum`; `#pricing`; `#agenda` → `schedule`; `#testimonials`; `#faq`; `#final-cta` |
| `Landing pages/Webinar/Webinar20 Landing.html` | hero; `#overview` → `rich_text`; `#agenda` → `schedule`; `#instructor`; Free/Pro plan cards → `pricing_cards`; FAQ → `faq`; closing → `final_cta` |

Set `settings.registerUrl` to the page's existing registration page (PPC: `https://pharmacozyme.com/official-ppc-registration-page/`; for MDC and W20 take the URL their `<a>` Register links use, or the page's own canonical registration URL if shown in the file), `settings.whatsappNumber` to the page's support number from its GAS file (`WA_SUPPORT_LINK`), and `seo.description` to the page's `<meta name="description">` (add a one-sentence description if absent). Images: copy the exact image URLs used in the HTML; Google Drive links stay as-is (the renderer proxies them). Keep all lists within each field's `maxItems`/`max`; truncate nothing silently: if copy exceeds a limit, raise the limit in `sections.ts` for that field (and its test is unaffected), do not cut text.

`buildTemplate` must deep-copy and regenerate ids:

```ts
function fresh(c: LandingContent): LandingContent {
  const copy = structuredClone(c);
  copy.sections = copy.sections.map((s) => ({ ...s, id: globalThis.crypto.randomUUID() }));
  return copy;
}
```

- [ ] **Step 4: Run to verify PASS.** The "publishable" test is the contract: if it fails because a required field is empty, fill it from the source page.
- [ ] **Step 5: Commit** — `git add src/lib/landing/templates.ts tests/landing-templates.test.ts && git commit -m "feat(landing): blank and seeded starter templates"`

---

### Task 9: Admin list page, create/duplicate dialogs, nav entry

> **GATE:** Fetch the Stitch screens "Landing Pages — list" and "New landing page dialog" (see the Global Constraints). If missing, STOP and report. Use the existing `Dialog`, `Button`, `Input`, `Label`, `Badge`, `EmptyState`, `useConfirm`, `useAsyncAction`, sonner toast patterns from `BannersPanel.tsx` and `CampaignsPanel`. Admin chrome follows the app's `pz-*` tokens and dark-mode rules (the admin area supports dark mode; the landing page itself does not).

**Files:**
- Create: `src/app/dashboard/admin/landing-pages/page.tsx`, `src/app/dashboard/admin/landing-pages/loading.tsx`, `src/components/admin/landing/LandingPagesList.tsx`, `src/components/admin/landing/NewPageDialog.tsx`, `src/components/admin/landing/DuplicatePageDialog.tsx`
- Modify: `src/components/dashboard/nav.ts` (one admin item after Marketing: `{ label: "Landing Pages", href: "/dashboard/admin/landing-pages", icon: LayoutTemplate, roles: ["admin", "super_admin"] }`; import `LayoutTemplate` from lucide-react and confirm it exists in the installed version, otherwise use `PanelsTopLeft`)
- Test: `tests/landing-admin-ui.test.tsx` (list part), update `tests/dashboard-nav.test.ts` only if its assertions break

**Interfaces:**
- Consumes: `listLandingPages()` (server), `TEMPLATES`, `slugify`, `validateSlug`, routes from Task 5.
- Produces:
  - `LandingPagesList({ pages: LandingPageSummary[] })`
  - `NewPageDialog({ open, onOpenChange })` — fields: kind (3 big radio cards), name, template (blank for the kind, or a seeded one for that kind); a "Page link" line that shows `/e/<slug>` live from `slugify(name)` with a small "Change" control; on submit POST `/api/admin/landing-pages` then `router.push('/dashboard/admin/landing-pages/<id>')`; server error text is shown inline (409 slug-taken, 400 reserved).
  - `DuplicatePageDialog({ page, open, onOpenChange })` — name prefilled `"<title> (copy)"`, slug auto from name; POST `/api/admin/landing-pages/<id>/duplicate`; on success navigate to the editor.
  - Row actions: **Edit** (link), **View live** (link to `/e/<slug>`, only when status is published/closed), **Duplicate**, **Close registration** / **Reopen registration** (POST `/status`, with `useConfirm`, toast, `router.refresh()`).
  - Status badge text: `Draft`, `Live`, `Closed`; an extra "Unpublished changes" chip when `hasUnpublishedChanges && status !== "draft"`.

- [ ] **Step 1: Write the failing tests** (add a `describe("landing pages list")` to `tests/landing-admin-ui.test.tsx`):

```tsx
// tests/landing-admin-ui.test.tsx (list/dialog part)
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => async () => true }));

import { LandingPagesList } from "@/components/admin/landing/LandingPagesList";
import { NewPageDialog } from "@/components/admin/landing/NewPageDialog";

const pages = [
  { id: "a", slug: "ppc-b3", kind: "course" as const, title: "PPC Batch 3", status: "published" as const, revision: 3, publishedAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z", hasUnpublishedChanges: true },
  { id: "b", slug: "w21", kind: "webinar" as const, title: "Webinar 21", status: "draft" as const, revision: 1, publishedAt: null, updatedAt: "2026-10-02T00:00:00Z", hasUnpublishedChanges: true },
];

beforeEach(() => { push.mockReset(); refresh.mockReset(); vi.stubGlobal("fetch", vi.fn()); });

describe("LandingPagesList", () => {
  it("shows status badges, the unpublished-changes chip only for live pages, and View live only for published/closed", () => {
    render(<LandingPagesList pages={pages} />);
    expect(screen.getByText("Live")).toBeTruthy();
    expect(screen.getByText("Draft")).toBeTruthy();
    expect(screen.getAllByText(/unpublished changes/i)).toHaveLength(1);
    expect(screen.getAllByRole("link", { name: /view live/i })).toHaveLength(1);
  });
  it("shows an empty state with a create button when there are no pages", () => {
    render(<LandingPagesList pages={[]} />);
    expect(screen.getByRole("button", { name: /new page/i })).toBeTruthy();
  });
  it("closes registration through the status route and refreshes", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    render(<LandingPagesList pages={pages} />);
    fireEvent.click(screen.getByRole("button", { name: /close registration/i }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/admin/landing-pages/a/status");
    expect(JSON.parse(init.body)).toEqual({ status: "closed" });
  });
});

describe("NewPageDialog", () => {
  it("derives and shows the page link from the name, and posts to create then opens the editor", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: "new1" }) });
    render(<NewPageDialog open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole("radio", { name: /workshop/i }));
    fireEvent.change(screen.getByLabelText(/page name/i), { target: { value: "MDC Batch 4" } });
    expect(screen.getByText("/e/mdc-batch-4")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /create page/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard/admin/landing-pages/new1"));
    expect(JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body)).toMatchObject({ title: "MDC Batch 4", kind: "workshop" });
  });
  it("shows the server's message when the link is taken and does not navigate", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: "A page with that link already exists. Please choose a different link." }) });
    render(<NewPageDialog open onOpenChange={() => {}} />);
    fireEvent.change(screen.getByLabelText(/page name/i), { target: { value: "PPC Batch 3" } });
    fireEvent.click(screen.getByRole("button", { name: /create page/i }));
    await waitFor(() => expect(screen.getByText(/already exists/i)).toBeTruthy());
    expect(push).not.toHaveBeenCalled();
  });
  it("blocks submit with no usable link (non-Latin name) and says why", () => {
    render(<NewPageDialog open onOpenChange={() => {}} />);
    fireEvent.change(screen.getByLabelText(/page name/i), { target: { value: "دورة" } });
    expect((screen.getByRole("button", { name: /create page/i }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/page link/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run to verify FAIL.**
- [ ] **Step 3: Implement** the page, list, dialogs, nav item (port layout from Stitch; logic as specified). `page.tsx` is a server component: `await requireAdminPage(); const pages = await listLandingPages();` and renders `<LandingPagesList pages={pages} />` under the standard admin page heading used by `marketing/page.tsx`.
- [ ] **Step 4: Run to verify PASS**, `tests/dashboard-nav.test.ts` still passes, `tsc --noEmit` clean of new errors.
- [ ] **Step 5: Commit** — `git add src/app/dashboard/admin/landing-pages src/components/admin/landing src/components/dashboard/nav.ts tests/landing-admin-ui.test.tsx && git commit -m "feat(landing): admin list page, new and duplicate dialogs, nav entry"`

---

### Task 10: Editor — section list, guided forms, settings, live preview

> **GATE:** Fetch the Stitch screens "Landing page editor — laptop" (three panes) and "Landing page editor — tablet". If missing, STOP and report. The editor is designed for laptop and tablet; on a phone show a short message "Open this editor on a laptop or tablet" with a link back to the list.

**Files:**
- Create: `src/app/dashboard/admin/landing-pages/[id]/page.tsx`, `src/app/dashboard/admin/landing-pages/[id]/preview/page.tsx`, `src/components/admin/landing/LandingEditor.tsx`, `SectionList.tsx`, `SectionForm.tsx`, `FieldInput.tsx`, `PageSettingsPanel.tsx`, `PreviewFrame.tsx`, `PreviewTarget.tsx`, `AddSectionMenu.tsx`
- Test: extend `tests/landing-admin-ui.test.tsx`

**Interfaces:**
- Consumes: Tasks 3–6 and 7 (`LandingRenderer`), `ImageUploadField` (`src/components/admin/program/ImageUploadField.tsx`, props `value,onChange,courseSlug,kind,inputClassName,shape,icon,uploadUrl`; pass `courseSlug="landing-pages"`, `kind="landing"`), `useAutosaveDraft`.
- Produces:
  - `LandingEditor({ page: LandingPage, versions: LandingVersion[] })` — owns `content` state (initialised from `page.draft`), calls `schedule(content)` on every change, renders: top bar (page name, save state text "Saved" / "Saving…" / "Unsaved changes" / "Couldn't save, retrying when you keep typing" / "Someone else changed this page. Reload." with a Reload button, Preview-in-new-tab link to `/dashboard/admin/landing-pages/<id>/preview`, Publish button — Task 11), left `SectionList`, middle form (`SectionForm` for the selected section, or `PageSettingsPanel` when "Page settings" is selected), right `PreviewFrame`.
  - `SectionList({ sections, selectedId, onSelect, onToggle, onMove, onRemove, onAdd })` — each row: label (from `SECTION_DEFS`), a switch (`role="switch"`, `aria-checked`, accessible name `Show <label>`), up/down buttons (`aria-label="Move <label> up"` / `down`, disabled at the ends), remove button (with `useConfirm`). `AddSectionMenu` lists every `SECTION_TYPES` entry with its label and description.
  - `SectionForm({ type, data, onChange })` — renders `SECTION_DEFS[type].fields` through `FieldInput`; for lists: item cards with up/down/remove, "Add <itemLabel>" button disabled at `maxItems`, each item's sub-fields rendered recursively.
  - `FieldInput({ field, value, onChange })` by `kind`: `text` → `Input`; `textarea` → `<textarea>`; `url`/`youtube` → `Input type="url"` with inline error text when the current value is non-empty and invalid (`isSafeUrl` / `youtubeId`); `image` → `ImageUploadField`; `list` → described above. Each field shows its `label`, `help` (muted text) and `example` as the input placeholder. Required fields show a small "Required to publish" marker.
  - `PageSettingsPanel({ settings, seo, onSettings, onSeo })` — fields: Register button link, Register button text, WhatsApp number, Countdown end (`datetime-local` converted to ISO) and label, Google/WhatsApp preview title, description, share image.
  - `PreviewFrame({ content, pageId })` — Laptop/Phone toggle; renders `<iframe src="/dashboard/admin/landing-pages/<id>/preview" title="Page preview">` at 1280 px or 390 px logical width scaled to fit its pane (CSS transform scale), and on every `content` change posts `{ type: "landing-preview", content }` to `iframe.contentWindow` with `targetOrigin = window.location.origin`.
  - `PreviewTarget({ initialContent, status, kind, title })` (client, used by the preview route): renders `LandingRenderer`; listens for `message` events and accepts a message **only if** `event.origin === window.location.origin` and `data.type === "landing-preview"`, then runs `normalizeContent(data.content)`.
  - Preview route (`.../[id]/preview/page.tsx`): `await requireAdminPage()`, loads the page, renders `PreviewTarget` with `page.draft`; sets `robots: noindex`.
  - Editor route (`.../[id]/page.tsx`): `requireAdminPage()`, `getLandingPage(id)` (`notFound()` if null), `listVersions(id)`.
  - Image uploads: before calling the existing upload route, run client-side downscale: read the file into an `<img>`, `fitWithin(w,h,1600)`, draw on a canvas, `canvas.toBlob(..., "image/webp", 0.82)`; fall back to the original file if canvas/`toBlob` is unavailable or throws. Wrap this in a small `compressImage(file)` helper in `src/lib/landing/compress-image.ts` used by an `ImageUploadField` wrapper `LandingImageField` (do not change `ImageUploadField` for other callers).

- [ ] **Step 1: Write the failing tests**

```tsx
// append to tests/landing-admin-ui.test.tsx
import { SectionList } from "@/components/admin/landing/SectionList";
import { SectionForm } from "@/components/admin/landing/SectionForm";
import { PreviewTarget } from "@/components/admin/landing/PreviewTarget";
import { emptyContent, updateSectionData } from "@/lib/landing/content";

describe("SectionList", () => {
  const c = emptyContent("webinar");
  const handlers = () => ({ onSelect: vi.fn(), onToggle: vi.fn(), onMove: vi.fn(), onRemove: vi.fn(), onAdd: vi.fn() });

  it("renders one row per section with a labelled switch, and disables Move up on the first and Move down on the last", () => {
    render(<SectionList sections={c.sections} selectedId={c.sections[0].id} {...handlers()} />);
    expect(screen.getAllByRole("switch")).toHaveLength(c.sections.length);
    expect((screen.getAllByRole("button", { name: /move .* up/i })[0] as HTMLButtonElement).disabled).toBe(true);
    const downs = screen.getAllByRole("button", { name: /move .* down/i });
    expect((downs[downs.length - 1] as HTMLButtonElement).disabled).toBe(true);
  });
  it("calls onMove with the section id and direction, and onToggle with the id", () => {
    const h = handlers();
    render(<SectionList sections={c.sections} selectedId={null} {...h} />);
    fireEvent.click(screen.getAllByRole("button", { name: /move .* down/i })[0]);
    expect(h.onMove).toHaveBeenCalledWith(c.sections[0].id, 1);
    fireEvent.click(screen.getAllByRole("switch")[1]);
    expect(h.onToggle).toHaveBeenCalledWith(c.sections[1].id);
  });
});

describe("SectionForm", () => {
  it("shows plain labels, help text and a required marker, and reports edits as the full data object", () => {
    const onChange = vi.fn();
    const data = updateSectionData(emptyContent("course"), emptyContent("course").sections[0].id, {}).sections[0].data;
    render(<SectionForm type="hero" data={data} onChange={onChange} />);
    expect(screen.getByLabelText("Headline")).toBeTruthy();
    expect(screen.getAllByText(/required to publish/i).length).toBeGreaterThan(0);
    fireEvent.change(screen.getByLabelText("Headline"), { target: { value: "New title" } });
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ headline: "New title" }));
  });
  it("adds, reorders and removes list items, and stops adding at maxItems", () => {
    const onChange = vi.fn();
    render(<SectionForm type="faq" data={{ heading: "H", items: [{ q: "1", a: "a" }, { q: "2", a: "b" }] }} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /add question/i }));
    expect(onChange.mock.calls.at(-1)![0].items).toHaveLength(3);
    fireEvent.click(screen.getAllByRole("button", { name: /move question 2 up/i })[0]);
    expect(onChange.mock.calls.at(-1)![0].items.map((i: { q: string }) => i.q)).toEqual(["2", "1"]);
    fireEvent.click(screen.getAllByRole("button", { name: /remove question 1/i })[0]);
    expect(onChange.mock.calls.at(-1)![0].items).toHaveLength(1);
  });
  it("flags an unsafe link inline", () => {
    render(<SectionForm type="hero" data={{ secondaryCtaUrl: "javascript:alert(1)" }} onChange={() => {}} />);
    expect(screen.getByText(/starting with https/i)).toBeTruthy();
  });
});

describe("PreviewTarget", () => {
  it("accepts a same-origin preview message and ignores other origins and shapes", async () => {
    const base = updateSectionData(emptyContent("webinar"), emptyContent("webinar").sections[0].id, {});
    const first = base.sections[0].id;
    const initial = updateSectionData(base, first, { headline: "ORIGINAL" });
    render(<PreviewTarget initialContent={initial} status="draft" kind="webinar" title="T" />);
    expect(screen.getAllByText("ORIGINAL").length).toBeGreaterThan(0);
    const next = updateSectionData(initial, first, { headline: "UPDATED" });
    window.dispatchEvent(new MessageEvent("message", { data: { type: "landing-preview", content: next }, origin: "https://evil.example" }));
    await Promise.resolve();
    expect(screen.queryByText("UPDATED")).toBeNull();
    window.dispatchEvent(new MessageEvent("message", { data: { type: "landing-preview", content: next }, origin: window.location.origin }));
    await waitFor(() => expect(screen.getAllByText("UPDATED").length).toBeGreaterThan(0));
  });
});
```

- [ ] **Step 2: Run to verify FAIL.**
- [ ] **Step 3: Implement** the components and routes per the interface list. Key logic (authoritative):

```tsx
// SectionForm list-item operations, immutably (inside the list FieldInput)
const items = (value as Record<string, unknown>[]) ?? [];
const set = (next: Record<string, unknown>[]) => onChange(next);
const add = () => set([...items, defaultItem(field)]);                // defaultItem: Object.fromEntries(itemFields.map(f => [f.key, f.defaultValue ?? (f.kind === "list" ? [] : "")]))
const remove = (i: number) => set(items.filter((_, n) => n !== i));
const move = (i: number, dir: -1 | 1) => {
  const j = i + dir;
  if (j < 0 || j >= items.length) return;
  const next = [...items];
  [next[i], next[j]] = [next[j], next[i]];
  set(next);
};
```

Item controls' accessible names must be exactly `Move <itemLabel> <n> up`, `Move <itemLabel> <n> down`, `Remove <itemLabel> <n>` (1-based), and the add button `Add <itemLabel lowercase>` — the tests above depend on this. `LandingEditor` wiring (authoritative):

```tsx
const { state, schedule, saveNow } = useAutosaveDraft({ pageId: page.id, initialRevision: page.revision });
const [content, setContent] = useState(page.draft);
const apply = useCallback((next: LandingContent) => { setContent(next); schedule(next); }, [schedule]);
// section handlers: apply(toggleSection(content, id)), apply(moveSection(content, id, dir)), apply(removeSection(...)), apply(addSection(content, type)), apply(updateSectionData(content, id, data))
```

Warn on leaving with unsaved changes: `beforeunload` listener while `state` is `dirty`/`saving`/`error`.

- [ ] **Step 4: Run to verify PASS**, `tsc --noEmit`, `pz-tokens` check.
- [ ] **Step 5: Commit** — `git add src/app/dashboard/admin/landing-pages src/components/admin/landing src/lib/landing/compress-image.ts tests/landing-admin-ui.test.tsx && git commit -m "feat(landing): editor with section list, guided forms, settings and live preview"`

---

### Task 11: Readiness checklist, Publish, versions and rollback

> **GATE:** Use the "Landing page editor" Stitch screens for the checklist and versions panel; if they do not show them, STOP and report.

**Files:**
- Create: `src/components/admin/landing/ReadinessPanel.tsx`, `src/components/admin/landing/VersionsPanel.tsx`
- Modify: `src/components/admin/landing/LandingEditor.tsx` (add the Publish button and the two panels)
- Test: extend `tests/landing-admin-ui.test.tsx`

**Interfaces:**
- Consumes: `computeReadiness`, `Problem`, `LandingVersion`, publish/rollback routes.
- Produces:
  - `ReadinessPanel({ problems, onGoto })` — heading "Ready to publish?"; when `problems` is empty shows "Everything is filled in"; otherwise lists each `problem.message` with a **Fix** button (only when `problem.sectionId` exists) calling `onGoto(sectionId)`.
  - `VersionsPanel({ versions, onRestore })` — list `Version N · <date>` with **Restore this version** (confirm via `useConfirm`: "Restore version N? This replaces the live page and your draft.").
  - Publish button: label **Publish**; disabled while readiness has problems or while saving/publishing; on click: `await saveNow()` (abort with a toast if it returns false), then POST `/publish`; on 200 toast "Page published" and `router.refresh()`; on 422 show the returned `problems` in `ReadinessPanel` (the server's list wins) and toast "Not ready to publish yet".

- [ ] **Step 1: Write the failing tests**

```tsx
// append to tests/landing-admin-ui.test.tsx
import { ReadinessPanel } from "@/components/admin/landing/ReadinessPanel";
import { VersionsPanel } from "@/components/admin/landing/VersionsPanel";

describe("ReadinessPanel", () => {
  it("lists plain-language problems with Fix buttons that jump to the section", () => {
    const onGoto = vi.fn();
    render(<ReadinessPanel problems={[{ message: 'Fill in "Headline" in "Hero".', sectionId: "s1" }, { message: "Give the page a name." }]} onGoto={onGoto} />);
    expect(screen.getByText(/Fill in "Headline"/)).toBeTruthy();
    const fix = screen.getAllByRole("button", { name: /fix/i });
    expect(fix).toHaveLength(1);
    fireEvent.click(fix[0]);
    expect(onGoto).toHaveBeenCalledWith("s1");
  });
  it("says everything is filled in when there are no problems", () => {
    render(<ReadinessPanel problems={[]} onGoto={() => {}} />);
    expect(screen.getByText(/everything is filled in/i)).toBeTruthy();
  });
});

describe("VersionsPanel", () => {
  it("restores the chosen version after confirmation", async () => {
    const onRestore = vi.fn();
    render(<VersionsPanel versions={[{ version: 3, createdAt: "2026-10-03T10:00:00Z" }, { version: 2, createdAt: "2026-10-02T10:00:00Z" }]} onRestore={onRestore} />);
    fireEvent.click(screen.getAllByRole("button", { name: /restore this version/i })[1]);
    await waitFor(() => expect(onRestore).toHaveBeenCalledWith(2));
  });
  it("shows a helpful empty message before the first publish", () => {
    render(<VersionsPanel versions={[]} onRestore={() => {}} />);
    expect(screen.getByText(/no published versions yet/i)).toBeTruthy();
  });
});
```

Add an editor-level test (mock `useAutosaveDraft` to return `{ state: "saved", schedule: vi.fn(), saveNow: vi.fn().mockResolvedValue(true) }`): with an incomplete `page.draft` the **Publish** button is disabled; after filling the required fields (render with a complete fixture built like in `landing-content.test.ts`) it is enabled, clicking it calls `saveNow` BEFORE `fetch("/api/admin/landing-pages/<id>/publish")` (assert call order), and a mocked 422 response renders the server's problem text.

- [ ] **Step 2: Run to verify FAIL.**
- [ ] **Step 3: Implement** the panels and wiring; the editor derives `problems` with `computeReadiness(content, { title: page.title, slug: page.slug })` on every change (cheap, synchronous) and replaces them with the server's list after a 422.
- [ ] **Step 4: Run to verify PASS**, `tsc --noEmit`.
- [ ] **Step 5: Commit** — `git add src/components/admin/landing tests/landing-admin-ui.test.tsx && git commit -m "feat(landing): readiness checklist, publish flow, version restore"`

---

### Task 12: End-to-end verification, performance and phase review

**Files:** none created (fix findings with new commits).

- [ ] **Step 1: Full suite and types.** `node node_modules/vitest/vitest.mjs run` — expected: all pass except the known `tests/pz-tokens.test.ts` failure (same single violation, none new). `node node_modules/typescript/bin/tsc --noEmit` — no new errors versus baseline.
- [ ] **Step 2: Confirm the migration is applied** (Task 1 Step 5 hand-off) before any browser step. If not, stop and ask the user.
- [ ] **Step 3: Start the dev server** (background) `node node_modules/next/dist/bin/next dev`. Log in with Playwright as the admin (`pharmacozymeofficial@gmail.com`; wait 4–6 s after load before typing; submit via the password field). Do not use the off-limits Test Data emails.
- [ ] **Step 4: Click-through at 1280×800, then at 390×844**, checking each: create a page from `ppc-batch-3` (name "ZZ Test Page"), link shows `/e/zz-test-page`; the editor autosaves ("Saved"); toggle and reorder sections and watch the preview change instantly; Laptop/Phone preview toggle; add a FAQ item; paste a bad link and see the inline message; clear a required field and see it in "Ready to publish?" and Publish disabled; fix, Publish; open `/e/zz-test-page` logged out (private window / cleared session) and confirm it renders; Close registration then reload the public page and confirm the closed notice and no Register link; Reopen; Duplicate; edit the duplicate; Restore the earlier version. Open the page in two tabs, edit in both, and confirm the second tab reports the conflict instead of overwriting. Take screenshots at both widths. Check the browser console for errors.
- [ ] **Step 5: Performance.** Run a Lighthouse mobile audit (chrome-devtools MCP `lighthouse_audit`, or `performance_start_trace`) on `/e/zz-test-page`. Targets: LCP < 2.5 s and CLS < 0.1. If the dev server is the bottleneck, run the audit against a production build ONLY after stopping the dev server (never `next build` while it runs), or against a Vercel preview if the user supplies one, and say so. Record the numbers in the report; do not claim a pass without them.
- [ ] **Step 6: Clean up test data.** The page "ZZ Test Page", its duplicate and their versions are test residue in the real project. Tell the user their ids and give read-only verification SQL plus the delete SQL for them to paste (the MCP cannot write). Do not leave them live.
- [ ] **Step 7: Independent opus review of the whole branch** (read-only, findings to a report file under `.superpowers/sdd/2026-10-12-landing-phase-1/`). Reviewer must verify: every source-scan or guard test would fail if the guarded code were removed; no `dangerouslySetInnerHTML`; `/e/[slug]` does not call `cookies()`/`headers()`; all routes call `requireAdmin()`; no raw hex colors; the Review Focus items each have a test that fails without the fix. Fix findings in new commits via the original implementer.
- [ ] **Step 8: Hand back to the user** with: what shipped, screenshots, Lighthouse numbers, the test-residue SQL, and the compare URL for the branch if they ask to push. Update the project memory with the phase status.

---

## Self-Review

**Spec coverage (Phase 1 scope):** section blocks + registry (Tasks 3, 7); templates for three kinds and recreations of the three pages (Task 8); editor with toggles, reorder arrows, guided forms with help text and examples, live laptop/phone preview (Task 10); autosave (Task 6); Duplicate (Tasks 5, 9); Publish with server-enforced readiness, snapshot per publish, one-click rollback, Close registration (Tasks 5, 11, 9); "Ready to publish?" checklist in plain words (Tasks 4, 11); `/e/<slug>` renderer, cached and revalidated on publish, SEO metadata, closed banner, countdown banner, WhatsApp float, sticky mobile CTA (Task 7); media: Drive proxy, compression, YouTube facade, restricted mini-markup (Tasks 2, 7, 10); light-theme only and tokens (Global Constraints); performance targets (Task 12); images never layout-shift (Task 7). **Deliberately NOT in this plan (later phases per the spec):** registration widget, test-mode registrations, payment accounts, promo codes, agent links, Meta Pixel/CAPI, Sheets/emails/sync, the Registrations screen. Stitch screens are an explicit gate in Tasks 7, 9, 10, 11; the Stitch prompts are in `docs/superpowers/stitch-prompts-landing-page-builder.md`.

**Placeholder scan:** The visual JSX of the 12 section components, the nav/footer shell and the admin chrome is intentionally delegated to the Stitch screens (project rule), with behavior, props, safety rules and tests fully specified. No "TBD"/"similar to Task N" steps remain; every logic unit has code and a test.

**Type consistency:** `LandingContent`, `LandingSection`, `Problem`, `SectionType`, `FieldDef` are defined in Tasks 3–4 and used with the same names in Tasks 5–11. Data-layer result shapes (`CreateResult`, `SaveResult`, `PublishResult`, `SimpleResult`) match the route tests' mocks. `buildTemplate(id, kind)` has the same signature in the Task 5 stub and Task 8. List-item control accessible names are specified once (Task 10) and used by its tests.

**Review Focus coverage:** (1) Task 3/4/7 tests for damaged data; (2) Task 2/7 hostile text and links; (3) Task 5 `conflict` route test + Task 6 serial-save tests; (4) Task 2/5 slug tests; (5) Task 5 publish-not-ready test (server-side); (6) Task 7 LandingImage tests.
