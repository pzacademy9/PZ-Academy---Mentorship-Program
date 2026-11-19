import { readFileSync } from "node:fs";
import { join } from "node:path";

const sql = readFileSync(
  join(process.cwd(), "supabase", "migrations", "0119_portal_access.sql"),
  "utf8",
);

function body(name: string): string {
  const start = sql.search(
    new RegExp(`create or replace function public\\.${name}\\(`, "i"),
  );
  expect(start).toBeGreaterThan(-1);
  const rest = sql.slice(start);
  const end = rest.search(/\n\$\$;/);
  return rest.slice(0, end > -1 ? end : undefined);
}

it("creates course_families with unique name and RLS on and no policy", () => {
  expect(sql).toMatch(
    /create table if not exists public\.course_families\s*\(\s*id\s+uuid primary key default gen_random_uuid\(\),\s*name\s+text not null unique,\s*created_at timestamptz not null default now\(\)\s*\)/i,
  );
  expect(sql).toMatch(
    /alter table public\.course_families enable row level security/i,
  );
  expect(sql).not.toMatch(/create policy/i);
});

it("adds family_id and batch_label to courses", () => {
  expect(sql).toMatch(
    /add column if not exists family_id uuid references public\.course_families\(id\) on delete set null/i,
  );
  expect(sql).toMatch(/add column if not exists batch_label text/i);
});

it("duplicate_course is security definer with the exact signature and revoked from public, anon, authenticated", () => {
  expect(sql).toMatch(
    /create or replace function public\.duplicate_course\(\s*p_source\s+uuid,\s*p_title\s+text,\s*p_family\s+uuid,\s*p_batch_label\s+text\s*\)\s*returns uuid/i,
  );
  const b = body("duplicate_course");
  expect(b).toMatch(/security definer/i);
  expect(b).toMatch(/set search_path = public, pg_temp/i);
  expect(sql).toMatch(
    /revoke all on function public\.duplicate_course\(uuid, text, uuid, text\) from public, anon, authenticated/i,
  );
});

it("duplicate_course copies modules, lessons, quiz_questions and module_notes but not enrollments, lesson_progress or quiz_attempts", () => {
  const b = body("duplicate_course");
  for (const t of ["modules", "lessons", "quiz_questions", "module_notes"]) {
    expect(b).toMatch(new RegExp(`insert into public\\.${t}\\b`, "i"));
  }
  expect(b).not.toMatch(/enrollments|lesson_progress|quiz_attempts/i);
});

it("duplicate_course creates the course unpublished", () => {
  const b = body("duplicate_course");
  expect(b).toMatch(/'draft'/);
  expect(b).toMatch(/is_published[\s\S]*?false/i);
  expect(b).not.toMatch(/\bsheet_id\b\s*,/i);
});

it("duplicate_course makes a unique slug and rejects a blank title", () => {
  const b = body("duplicate_course");
  expect(b).toMatch(/btrim\(coalesce\(p_title, ''\)\) = ''/i);
  expect(b).toMatch(/loop[\s\S]*?'-' \|\| v_n/i);
});

it("move_batch_students has the exact signature and is locked down", () => {
  expect(sql).toMatch(
    /create or replace function public\.move_batch_students\(\s*p_page\s+uuid,\s*p_to_course\s+uuid,\s*p_dry_run\s+boolean\s*\)\s*returns jsonb/i,
  );
  const b = body("move_batch_students");
  expect(b).toMatch(/security definer/i);
  expect(sql).toMatch(
    /revoke all on function public\.move_batch_students\(uuid, uuid, boolean\) from public, anon, authenticated/i,
  );
});

it("move_batch_students filters enrollments by landing_registration_id of the page's registrations", () => {
  const b = body("move_batch_students");
  expect(b).toMatch(
    /landing_registration_id in \(\s*select id from public\.landing_registrations where page_id = p_page\s*\)/i,
  );
});

it("move_batch_students skips a student who already has an enrollment in the target course", () => {
  const b = body("move_batch_students");
  expect(b).toMatch(
    /not exists \(\s*select 1 from public\.enrollments t\s+where t\.student_id = e\.student_id and t\.course_id = p_to_course/i,
  );
  expect(b).toMatch(/already_there/);
});

it("move_batch_students remaps enrollment_open_modules, enrollment_modules and landing_batch_state and repoints landing_pages.course_id", () => {
  const b = body("move_batch_students");
  expect(b).toMatch(/enrollment_open_modules/);
  expect(b).toMatch(/enrollment_modules/);
  expect(b).toMatch(/landing_batch_state/);
  expect(b).toMatch(/update public\.landing_pages\s+set course_id = p_to_course/i);
  expect(b).toMatch(/update public\.enrollments\s+set course_id = p_to_course/i);
  expect(b).toMatch(/row_number\(\) over \(order by order_index, id\)/i);
});

it("a dry run writes nothing", () => {
  const b = body("move_batch_students");
  const guard = b.search(/if not p_dry_run then/i);
  expect(guard).toBeGreaterThan(-1);
  const re = /\b(update public\.|insert into public\.|delete from public\.)/gi;
  let count = 0;
  let w: RegExpExecArray | null;
  while ((w = re.exec(b)) !== null) {
    count++;
    expect(w.index).toBeGreaterThan(guard);
  }
  expect(count).toBeGreaterThan(0);
});

it("does not use the page's course to decide who moves, so Move works after the page was repointed", () => {
  const b = body("move_batch_students");
  expect(b).not.toMatch(/already uses that portal/i);
  expect(b).not.toMatch(/no portal yet/i);
  expect(b).not.toMatch(/v_old/i);
  expect(b).not.toMatch(/select course_id into/i);
  expect(b).toMatch(/e\.course_id <> p_to_course/i);
  expect(b).toMatch(/Registration page not found/);
});

it("builds the module map per old course by position", () => {
  const b = body("move_batch_students");
  expect(b).toMatch(/row_number\(\) over \(partition by course_id order by order_index, id\)/i);
  expect(b).toMatch(/row_number\(\) over \(order by order_index, id\)/i);
});

it("a second run finds nothing: only enrollments off the target are selected", () => {
  const b = body("move_batch_students");
  const set = b.slice(b.search(/create temp table _mv_set/i));
  expect(set.slice(0, set.search(/;/))).toMatch(/e\.course_id <> p_to_course/i);
});

it("refuses a missing target course and a target with no modules", () => {
  const b = body("move_batch_students");
  expect(b).toMatch(/The new portal was not found/);
  expect(b).toMatch(/not exists \(select 1 from public\.modules where course_id = p_to_course\)/i);
  expect(b).toMatch(/The new portal has no modules yet/);
});

it("deletes only remapped enrollment_modules rows so a restricted student never becomes whole-course", () => {
  const b = body("move_batch_students");
  expect(b).toMatch(
    /delete from public\.enrollment_modules\s+where enrollment_id in \(select id from _mv_set\)\s+and module_id in \(select old_id from _mv_map where new_id is not null\)/i,
  );
});

it("moves at most one enrollment per student so the unique (student, course) key cannot abort the call", () => {
  const b = body("move_batch_students");
  const set = b.slice(b.search(/create temp table _mv_set/i));
  expect(set.slice(0, set.search(/;/))).toMatch(
    /select distinct on \(e\.student_id\) e\.id, e\.course_id[\s\S]*?order by e\.student_id, e\.id/i,
  );
});

it("remaps landing_batch_state without colliding on (page_id, module_id)", () => {
  const b = body("move_batch_students");
  expect(b).toMatch(/select distinct on \(mp\.new_id\)/i);
  expect(b).toMatch(
    /not exists \(\s*select 1 from public\.landing_batch_state x\s+where x\.page_id = p_page and x\.module_id = mp\.new_id/i,
  );
  expect(b).toMatch(
    /delete from public\.landing_batch_state\s+where page_id = p_page\s+and module_id in \(select old_id from _mv_map\)/i,
  );
});
