import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, renderHook, screen, fireEvent, act, within } from "@testing-library/react";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const confirmFn = vi.fn(async () => true);
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => confirmFn }));
const uploads = vi.hoisted(() => ({ pending: [] as ((url: string) => void)[] }));
vi.mock("@/components/admin/program/ImageUploadField", () => ({
  // Models the real field: the upload captures onChange when the file is picked and calls it later.
  ImageUploadField: ({ onChange }: { onChange: (u: string) => void }) => (
    <button type="button" onClick={() => { const captured = onChange; uploads.pending.push((u) => captured(u)); }}>Fake pick file</button>
  ),
}));

import { LandingEditor } from "@/components/admin/landing/LandingEditor";
import { useAutosaveDraft } from "@/hooks/useAutosaveDraft";
import { VariantSwitcher } from "@/components/admin/landing/variants/VariantSwitcher";
import { OverrideBadge } from "@/components/admin/landing/variants/OverrideBadge";
import { emptyContent, updateSectionData } from "@/lib/landing/content";
import type { LandingVariant } from "@/lib/data/landing-variants";
import type { RegionDef } from "@/lib/landing/registration/config";
import type { VariantOverrides } from "@/lib/landing/variants";

const base = emptyContent("webinar");
const heroId = base.sections[0].id;
const draft = {
  ...updateSectionData(base, heroId, { ...base.sections[0].data, headline: "Main headline" }),
  modules: [
    { key: "module-2", title: "Module 2", format: "3-Day Workshop", days: 3, optionKey: "" },
    { key: "module-3", title: "Module 3", format: "3-Day Workshop", days: 3, optionKey: "" },
  ],
};
const page = {
  id: "p1", slug: "w21", kind: "webinar" as const, title: "Webinar 21", status: "draft" as const,
  draft, published: null, revision: 4, publishedAt: null, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z",
};
const mkVariant = (overrides: VariantOverrides = { sections: {} }, enabled = true): LandingVariant => ({
  id: "v1", pageId: "p1", ref: { regionKey: null, moduleKey: "module-2" }, enabled,
  draft: overrides, published: null, revision: 3, publishedAt: null,
});

let fetchMock: ReturnType<typeof vi.fn>;
const calls = (url: string) => fetchMock.mock.calls.filter(([u, init]) => u === url && init?.method === "PATCH");
const VARIANT_URL = "/api/admin/landing-pages/p1/variants/v1";
const PAGE_URL = "/api/admin/landing-pages/p1";

beforeEach(() => {
  vi.useFakeTimers();
  fetchMock = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ revision: 4 }) }));
  vi.stubGlobal("fetch", fetchMock);
  confirmFn.mockClear();
  uploads.pending = [];
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function renderWith(variant: LandingVariant, ...more: LandingVariant[]) {
  const variants = [variant, ...more];
  return render(<LandingEditor page={page} versions={[]} variants={variants} />);
}
async function choose(label: string) {
  const select = screen.getByLabelText("Editing:") as HTMLSelectElement;
  const opt = within(select).getByRole("option", { name: label }) as HTMLOptionElement;
  await act(async () => { fireEvent.change(select, { target: { value: opt.value } }); await vi.advanceTimersByTimeAsync(0); });
}
const flush = () => act(async () => { await vi.advanceTimersByTimeAsync(1000); });

describe("VariantSwitcher", () => {
  it("lists the options under an Editing: label", () => {
    const onChange = vi.fn();
    render(<VariantSwitcher options={[{ id: null, label: "Main page" }, { id: "v1", label: "UAE" }]} value={null} onChange={onChange} />);
    const select = screen.getByLabelText("Editing:") as HTMLSelectElement;
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual(["Main page", "UAE"]);
    fireEvent.change(select, { target: { value: "v1" } });
    expect(onChange).toHaveBeenCalledWith("v1");
  });
});

describe("OverrideBadge", () => {
  it("renders nothing when the field is not edited for this link", () => {
    const { container } = render(<OverrideBadge overridden={false} onReset={() => {}} />);
    expect(container.textContent).toBe("");
  });
  it("shows the badge and a Reset to main button", () => {
    const onReset = vi.fn();
    render(<OverrideBadge overridden onReset={onReset} />);
    expect(screen.getByText("Edited for this link")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /reset to main/i }));
    expect(onReset).toHaveBeenCalled();
  });
});

describe("LandingEditor with links", () => {
  it("hides the switcher when the page has no turned-on links", () => {
    renderWith(mkVariant({ sections: {} }, false));
    expect(screen.queryByLabelText("Editing:")).toBeNull();
  });

  it("main selected: switcher lists main + turned-on links, and the badge never shows", () => {
    renderWith(mkVariant({ sections: { [heroId]: { fields: { headline: "M2" } } } }));
    const select = screen.getByLabelText("Editing:") as HTMLSelectElement;
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual(["Main page", "Module 2"]);
    expect(within(select).queryByRole("option", { name: "Module 3" })).toBeNull();
    expect((screen.getByLabelText("Headline") as HTMLInputElement).value).toBe("Main headline");
    expect(screen.queryByText("Edited for this link")).toBeNull();
  });

  it("switching to Module 2 shows main's values for fields not edited for the link", async () => {
    renderWith(mkVariant());
    await choose("Module 2");
    expect((screen.getByLabelText("Headline") as HTMLInputElement).value).toBe("Main headline");
    expect(screen.queryByText("Edited for this link")).toBeNull();
  });

  it("typing in a link shows the badge and saves only that field to the link", async () => {
    renderWith(mkVariant());
    await choose("Module 2");
    fireEvent.change(screen.getByLabelText("Headline"), { target: { value: "Module 2 only" } });
    expect(screen.getByText("Edited for this link")).toBeTruthy();
    await flush();
    const sent = calls(VARIANT_URL);
    expect(sent).toHaveLength(1);
    const body = JSON.parse(sent[0][1].body);
    expect(body.baseRevision).toBe(3);
    expect(body.overrides.sections).toEqual({ [heroId]: { fields: { headline: "Module 2 only" } } });
    expect(calls(PAGE_URL)).toHaveLength(0);
  });

  it("Reset to main removes just that field", async () => {
    renderWith(mkVariant({ sections: { [heroId]: { fields: { headline: "M2", subheadline: "Sub M2" } } } }));
    await choose("Module 2");
    expect((screen.getByLabelText("Headline") as HTMLInputElement).value).toBe("M2");
    const badges = screen.getAllByRole("button", { name: /reset to main/i });
    expect(badges.length).toBe(2);
    fireEvent.click(badges[0]);
    expect((screen.getByLabelText("Headline") as HTMLInputElement).value).toBe("Main headline");
    await flush();
    const body = JSON.parse(calls(VARIANT_URL)[0][1].body);
    expect(body.overrides.sections[heroId].fields).toEqual({ subheadline: "Sub M2" });
  });

  it("Hide on this link saves hidden:true to the link and leaves the main page unsaved", async () => {
    renderWith(mkVariant());
    await choose("Module 2");
    fireEvent.click(screen.getByRole("checkbox", { name: /hide on this link/i }));
    await flush();
    const body = JSON.parse(calls(VARIANT_URL)[0][1].body);
    expect(body.overrides.sections[heroId].hidden).toBe(true);
    expect(calls(PAGE_URL)).toHaveLength(0);
  });

  it("moving a section on a link saves the link's order", async () => {
    renderWith(mkVariant());
    await choose("Module 2");
    fireEvent.click(screen.getAllByRole("button", { name: /move .* down/i })[0]);
    await flush();
    const body = JSON.parse(calls(VARIANT_URL)[0][1].body);
    expect(body.overrides.order.slice(0, 2)).toEqual([draft.sections[1].id, heroId]);
    expect(calls(PAGE_URL)).toHaveLength(0);
  });

  it("page settings are read-only on a link", async () => {
    renderWith(mkVariant());
    await choose("Module 2");
    fireEvent.click(screen.getByRole("button", { name: /page settings/i }));
    expect(screen.getByText("These apply to all links. Edit them on the main page.")).toBeTruthy();
    // Inside a disabled fieldset: the browser disables every control in it.
    expect((screen.getByLabelText("Register button text") as HTMLInputElement).matches(":disabled")).toBe(true);
  });

  it("lists edits that no longer apply and removes them", async () => {
    renderWith(mkVariant({ sections: { gone: { fields: { headline: "x" } }, [heroId]: { fields: { headline: "M2", nope: 1 } } } }));
    await choose("Module 2");
    expect(screen.getByText("2 edits no longer apply")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^remove$/i }));
    expect(screen.queryByText(/no longer apply/)).toBeNull();
    await flush();
    const body = JSON.parse(calls(VARIANT_URL)[0][1].body);
    expect(body.overrides.sections).toEqual({ [heroId]: { fields: { headline: "M2" } } });
  });

  it("an upload that finishes after switching links is not written to the newly open link or saved anywhere", async () => {
    const other: LandingVariant = { ...mkVariant(), id: "v2", ref: { regionKey: null, moduleKey: "module-3" }, revision: 3 };
    renderWith(mkVariant(), other);
    await choose("Module 2");
    fireEvent.click(screen.getAllByRole("button", { name: "Fake pick file" })[0]);
    await choose("Module 3");
    act(() => uploads.pending[0]("https://example.com/late.jpg"));
    expect(screen.queryByText("Edited for this link")).toBeNull();
    await flush();
    expect(calls(VARIANT_URL)).toHaveLength(0);
    expect(calls("/api/admin/landing-pages/p1/variants/v2")).toHaveLength(0);
    expect(calls(PAGE_URL)).toHaveLength(0);
  });

  it("an upload that finishes after switching back to the main page is dropped", async () => {
    renderWith(mkVariant());
    await choose("Module 2");
    fireEvent.click(screen.getAllByRole("button", { name: "Fake pick file" })[0]);
    await choose("Main page");
    act(() => uploads.pending[0]("https://example.com/late.jpg"));
    await flush();
    expect(calls(VARIANT_URL)).toHaveLength(0);
  });

  it("the preview loads the link's draft", async () => {
    renderWith(mkVariant());
    await choose("Module 2");
    expect((screen.getByTitle("Page preview") as HTMLIFrameElement).getAttribute("src")).toBe("/dashboard/admin/landing-pages/p1/preview?v=module-2");
  });
});

describe("useAutosaveDraft on a link", () => {
  it("PATCHes the given endpoint with { overrides, baseRevision }, and starts over on a new endpoint", async () => {
    fetchMock.mockImplementation(async () => ({ ok: true, status: 200, json: async () => ({ revision: 8 }) }));
    const { result, rerender } = renderHook(
      ({ endpoint, rev }) => useAutosaveDraft<VariantOverrides>({ endpoint, bodyKey: "overrides", initialRevision: rev, delayMs: 100 }),
      { initialProps: { endpoint: "/a", rev: 7 } },
    );
    act(() => result.current.schedule({ sections: {} }));
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(fetchMock.mock.calls[0][0]).toBe("/a");
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ overrides: { sections: {} }, baseRevision: 7 });
    rerender({ endpoint: "/b", rev: 2 });
    act(() => result.current.schedule({ sections: {} }));
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(fetchMock.mock.calls[1][0]).toBe("/b");
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).baseRevision).toBe(2);
  });
  it("a schedule captured before a target change sends to the current target only", async () => {
    const { result, rerender } = renderHook(
      ({ endpoint, rev }) => useAutosaveDraft<VariantOverrides>({ endpoint, bodyKey: "overrides", initialRevision: rev, delayMs: 100 }),
      { initialProps: { endpoint: "/a", rev: 7 } },
    );
    const stale = result.current.schedule;
    rerender({ endpoint: "/b", rev: 2 });
    act(() => stale({ sections: {} }));
    await act(async () => { await vi.advanceTimersByTimeAsync(100); });
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(["/b"]);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).baseRevision).toBe(2);
  });
});

// ---------------------------------------------------------------- Task 11: links panel, add country, link publish

const region = (key: string, label: string, currency: string, accountKeys: string[] = []): RegionDef => ({
  key, label, currency, classTime: "", timezoneLabel: "", accountKeys,
});
const PK = region("PK", "Pakistan", "PKR", ["meezan"]);
const UAE = region("UAE", "UAE", "AED", ["meezan"]);
const ACCOUNTS = [{ key: "meezan", label: "Meezan Bank", kind: "bank" as const, displayText: "PK00 MEZN 0000" }];
const big = {
  ...draft,
  registration: {
    ...draft.registration,
    regions: [PK, UAE],
    defaultRegionKey: "PK",
    options: [
      { key: "full", label: "Full course", kind: "bundle" as const, free: false, waGroupUrl: "", moduleIds: [] },
      { key: "m2", label: "Module 2 only", kind: "module" as const, free: false, waGroupUrl: "", moduleIds: [] },
    ],
    prices: { full: { PK: { amount: 1000 }, UAE: { amount: 50 } } },
  },
  modules: ["module-1", "module-2", "module-3", "module-4"].map((key, i) => ({ key, title: `Module ${i + 1}`, format: "3-Day Workshop", days: 3, optionKey: "" })),
};
const draftPage = { ...page, draft: big };
const livePage = { ...draftPage, status: "published" as const, published: big, publishedAt: "2026-10-03T00:00:00Z" };
// Passes the local publish checklist: one filled-in hero, a description and a Register link.
const ready = {
  ...big, sections: big.sections.slice(0, 1),
  seo: { ...big.seo, description: "A webinar." }, settings: { ...big.settings, registerUrl: "https://example.com/register" },
};
const readyPage = { ...livePage, draft: ready, published: ready };
const LINKS_URL = "/api/admin/landing-pages/p1/variants";
const linkVariant = (over: Partial<LandingVariant> = {}): LandingVariant => ({
  id: "v1", pageId: "p1", ref: { regionKey: "UAE", moduleKey: "module-2" }, enabled: true,
  draft: { sections: {} }, published: null, revision: 3, publishedAt: null, ...over,
});

type Reply = { status?: number; body?: unknown };
let routes: Record<string, (init?: RequestInit) => Reply | Promise<Reply>>;
function useRoutes() {
  fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
    const h = routes[`${init?.method ?? "GET"} ${url}`];
    const r = h ? await h(init) : { body: { revision: 5 } };
    const status = r.status ?? 200;
    return { ok: status < 400, status, json: async () => r.body };
  });
}
const sent = (method: string, url: string) => fetchMock.mock.calls.filter(([u, init]) => u === url && (init?.method ?? "GET") === method);
const bodyOf = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string);

function openLinks() {
  fireEvent.click(screen.getByRole("button", { name: /^links/i }));
  return screen.getByRole("region", { name: "Links" });
}
const row = (panel: HTMLElement, label: string) => within(panel).getByRole("listitem", { name: label });

describe("Links panel", () => {
  beforeEach(() => { routes = {}; useRoutes(); });

  it("shows every possible link (2 countries x 4 modules = 14), all off", () => {
    render(<LandingEditor page={draftPage} versions={[]} variants={[]} accounts={ACCOUNTS} />);
    const panel = openLinks();
    const switches = within(panel).getAllByRole("switch");
    expect(switches).toHaveLength(14);
    expect(switches.every((s) => s.getAttribute("aria-checked") === "false")).toBe(true);
    expect(row(panel, "UAE · Module 2")).toBeTruthy();
  });

  it("a page with one country and no modules gets a friendly empty state", () => {
    const small = { ...page, draft: { ...big, modules: [], registration: { ...big.registration, regions: [PK] } } };
    render(<LandingEditor page={small} versions={[]} variants={[]} accounts={ACCOUNTS} />);
    const panel = openLinks();
    expect(within(panel).getByText("Add a country or module to create more links")).toBeTruthy();
    expect(within(panel).queryAllByRole("switch")).toHaveLength(0);
  });

  it("turning on a new link creates it, and it appears in the Editing: switcher", async () => {
    routes[`POST ${LINKS_URL}`] = () => ({ body: { variant: linkVariant({ id: "v9", ref: { regionKey: "UAE", moduleKey: null } }) } });
    render(<LandingEditor page={draftPage} versions={[]} variants={[]} accounts={ACCOUNTS} />);
    const panel = openLinks();
    await act(async () => { fireEvent.click(within(row(panel, "UAE")).getByRole("switch")); await vi.advanceTimersByTimeAsync(0); });
    const posts = sent("POST", LINKS_URL);
    expect(posts).toHaveLength(1);
    expect(bodyOf(posts[0])).toEqual({ regionKey: "UAE", moduleKey: null, enabled: true });
    expect(within(row(panel, "UAE")).getByRole("switch").getAttribute("aria-checked")).toBe("true");
    const select = screen.getByLabelText("Editing:") as HTMLSelectElement;
    expect(within(select).getAllByRole("option").map((o) => o.textContent)).toEqual(["Main page", "UAE"]);
  });

  it("turning an existing link off and on uses its own switch (PATCH), never a second create", async () => {
    routes[`PATCH ${LINKS_URL}/v1`] = () => ({ body: { ok: true } });
    render(<LandingEditor page={draftPage} versions={[]} variants={[linkVariant()]} accounts={ACCOUNTS} />);
    expect(screen.getByLabelText("Editing:")).toBeTruthy();
    const panel = openLinks();
    const sw = () => within(row(panel, "UAE · Module 2")).getByRole("switch");
    expect(sw().getAttribute("aria-checked")).toBe("true");
    await act(async () => { fireEvent.click(sw()); await vi.advanceTimersByTimeAsync(0); });
    expect(bodyOf(sent("PATCH", `${LINKS_URL}/v1`)[0])).toEqual({ enabled: false });
    expect(sw().getAttribute("aria-checked")).toBe("false");
    expect(screen.queryByLabelText("Editing:")).toBeNull();
    await act(async () => { fireEvent.click(sw()); await vi.advanceTimersByTimeAsync(0); });
    expect(bodyOf(sent("PATCH", `${LINKS_URL}/v1`)[1])).toEqual({ enabled: true });
    expect(sent("POST", LINKS_URL)).toHaveLength(0);
    expect(screen.getByLabelText("Editing:")).toBeTruthy();
  });

  it("Publish is disabled while the main page is not published", () => {
    render(<LandingEditor page={draftPage} versions={[]} variants={[linkVariant()]} accounts={ACCOUNTS} />);
    const btn = within(row(openLinks(), "UAE · Module 2")).getByRole("button", { name: "Publish" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute("title")).toBe("Publish the main page first");
  });

  it("Publish sends the link live, or lists what to fix in plain words", async () => {
    routes[`POST ${LINKS_URL}/v1/publish`] = () => ({ status: 422, body: { error: "x", problems: [{ message: "Nothing is priced for UAE yet." }] } });
    render(<LandingEditor page={livePage} versions={[]} variants={[linkVariant()]} accounts={ACCOUNTS} />);
    const panel = openLinks();
    await act(async () => { fireEvent.click(within(row(panel, "UAE · Module 2")).getByRole("button", { name: "Publish" })); await vi.advanceTimersByTimeAsync(0); });
    expect(within(row(panel, "UAE · Module 2")).getByText("Nothing is priced for UAE yet.")).toBeTruthy();
    routes[`POST ${LINKS_URL}/v1/publish`] = () => ({ body: { ok: true, version: 1 } });
    await act(async () => { fireEvent.click(within(row(panel, "UAE · Module 2")).getByRole("button", { name: "Publish" })); await vi.advanceTimersByTimeAsync(0); });
    expect(sent("POST", `${LINKS_URL}/v1/publish`)).toHaveLength(2);
    expect(within(row(panel, "UAE · Module 2")).getByText("Live")).toBeTruthy();
    expect(within(row(panel, "UAE · Module 2")).queryByText("Nothing is priced for UAE yet.")).toBeNull();
  });

  it("copy puts the full public web address on the clipboard", async () => {
    const writeText = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    render(<LandingEditor page={livePage} versions={[]} variants={[linkVariant()]} accounts={ACCOUNTS} />);
    const r = row(openLinks(), "UAE · Module 2");
    expect(within(r).getByText(`${window.location.origin}/e/w21/uae/module-2`)).toBeTruthy();
    await act(async () => { fireEvent.click(within(r).getByRole("button", { name: /copy/i })); await vi.advanceTimersByTimeAsync(0); });
    expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/e/w21/uae/module-2`);
  });
});

describe("Add a country", () => {
  beforeEach(() => { routes = {}; useRoutes(); });

  async function pickSaudi() {
    const panel = openLinks();
    fireEvent.click(within(panel).getByRole("button", { name: /add a country/i }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Search countries"), { target: { value: "saudi" } });
    fireEvent.click(within(dialog).getByRole("radio", { name: /saudi arabia/i }));
    return { panel, dialog };
  }

  it("prefills the currency and time zone, and refuses a country with no payment account", async () => {
    render(<LandingEditor page={draftPage} versions={[]} variants={[]} accounts={ACCOUNTS} />);
    const { dialog } = await pickSaudi();
    expect((within(dialog).getByLabelText("Currency") as HTMLInputElement).value).toBe("SAR");
    expect((within(dialog).getByLabelText("Time zone name") as HTMLInputElement).value).toBe("Saudi Arabia Time");
    fireEvent.click(within(dialog).getByRole("button", { name: "Add country" }));
    expect(within(dialog).getByRole("alert").textContent).toMatch(/payment account/i);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  const earlyPage = { ...draftPage, draft: { ...big, registration: { ...big.registration, earlyBirdEndsAt: "2026-12-01T00:00:00+05:00" } } };
  function fillSaudi(dialog: HTMLElement) {
    fireEvent.change(within(dialog).getByLabelText("Class time"), { target: { value: "7 – 8 PM" } });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /meezan bank/i }));
    fireEvent.change(within(dialog).getByLabelText("Full course price"), { target: { value: "300" } });
    fireEvent.change(within(dialog).getByLabelText("Module 2 only price"), { target: { value: "120" } });
  }

  it("asks a price for every paid option, and Early Bird only when the page has an Early Bird end date", async () => {
    render(<LandingEditor page={draftPage} versions={[]} variants={[]} accounts={ACCOUNTS} />);
    const { dialog } = await pickSaudi();
    expect(within(dialog).queryByLabelText("Full course Early Bird price")).toBeNull();
    fireEvent.click(within(dialog).getByRole("checkbox", { name: /meezan bank/i }));
    fireEvent.change(within(dialog).getByLabelText("Full course price"), { target: { value: "300" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add country" }));
    expect(within(dialog).getByRole("alert").textContent).toMatch(/Module 2 only/);
    expect(within(dialog).queryByText(/not sold in this country/i)).toBeNull();
  });

  it("refuses an Early Bird price above the regular price", async () => {
    render(<LandingEditor page={earlyPage} versions={[]} variants={[]} accounts={ACCOUNTS} />);
    const { dialog } = await pickSaudi();
    fillSaudi(dialog);
    fireEvent.change(within(dialog).getByLabelText("Full course Early Bird price"), { target: { value: "400" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add country" }));
    expect(within(dialog).getByRole("alert").textContent).toMatch(/Early Bird price of "Full course" is higher/);
  });

  it("does not ask a price for a free option, and offers it in the new country", async () => {
    const withFree = { ...draftPage, draft: { ...big, registration: { ...big.registration, options: [...big.registration.options, { key: "taster", label: "Free taster", kind: "bundle" as const, free: true, waGroupUrl: "", moduleIds: [] }] } } };
    render(<LandingEditor page={withFree} versions={[]} variants={[]} accounts={ACCOUNTS} />);
    const { dialog } = await pickSaudi();
    expect(within(dialog).queryByLabelText("Free taster price")).toBeNull();
    fillSaudi(dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: "Add country" }));
    await flush();
    expect(bodyOf(calls(PAGE_URL)[0]).content.registration.prices.taster.KSA).toEqual({ amount: 0 });
  });

  it("adds the country with its prices to the main page, and its links appear", async () => {
    render(<LandingEditor page={earlyPage} versions={[]} variants={[]} accounts={ACCOUNTS} />);
    const { panel, dialog } = await pickSaudi();
    fillSaudi(dialog);
    fireEvent.change(within(dialog).getByLabelText("Full course Early Bird price"), { target: { value: "250" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Add country" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(within(panel).getAllByRole("switch")).toHaveLength(3 + 4 + 12);
    expect(row(panel, "Saudi Arabia · Module 4")).toBeTruthy();
    await flush();
    const saved = bodyOf(calls(PAGE_URL)[0]).content.registration;
    expect(saved.regions.find((g: RegionDef) => g.key === "KSA")).toEqual({
      key: "KSA", label: "Saudi Arabia", currency: "SAR", classTime: "7 – 8 PM", timezoneLabel: "Saudi Arabia Time", accountKeys: ["meezan"],
    });
    expect(saved.prices.full.KSA).toEqual({ amount: 300, earlyAmount: 250 });
    expect(saved.prices.m2.KSA).toEqual({ amount: 120 });
  });

  it("does not offer a country that is already on the page", async () => {
    render(<LandingEditor page={draftPage} versions={[]} variants={[]} accounts={ACCOUNTS} />);
    fireEvent.click(within(openLinks()).getByRole("button", { name: /add a country/i }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Search countries"), { target: { value: "pakistan" } });
    expect(within(dialog).queryByRole("radio", { name: /pakistan/i })).toBeNull();
  });
});

describe("Publish and checklist act on the open link", () => {
  beforeEach(() => { routes = {}; useRoutes(); });

  it("while the main page is a draft, the top Publish is off for the link", async () => {
    render(<LandingEditor page={draftPage} versions={[]} variants={[linkVariant()]} accounts={ACCOUNTS} />);
    await choose("UAE · Module 2");
    const btn = screen.getByRole("button", { name: "Publish" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute("title")).toBe("Publish the main page first");
  });

  it("the top Publish publishes the open link, and a refusal fills the checklist", async () => {
    routes[`POST ${LINKS_URL}/v1/publish`] = () => ({ status: 422, body: { problems: [{ message: "Module 2 is not linked to a priced registration option." }] } });
    render(<LandingEditor page={readyPage} versions={[]} variants={[linkVariant()]} accounts={ACCOUNTS} />);
    await choose("UAE · Module 2");
    expect((screen.getByRole("button", { name: "Publish" }) as HTMLButtonElement).disabled).toBe(false);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Publish" })); await vi.advanceTimersByTimeAsync(0); });
    expect(sent("POST", `${LINKS_URL}/v1/publish`)).toHaveLength(1);
    expect(sent("POST", "/api/admin/landing-pages/p1/publish")).toHaveLength(0);
    const checklist = screen.getByRole("region", { name: "Publish checklist" });
    expect(within(checklist).getByText("Module 2 is not linked to a priced registration option.")).toBeTruthy();
  });

  it("shows Unpublished changes for the open link, not the main page", async () => {
    const v = linkVariant({ draft: { sections: { [heroId]: { fields: { headline: "M2" } } } }, published: { sections: {} }, publishedAt: "2026-10-04T00:00:00Z" });
    render(<LandingEditor page={livePage} versions={[]} variants={[v]} accounts={ACCOUNTS} />);
    expect(screen.queryByText("Unpublished changes")).toBeNull();
    await choose("UAE · Module 2");
    expect(screen.getByText("Unpublished changes")).toBeTruthy();
  });

  it("a link published as-is (keys in another order) is up to date", async () => {
    const v = linkVariant({
      draft: { sections: { [heroId]: { hidden: true, fields: { headline: "M2" } } } },
      published: { sections: { [heroId]: { fields: { headline: "M2" }, hidden: true } } }, publishedAt: "2026-10-04T00:00:00Z",
    });
    render(<LandingEditor page={readyPage} versions={[]} variants={[v]} accounts={ACCOUNTS} />);
    await choose("UAE · Module 2");
    expect(screen.queryByText("Unpublished changes")).toBeNull();
    expect((screen.getByRole("button", { name: "Published" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("Modules in page settings", () => {
  beforeEach(() => { routes = {}; useRoutes(); });
  const course = (modules = big.modules) => ({ ...page, kind: "course" as const, draft: { ...big, modules } });
  const openSettings = () => fireEvent.click(screen.getByRole("button", { name: /page settings/i }));

  it("is not shown on a webinar page", () => {
    render(<LandingEditor page={draftPage} versions={[]} variants={[]} accounts={ACCOUNTS} />);
    openSettings();
    expect(screen.queryByRole("region", { name: "Modules" })).toBeNull();
  });

  it("adds a module with the next link name and saves its details", async () => {
    render(<LandingEditor page={course([])} versions={[]} variants={[]} accounts={ACCOUNTS} />);
    openSettings();
    const card = screen.getByRole("region", { name: "Modules" });
    fireEvent.click(within(card).getByRole("button", { name: /add module/i }));
    expect((within(card).getByLabelText("Link name") as HTMLInputElement).value).toBe("module-1");
    fireEvent.change(within(card).getByLabelText("Module title"), { target: { value: "Diabetes" } });
    fireEvent.change(within(card).getByLabelText("Format"), { target: { value: "3-Day Workshop" } });
    fireEvent.change(within(card).getByLabelText("Days"), { target: { value: "3" } });
    fireEvent.change(within(card).getByLabelText("Sold as"), { target: { value: "m2" } });
    await flush();
    const saved = bodyOf(calls(PAGE_URL).at(-1)!).content.modules;
    expect(saved).toEqual([{ key: "module-1", title: "Diabetes", format: "3-Day Workshop", days: 3, optionKey: "m2" }]);
  });

  it("refuses a link name a country uses, or one that is not web-address safe", async () => {
    render(<LandingEditor page={course([{ key: "module-1", title: "A", format: "", days: 1, optionKey: "" }])} versions={[]} variants={[]} accounts={ACCOUNTS} />);
    openSettings();
    const card = screen.getByRole("region", { name: "Modules" });
    fireEvent.change(within(card).getByLabelText("Link name"), { target: { value: "uae" } });
    expect(within(card).getByRole("alert").textContent).toMatch(/UAE/);
    fireEvent.change(within(card).getByLabelText("Link name"), { target: { value: "Module 2" } });
    expect(within(card).getByRole("alert").textContent).toMatch(/small letters/);
    await flush();
    expect(calls(PAGE_URL)).toHaveLength(0);
    fireEvent.change(within(card).getByLabelText("Link name"), { target: { value: "diabetes" } });
    expect(within(card).queryByRole("alert")).toBeNull();
    await flush();
    expect(bodyOf(calls(PAGE_URL)[0]).content.modules[0].key).toBe("diabetes");
  });

  it("a module that already has a link keeps its link name", () => {
    const v = linkVariant({ ref: { regionKey: null, moduleKey: "module-1" } });
    render(<LandingEditor page={course([{ key: "module-1", title: "A", format: "", days: 1, optionKey: "" }])} versions={[]} variants={[v]} accounts={ACCOUNTS} />);
    openSettings();
    const card = screen.getByRole("region", { name: "Modules" });
    expect((within(card).getByLabelText("Link name") as HTMLInputElement).readOnly).toBe(true);
  });
});

describe("Version history of the open link", () => {
  beforeEach(() => { routes = {}; useRoutes(); });

  it("lists the link's versions and restores one into the editor", async () => {
    routes[`GET ${LINKS_URL}/v1/versions`] = () => ({ body: { versions: [{ version: 2, createdAt: "2026-10-05T10:00:00Z" }] } });
    routes[`POST ${LINKS_URL}/v1/rollback`] = () => ({ body: { ok: true, version: 3 } });
    routes[`GET ${LINKS_URL}`] = () => ({
      body: { variants: [linkVariant({ draft: { sections: { [heroId]: { fields: { headline: "Restored" } } } }, revision: 9, published: { sections: {} } })] },
    });
    render(<LandingEditor page={livePage} versions={[]} variants={[linkVariant()]} accounts={ACCOUNTS} />);
    await choose("UAE · Module 2");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Versions" })); await vi.advanceTimersByTimeAsync(0); });
    const sheet = screen.getByRole("dialog", { name: "Version history" });
    await act(async () => { fireEvent.click(within(sheet).getByRole("button", { name: "Restore this version" })); await vi.advanceTimersByTimeAsync(0); });
    expect(bodyOf(sent("POST", `${LINKS_URL}/v1/rollback`)[0])).toEqual({ version: 2 });
    expect(sent("POST", "/api/admin/landing-pages/p1/rollback")).toHaveLength(0);
    expect((screen.getByLabelText("Headline") as HTMLInputElement).value).toBe("Restored");
    fireEvent.change(screen.getByLabelText("Headline"), { target: { value: "After restore" } });
    await flush();
    expect(bodyOf(calls(VARIANT_URL).at(-1)!).baseRevision).toBe(9);
  });

  it("restoring waits for a link save that is still on its way", async () => {
    let finishSave: (r: Reply) => void = () => {};
    routes[`PATCH ${VARIANT_URL}`] = () => new Promise<Reply>((resolve) => { finishSave = resolve; });
    routes[`GET ${LINKS_URL}/v1/versions`] = () => ({ body: { versions: [{ version: 2, createdAt: "2026-10-05T10:00:00Z" }] } });
    routes[`POST ${LINKS_URL}/v1/rollback`] = () => ({ body: { ok: true, version: 3 } });
    routes[`GET ${LINKS_URL}`] = () => ({ body: { variants: [linkVariant({ revision: 9 })] } });
    render(<LandingEditor page={livePage} versions={[]} variants={[linkVariant()]} accounts={ACCOUNTS} />);
    await choose("UAE · Module 2");
    fireEvent.change(screen.getByLabelText("Headline"), { target: { value: "Typed" } });
    await flush(); // the save is now in flight
    expect(calls(VARIANT_URL)).toHaveLength(1);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Versions" })); await vi.advanceTimersByTimeAsync(0); });
    await act(async () => {
      fireEvent.click(within(screen.getByRole("dialog", { name: "Version history" })).getByRole("button", { name: "Restore this version" }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(sent("POST", `${LINKS_URL}/v1/rollback`)).toHaveLength(0);
    await act(async () => { finishSave({ body: { revision: 4 } }); await vi.advanceTimersByTimeAsync(0); });
    expect(sent("POST", `${LINKS_URL}/v1/rollback`)).toHaveLength(1);
  });
});

describe("Task 11 fixes", () => {
  beforeEach(() => { routes = {}; useRoutes(); });

  it("a new module never takes the link name of a removed module whose link still exists", () => {
    const old = linkVariant({ ref: { regionKey: null, moduleKey: "module-1" } });
    render(<LandingEditor page={{ ...page, kind: "course" as const, draft: { ...big, modules: [] } }} versions={[]} variants={[old]} accounts={ACCOUNTS} />);
    fireEvent.click(screen.getByRole("button", { name: /page settings/i }));
    const card = screen.getByRole("region", { name: "Modules" });
    fireEvent.click(within(card).getByRole("button", { name: /add module/i }));
    const input = within(card).getByLabelText("Link name") as HTMLInputElement;
    expect(input.value).toBe("module-2");
    expect(input.readOnly).toBe(false);
    fireEvent.change(input, { target: { value: "module-1" } });
    expect(within(card).getByRole("alert").textContent).toMatch(/earlier module/);
  });

  it("a link whose module is not on the live main page yet can't be published until main is published again", async () => {
    const stale = { ...livePage, published: { ...big, modules: big.modules.filter((m) => m.key !== "module-2") } };
    render(<LandingEditor page={stale} versions={[]} variants={[linkVariant()]} accounts={ACCOUNTS} />);
    const btn = within(row(openLinks(), "UAE · Module 2")).getByRole("button", { name: "Publish" }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    expect(btn.getAttribute("title")).toBe("Publish the main page again so it includes Module 2");
    await choose("UAE · Module 2");
    const links = screen.getByRole("region", { name: "Links" });
    const top = screen.getAllByRole("button", { name: "Publish" }).find((b) => !links.contains(b)) as HTMLButtonElement;
    expect(top.disabled).toBe(true);
    expect(top.getAttribute("title")).toBe("Publish the main page again so it includes Module 2");
  });

  it("edits typed while a publish is on its way stay unpublished", async () => {
    let finish: (r: Reply) => void = () => {};
    routes[`POST ${LINKS_URL}/v1/publish`] = () => new Promise<Reply>((resolve) => { finish = resolve; });
    render(<LandingEditor page={readyPage} versions={[]} variants={[linkVariant()]} accounts={ACCOUNTS} />);
    await choose("UAE · Module 2");
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Publish" })); await vi.advanceTimersByTimeAsync(0); });
    expect(sent("POST", `${LINKS_URL}/v1/publish`)).toHaveLength(1);
    fireEvent.change(screen.getByLabelText("Headline"), { target: { value: "Typed during publish" } });
    await act(async () => { finish({ body: { ok: true, version: 1 } }); await vi.advanceTimersByTimeAsync(0); });
    expect(screen.getByText("Unpublished changes")).toBeTruthy();
  });
});
