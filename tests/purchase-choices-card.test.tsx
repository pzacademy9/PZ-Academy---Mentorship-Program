// tests/purchase-choices-card.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import { PurchaseChoicesCard } from "@/components/admin/registrations/PurchaseChoicesCard";
import type { ChoiceOverview } from "@/lib/landing/registration/choice-types";

const PAGE = "11111111-1111-4111-8111-111111111111";
const HREF = "/dashboard/admin/landing-pages/" + PAGE;
const A = "Live - Module 1 - Individual";
const B = "Live - Something odd";

const OPTIONS = [
  { key: "full", label: "Full Course", kind: "bundle" as const, moduleIds: [] },
  { key: "m1", label: "Module 1", kind: "module" as const, moduleIds: ["a"] },
  { key: "m2", label: "Module 2", kind: "module" as const, moduleIds: ["b"] },
];
const GA = { label: A, mode: "live" as const, count: 24, paidCount: 20, suggestedKeys: ["m1"], confident: true };
const GB = { label: B, mode: "live" as const, count: 134, paidCount: 130, suggestedKeys: [], confident: false };
const OVERVIEW: ChoiceOverview = { hasOptions: true, options: OPTIONS, groups: [GA, GB] };
const EMPTY: ChoiceOverview = { hasOptions: true, options: OPTIONS, groups: [] };
const NO_OPTIONS: ChoiceOverview = { hasOptions: false, options: [], groups: [GA, GB] };

const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;

let fetchMock: ReturnType<typeof vi.fn>;
let getBody: ChoiceOverview;
let postResponse: () => Response;
const posts = () => fetchMock.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === "POST");

beforeEach(() => {
  getBody = OVERVIEW;
  postResponse = () => json({ updated: 24, queued: 20 });
  fetchMock = vi.fn(async (_url: string, init?: RequestInit) => (init?.method === "POST" ? postResponse() : json(getBody)));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const renderCard = () => render(<PurchaseChoicesCard pageId={PAGE} registrationSetupHref={HREF} />);
const row = (label: string) => screen.getByRole("group", { name: label });

describe("PurchaseChoicesCard", () => {
  it("shows nothing when there are no unmatched labels", async () => {
    getBody = EMPTY;
    const { container } = renderCard();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 10));
    expect(container.textContent).toBe("");
  });

  it("shows the amber notice with the total held", async () => {
    renderCard();
    const notice = await screen.findByRole("status");
    expect(notice.textContent).toContain("150 paid people have no recorded choice");
    expect(notice.textContent).toContain("158 people in all");
  });

  it("does not repeat the number when paid equals total, and never says 0 paid people", async () => {
    getBody = { ...OVERVIEW, groups: [{ ...GA, paidCount: 24 }] };
    const { unmount } = renderCard();
    const n1 = await screen.findByRole("status");
    expect(n1.textContent).toContain("24 paid people have no recorded choice");
    expect(n1.textContent).not.toContain("in all");
    unmount();
    getBody = { ...OVERVIEW, groups: [{ ...GA, paidCount: 0 }] };
    renderCard();
    const n2 = await screen.findByRole("status");
    expect(n2.textContent).not.toContain("0 paid");
    expect(n2.textContent).toContain("24 people have no recorded choice");
  });

  it("ignores suggested keys that are not page options", async () => {
    getBody = { ...OVERVIEW, groups: [{ ...GA, suggestedKeys: ["ghost"] }] };
    renderCard();
    await screen.findByRole("group", { name: A });
    expect((within(row(A)).getByRole("button", { name: "Apply" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("after Apply, focus moves to the Saved line", async () => {
    renderCard();
    await screen.findByRole("group", { name: A });
    getBody = { ...OVERVIEW, groups: [GB] };
    fireEvent.click(within(row(A)).getByRole("button", { name: "Apply" }));
    const dlg = await screen.findByRole("dialog");
    fireEvent.click(within(dlg).getByRole("button", { name: "Apply to 24 people" }));
    const line = await screen.findByText("Saved for 24 people");
    await waitFor(() => expect(document.activeElement).toBe(line));
  });

  it("shows a calm line when the reload after Apply fails", async () => {
    renderCard();
    await screen.findByRole("group", { name: A });
    fetchMock.mockImplementation(async (_u: string, init?: RequestInit) =>
      init?.method === "POST" ? json({ updated: 24, queued: 20 }) : json({ error: "x" }, 500),
    );
    fireEvent.click(within(row(A)).getByRole("button", { name: "Apply" }));
    const dlg = await screen.findByRole("dialog");
    fireEvent.click(within(dlg).getByRole("button", { name: "Apply to 24 people" }));
    await screen.findByText("Saved for 24 people");
    expect((await screen.findByText(/could not refresh/i)).textContent).toMatch(/saved/);
  });

  it("renders one row per label with the label, count chip and mode chip", async () => {
    renderCard();
    await screen.findByRole("group", { name: A });
    const r = row(A);
    expect(within(r).getByText("24 people")).toBeTruthy();
    expect(within(r).getByText("Live")).toBeTruthy();
    expect(screen.getAllByRole("group")).toHaveLength(2);
  });

  it("pre-selects the suggested options and shows a Suggested chip only when confident", async () => {
    renderCard();
    await screen.findByRole("group", { name: A });
    const a = row(A);
    expect((within(a).getByLabelText("Module 1") as HTMLInputElement).checked).toBe(true);
    expect((within(a).getByLabelText("Module 2") as HTMLInputElement).checked).toBe(false);
    expect(within(a).getByText("Suggested")).toBeTruthy();
    expect(within(row(B)).queryByText("Suggested")).toBeNull();
  });

  it("Apply is disabled until at least one option is chosen", async () => {
    renderCard();
    await screen.findByRole("group", { name: B });
    const odd = row(B);
    const apply = within(odd).getByRole("button", { name: "Apply" }) as HTMLButtonElement;
    expect(apply.disabled).toBe(true);
    fireEvent.click(within(odd).getByLabelText("Full Course"));
    expect(apply.disabled).toBe(false);
  });

  it("Apply opens the confirm dialog with the count and Nobody is emailed", async () => {
    renderCard();
    await screen.findByRole("group", { name: A });
    fireEvent.click(within(row(A)).getByRole("button", { name: "Apply" }));
    const dlg = await screen.findByRole("dialog");
    expect(dlg.textContent).toContain("Apply to 24 people?");
    expect(dlg.textContent).toContain("Nobody is emailed.");
    expect(posts()).toHaveLength(0);
  });

  it("Cancel posts nothing", async () => {
    renderCard();
    await screen.findByRole("group", { name: A });
    fireEvent.click(within(row(A)).getByRole("button", { name: "Apply" }));
    const dlg = await screen.findByRole("dialog");
    fireEvent.click(within(dlg).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(posts()).toHaveLength(0);
  });

  it("Confirm posts the choice and then shows the row as Saved with the people count", async () => {
    renderCard();
    await screen.findByRole("group", { name: A });
    getBody = { ...OVERVIEW, groups: [GB] };
    fireEvent.click(within(row(A)).getByRole("button", { name: "Apply" }));
    const dlg = await screen.findByRole("dialog");
    fireEvent.click(within(dlg).getByRole("button", { name: "Apply to 24 people" }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    const [url, init] = posts()[0];
    expect(String(url)).toBe("/api/admin/landing/portal/choices");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ pageId: PAGE, label: A, optionKeys: ["m1"] });
    await waitFor(() => expect(within(row(A)).getByText("Saved for 24 people")).toBeTruthy());
    expect(within(row(A)).queryByRole("button", { name: "Apply" })).toBeNull();
  });

  it("shows a 409 message from the server calmly", async () => {
    postResponse = () => json({ error: "Those options changed. Reload and try again." }, 409);
    renderCard();
    await screen.findByRole("group", { name: A });
    fireEvent.click(within(row(A)).getByRole("button", { name: "Apply" }));
    const dlg = await screen.findByRole("dialog");
    fireEvent.click(within(dlg).getByRole("button", { name: "Apply to 24 people" }));
    const alert = await within(dlg).findByRole("alert");
    expect(alert.textContent).toBe("Those options changed. Reload and try again.");
  });

  it("with no options set up it shows the link and no Apply buttons", async () => {
    getBody = NO_OPTIONS;
    renderCard();
    const link = await screen.findByRole("link", { name: /registration page/i });
    expect(link.getAttribute("href")).toBe(HREF);
    expect(screen.getByText("Set up purchase options on the registration page first")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Apply" })).toBeNull();
  });

  it("Escape closes the confirm dialog and focus returns to the Apply button", async () => {
    renderCard();
    await screen.findByRole("group", { name: A });
    const apply = within(row(A)).getByRole("button", { name: "Apply" });
    apply.focus();
    fireEvent.click(apply);
    const dlg = await screen.findByRole("dialog");
    fireEvent.keyDown(dlg, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(apply));
  });

  it("a stale list response cannot overwrite a newer one", async () => {
    const NEWER = { ...GB, label: "Newer label" };
    let gets = 0;
    let slow: ((r: Response) => void) | null = null;
    fetchMock.mockImplementation((_u: string, init?: RequestInit) => {
      if (init?.method === "POST") return Promise.resolve(json({ updated: 1, queued: 0 }));
      gets += 1;
      if (gets === 1) return Promise.resolve(json(OVERVIEW));
      if (gets === 2) return new Promise<Response>((res) => { slow = res; });
      return Promise.resolve(json({ ...OVERVIEW, groups: [NEWER] }));
    });
    renderCard();
    await screen.findByRole("group", { name: A });
    for (const label of [A, B]) {
      if (label === B) fireEvent.click(within(row(B)).getByLabelText("Full Course"));
      fireEvent.click(within(row(label)).getByRole("button", { name: "Apply" }));
      const dlg = await screen.findByRole("dialog");
      fireEvent.click(within(dlg).getByRole("button", { name: /^Apply to / }));
      await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    }
    await screen.findByRole("group", { name: "Newer label" });
    slow!(json({ ...OVERVIEW, groups: [] }));
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.getByRole("group", { name: "Newer label" })).toBeTruthy();
  });

  it("Confirm cannot be pressed twice while busy", async () => {
    fetchMock.mockImplementation((_u: string, init?: RequestInit) =>
      init?.method === "POST" ? new Promise<Response>(() => {}) : Promise.resolve(json(OVERVIEW)),
    );
    renderCard();
    await screen.findByRole("group", { name: A });
    fireEvent.click(within(row(A)).getByRole("button", { name: "Apply" }));
    const dlg = await screen.findByRole("dialog");
    const confirm = within(dlg).getByRole("button", { name: "Apply to 24 people" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect((within(dlg).getByRole("button", { name: "Applying…" }) as HTMLButtonElement).disabled).toBe(true);
    expect(posts()).toHaveLength(1);
  });
});
