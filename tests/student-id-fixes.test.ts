import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createSupabaseMock, memoryHandler, type Store } from "./helpers/supabase-mock";

vi.mock("server-only", () => ({}));
const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));
const mail = vi.hoisted(() => ({ send: vi.fn(async (_opts: { to: string; subject: string; htmlContent: string }) => ({ ok: true as const })) }));
vi.mock("@/lib/brevo-participants", () => ({ sendParticipantEmail: mail.send }));

import {
  addPersonEmail,
  cleanPersonName,
  getPersonDetail,
  idEmailHtml,
  reissuePersonId,
  removePersonEmail,
  renamePerson,
  sendIdEmail,
} from "@/lib/data/pz-people-fix";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

let store: Store;
let rpcMissing = false;

beforeEach(() => {
  db.reset();
  mail.send.mockClear();
  rpcMissing = false;
  store = {
    pz_people: [
      { id: A, pz_id: "Hamza-1002", display_name: "Hamza Ali" },
      { id: B, pz_id: "Sara-1003", display_name: "Sara Khan" },
    ],
    pz_person_emails: [
      { email: "fake.hamid@example.com", person_id: A },
      { email: "fake.sara@example.com", person_id: B },
    ],
    pz_id_aliases: [
      { alias_norm: "hamza-1002", person_id: A, source: "own" },
      { alias_norm: "hamid-dr28", person_id: A, source: "legacy" },
      { alias_norm: "sara-1003", person_id: B, source: "own" },
    ],
    landing_registrations: [
      { id: "r1", person_id: A, page_id: "p1", mode: "live", status: "paid", is_test: false },
      { id: "r2", person_id: A, page_id: "p2", mode: "recorded", status: "free", is_test: false },
      { id: "r3", person_id: A, page_id: "p2", mode: "live", status: "paid", is_test: true },
    ],
    landing_pages: [
      { id: "p1", title: "Fake Course Batch 1" },
      { id: "p2", title: "Fake Workshop" },
    ],
    batch_quiz_results: [{ id: "q1", person_id: A }, { id: "q2", person_id: A }],
    batch_session_marks: [{ id: "m1", person_id: A }],
  };
  db.state.handler = memoryHandler(store, (fn, args) => {
    if (fn !== "pz_reissue_id") return { data: null, error: { message: "no rpc" } };
    if (rpcMissing) return { data: null, error: { code: "PGRST202", message: "Could not find the function public.pz_reissue_id" } };
    const { p_person } = args as { p_person: string };
    const p = store.pz_people.find((x) => x.id === p_person)!;
    const next = `${String(p.display_name).split(" ")[0]}-1050`;
    store.pz_id_aliases.push({ alias_norm: next.toLowerCase(), person_id: p_person, source: "own" });
    p.pz_id = next;
    return { data: next, error: null };
  });
});

describe("migration 0104", () => {
  const sql = readFileSync(join(process.cwd(), "supabase", "migrations", "0104_pz_reissue_id.sql"), "utf8");
  it("adds a service-role-only function that keeps the old ID as an alias and deletes nothing", () => {
    expect(sql).toContain("create or replace function public.pz_reissue_id(p_person uuid)");
    expect(sql).toMatch(/security definer/i);
    expect(sql).toContain("revoke all on function public.pz_reissue_id(uuid) from public, anon, authenticated;");
    expect(sql).toContain("grant execute on function public.pz_reissue_id(uuid) to service_role;");
    expect(sql).toMatch(/values \(lower\(btrim\(v_old\)\), p_person, 'own'\)/);
    expect(sql).not.toMatch(/\bdelete\b|drop table|truncate/i);
  });
});

describe("person detail", () => {
  it("shows IDs, emails, batches and counts for troubleshooting", async () => {
    const d = await getPersonDetail(A);
    expect(d).toMatchObject({
      id: A,
      pzId: "Hamza-1002",
      name: "Hamza Ali",
      emails: ["fake.hamid@example.com"],
      oldIds: ["hamid-dr28"],
      quizResults: 2,
      attendance: 1,
    });
    expect(d!.batches).toEqual([
      { title: "Fake Course Batch 1", mode: "live", status: "paid" },
      { title: "Fake Workshop", mode: "recorded", status: "free" },
    ]);
  });
  it("returns null for a bad or unknown id", async () => {
    expect(await getPersonDetail("nope")).toBeNull();
    expect(await getPersonDetail("33333333-3333-4333-8333-333333333333")).toBeNull();
  });
});

describe("fix name", () => {
  it("cleans the name", () => {
    expect(cleanPersonName("  hamid   ali ")).toBe("hamid ali");
    expect(cleanPersonName("x")).toBeNull();
    expect(cleanPersonName("1234")).toBeNull();
    expect(cleanPersonName("a".repeat(81))).toBeNull();
  });
  it("saves the corrected name and keeps the ID", async () => {
    expect(await renamePerson(A, " Hamid  Ali ")).toEqual({ ok: true });
    expect(store.pz_people[0]).toMatchObject({ display_name: "Hamid Ali", pz_id: "Hamza-1002" });
  });
  it("refuses an empty name", async () => {
    expect((await renamePerson(A, " ")).ok).toBe(false);
    expect(store.pz_people[0].display_name).toBe("Hamza Ali");
  });
});

describe("new ID", () => {
  it("issues a new ID from the current name and reports the old one", async () => {
    store.pz_people[0].display_name = "Hamid Ali";
    expect(await reissuePersonId(A)).toEqual({ ok: true, oldId: "Hamza-1002", newId: "Hamid-1050" });
  });
  it("explains when the SQL has not been pasted yet", async () => {
    rpcMissing = true;
    const res = await reissuePersonId(A);
    expect(res.ok).toBe(false);
    expect(!res.ok && res.message).toMatch(/SQL/);
  });
});

describe("emails", () => {
  it("adds a new email in lower case", async () => {
    expect(await addPersonEmail(A, " Fake.Second@Example.com ")).toEqual({ ok: true });
    expect(store.pz_person_emails.find((e) => e.email === "fake.second@example.com")).toMatchObject({ person_id: A });
  });
  it("refuses an email that belongs to someone else and names them", async () => {
    const res = await addPersonEmail(A, "fake.sara@example.com");
    expect(res.ok).toBe(false);
    expect(!res.ok && res.message).toMatch(/Sara-1003/);
    expect(!res.ok && res.message).toMatch(/merge/i);
  });
  it("refuses a bad email", async () => {
    expect((await addPersonEmail(A, "not-an-email")).ok).toBe(false);
  });
  it("removes an email only when another one is left", async () => {
    expect((await removePersonEmail(A, "fake.hamid@example.com")).ok).toBe(false);
    await addPersonEmail(A, "fake.second@example.com");
    expect(await removePersonEmail(A, "fake.hamid@example.com")).toEqual({ ok: true });
    expect(store.pz_person_emails.find((e) => e.email === "fake.hamid@example.com")).toBeUndefined();
  });
});

describe("ID email", () => {
  it("sends the ID to one of the student's own emails", async () => {
    expect(await sendIdEmail(A, "fake.hamid@example.com")).toEqual({ ok: true });
    expect(mail.send).toHaveBeenCalledTimes(1);
    const opts = mail.send.mock.calls[0][0];
    expect(opts.to).toBe("fake.hamid@example.com");
    expect(opts.subject).toBe("Your PZ ID");
    expect(opts.htmlContent).toContain("Hamza-1002");
  });
  it("never sends to an email that is not the student's", async () => {
    expect((await sendIdEmail(A, "fake.sara@example.com")).ok).toBe(false);
    expect(mail.send).not.toHaveBeenCalled();
  });
  it("escapes the name in the email", () => {
    const html = idEmailHtml("<b>Fake</b>", "Fake-1000");
    expect(html).not.toContain("<b>Fake</b>");
    expect(html).toContain("&lt;b&gt;Fake&lt;/b&gt;");
  });
});
