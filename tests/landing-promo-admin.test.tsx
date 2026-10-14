import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

vi.mock("server-only", () => ({}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }), redirect: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));
const data = vi.hoisted(() => ({
  listPromoCodes: vi.fn(), listLandingPages: vi.fn(), getLandingPage: vi.fn(), requireAdminPage: vi.fn(), listSalesAgents: vi.fn(),
}));
vi.mock("@/lib/data/landing-promo-codes", () => ({ listPromoCodes: data.listPromoCodes }));
vi.mock("@/lib/data/landing-pages", () => ({ listLandingPages: data.listLandingPages, getLandingPage: data.getLandingPage }));
vi.mock("@/lib/data/sales-agents", () => ({ listSalesAgents: data.listSalesAgents }));
vi.mock("@/lib/auth/require-admin", () => ({ requireAdminPage: data.requireAdminPage }));

import { PromoCodesManager } from "@/components/admin/landing/promo/PromoCodesManager";
import { AgentLinksPanel } from "@/components/admin/landing/promo/AgentLinksPanel";
import AdminPromoCodesPage from "@/app/dashboard/admin/landing-promo-codes/page";
import { emptyContent, updateRegistration } from "@/lib/landing/content";
import type { PromoCode } from "@/lib/landing/registration/promo";
import type { PromoPageOption } from "@/lib/landing/registration/promo-form";
import { ppcConfig } from "./fixtures/registration-fixtures";

const PAGES: PromoPageOption[] = [
  { id: "p1", title: "PPC Batch 3", options: [{ key: "full", label: "Full Course" }, { key: "m1", label: "Module 1" }] },
  { id: "p2", title: "Webinar 20", options: [{ key: "pro", label: "Pro Access" }] },
];
const promo = (over: Partial<PromoCode> = {}): PromoCode => ({
  id: "promo-1", code: "PZ10", type: "percent", value: 10, fixedAmounts: {}, maxDiscountPercent: 0, pageIds: [], optionKeys: [],
  maxUses: 50, usedCount: 3, oneperEmail: false, startsAt: null, endsAt: null, active: true, ownerAgentId: null, ...over,
});
const fetchMock = () => fetch as unknown as ReturnType<typeof vi.fn>;
const reply = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body });
const lastBody = () => JSON.parse(String(fetchMock().mock.calls.at(-1)![1].body));

beforeEach(() => {
  refresh.mockReset(); toast.success.mockReset(); toast.error.mockReset();
  for (const f of Object.values(data)) f.mockReset();
  vi.stubGlobal("fetch", vi.fn(async () => reply(201, { id: "promo-9" })));
});
afterEach(() => vi.unstubAllGlobals());

describe("PromoCodesManager list", () => {
  it("shows each code with its discount, scope, uses, dates and state, in both layouts", () => {
    render(<PromoCodesManager codes={[
      promo(),
      promo({ id: "promo-2", code: "MDC500", type: "fixed", value: 0, fixedAmounts: { PKR: 500 }, pageIds: ["p1"], optionKeys: ["full"], maxUses: null, active: false, endsAt: "2026-10-15T18:59:00Z" }),
    ]} pages={PAGES} />);
    const table = screen.getByRole("table", { name: "Promo codes" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(2);
    expect(within(rows[0]).getByText("PZ10")).toBeTruthy();
    expect(within(rows[0]).getByText("10% off")).toBeTruthy();
    expect(within(rows[0]).getByText("All pages")).toBeTruthy();
    expect(within(rows[0]).getByText("3 of 50 used")).toBeTruthy();
    expect(within(rows[0]).getByText("Active")).toBeTruthy();
    expect(within(rows[1]).getByText("PKR 500 off")).toBeTruthy();
    expect(within(rows[1]).getByText("PPC Batch 3 · only Full Course")).toBeTruthy();
    expect(within(rows[1]).getByText(/until 15 oct 2026/i)).toBeTruthy();
    expect(within(rows[1]).getByText("Paused")).toBeTruthy();
    expect(screen.getAllByText("PZ10")).toHaveLength(2);
  });
  it("has an empty state with a create button", () => {
    render(<PromoCodesManager codes={[]} pages={PAGES} />);
    fireEvent.click(screen.getByRole("button", { name: /create your first code/i }));
    expect(screen.getByRole("dialog", { name: "New promo code" })).toBeTruthy();
  });
  it("pauses and resumes a code", async () => {
    fetchMock().mockResolvedValue(reply(200, { id: "promo-1" }));
    render(<PromoCodesManager codes={[promo()]} pages={PAGES} />);
    const table = screen.getByRole("table", { name: "Promo codes" });
    fireEvent.click(within(table).getByRole("button", { name: "Pause PZ10" }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock().mock.calls[0][0]).toBe("/api/admin/landing-promo-codes/promo-1");
    expect(fetchMock().mock.calls[0][1].method).toBe("PATCH");
    expect(lastBody()).toEqual({ active: false });
    expect(toast.success).toHaveBeenCalledWith("PZ10 paused.");
  });
});

describe("PromoCodesManager form", () => {
  it("creates a percent code limited to one page and one option", async () => {
    render(<PromoCodesManager codes={[promo()]} pages={PAGES} />);
    fireEvent.click(screen.getByRole("button", { name: /new promo code/i }));
    const dialog = screen.getByRole("dialog", { name: "New promo code" });
    fireEvent.change(within(dialog).getByLabelText("Code"), { target: { value: "ppc 20" } });
    expect((within(dialog).getByLabelText("Code") as HTMLInputElement).value).toBe("PPC20");
    fireEvent.change(within(dialog).getByLabelText("Percent off"), { target: { value: "20" } });
    fireEvent.click(within(dialog).getByRole("radio", { name: "Only these pages" }));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "PPC Batch 3" }));
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "Full Course · PPC Batch 3" }));
    fireEvent.change(within(dialog).getByLabelText("Total uses"), { target: { value: "100" } });
    fireEvent.click(within(dialog).getByRole("checkbox", { name: "One use per email address" }));
    fireEvent.change(within(dialog).getByLabelText("Ends"), { target: { value: "2026-10-15T23:59" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create code" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("PPC20 created."));
    expect(fetchMock().mock.calls[0][0]).toBe("/api/admin/landing-promo-codes");
    expect(fetchMock().mock.calls[0][1].method).toBe("POST");
    expect(lastBody()).toEqual({
      code: "PPC20", type: "percent", value: 20, fixedAmounts: {}, maxDiscountPercent: 0, pageIds: ["p1"], optionKeys: ["full"],
      maxUses: 100, oneperEmail: true, startsAt: null, endsAt: "2026-10-15T18:59:00.000Z", active: true, ownerAgentId: null,
    });
    expect(refresh).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
  it("shows field problems without calling the server", () => {
    render(<PromoCodesManager codes={[]} pages={PAGES} />);
    fireEvent.click(screen.getByRole("button", { name: /create your first code/i }));
    const dialog = screen.getByRole("dialog", { name: "New promo code" });
    fireEvent.click(within(dialog).getByRole("radio", { name: "Fixed amount off" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Create code" }));
    expect(within(dialog).getByText(/use 2 to 40 capital letters/i)).toBeTruthy();
    expect(within(dialog).getByText(/enter the discount for at least one currency/i)).toBeTruthy();
    expect(fetchMock()).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(within(dialog).getByLabelText("Code"));
  });
  it("puts a duplicate-code answer on the Code field", async () => {
    fetchMock().mockResolvedValue(reply(409, { error: "A promo code with this name already exists." }));
    render(<PromoCodesManager codes={[]} pages={PAGES} />);
    fireEvent.click(screen.getByRole("button", { name: /create your first code/i }));
    const dialog = screen.getByRole("dialog", { name: "New promo code" });
    fireEvent.change(within(dialog).getByLabelText("Code"), { target: { value: "PZ10" } });
    fireEvent.change(within(dialog).getByLabelText("Percent off"), { target: { value: "10" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create code" }));
    expect(await within(dialog).findByText("A promo code with this name already exists.")).toBeTruthy();
    expect(within(dialog).getByLabelText("Code").getAttribute("aria-invalid")).toBe("true");
  });
  it("edits a code without renaming it and sends only the editable fields", async () => {
    fetchMock().mockResolvedValue(reply(200, { id: "promo-1" }));
    render(<PromoCodesManager codes={[promo({ ownerAgentId: "agent-1" })]} pages={PAGES} />);
    const table = screen.getByRole("table", { name: "Promo codes" });
    fireEvent.click(within(table).getByRole("button", { name: "Edit PZ10" }));
    const dialog = screen.getByRole("dialog", { name: "Edit PZ10" });
    expect((within(dialog).getByLabelText("Code") as HTMLInputElement).readOnly).toBe(true);
    fireEvent.change(within(dialog).getByLabelText("Percent off"), { target: { value: "15" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("PZ10 saved."));
    expect(fetchMock().mock.calls[0][0]).toBe("/api/admin/landing-promo-codes/promo-1");
    expect(fetchMock().mock.calls[0][1].method).toBe("PATCH");
    const body = lastBody();
    expect(body).toMatchObject({ type: "percent", value: 15, maxUses: 50 });
    expect(body).not.toHaveProperty("code");
    expect(body).not.toHaveProperty("ownerAgentId");
  });
  it("puts a server validation answer on the field it names", async () => {
    fetchMock().mockResolvedValue(reply(400, { error: "Use 3-letter currency codes such as PKR.", field: "fixedAmounts.rupees" }));
    render(<PromoCodesManager codes={[]} pages={PAGES} />);
    fireEvent.click(screen.getByRole("button", { name: /create your first code/i }));
    const dialog = screen.getByRole("dialog", { name: "New promo code" });
    fireEvent.change(within(dialog).getByLabelText("Code"), { target: { value: "ZZFIX" } });
    fireEvent.click(within(dialog).getByRole("radio", { name: "Fixed amount off" }));
    fireEvent.change(within(dialog).getByLabelText("Amount off in PKR"), { target: { value: "500" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create code" }));
    expect(await within(dialog).findByText("Use 3-letter currency codes such as PKR.")).toBeTruthy();
    expect(toast.error).not.toHaveBeenCalled();
  });
  it("ties error and help text to their fields with aria-describedby", () => {
    const refs = (el: HTMLElement) => (el.getAttribute("aria-describedby") ?? "").split(" ").filter(Boolean).map((id) => document.getElementById(id));
    render(<PromoCodesManager codes={[]} pages={PAGES} />);
    fireEvent.click(screen.getByRole("button", { name: /create your first code/i }));
    const dialog = screen.getByRole("dialog", { name: "New promo code" });
    fireEvent.click(within(dialog).getByRole("radio", { name: "Fixed amount off" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Create code" }));
    const code = within(dialog).getByLabelText("Code");
    const codeErr = refs(code).find((e) => e?.getAttribute("role") === "alert");
    expect(codeErr?.textContent).toMatch(/use 2 to 40 capital letters/i);
    expect(refs(code)).toHaveLength(2);
    const pkr = within(dialog).getByLabelText("Amount off in PKR");
    const usd = within(dialog).getByLabelText("Amount off in USD");
    const shared = refs(pkr).find((e) => e?.getAttribute("role") === "alert");
    expect(shared?.textContent).toMatch(/at least one currency/i);
    expect(refs(usd).map((e) => e?.id)).toEqual(refs(pkr).map((e) => e?.id));
    expect(refs(within(dialog).getByLabelText("Total uses"))[0]?.textContent).toMatch(/counts once/i);
  });
  it("points the read-only Code field at its help text", () => {
    render(<PromoCodesManager codes={[promo()]} pages={PAGES} />);
    fireEvent.click(within(screen.getByRole("table", { name: "Promo codes" })).getByRole("button", { name: "Edit PZ10" }));
    const code = within(screen.getByRole("dialog", { name: "Edit PZ10" })).getByLabelText("Code");
    const help = document.getElementById(code.getAttribute("aria-describedby") ?? "");
    expect(help?.textContent).toMatch(/can't be renamed/i);
  });
  it("reports a server error and keeps the form open", async () => {
    fetchMock().mockResolvedValue(reply(500, { error: "Could not save the promo code." }));
    render(<PromoCodesManager codes={[]} pages={PAGES} />);
    fireEvent.click(screen.getByRole("button", { name: /create your first code/i }));
    const dialog = screen.getByRole("dialog", { name: "New promo code" });
    fireEvent.change(within(dialog).getByLabelText("Code"), { target: { value: "PZ10" } });
    fireEvent.change(within(dialog).getByLabelText("Percent off"), { target: { value: "10" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "Create code" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Could not save the promo code."));
    expect(screen.getByRole("dialog", { name: "New promo code" })).toBeTruthy();
  });
});

describe("AgentLinksPanel", () => {
  const AGENTS = [{ id: "agent-1", name: "Ayesha Siddiqui" }, { id: "agent-2", name: "Bilal Khan" }];
  const LINK_PAGES = [{ slug: "ppc-b4", title: "PPC Batch 4" }, { slug: "w21", title: "Webinar 21" }];
  const shareField = () => screen.queryByLabelText("Share link") as HTMLInputElement | null;

  it("generates the chosen agent's code and shows the share link for the chosen page", async () => {
    fetchMock().mockResolvedValue(reply(200, { code: "bilal-7k2" }));
    render(<AgentLinksPanel agents={AGENTS} pages={LINK_PAGES} />);
    expect(screen.getByRole("heading", { level: 2, name: "Agent links" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Sales agent"), { target: { value: "agent-2" } });
    fireEvent.change(screen.getByLabelText("Page"), { target: { value: "w21" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate link" }));
    await waitFor(() => expect(shareField()).not.toBeNull());
    expect(shareField()!.value).toBe(`${window.location.origin}/e/w21?ref=bilal-7k2`);
    expect(shareField()!.readOnly).toBe(true);
    expect(fetchMock().mock.calls[0][0]).toBe("/api/admin/landing-agent-links");
    expect(fetchMock().mock.calls[0][1].method).toBe("POST");
    expect(lastBody()).toEqual({ agentId: "agent-2" });
    // The code belongs to the agent, not the page: switching the page only rewrites the link.
    fireEvent.change(screen.getByLabelText("Page"), { target: { value: "ppc-b4" } });
    expect(shareField()!.value).toBe(`${window.location.origin}/e/ppc-b4?ref=bilal-7k2`);
    // Another agent needs their own code: the old link disappears until it is generated.
    fireEvent.change(screen.getByLabelText("Sales agent"), { target: { value: "agent-1" } });
    expect(shareField()).toBeNull();
  });
  it("copies the link", async () => {
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    fetchMock().mockResolvedValue(reply(200, { code: "ayesha-7k2" }));
    render(<AgentLinksPanel agents={AGENTS} pages={LINK_PAGES} />);
    fireEvent.click(screen.getByRole("button", { name: "Generate link" }));
    await waitFor(() => expect(shareField()).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Copy share link" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/e/ppc-b4?ref=ayesha-7k2`));
    expect(toast.success).toHaveBeenCalledWith("Link copied.");
  });
  it("does not claim success when the clipboard and the fallback both fail", async () => {
    Object.defineProperty(navigator, "clipboard", { value: { writeText: vi.fn(async () => { throw new Error("denied"); }) }, configurable: true });
    (document as unknown as { execCommand: () => boolean }).execCommand = () => false;
    fetchMock().mockResolvedValue(reply(200, { code: "ayesha-7k2" }));
    render(<AgentLinksPanel agents={AGENTS} pages={LINK_PAGES} />);
    fireEvent.click(screen.getByRole("button", { name: "Generate link" }));
    await waitFor(() => expect(shareField()).not.toBeNull());
    fireEvent.click(screen.getByRole("button", { name: "Copy share link" }));
    expect(await screen.findByText("Couldn't copy, press and hold to copy")).toBeTruthy();
    expect(toast.success).not.toHaveBeenCalled();
  });
  it("shows the server's refusal and no link", async () => {
    fetchMock().mockResolvedValue(reply(422, { error: "Links can only be made for sales agents.", field: "agentId" }));
    render(<AgentLinksPanel agents={AGENTS} pages={LINK_PAGES} />);
    fireEvent.click(screen.getByRole("button", { name: "Generate link" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Links can only be made for sales agents."));
    expect(shareField()).toBeNull();
  });
  it("explains when there are no sales agents or no published pages", () => {
    const { unmount } = render(<AgentLinksPanel agents={[]} pages={LINK_PAGES} />);
    expect(screen.getByText(/no sales agents yet/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Generate link" })).toBeNull();
    unmount();
    render(<AgentLinksPanel agents={AGENTS} pages={[]} />);
    expect(screen.getByText(/publish a landing page first/i)).toBeTruthy();
  });
});

describe("/dashboard/admin/landing-promo-codes page", () => {
  it("is admin-only and lists codes with each page's options, plus the agent links section", async () => {
    data.requireAdminPage.mockResolvedValue({ user: { id: "admin-user" }, supabase: {} });
    data.listPromoCodes.mockResolvedValue([promo()]);
    data.listSalesAgents.mockResolvedValue([{ id: "agent-1", fullName: "Ayesha Siddiqui", email: "a@pz.test", createdAt: "2026-09-01T00:00:00Z", contactCount: 4 }]);
    data.listLandingPages.mockResolvedValue([
      { id: "p1", slug: "ppc", kind: "course", title: "PPC Batch 3", status: "draft", revision: 1, publishedAt: null, updatedAt: "2026-10-01T00:00:00Z", hasUnpublishedChanges: true },
      { id: "p2", slug: "w21", kind: "webinar", title: "Webinar 21", status: "published", revision: 2, publishedAt: "2026-10-02T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z", hasUnpublishedChanges: false },
    ]);
    data.getLandingPage.mockImplementation(async (id: string) => (id === "p1"
      ? { id: "p1", slug: "ppc", kind: "course", title: "PPC Batch 3", status: "draft", draft: updateRegistration(emptyContent("course"), ppcConfig), published: null, revision: 1, publishedAt: null, createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-01T00:00:00Z" }
      : { id: "p2", slug: "w21", kind: "webinar", title: "Webinar 21", status: "published", draft: emptyContent("webinar"), published: emptyContent("webinar"), revision: 2, publishedAt: "2026-10-02T00:00:00Z", createdAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z" }));
    render(await AdminPromoCodesPage());
    expect(data.requireAdminPage).toHaveBeenCalled();
    expect(data.listSalesAgents).toHaveBeenCalled();
    expect(screen.getByRole("heading", { level: 1, name: "Promo Codes" })).toBeTruthy();
    expect(screen.getAllByText("PZ10").length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { level: 2, name: "Agent links" })).toBeTruthy();
    expect(within(screen.getByLabelText("Sales agent")).getByRole("option", { name: "Ayesha Siddiqui" })).toBeTruthy();
    // Only published pages can carry a working link.
    expect(within(screen.getByLabelText("Page")).getAllByRole("option").map((o) => o.textContent)).toEqual(["Webinar 21"]);
    fireEvent.click(screen.getByRole("button", { name: /new promo code/i }));
    const dialog = screen.getByRole("dialog", { name: "New promo code" });
    expect(within(dialog).getByRole("checkbox", { name: "Module 1 · PPC Batch 3" })).toBeTruthy();
  });
});
