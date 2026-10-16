import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, renderHook, screen, fireEvent, act, within } from "@testing-library/react";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
const confirmFn = vi.fn(async () => true);
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => confirmFn }));
vi.mock("@/components/admin/program/ImageUploadField", () => ({ ImageUploadField: () => null }));

import { LandingEditor } from "@/components/admin/landing/LandingEditor";
import { useAutosaveDraft } from "@/hooks/useAutosaveDraft";
import { VariantSwitcher } from "@/components/admin/landing/variants/VariantSwitcher";
import { OverrideBadge } from "@/components/admin/landing/variants/OverrideBadge";
import { emptyContent, updateSectionData } from "@/lib/landing/content";
import { buildVariantGrid } from "@/lib/landing/variant-grid";
import type { LandingVariant } from "@/lib/data/landing-variants";
import type { VariantOverrides } from "@/lib/landing/variants";

const base = emptyContent("webinar");
const heroId = base.sections[0].id;
const draft = {
  ...updateSectionData(base, heroId, { ...base.sections[0].data, headline: "Main headline" }),
  modules: [{ key: "module-2", title: "Module 2", format: "3-Day Workshop", days: 3, optionKey: "" }],
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
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

function renderWith(variant: LandingVariant) {
  const variants = [variant];
  return render(<LandingEditor page={page} versions={[]} variants={variants} grid={buildVariantGrid(draft, variants)} />);
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
});
