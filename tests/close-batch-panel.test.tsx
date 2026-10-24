// tests/close-batch-panel.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import { BatchAccessPanel } from "@/components/admin/registrations/BatchAccessPanel";

const PAGES = [{ id: "p1", title: "PPC Masterclass" }];
const OVERVIEW = {
  courseTitle: "PPC Course",
  modules: [{ id: "m1", title: "Module 1", finishedAt: null, paidLive: 12, opened: 8 }],
  recordedPaid: 5,
};
const PREVIEW = { pageTitle: "PPC Masterclass", paid: 12, interested: 30, skipped: 0, alreadyClosed: false, newPaid: 12 };
const RESULT = { paidAdded: 12, interestedAdded: 30, contactsCreated: 35, contactsMerged: 7, skipped: 2 };
const json = (body: unknown, ok = true, status = ok ? 200 : 500) => ({ ok, status, json: async () => body }) as Response;

let fetchMock: ReturnType<typeof vi.fn>;
let preview: unknown;
const isClose = (c: unknown[]) => String(c[0]).includes("/api/admin/landing/close-batch");
const closePosts = () => fetchMock.mock.calls.filter((c) => isClose(c) && (c[1] as RequestInit | undefined)?.method === "POST");

beforeEach(() => {
  preview = PREVIEW;
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes("close-batch")) return init?.method === "POST" ? json(RESULT) : json(preview);
    return json(OVERVIEW);
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

async function openDialog() {
  render(<BatchAccessPanel pageOptions={PAGES} />);
  await screen.findByText("Module 1");
  fireEvent.click(screen.getByRole("button", { name: "Save batch to CRM" }));
  return screen.findByRole("dialog");
}

describe("Save batch to CRM", () => {
  it("asks for the preview and shows the counts in the warning", async () => {
    const dialog = await openDialog();
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("close-batch?pageId=p1"))).toBe(true);
    expect(
      within(dialog).getByText(
        /This copies 12 paid people and 30 interested people into your CRM as new cohorts\. Nothing is removed from Registrations\./,
      ),
    ).toBeTruthy();
    expect(within(dialog).queryByText(/saved before/)).toBeNull();
    expect(within(dialog).queryByText(/can't be copied/)).toBeNull();
    expect(closePosts()).toHaveLength(0);
  });

  it("says 1 person in the singular", async () => {
    preview = { ...PREVIEW, paid: 1, interested: 1, skipped: 1 };
    const dialog = await openDialog();
    expect(within(dialog).getByText(/This copies 1 paid person and 1 interested person into your CRM/)).toBeTruthy();
    expect(within(dialog).getByText(/1 person can't be copied/)).toBeTruthy();
  });

  it("shows the skipped count when some people cannot be copied", async () => {
    preview = { ...PREVIEW, skipped: 4 };
    const dialog = await openDialog();
    expect(
      within(dialog).getByText(/4 people can't be copied \(no contact details, test entries, or no permission to contact\)\./),
    ).toBeTruthy();
  });

  it("explains a batch that was saved before", async () => {
    preview = { ...PREVIEW, alreadyClosed: true, newPaid: 3 };
    const dialog = await openDialog();
    expect(
      within(dialog).getByText(/This batch was saved before\. Only 3 new paid people will be added; the interested list is refreshed\./),
    ).toBeTruthy();
  });

  it("confirming posts once even with a double click, then shows the result", async () => {
    let release: (r: Response) => void = () => {};
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("close-batch")) return init?.method === "POST" ? new Promise<Response>((r) => (release = r)) : Promise.resolve(json(PREVIEW));
      return Promise.resolve(json(OVERVIEW));
    });
    const dialog = await openDialog();
    const yes = within(dialog).getByRole("button", { name: "Yes, save it" });
    fireEvent.click(yes);
    fireEvent.click(yes);
    await waitFor(() => expect(closePosts()).toHaveLength(1));
    expect(JSON.parse((closePosts()[0][1] as RequestInit).body as string)).toEqual({ pageId: "p1" });
    expect((screen.getByRole("button", { name: "Saving…" }) as HTMLButtonElement).disabled).toBe(true);
    release(json(RESULT));
    await screen.findByText("Saved to your CRM: 12 paid and 30 interested. 7 were already in the CRM. 2 skipped.");
    expect(closePosts()).toHaveLength(1);
  });

  it("on a re-run the result uses the preview's new paid count, never 'already in the CRM'", async () => {
    preview = { ...PREVIEW, alreadyClosed: true, newPaid: 3 };
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
      url.includes("close-batch")
        ? init?.method === "POST"
          ? json({ ...RESULT, paidAdded: 50, contactsMerged: 50, interestedAdded: 30, skipped: 2 })
          : json(preview)
        : json(OVERVIEW),
    );
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole("button", { name: "Yes, save it" }));
    const strip = await screen.findByText(/Saved to your CRM again\./);
    expect(strip.textContent).toBe("Saved to your CRM again. 3 new paid people added; the interested list was refreshed (30 people). 2 skipped.");
    expect(screen.queryByText(/already in the CRM/)).toBeNull();
  });

  it("on a re-run with one new paid person and nothing skipped", async () => {
    preview = { ...PREVIEW, alreadyClosed: true, newPaid: 1 };
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
      url.includes("close-batch") ? (init?.method === "POST" ? json({ ...RESULT, skipped: 0 }) : json(preview)) : json(OVERVIEW),
    );
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole("button", { name: "Yes, save it" }));
    const strip = await screen.findByText(/Saved to your CRM again\./);
    expect(strip.textContent).toBe("Saved to your CRM again. 1 new paid person added; the interested list was refreshed (30 people).");
  });

  it("shows Saving… on the button while the save runs and locks the page select while previewing", async () => {
    let release: (r: Response) => void = () => {};
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes("close-batch")) return init?.method === "POST" ? new Promise<Response>((r) => (release = r)) : Promise.resolve(json(PREVIEW));
      return Promise.resolve(json(OVERVIEW));
    });
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole("button", { name: "Yes, save it" }));
    await screen.findByRole("button", { name: "Saving…" });
    expect((screen.getByLabelText("Landing page") as HTMLSelectElement).disabled).toBe(true);
    release(json(RESULT));
    await screen.findByText(/Saved to your CRM:/);
  });

  it("leaves out the skipped sentence when nothing was skipped", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
      url.includes("close-batch") ? (init?.method === "POST" ? json({ ...RESULT, skipped: 0 }) : json(PREVIEW)) : json(OVERVIEW),
    );
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole("button", { name: "Yes, save it" }));
    await screen.findByText("Saved to your CRM: 12 paid and 30 interested. 7 were already in the CRM.");
  });

  it("shows the generic error when the preview fails", async () => {
    fetchMock.mockImplementation(async (url: string) => (url.includes("close-batch") ? json({ error: "Page not found" }, false, 404) : json(OVERVIEW)));
    render(<BatchAccessPanel pageOptions={PAGES} />);
    await screen.findByText("Module 1");
    fireEvent.click(screen.getByRole("button", { name: "Save batch to CRM" }));
    await screen.findByText("Something went wrong. Please try again.");
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("shows the generic error when saving fails", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) =>
      url.includes("close-batch") ? (init?.method === "POST" ? json({}, false) : json(PREVIEW)) : json(OVERVIEW),
    );
    const dialog = await openDialog();
    fireEvent.click(within(dialog).getByRole("button", { name: "Yes, save it" }));
    await screen.findByText("Something went wrong. Please try again.");
    expect(screen.queryByText(/Saved to your CRM/)).toBeNull();
  });

  it("says there is nothing to copy and blocks confirming when both counts are zero", async () => {
    preview = { ...PREVIEW, paid: 0, interested: 0 };
    const dialog = await openDialog();
    expect(within(dialog).getByText(/There is nobody to copy yet/)).toBeTruthy();
    expect((within(dialog).getByRole("button", { name: "Yes, save it" }) as HTMLButtonElement).disabled).toBe(true);
    expect(closePosts()).toHaveLength(0);
  });
});
