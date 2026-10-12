import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";

const push = vi.fn();
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));
const { toastError, confirmFn } = vi.hoisted(() => ({ toastError: vi.fn(), confirmFn: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: toastError } }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => confirmFn }));

import { LandingPagesList } from "@/components/admin/landing/LandingPagesList";
import { validateSlug } from "@/lib/landing/slug";
import { NewPageDialog } from "@/components/admin/landing/NewPageDialog";
import { DuplicatePageDialog } from "@/components/admin/landing/DuplicatePageDialog";

const pages = [
  { id: "a", slug: "ppc-b3", kind: "course" as const, title: "PPC Batch 3", status: "published" as const, revision: 3, publishedAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z", hasUnpublishedChanges: true },
  { id: "b", slug: "w21", kind: "webinar" as const, title: "Webinar 21", status: "draft" as const, revision: 1, publishedAt: null, updatedAt: "2026-10-02T00:00:00Z", hasUnpublishedChanges: true },
];
const closedPage = { id: "c", slug: "mdc-b2", kind: "workshop" as const, title: "MDC Batch 2", status: "closed" as const, revision: 2, publishedAt: "2026-09-01T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z", hasUnpublishedChanges: false };

beforeEach(() => { push.mockReset(); refresh.mockReset(); toastError.mockReset(); confirmFn.mockReset(); confirmFn.mockResolvedValue(true); vi.stubGlobal("fetch", vi.fn()); });

describe("LandingPagesList", () => {
  it("shows status badges; chip and View live appear only for the live page, in both layouts", () => {
    const { container } = render(<LandingPagesList pages={pages} />);
    const table = screen.getByRole("table");
    const cards = container.querySelector("ul") as HTMLElement;
    for (const scope of [table, cards]) {
      const rows = Array.from(scope.querySelectorAll(scope === table ? "tbody tr" : ":scope > li")) as HTMLElement[];
      expect(rows).toHaveLength(2);
      const [live, draft] = rows;
      expect(within(live).getByText("Live")).toBeTruthy();
      expect(within(live).getAllByText(/unpublished changes/i)).toHaveLength(1);
      expect(within(live).getAllByRole("link", { name: /view live/i })).toHaveLength(1);
      expect(within(draft).getByText("Draft")).toBeTruthy();
      expect(within(draft).queryByText(/unpublished changes/i)).toBeNull();
      expect(within(draft).queryByRole("link", { name: /view live/i })).toBeNull();
    }
    expect(screen.getAllByText(/unpublished changes/i)).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: /view live/i })).toHaveLength(2);
  });
  it("formats dates in the fixed Karachi zone (20:00Z on 2 Oct is 3 Oct)", () => {
    render(<LandingPagesList pages={[{ ...pages[1], updatedAt: "2026-10-02T20:00:00Z" }]} />);
    expect(screen.getAllByText(/3 Oct 2026/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/2 Oct 2026/)).toBeNull();
  });
  it("shows exact count tiles, an honest traffic stub, disabled tabs and a showing footer", () => {
    render(<LandingPagesList pages={[...pages, closedPage]} />);
    expect(screen.getByText("Analytics coming soon")).toBeTruthy();
    expect(screen.getByText("Showing 3 of 3 pages")).toBeTruthy();
    const tabs = screen.getAllByRole("tab");
    expect(tabs).toHaveLength(3);
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    expect(tabs[1].getAttribute("aria-disabled")).toBe("true");
    expect(tabs[2].getAttribute("aria-disabled")).toBe("true");
    expect(within(tabs[1]).getByText("Coming soon")).toBeTruthy();
    const total = screen.getByText("Total pages").parentElement as HTMLElement;
    expect(within(total).getByText("3")).toBeTruthy();
  });
  it("does not call the status route when the confirm is declined", async () => {
    confirmFn.mockResolvedValue(false);
    render(<LandingPagesList pages={pages} />);
    fireEvent.click(screen.getAllByRole("button", { name: /close registration/i })[0]);
    await waitFor(() => expect(confirmFn).toHaveBeenCalled());
    expect(fetch).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
  it("tells the user when the status request fails to reach the server", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockRejectedValue(new TypeError("network"));
    render(<LandingPagesList pages={pages} />);
    fireEvent.click(screen.getAllByRole("button", { name: /close registration/i })[0]);
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("Could not reach the server. Please try again."));
    expect(refresh).not.toHaveBeenCalled();
  });
  it("shows an empty state with a create button when there are no pages", () => {
    render(<LandingPagesList pages={[]} />);
    expect(screen.getAllByRole("button", { name: /new page|create your first page/i }).length).toBeGreaterThan(0);
  });
  it("closes registration through the status route and refreshes", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    render(<LandingPagesList pages={pages} />);
    fireEvent.click(screen.getAllByRole("button", { name: /close registration/i })[0]);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/admin/landing-pages/a/status");
    expect(JSON.parse(init.body)).toEqual({ status: "closed" });
  });
  it("offers Reopen registration for closed pages and posts published", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    render(<LandingPagesList pages={[closedPage]} />);
    expect(screen.queryByRole("button", { name: /close registration/i })).toBeNull();
    fireEvent.click(screen.getAllByRole("button", { name: /reopen registration/i })[0]);
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/admin/landing-pages/c/status");
    expect(JSON.parse(init.body)).toEqual({ status: "published" });
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
    expect(screen.getByRole("alert").textContent).toBe(validateSlug("").ok ? "" : (validateSlug("") as { message: string }).message);
  });
  it("clears the server error when the name or the link is edited", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: "A page with that link already exists." }) });
    render(<NewPageDialog open onOpenChange={() => {}} />);
    fireEvent.change(screen.getByLabelText(/page name/i), { target: { value: "PPC Batch 3" } });
    fireEvent.click(screen.getByRole("button", { name: /create page/i }));
    await waitFor(() => expect(screen.getByText(/already exists/i)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /change/i }));
    fireEvent.change(screen.getByLabelText(/link ending/i), { target: { value: "ppc-batch-9" } });
    expect(screen.queryByText(/already exists/i)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /create page/i }));
    await waitFor(() => expect(screen.getByText(/already exists/i)).toBeTruthy());
    fireEvent.change(screen.getByLabelText(/page name/i), { target: { value: "PPC Batch 9" } });
    expect(screen.queryByText(/already exists/i)).toBeNull();
  });
  it("shows the stale-dates helper only when a seeded template is chosen, and sends templateId", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: "n2" }) });
    render(<NewPageDialog open onOpenChange={() => {}} />);
    const helper = /come from the original page/i;
    expect(screen.queryByText(helper)).toBeNull();
    fireEvent.change(screen.getByLabelText(/start from/i), { target: { value: "ppc-batch-3" } });
    expect(screen.getByText(helper)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/start from/i), { target: { value: "blank-course" } });
    expect(screen.queryByText(helper)).toBeNull();
    fireEvent.change(screen.getByLabelText(/start from/i), { target: { value: "ppc-batch-3" } });
    fireEvent.change(screen.getByLabelText(/page name/i), { target: { value: "PPC Batch 4" } });
    fireEvent.click(screen.getByRole("button", { name: /create page/i }));
    await waitFor(() => expect(push).toHaveBeenCalled());
    expect(JSON.parse((fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body)).toMatchObject({ kind: "course", templateId: "ppc-batch-3" });
  });
  it("only lists templates for the chosen kind", () => {
    render(<NewPageDialog open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole("radio", { name: /webinar/i }));
    const opts = Array.from((screen.getByLabelText(/start from/i) as HTMLSelectElement).options).map((o) => o.value);
    expect(opts).toEqual(["blank-webinar", "w20-diabetes"]);
  });
});

describe("DuplicatePageDialog", () => {
  it("prefills the name, posts to duplicate and opens the editor on 201", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true, status: 201, json: async () => ({ id: "dup1" }) });
    render(<DuplicatePageDialog page={pages[0]} open onOpenChange={() => {}} />);
    expect((screen.getByLabelText(/page name/i) as HTMLInputElement).value).toBe("PPC Batch 3 (copy)");
    expect(screen.getByText("/e/ppc-batch-3-copy")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /duplicate page/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard/admin/landing-pages/dup1"));
    const [url, init] = (fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/admin/landing-pages/a/duplicate");
    expect(JSON.parse(init.body)).toMatchObject({ title: "PPC Batch 3 (copy)" });
  });
  it("clears the server error when the link is edited", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: "A page with that link already exists." }) });
    render(<DuplicatePageDialog page={pages[0]} open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /duplicate page/i }));
    await waitFor(() => expect(screen.getByText(/already exists/i)).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /change/i }));
    fireEvent.change(screen.getByLabelText(/link ending/i), { target: { value: "ppc-b3-copy-2" } });
    expect(screen.queryByText(/already exists/i)).toBeNull();
  });
  it("shows the server's error inline", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: "A page with that link already exists." }) });
    render(<DuplicatePageDialog page={pages[0]} open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /duplicate page/i }));
    await waitFor(() => expect(screen.getByText(/already exists/i)).toBeTruthy());
    expect(push).not.toHaveBeenCalled();
  });
});
