import { describe, it, expect, vi, beforeEach } from "vitest";
import { createSupabaseMock, memoryHandler, type Store } from "./helpers/supabase-mock";

const db = createSupabaseMock();
vi.mock("@/lib/supabase/admin", () => ({ createAdminSupabase: () => db.client }));

import { listTemplates, saveTemplate, deleteTemplate } from "@/lib/data/participant-templates";

let store: Store;
const input = (o: Record<string, unknown> = {}) => ({
  name: "Welcome", subject: "Hi", emailBody: "Email body", whatsappBody: "WA body", actorId: "admin-1", ...o,
});

beforeEach(() => {
  db.reset();
  store = { participant_templates: [] };
  db.state.handler = memoryHandler(store);
});

describe("participant templates", () => {
  it("saves without an id by inserting and returns the mapped row", async () => {
    const row = await saveTemplate(input());
    expect(store.participant_templates).toHaveLength(1);
    expect(store.participant_templates[0]).toMatchObject({ name: "Welcome", subject: "Hi", email_body: "Email body", whatsapp_body: "WA body", created_by: "admin-1" });
    expect(row).toMatchObject({ id: store.participant_templates[0].id, name: "Welcome", subject: "Hi", emailBody: "Email body", whatsappBody: "WA body" });
  });

  it("saves with an id by updating and bumping updated_at", async () => {
    const created = await saveTemplate(input());
    store.participant_templates[0].updated_at = "2020-01-01T00:00:00.000Z";
    const row = await saveTemplate(input({ id: created.id, name: "  Renamed ", subject: "New" }));
    expect(store.participant_templates).toHaveLength(1);
    expect(store.participant_templates[0]).toMatchObject({ name: "Renamed", subject: "New" });
    expect(store.participant_templates[0].updated_at).not.toBe("2020-01-01T00:00:00.000Z");
    expect(row).toMatchObject({ id: created.id, name: "Renamed", subject: "New" });
  });

  it("rejects a blank name", async () => {
    await expect(saveTemplate(input({ name: "   " }))).rejects.toThrow("Give the template a name");
    expect(store.participant_templates).toHaveLength(0);
  });

  it("deletes a template, and a missing id is a no-op", async () => {
    const created = await saveTemplate(input());
    await deleteTemplate(created.id);
    expect(store.participant_templates).toHaveLength(0);
    await expect(deleteTemplate("nope")).resolves.toBeUndefined();
  });

  it("lists sorted by name, case-insensitively", async () => {
    await saveTemplate(input({ name: "banana" }));
    await saveTemplate(input({ name: "Cherry" }));
    await saveTemplate(input({ name: "Apple" }));
    expect((await listTemplates()).map((t) => t.name)).toEqual(["Apple", "banana", "Cherry"]);
  });
});
