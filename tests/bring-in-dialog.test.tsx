// tests/bring-in-dialog.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { BringInDialog } from "@/components/admin/crm/BringInDialog";

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const pages = [
  { id: P1, title: "Pharmacovigilance - Batch 3", registrations: 212, alreadyBrought: false },
  { id: P2, title: "OPD Practice - Batch 1", registrations: 96, alreadyBrought: true },
];

type Call = { url: string; init?: RequestInit };
let calls: Call[];
let release: (() => void) | null;
let body: unknown;

beforeEach(() => {
  calls = [];
  release = null;
  body = {
    pages: [
      { id: P1, ok: true, paidAdded: 180, interestedAdded: 40, skipped: 4 },
      { id: P2, ok: false, paidAdded: 0, interestedAdded: 0, skipped: 0, error: "Could not bring this page in. Please try again." },
    ],
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      await new Promise<void>((r) => {
        release = r;
      });
      return { ok: true, status: 200, json: async () => body } as unknown as Response;
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

  it("Select all ticks every page and Bring in posts their ids", async () => {
    const onDone = vi.fn();
    render(<BringInDialog landingPages={pages} onDone={onDone} />);
    open();
    const bringIn = screen.getByRole("button", { name: "Bring in" }) as HTMLButtonElement;
    expect(bringIn.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Select all" }));
    expect((screen.getByLabelText(/Pharmacovigilance - Batch 3/) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText(/OPD Practice - Batch 1/) as HTMLInputElement).checked).toBe(true);
    fireEvent.click(bringIn);
    await waitFor(() => expect(calls).toHaveLength(1));
    expect(calls[0].url).toBe("/api/admin/crm/audiences/bring-in");
    expect(calls[0].init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ pageIds: [P1, P2] });
    release?.();
    await screen.findByText(/Brought in 180 paid, 40 interested\. 4 left out: no email or phone, or no consent\./);
    expect(screen.getByText(/Could not bring this page in/)).toBeTruthy();
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it("while running: buttons disabled, Escape does not close", async () => {
    render(<BringInDialog landingPages={pages} onDone={vi.fn()} />);
    open();
    fireEvent.click(screen.getByLabelText(/Pharmacovigilance - Batch 3/));
    fireEvent.click(screen.getByRole("button", { name: "Bring in" }));
    await waitFor(() => expect(calls).toHaveLength(1));
    expect((screen.getByRole("button", { name: /Bringing in/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Cancel" }) as HTMLButtonElement).disabled).toBe(true);
    const opener = screen.getByRole("button", { name: "Bring in from landing pages", hidden: true }) as HTMLButtonElement;
    expect(opener.disabled).toBe(true);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeTruthy();
    release?.();
    await screen.findByText(/Brought in 180 paid/);
  });

  it("no landing pages: a plain line and no Bring in", () => {
    render(<BringInDialog landingPages={[]} onDone={vi.fn()} />);
    open();
    expect(screen.getByText("No landing pages yet.")).toBeTruthy();
  });
});
