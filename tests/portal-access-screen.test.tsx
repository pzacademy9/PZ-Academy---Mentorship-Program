// tests/portal-access-screen.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));

import { PortalAccessScreen } from "@/components/admin/registrations/PortalAccessScreen";
import type { PortalOverview } from "@/lib/data/portals";

const PAGE = "11111111-1111-4111-8111-111111111111";
const C1 = "22222222-2222-4222-8222-222222222222";
const C2 = "33333333-3333-4333-8333-333333333333";
const FAM = "44444444-4444-4444-8444-444444444444";

const portal = { id: C1, title: "PPC batch 3 portal", slug: "ppc-3", published: false, familyId: FAM, familyName: "PPC", batchLabel: "Batch 3" };
const sibling = { id: C2, title: "PPC batch 2 portal", slug: "ppc-2", published: true, familyId: FAM, familyName: "PPC", batchLabel: "Batch 2" };
const OVERVIEW: PortalOverview = {
  portal,
  siblings: [sibling],
  families: [{ id: FAM, name: "PPC" }],
  sources: [portal, sibling],
};
const NO_PORTAL: PortalOverview = { portal: null, siblings: [], families: [{ id: FAM, name: "PPC" }], sources: [portal, sibling] };
const PANEL = { courseTitle: "PPC", modules: [{ id: "m1", title: "Module 1", finishedAt: null, paidLive: 1, opened: 0 }], recordedPaid: 0 };

const json = (body: unknown, status = 200) => ({ ok: status < 400, status, json: async () => body }) as Response;

let fetchMock: ReturnType<typeof vi.fn>;
let preview = { toMove: 48, alreadyThere: 2, unmatchedModules: 1 };
const posts = (part: string) =>
  fetchMock.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === "POST" && String(c[0]).includes(part));

beforeEach(() => {
  refresh.mockReset();
  preview = { toMove: 48, alreadyThere: 2, unmatchedModules: 1 };
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (init?.method === "POST") return json({ courseId: C2, moved: 48 });
    if (String(url).includes("/portal/move")) return json(preview);
    return json(PANEL);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function renderScreen(overview: PortalOverview | null = OVERVIEW) {
  return render(<PortalAccessScreen pageId={PAGE} pageTitle="PPC Batch 3" overview={overview} />);
}

describe("PortalAccessScreen", () => {
  it("shows the portal name, group chip, batch chip and Not published chip", () => {
    renderScreen();
    expect(screen.getByRole("heading", { name: "PPC batch 3 portal" })).toBeTruthy();
    expect(screen.getByTestId("chip-group").textContent).toBe("PPC");
    expect(screen.getByTestId("chip-batch").textContent).toBe("Batch 3");
    expect(screen.getByTestId("chip-published").textContent).toContain("Not published");
    expect(screen.getByRole("link", { name: /Open in Course Builder/ }).getAttribute("href")).toBe(`/dashboard/admin/courses/${C1}`);
  });

  it('shows "No portal yet" with the duplicate and pick actions when overview.portal is null', () => {
    renderScreen(NO_PORTAL);
    expect(screen.getByText("No portal yet")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Duplicate a portal" })).toBeTruthy();
    expect(screen.getByLabelText("Pick a portal")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Move students" })).toBeNull();
  });

  it("Duplicate a portal opens the dialog and Escape closes it and returns focus to the button", async () => {
    renderScreen();
    const opener = screen.getByRole("button", { name: "Duplicate a portal" });
    opener.focus();
    fireEvent.click(opener);
    const dialog = await screen.findByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it("Copy portal is disabled until a source and a name are given and posts to /api/admin/landing/portal/duplicate", async () => {
    renderScreen();
    fireEvent.click(screen.getByRole("button", { name: "Duplicate a portal" }));
    const dialog = await screen.findByRole("dialog");
    const copy = within(dialog).getByRole("button", { name: "Copy portal" }) as HTMLButtonElement;
    expect(copy.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText("Portal to copy"), { target: { value: C2 } });
    expect(copy.disabled).toBe(true);
    fireEvent.change(within(dialog).getByLabelText("Name of the new portal"), { target: { value: "PPC batch 4 portal" } });
    expect(copy.disabled).toBe(false);
    fireEvent.click(copy);
    await waitFor(() => expect(posts("/api/admin/landing/portal/duplicate")).toHaveLength(1));
    const body = JSON.parse(posts("/api/admin/landing/portal/duplicate")[0][1].body);
    expect(body).toMatchObject({ pageId: PAGE, sourceCourseId: C2, title: "PPC batch 4 portal" });
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it('Move students shows the count line "48 students will move", "2 already in this portal" and "1 module could not be matched"', async () => {
    renderScreen();
    await screen.findByText("48 students will move");
    expect(screen.getByText("2 already in this portal")).toBeTruthy();
    expect(screen.getByText("1 module could not be matched")).toBeTruthy();
    const url = String(fetchMock.mock.calls.find((c) => String(c[0]).includes("/portal/move"))![0]);
    expect(url).toContain(`pageId=${PAGE}`);
    expect(url).toContain(`toCourseId=${C1}`);
  });

  it("Move students is disabled when nothing will move", async () => {
    preview = { toMove: 0, alreadyThere: 5, unmatchedModules: 0 };
    renderScreen();
    await screen.findByText("0 students will move");
    expect((screen.getByRole("button", { name: "Move students" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("the confirm dialog says progress does not carry over and posts to /api/admin/landing/portal/move only on confirm, and Cancel posts nothing", async () => {
    renderScreen();
    await screen.findByText("48 students will move");
    fireEvent.click(screen.getByRole("button", { name: "Move students" }));
    let dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Move 48 students?")).toBeTruthy();
    expect(within(dialog).getByText(/progress in the old portal does not carry over/i)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(posts("/api/admin/landing/portal/move")).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: "Move students" }));
    dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Move students" }));
    await waitFor(() => expect(posts("/api/admin/landing/portal/move")).toHaveLength(1));
    expect(JSON.parse(posts("/api/admin/landing/portal/move")[0][1].body)).toEqual({ pageId: PAGE, toCourseId: C1 });
    await screen.findByText("Moved 48 students.");
  });

  it("a second move shows the calm message instead of crashing", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => {
      if (init?.method === "POST") return json({ error: "This batch already uses that portal." }, 409);
      if (String(url).includes("/portal/move")) return json(preview);
      return json(PANEL);
    });
    renderScreen();
    await screen.findByText("48 students will move");
    fireEvent.click(screen.getByRole("button", { name: "Move students" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Move students" }));
    await screen.findByText("This batch already uses that portal.");
  });

  it("the group and batch label form posts to /api/admin/landing/portal/group", async () => {
    renderScreen();
    fireEvent.change(screen.getByLabelText("Batch label"), { target: { value: "Batch 3b" } });
    fireEvent.click(screen.getByRole("button", { name: "Save group and batch" }));
    await waitFor(() => expect(posts("/api/admin/landing/portal/group")).toHaveLength(1));
    expect(JSON.parse(posts("/api/admin/landing/portal/group")[0][1].body)).toMatchObject({
      courseId: C1,
      familyId: FAM,
      batchLabel: "Batch 3b",
    });
  });

  it("choosing another portal in the group posts to the attach route", async () => {
    renderScreen();
    fireEvent.change(screen.getByLabelText("Portals in the PPC group"), { target: { value: C2 } });
    await waitFor(() => expect(posts("/api/admin/landing/portal/attach")).toHaveLength(1));
    expect(JSON.parse(posts("/api/admin/landing/portal/attach")[0][1].body)).toEqual({ pageId: PAGE, courseId: C2 });
  });
});
