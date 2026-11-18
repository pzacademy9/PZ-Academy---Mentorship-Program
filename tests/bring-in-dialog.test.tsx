// tests/bring-in-dialog.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BringInDialog } from "@/components/admin/crm/BringInDialog";

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const P3 = "33333333-3333-4333-8333-333333333333";
const pages = [
  { id: P1, title: "Pharmacovigilance - Batch 3", registrations: 212, alreadyBrought: false },
  { id: P2, title: "OPD Practice - Batch 1", registrations: 96, alreadyBrought: true },
];
const threePages = [...pages, { id: P3, title: "Clinical Skills - Batch 2", registrations: 40, alreadyBrought: false }];

const RETRY = "This page did not finish. Press Bring in again to retry it.";

type Call = { url: string; init?: RequestInit };
type Reply = { status: number; body?: unknown; notJson?: boolean } | "throw";
let calls: Call[];
let releases: (() => void)[];
let gated: boolean;
let reply: (pageId: string) => Reply;

const okPage = (id: string) => ({ status: 200, body: { pages: [{ id, ok: true, paidAdded: 180, interestedAdded: 40, skipped: 4 }] } });
const failedPage = (id: string) => ({
  status: 200,
  body: { pages: [{ id, ok: false, paidAdded: 0, interestedAdded: 0, skipped: 0, error: "Could not bring this page in. Please try again." }] },
});

beforeEach(() => {
  calls = [];
  releases = [];
  gated = false;
  reply = (id) => (id === P2 ? failedPage(id) : okPage(id));
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (gated) {
        await new Promise<void>((r) => {
          releases.push(r);
        });
      }
      const id = (JSON.parse(String(init?.body)) as { pageIds: string[] }).pageIds[0];
      const r = reply(id);
      if (r === "throw") throw new TypeError("Failed to fetch");
      return {
        ok: r.status >= 200 && r.status < 300,
        status: r.status,
        json: async () => {
          if (r.notJson) throw new SyntaxError("Unexpected token <");
          return r.body;
        },
      } as unknown as Response;
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

const open = () => {
  const opener = screen.getByRole("button", { name: "Bring in from landing pages" });
  opener.focus();
  fireEvent.click(opener);
  return opener;
};
const bodies = () => calls.map((c) => JSON.parse(String(c.init?.body)) as { pageIds: string[] });

describe("bring-in dialog", () => {
  it("lists pages with counts and the already brought in tag", () => {
    render(<BringInDialog landingPages={pages} onDone={vi.fn()} />);
    open();
    expect(screen.getByRole("dialog", { name: "Bring in from landing pages" })).toBeTruthy();
    expect(screen.getByText("Copy people who registered on landing pages into the CRM. Safe to press again.")).toBeTruthy();
    expect(screen.getByLabelText(/Pharmacovigilance - Batch 3, 212 people/)).toBeTruthy();
    expect(screen.getByText("already brought in")).toBeTruthy();
  });

  it("Escape closes and focus returns to the opener", async () => {
    render(<BringInDialog landingPages={pages} onDone={vi.fn()} />);
    const opener = open();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it("Select all posts one request per page, in order, and calls onDone once", async () => {
    const onDone = vi.fn();
    render(<BringInDialog landingPages={pages} onDone={onDone} />);
    open();
    const bringIn = screen.getByRole("button", { name: "Bring in" }) as HTMLButtonElement;
    expect(bringIn.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect((screen.getByLabelText(/Pharmacovigilance - Batch 3/) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(/OPD Practice - Batch 1/) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(bringIn);
    await screen.findByText(/Brought in 180 paid, 40 interested\. 4 left out: no email or phone, or no consent\./);
    await screen.findByText(/Could not bring this page in/);
    expect(calls).toHaveLength(2);
    for (const c of calls) {
      expect(c.url).toBe("/api/admin/crm/audiences/bring-in");
      expect(c.init?.method).toBe("POST");
    }
    expect(bodies()).toEqual([{ pageIds: [P1] }, { pageIds: [P2] }]);
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  });

  it("shows each page's line as it lands, with a progress line", async () => {
    gated = true;
    render(<BringInDialog landingPages={pages} onDone={vi.fn()} />);
    open();
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    fireEvent.click(screen.getByRole("button", { name: "Bring in" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(screen.getByText("Page 1 of 2")).toBeTruthy();
    releases[0]();
    await screen.findByText(/Brought in 180 paid/);
    await waitFor(() => expect(calls).toHaveLength(2));
    expect(screen.getByText("Page 2 of 2")).toBeTruthy();
    expect(screen.queryByText(/Could not bring this page in/)).toBeNull();
    releases[1]();
    await screen.findByText(/Could not bring this page in/);
    await waitFor(() => expect(screen.queryByText(/Page \d of 2/)).toBeNull());
  });

  it("a failing page or a failed request does not stop the rest", async () => {
    const onDone = vi.fn();
    reply = (id) => (id === P1 ? "throw" : id === P2 ? { status: 500, body: { error: "Something went wrong. Please try again." } } : okPage(id));
    render(<BringInDialog landingPages={threePages} onDone={onDone} />);
    open();
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    fireEvent.click(screen.getByRole("button", { name: "Bring in" }));
    await screen.findByText(/Brought in 180 paid/);
    expect(bodies()).toEqual([{ pageIds: [P1] }, { pageIds: [P2] }, { pageIds: [P3] }]);
    expect(screen.getByText(RETRY)).toBeTruthy();
    expect(screen.getByText("Something went wrong. Please try again.")).toBeTruthy();
    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
  });

  it("a 504 or other non-JSON answer is a plain line for that page only", async () => {
    reply = (id) => (id === P1 ? { status: 504, notJson: true } : okPage(id));
    render(<BringInDialog landingPages={pages} onDone={vi.fn()} />);
    open();
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    fireEvent.click(screen.getByRole("button", { name: "Bring in" }));
    await screen.findByText(/Brought in 180 paid/);
    const line = screen.getByText(RETRY);
    expect(line.textContent).toBe(`Pharmacovigilance - Batch 3: ${RETRY}`);
    expect(screen.getAllByText(RETRY)).toHaveLength(1);
  });

  it("while running: buttons disabled, Escape does not close; afterwards Escape closes and focus returns", async () => {
    gated = true;
    render(<BringInDialog landingPages={pages} onDone={vi.fn()} />);
    const opener = open();
    fireEvent.click(screen.getByLabelText(/Pharmacovigilance - Batch 3/));
    fireEvent.click(screen.getByRole("button", { name: "Bring in" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect((screen.getByRole("button", { name: /Bringing in/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true);
    const hiddenOpener = screen.getByRole("button", { name: "Bring in from landing pages", hidden: true }) as HTMLButtonElement;
    expect(hiddenOpener.disabled).toBe(true);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeTruthy();
    releases[0]();
    await screen.findByText(/Brought in 180 paid/);
    await waitFor(() => expect((screen.getByText("Close", { selector: "button" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(opener));
  });

  it("no landing pages: a plain line and no Bring in", () => {
    render(<BringInDialog landingPages={[]} onDone={vi.fn()} />);
    open();
    expect(screen.getByText("No landing pages yet.")).toBeTruthy();
  });
});
