import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
const createLandingPage = vi.fn();
const ensureVariant = vi.fn();
const saveVariantDraft = vi.fn();
const setVariantEnabled = vi.fn();
vi.mock("@/lib/data/landing-pages", () => ({ createLandingPage: (...a: unknown[]) => createLandingPage(...a) }));
vi.mock("@/lib/data/landing-variants", () => ({
  ensureVariant: (...a: unknown[]) => ensureVariant(...a),
  saveVariantDraft: (...a: unknown[]) => saveVariantDraft(...a),
  setVariantEnabled: (...a: unknown[]) => setVariantEnabled(...a),
}));
const buildImport = vi.fn();
vi.mock("@/lib/landing/import/build-content", () => ({ buildImport: (...a: unknown[]) => buildImport(...a) }));

import { importLandingPage } from "@/lib/data/landing-import";

const content = {
  sections: [{ id: "s1", type: "faq" }, { id: "hero1", type: "hero" }],
  registration: { regions: [{ key: "UAE", label: "UAE" }, { key: "PK", label: "Pakistan" }] },
  modules: [{ key: "m2", title: "Module 2" }],
};
const links = [
  { regionKey: "UAE", moduleKey: null, on: false },
  { regionKey: null, moduleKey: "m2", on: true, heroTitle: "Hello", heroSubtitle: "Sub" },
  { regionKey: "UAE", moduleKey: "m2", on: false },
];
function built(over: Record<string, unknown> = {}) {
  return { ok: true, built: { kind: "course", title: "T", slug: "my-page", content, links, warnings: [{ level: "warning", message: "W1" }], ...over } };
}
const variant = (id: string, draft: unknown = { sections: {} }) => ({ ok: true, variant: { id, draft, revision: 4 } });

beforeEach(() => {
  vi.clearAllMocks();
  buildImport.mockReturnValue(built());
  createLandingPage.mockResolvedValue({ ok: true, id: "p1" });
  let n = 0;
  ensureVariant.mockImplementation(async () => variant(`v${++n}`, { sections: { hero1: { fields: { headline: "Seeded" } } } }));
  saveVariantDraft.mockResolvedValue({ ok: true, revision: 5 });
  setVariantEnabled.mockResolvedValue({ ok: true });
});

describe("importLandingPage", () => {
  it("creates the page, every link off, switches on and writes hero text", async () => {
    const r = await importLandingPage("u1", "raw");
    expect(r).toEqual({ ok: true, pageId: "p1", slug: "my-page", slugChanged: false, warnings: ["W1"], linksCreated: 3, linksFailed: [] });
    expect(createLandingPage).toHaveBeenCalledWith("u1", { title: "T", slug: "my-page", kind: "course", content });
    expect(ensureVariant).toHaveBeenCalledTimes(3);
    expect(ensureVariant).toHaveBeenNthCalledWith(2, "p1", { regionKey: null, moduleKey: "m2" }, false);
    expect(setVariantEnabled).toHaveBeenCalledTimes(1);
    expect(setVariantEnabled).toHaveBeenCalledWith("v2", true);
    expect(saveVariantDraft).toHaveBeenCalledWith("v2", { sections: { hero1: { fields: { headline: "Hello", subheadline: "Sub" } } } }, 4);
  });

  it("keeps the seeded headline when the file gives only a subtitle", async () => {
    buildImport.mockReturnValue(built({ links: [{ regionKey: null, moduleKey: "m2", on: false, heroSubtitle: "Sub" }] }));
    await importLandingPage("u1", "raw");
    expect(saveVariantDraft).toHaveBeenCalledWith("v1", { sections: { hero1: { fields: { headline: "Seeded", subheadline: "Sub" } } } }, 4);
  });

  it("retries a taken slug with a suffix", async () => {
    createLandingPage.mockResolvedValueOnce({ ok: false, reason: "slug-taken" }).mockResolvedValueOnce({ ok: false, reason: "slug-taken" });
    const r = await importLandingPage("u1", "raw");
    expect(r).toMatchObject({ ok: true, slug: "my-page-3", slugChanged: true });
  });

  it("gives up after -20", async () => {
    createLandingPage.mockResolvedValue({ ok: false, reason: "slug-taken" });
    const r = await importLandingPage("u1", "raw");
    expect(r).toEqual({ ok: false, errors: ["That link name is already used. Choose another in the file."] });
    expect(createLandingPage).toHaveBeenCalledTimes(20);
    expect(ensureVariant).not.toHaveBeenCalled();
  });

  it("truncates a long base so the suffix fits in 60 characters", async () => {
    const long = "a".repeat(60);
    buildImport.mockReturnValue(built({ slug: long }));
    createLandingPage.mockResolvedValueOnce({ ok: false, reason: "slug-taken" });
    const r = await importLandingPage("u1", "raw");
    expect(r).toMatchObject({ ok: true, slug: "a".repeat(58) + "-2" });
  });

  it("reports a db error when the page cannot be created", async () => {
    createLandingPage.mockResolvedValue({ ok: false, reason: "db-error" });
    const r = await importLandingPage("u1", "raw");
    expect(r.ok).toBe(false);
    expect(createLandingPage).toHaveBeenCalledTimes(1);
    expect(ensureVariant).not.toHaveBeenCalled();
  });

  it("a failed link does not fail the import", async () => {
    ensureVariant.mockReset();
    ensureVariant.mockResolvedValueOnce({ ok: false, reason: "db-error" }).mockResolvedValue(variant("vx"));
    const r = await importLandingPage("u1", "raw");
    expect(r).toMatchObject({ ok: true, linksCreated: 2, linksFailed: ["UAE"] });
  });

  it("labels a country and module failure in plain words", async () => {
    ensureVariant.mockReset();
    ensureVariant.mockResolvedValueOnce(variant("a")).mockResolvedValueOnce(variant("b")).mockResolvedValueOnce({ ok: false, reason: "db-error" });
    const r = await importLandingPage("u1", "raw");
    expect(r).toMatchObject({ ok: true, linksFailed: ["UAE, Module 2"] });
  });

  it("counts a link failed when switching on fails", async () => {
    setVariantEnabled.mockResolvedValue({ ok: false, reason: "db-error" });
    const r = await importLandingPage("u1", "raw");
    expect(r).toMatchObject({ ok: true, linksFailed: ["Module 2"], linksCreated: 2 });
  });

  it("retries a draft conflict once on a fresh copy", async () => {
    buildImport.mockReturnValue(built({ links: [{ regionKey: null, moduleKey: "m2", on: true, heroTitle: "Hello" }] }));
    saveVariantDraft.mockResolvedValueOnce({ ok: false, reason: "conflict" }).mockResolvedValueOnce({ ok: true, revision: 6 });
    const r = await importLandingPage("u1", "raw");
    expect(r).toMatchObject({ ok: true, linksCreated: 1, linksFailed: [] });
    expect(saveVariantDraft).toHaveBeenCalledTimes(2);
    expect(ensureVariant).toHaveBeenCalledTimes(2);
    expect(setVariantEnabled).toHaveBeenCalledTimes(1);
  });

  it("a second conflict fails the link but not the import", async () => {
    buildImport.mockReturnValue(built({ links: [{ regionKey: null, moduleKey: "m2", on: true, heroTitle: "Hello" }] }));
    saveVariantDraft.mockResolvedValue({ ok: false, reason: "conflict" });
    const r = await importLandingPage("u1", "raw");
    expect(r).toMatchObject({ ok: true, linksCreated: 0, linksFailed: ["Module 2"] });
    expect(saveVariantDraft).toHaveBeenCalledTimes(2);
    expect(setVariantEnabled).not.toHaveBeenCalled();
  });

  it("creates the page before any link, and saves the hero before switching on", async () => {
    await importLandingPage("u1", "raw");
    expect(createLandingPage.mock.invocationCallOrder[0]).toBeLessThan(ensureVariant.mock.invocationCallOrder[0]);
    expect(saveVariantDraft.mock.invocationCallOrder[0]).toBeLessThan(setVariantEnabled.mock.invocationCallOrder[0]);
  });

  it("warns when hero text has no hero section to go in", async () => {
    buildImport.mockReturnValue(built({ content: { ...content, sections: [{ id: "s1", type: "faq" }] } }));
    const r = await importLandingPage("u1", "raw");
    expect(r).toMatchObject({ ok: true });
    if (r.ok) expect(r.warnings).toContain("Module 2: the hero text was not saved because the page has no hero section.");
    expect(saveVariantDraft).not.toHaveBeenCalled();
  });

  it("build errors stop before creating anything", async () => {
    buildImport.mockReturnValue({ ok: false, errors: ["bad"] });
    expect(await importLandingPage("u1", "raw")).toEqual({ ok: false, errors: ["bad"] });
    expect(createLandingPage).not.toHaveBeenCalled();
  });
});
