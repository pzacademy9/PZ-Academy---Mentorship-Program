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
import { DuplicatePageDialog } from "@/components/admin/landing/DuplicatePageDialog";

const pages = [
  { id: "a", slug: "ppc-b3", kind: "course" as const, title: "PPC Batch 3", status: "published" as const, revision: 3, publishedAt: "2026-10-01T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z", hasUnpublishedChanges: true },
  { id: "b", slug: "w21", kind: "webinar" as const, title: "Webinar 21", status: "draft" as const, revision: 1, publishedAt: null, updatedAt: "2026-10-02T00:00:00Z", hasUnpublishedChanges: true },
];
const closedPage = { id: "c", slug: "mdc-b2", kind: "workshop" as const, title: "MDC Batch 2", status: "closed" as const, revision: 2, publishedAt: "2026-09-01T00:00:00Z", updatedAt: "2026-10-02T00:00:00Z", hasUnpublishedChanges: false };

beforeEach(() => { push.mockReset(); refresh.mockReset(); vi.stubGlobal("fetch", vi.fn()); });

describe("LandingPagesList", () => {
  it("shows status badges, the unpublished-changes chip only for live pages, and View live only for published/closed", () => {
    render(<LandingPagesList pages={pages} />);
    expect(screen.getAllByText("Live").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Draft").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/unpublished changes/i).length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /view live/i }).length).toBeGreaterThan(0);
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
    expect(screen.getByText(/page link/i)).toBeTruthy();
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
  it("shows the server's error inline", async () => {
    (fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, status: 409, json: async () => ({ error: "A page with that link already exists." }) });
    render(<DuplicatePageDialog page={pages[0]} open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /duplicate page/i }));
    await waitFor(() => expect(screen.getByText(/already exists/i)).toBeTruthy());
    expect(push).not.toHaveBeenCalled();
  });
});
