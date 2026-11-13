import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock("sonner", () => ({ toast }));

import { AffiliateEmailsTab } from "@/components/admin/affiliates/AffiliateEmailsTab";

const fetchMock = () => fetch as unknown as ReturnType<typeof vi.fn>;
const reply = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body });
const people = (n: number, sentAt: string | null = null) =>
  Array.from({ length: n }, (_, i) => ({ id: `id${i}`, name: `Person ${i}`, email: `p${i}@example.com`, sentAt }));
const okSend = (b: { ids: string[] }) => ({ sent: b.ids.length, failed: 0, skipped: 0, limitReached: false, remainingToday: 100 });

/** GET gives the list, POST uses the given handler. */
function route(candidates: unknown[], post: (body: { ids: string[]; includeSent: boolean }) => unknown = okSend) {
  fetchMock().mockImplementation(async (_url: string, init?: RequestInit) => {
    if (init?.method === "POST") return reply(200, post(JSON.parse(String(init.body))));
    if (init?.method === "PUT") return reply(200, { ok: true });
    return reply(200, { candidates });
  });
}

beforeEach(() => {
  toast.success.mockReset();
  toast.error.mockReset();
  vi.stubGlobal("fetch", vi.fn());
});

describe("AffiliateEmailsTab: message box", () => {
  it("shows the saved message with a 1000 character counter and limits typing", async () => {
    route([]);
    render(<AffiliateEmailsTab initialMessage="Hello team" messageFailed={false} />);
    const box = screen.getByLabelText("Message text") as HTMLTextAreaElement;
    expect(box.value).toBe("Hello team");
    expect(box.maxLength).toBe(1000);
    expect(screen.getByText("10 / 1000")).toBeTruthy();
    fireEvent.change(box, { target: { value: "Hello team!!" } });
    expect(screen.getByText("12 / 1000")).toBeTruthy();
    await waitFor(() => expect(screen.getByText("Everyone has at least one paid sale.")).toBeTruthy());
  });

  it("saves through the PUT route and says Saved", async () => {
    route([]);
    render(<AffiliateEmailsTab initialMessage="" messageFailed={false} />);
    fireEvent.change(screen.getByLabelText("Message text"), { target: { value: "New words" } });
    fireEvent.click(screen.getByRole("button", { name: "Save message" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/Saved/));
    const put = fetchMock().mock.calls.find((c) => c[1]?.method === "PUT")!;
    expect(put[0]).toBe("/api/admin/affiliates/email-message");
    expect(JSON.parse(put[1].body)).toEqual({ message: "New words" });
  });

  it("Clear text then Save sends an empty message", async () => {
    route([]);
    render(<AffiliateEmailsTab initialMessage="Some text" messageFailed={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Clear text" }));
    expect((screen.getByLabelText("Message text") as HTMLTextAreaElement).value).toBe("");
    fireEvent.click(screen.getByRole("button", { name: "Save message" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/Saved/));
    const put = fetchMock().mock.calls.find((c) => c[1]?.method === "PUT")!;
    expect(JSON.parse(put[1].body)).toEqual({ message: "" });
  });

  it("shows the server error when saving fails", async () => {
    fetchMock().mockImplementation(async (_u: string, init?: RequestInit) =>
      init?.method === "PUT" ? reply(500, { error: "Could not save the message. Please try again." }) : reply(200, { candidates: [] }),
    );
    render(<AffiliateEmailsTab initialMessage="x" messageFailed={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Save message" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Could not save the message. Please try again."));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows a small notice when the message could not be read", async () => {
    route([]);
    render(<AffiliateEmailsTab initialMessage="" messageFailed />);
    expect(screen.getByText(/could not be loaded/i)).toBeTruthy();
    await waitFor(() => expect(screen.getByText("Everyone has at least one paid sale.")).toBeTruthy());
  });
});

describe("AffiliateEmailsTab: Motivation send", () => {
  it("ticks the people not yet emailed, with the switch off and a Send button", async () => {
    route([...people(2), { id: "s", name: "Sent Person", email: "s@example.com", sentAt: "2026-11-03T10:00:00Z" }]);
    render(<AffiliateEmailsTab initialMessage="" messageFailed={false} />);
    await waitFor(() => expect(screen.getByText("Person 0")).toBeTruthy());
    expect((screen.getAllByRole("checkbox") as HTMLInputElement[]).map((c) => c.checked)).toEqual([true, true, false]);
    expect(screen.getAllByText("Not sent yet")).toHaveLength(2);
    expect(screen.getByText(/Sent 3 Nov/)).toBeTruthy();
    expect(screen.getByRole("switch", { name: "Also show people who already got it" }).getAttribute("aria-checked")).toBe("false");
    expect(screen.getByRole("button", { name: "Send to 2 people" })).toBeTruthy();
    expect(fetchMock().mock.calls[0][0]).toBe("/api/admin/affiliates/motivation");
  });

  it("with the switch on, people who already got it show but are not ticked, and are never sent", async () => {
    const all = [...people(2), { id: "old", name: "Old Person", email: "o@example.com", sentAt: "2026-11-03T10:00:00Z" }];
    route(all);
    render(<AffiliateEmailsTab initialMessage="" messageFailed={false} />);
    await waitFor(() => expect(screen.getByText("Person 0")).toBeTruthy());
    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() => expect(screen.getByText("Old Person")).toBeTruthy());
    const boxes = screen.getAllByRole("checkbox") as HTMLInputElement[];
    expect(boxes.map((b) => b.checked)).toEqual([true, true, false]);
    fireEvent.click(screen.getByRole("button", { name: "Send to 2 people" }));
    await waitFor(() => expect(screen.getByText("Done. Sent 2.")).toBeTruthy());
    const post = fetchMock().mock.calls.filter((c) => c[1]?.method === "POST").map((c) => JSON.parse(c[1].body))[0];
    expect(post.ids).toEqual(["id0", "id1"]);
    expect(post.includeSent).toBe(true);
  });

  it("after a send and reload, the people just emailed are not ticked again", async () => {
    let gets = 0;
    fetchMock().mockImplementation(async (_u: string, init?: RequestInit) => {
      if (init?.method === "POST") return reply(200, okSend(JSON.parse(String(init.body))));
      gets++;
      // First load (switch on): two new. Reload after the send: they now have a sent date.
      const sentAt = gets >= 3 ? "2026-11-13T10:00:00Z" : null;
      return reply(200, { candidates: people(2, sentAt) });
    });
    render(<AffiliateEmailsTab initialMessage="" messageFailed={false} />);
    await waitFor(() => expect(screen.getByText("Person 0")).toBeTruthy());
    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Send to 2 people" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Send to 2 people" }));
    await waitFor(() => expect(screen.getByText("Done. Sent 2.")).toBeTruthy());
    await waitFor(() => expect(screen.getAllByText(/^Sent \d+ \w+$/)).toHaveLength(2));
    expect((screen.getAllByRole("checkbox") as HTMLInputElement[]).every((b) => !b.checked)).toBe(true);
    expect((screen.getByRole("button", { name: "Send to 0 people" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("the switch asks for the people who already got it", async () => {
    route(people(1));
    render(<AffiliateEmailsTab initialMessage="" messageFailed={false} />);
    await waitFor(() => expect(screen.getByText("Person 0")).toBeTruthy());
    fireEvent.click(screen.getByRole("switch"));
    await waitFor(() => expect(fetchMock().mock.calls.some((c) => String(c[0]).includes("includeSent=1"))).toBe(true));
  });

  it("Select none unticks everyone and disables Send", async () => {
    route(people(3));
    render(<AffiliateEmailsTab initialMessage="" messageFailed={false} />);
    await waitFor(() => expect(screen.getByText("Person 0")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Select none" }));
    expect((screen.getByRole("button", { name: /Send to 0 people/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("sends in chunks of 25 with progress and ends with Done", async () => {
    route(people(60));
    render(<AffiliateEmailsTab initialMessage="" messageFailed={false} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Send to 60 people" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Send to 60 people" }));
    await waitFor(() => expect(screen.getByText("Done. Sent 60.")).toBeTruthy());
    const posts = fetchMock().mock.calls.filter((c) => c[1]?.method === "POST").map((c) => JSON.parse(c[1].body));
    expect(posts.map((p) => p.ids.length)).toEqual([25, 25, 10]);
    expect(posts[0].includeSent).toBe(false);
  });

  it("shows the running count while a chunk is going and blocks a second click", async () => {
    let release: () => void = () => {};
    let n = 0;
    fetchMock().mockImplementation(async (_u: string, init?: RequestInit) => {
      if (init?.method !== "POST") return reply(200, { candidates: people(60) });
      n++;
      if (n === 2) await new Promise<void>((r) => (release = r));
      return reply(200, okSend(JSON.parse(String(init.body))));
    });
    render(<AffiliateEmailsTab initialMessage="" messageFailed={false} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Send to 60 people" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Send to 60 people" }));
    await waitFor(() => expect(screen.getByText("Sent 25 of 60")).toBeTruthy());
    expect((screen.getByRole("switch") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getAllByRole("checkbox")[0] as HTMLInputElement).disabled).toBe(true);
    const sendBtn = screen.getByRole("button", { name: /Sending/ }) as HTMLButtonElement;
    expect(sendBtn.disabled).toBe(true);
    fireEvent.click(sendBtn);
    release();
    await waitFor(() => expect(screen.getByText("Done. Sent 60.")).toBeTruthy());
    expect(fetchMock().mock.calls.filter((c) => c[1]?.method === "POST")).toHaveLength(3);
  });

  it("stops at the daily limit and says how many are left for tomorrow", async () => {
    let n = 0;
    route(people(60), () => {
      n++;
      return n === 1
        ? { sent: 25, failed: 0, skipped: 0, limitReached: false, remainingToday: 10 }
        : { sent: 10, failed: 0, skipped: 0, limitReached: true, remainingToday: 0 };
    });
    render(<AffiliateEmailsTab initialMessage="" messageFailed={false} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Send to 60 people" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Send to 60 people" }));
    await waitFor(() => expect(screen.getByText("Daily limit reached. 25 people left for tomorrow.")).toBeTruthy());
    expect(fetchMock().mock.calls.filter((c) => c[1]?.method === "POST")).toHaveLength(2);
  });

  it("tells failed and skipped counts in plain words and refreshes the list", async () => {
    route(people(5), () => ({ sent: 3, failed: 1, skipped: 1, limitReached: false, remainingToday: 100 }));
    render(<AffiliateEmailsTab initialMessage="" messageFailed={false} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Send to 5 people" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Send to 5 people" }));
    await waitFor(() => expect(screen.getByText("Done. Sent 3.")).toBeTruthy());
    expect(screen.getByText(/1 email could not be sent/)).toBeTruthy();
    expect(screen.getByText(/1 person was skipped/)).toBeTruthy();
    expect(fetchMock().mock.calls.filter((c) => !c[1]?.method)).toHaveLength(2);
  });

  it("if a send request fails, says how many were not reached", async () => {
    let n = 0;
    fetchMock().mockImplementation(async (_u: string, init?: RequestInit) => {
      if (init?.method !== "POST") return reply(200, { candidates: people(30) });
      n++;
      return n === 1 ? reply(200, okSend({ ids: people(25).map((p) => p.id) })) : reply(500, { error: "Could not send. Please try again." });
    });
    render(<AffiliateEmailsTab initialMessage="" messageFailed={false} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Send to 30 people" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Send to 30 people" }));
    await waitFor(() => expect(screen.getByText(/Stopped\. Sent 25\. 5 people were not reached/)).toBeTruthy());
    expect(toast.error).toHaveBeenCalledWith("Could not send. Please try again.");
  });

  it("shows the empty state when everyone has a paid sale", async () => {
    route([]);
    render(<AffiliateEmailsTab initialMessage="" messageFailed={false} />);
    await waitFor(() => expect(screen.getByText("Everyone has at least one paid sale.")).toBeTruthy());
    expect(screen.queryByRole("button", { name: /Send to/ })).toBeNull();
  });

  it("keeps touch targets at least 44px on phone", async () => {
    route(people(1));
    render(<AffiliateEmailsTab initialMessage="m" messageFailed={false} />);
    await waitFor(() => expect(screen.getByText("Person 0")).toBeTruthy());
    for (const el of [
      screen.getByRole("button", { name: "Save message" }),
      screen.getByRole("button", { name: "Clear text" }),
      screen.getByRole("switch"),
      screen.getByRole("button", { name: "Select none" }),
      screen.getByRole("button", { name: "Send to 1 person" }),
      screen.getByRole("checkbox").closest("label")!,
    ]) {
      expect(el.className).toMatch(/min-h-(11|\[44px\])/);
    }
  });
});
