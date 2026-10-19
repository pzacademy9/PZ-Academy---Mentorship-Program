// tests/batch-access-panel.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, waitFor, within, fireEvent } from "@testing-library/react";
import { BatchAccessPanel } from "@/components/admin/registrations/BatchAccessPanel";

const PAGES = [
  { id: "p1", title: "PPC Masterclass" },
  { id: "p2", title: "Draft Page" },
];
const OVERVIEW = {
  courseTitle: "PPC Course",
  modules: [
    { id: "m1", title: "Module 1", finishedAt: "2026-10-14T10:00:00Z", paidLive: 12, opened: 12 },
    { id: "m2", title: "Module 2", finishedAt: null, paidLive: 12, opened: 8 },
  ],
  recordedPaid: 5,
};
const json = (body: unknown, ok = true) => ({ ok, status: ok ? 200 : 500, json: async () => body }) as Response;

let fetchMock: ReturnType<typeof vi.fn>;
const posts = () => fetchMock.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === "POST");

beforeEach(() => {
  fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (!init || !init.method || init.method === "GET") return json(OVERVIEW);
    if (url.includes("portal-links")) return json({ sent: 20, notOpenYet: 3, waitingForAccount: 0, failed: 0 });
    return json({ modulesFinished: 1, opened: 12, emailed: 11, alreadyOpen: 0, waitingForAccount: 2, failed: 1 });
  });
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

async function ready() {
  render(<BatchAccessPanel pageOptions={PAGES} />);
  await screen.findByText("Module 2");
}

describe("BatchAccessPanel", () => {
  it("loads the overview for the first page and renders counts", async () => {
    await ready();
    expect(fetchMock.mock.calls[0][0]).toContain("/api/admin/landing/batch?pageId=p1");
    expect(screen.getByText("12 Live students paid, 8 portal open")).toBeTruthy();
    expect(screen.getByText("Finished on 14 Oct")).toBeTruthy();
    expect(screen.getByText("Not finished")).toBeTruthy();
  });

  it("requires confirmation before posting", async () => {
    await ready();
    fireEvent.click(screen.getAllByRole("button", { name: "Batch finished" })[1]);
    expect(posts()).toHaveLength(0);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/12 Live students paid and 8 already have this module open\. Pressing opens it for the rest and emails them the portal link\./)).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(posts()).toHaveLength(0);
  });

  it("posts the module id after confirming and shows the result in plain words", async () => {
    await ready();
    fireEvent.click(screen.getAllByRole("button", { name: "Batch finished" })[1]);
    fireEvent.click(await screen.findByRole("button", { name: "Yes, open it" }));
    await screen.findByText(/Opened for 12 students\. Emailed 11\. 1 email did not send \(press again to retry\)\. 2 students still need to sign up\./);
    expect(JSON.parse(posts()[0][1].body)).toEqual({ pageId: "p1", moduleId: "m2" });
    expect(posts()[0][1].credentials).toBe("same-origin");
  });

  it("whole course posts moduleId null", async () => {
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Batch finished for the whole course" }));
    fireEvent.click(await screen.findByRole("button", { name: "Yes, open it" }));
    await waitFor(() => expect(posts()).toHaveLength(1));
    expect(JSON.parse(posts()[0][1].body)).toEqual({ pageId: "p1", moduleId: null });
  });

  it("disables the buttons while a request runs and refreshes after", async () => {
    let release: (r: Response) => void = () => {};
    fetchMock.mockImplementation((url: string, init?: RequestInit) =>
      init?.method === "POST" ? new Promise<Response>((r) => (release = r)) : Promise.resolve(json(OVERVIEW)),
    );
    await ready();
    fireEvent.click(screen.getAllByRole("button", { name: "Batch finished" })[0]);
    fireEvent.click(await screen.findByRole("button", { name: "Yes, open it" }));
    await waitFor(() => expect((screen.getByRole("button", { name: "Batch finished for the whole course" }) as HTMLButtonElement).disabled).toBe(true));
    expect((screen.getByRole("button", { name: "Send link" }) as HTMLButtonElement).disabled).toBe(true);
    const getsBefore = fetchMock.mock.calls.filter((c) => !(c[1] as RequestInit | undefined)?.method).length;
    release(json({ modulesFinished: 1, opened: 1, emailed: 1, alreadyOpen: 0, waitingForAccount: 0, failed: 0 }));
    await waitFor(() => expect((screen.getByRole("button", { name: "Send link" }) as HTMLButtonElement).disabled).toBe(false));
    await waitFor(() =>
      expect(fetchMock.mock.calls.filter((c) => !(c[1] as RequestInit | undefined)?.method).length).toBe(getsBefore + 1),
    );
  });

  it("shows a plain error when the press fails", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => (init?.method === "POST" ? json({}, false) : json(OVERVIEW)));
    await ready();
    fireEvent.click(screen.getAllByRole("button", { name: "Batch finished" })[0]);
    fireEvent.click(await screen.findByRole("button", { name: "Yes, open it" }));
    await screen.findByText("Something went wrong. Please try again.");
  });

  it("email link: audience choice is posted after confirming", async () => {
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Recorded students" }));
    fireEvent.click(screen.getByRole("button", { name: "Send link" }));
    expect(posts()).toHaveLength(0);
    fireEvent.click(await screen.findByRole("button", { name: "Yes, send it" }));
    await screen.findByText(/Sent to 20\./);
    expect(screen.getByText(/3 Live students are not open yet\./)).toBeTruthy();
    expect(JSON.parse(posts()[0][1].body)).toEqual({ pageId: "p1", audience: "recorded" });
  });

  it("shows the empty state when the page has no course", async () => {
    fetchMock.mockImplementation(async () => json({ courseTitle: null, modules: [], recordedPaid: 0 }));
    render(<BatchAccessPanel pageOptions={PAGES} />);
    await screen.findByText("This page has no course yet.");
    expect(screen.queryByRole("button", { name: "Send link" })).toBeNull();
  });

  it("shows an error when the overview cannot load", async () => {
    fetchMock.mockImplementation(async () => json({}, false));
    render(<BatchAccessPanel pageOptions={PAGES} />);
    await screen.findByText("Something went wrong. Please try again.");
  });

  it("fully opened finished module: button still enabled, confirm text explains", async () => {
    await ready();
    const first = screen.getAllByRole("button", { name: "Batch finished" })[0] as HTMLButtonElement;
    expect(first.disabled).toBe(false);
    fireEvent.click(first);
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Module 1: Everyone already has this module open\. Pressing again only sends the link to anyone who did not get it\./)).toBeTruthy();
  });

  it("whole-course confirm makes no count claim", async () => {
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Batch finished for the whole course" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/Opens every module of this course for Live students who paid and emails them the portal link\. Students who already have a module open are not emailed again for it\./)).toBeTruthy();
  });

  it("clears earlier result strips when a new press starts", async () => {
    await ready();
    fireEvent.click(screen.getByRole("button", { name: "Send link" }));
    fireEvent.click(await screen.findByRole("button", { name: "Yes, send it" }));
    await screen.findByText(/Sent to 20\./);
    fireEvent.click(screen.getAllByRole("button", { name: "Batch finished" })[1]);
    fireEvent.click(await screen.findByRole("button", { name: "Yes, open it" }));
    await screen.findByText(/Opened for 12 students/);
    expect(screen.queryByText(/Sent to 20\./)).toBeNull();
  });

  it("refreshes the overview after a failed press", async () => {
    fetchMock.mockImplementation(async (url: string, init?: RequestInit) => (init?.method === "POST" ? json({}, false) : json(OVERVIEW)));
    await ready();
    const gets = () => fetchMock.mock.calls.filter((c) => !(c[1] as RequestInit | undefined)?.method).length;
    const before = gets();
    fireEvent.click(screen.getAllByRole("button", { name: "Batch finished" })[0]);
    fireEvent.click(await screen.findByRole("button", { name: "Yes, open it" }));
    await screen.findByText("Something went wrong. Please try again.");
    await waitFor(() => expect(gets()).toBe(before + 1));
  });

  it("a double click on Yes, open it posts once", async () => {
    await ready();
    fireEvent.click(screen.getAllByRole("button", { name: "Batch finished" })[0]);
    const yes = await screen.findByRole("button", { name: "Yes, open it" });
    fireEvent.click(yes);
    fireEvent.click(yes);
    await screen.findByText(/Opened for 12 students/);
    expect(posts()).toHaveLength(1);
  });

  it("no modules shows different empty text from no course", async () => {
    fetchMock.mockImplementation(async () => json({ courseTitle: "PPC", modules: [], recordedPaid: 0 }));
    render(<BatchAccessPanel pageOptions={PAGES} />);
    await screen.findByText("This course has no modules yet.");
  });
});
