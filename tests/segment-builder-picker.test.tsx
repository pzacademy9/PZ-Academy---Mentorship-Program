import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { useState } from "react";
import { SegmentBuilder } from "@/components/admin/crm/SegmentBuilder";
import type { SegmentFilter } from "@/lib/crm/segment";

const ROWS = [
  { id: "c1", fullName: "Amy Ok", email: "amy@x.com", phoneE164: "+1", unsubscribed: false },
  { id: "c2", fullName: "Bob Unsub", email: "bob@x.com", phoneE164: "+2", unsubscribed: true },
  { id: "c3", fullName: "Cat NoMail", email: null, phoneE164: null, unsubscribed: false },
];
let searchCalls: string[] = [];

beforeEach(() => {
  searchCalls = [];
  vi.unstubAllGlobals();
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    if (url.startsWith("/api/admin/crm/contacts")) {
      searchCalls.push(url);
      return { ok: true, json: async () => ({ rows: ROWS, total: 3 }) };
    }
    if (url.includes("preview")) return { ok: true, json: async () => ({ total: 1, samples: [] }) };
    return { ok: true, json: async () => ({}) };
  }));
});

function Harness({ initial, channel }: { initial: SegmentFilter[]; channel?: "email" | "whatsapp" }) {
  const [v, setV] = useState<SegmentFilter[]>(initial);
  return (
    <>
      <SegmentBuilder value={v} onChange={setV} channel={channel} />
      <pre data-testid="out">{JSON.stringify(v)}</pre>
    </>
  );
}
const out = () => JSON.parse(screen.getByTestId("out").textContent!) as SegmentFilter[];
const empty: SegmentFilter[] = [{ field: "contact_id", op: "in", values: [] }];

async function search(term = "a") {
  fireEvent.change(screen.getByPlaceholderText(/search by name/i), { target: { value: term } });
  await waitFor(() => expect(screen.getByText("Amy Ok")).toBeTruthy(), { timeout: 2000 });
}

describe("SegmentBuilder contact picker", () => {
  it("adds a Specific contacts row from the dropdown, once", () => {
    render(<Harness initial={[]} />);
    const select = screen.getAllByRole("combobox")[0];
    fireEvent.change(select, { target: { value: "contact_id" } });
    fireEvent.change(select, { target: { value: "contact_id" } });
    expect(out().filter((f) => f.field === "contact_id")).toHaveLength(1);
  });

  it("searches, flags unsendable, disables their Add, adds sendable as a chip", async () => {
    render(<Harness initial={empty} />);
    await search();
    expect(searchCalls[0]).toContain("search=a");
    expect(screen.getByText("unsubscribed")).toBeTruthy();
    expect(screen.getByText("no email")).toBeTruthy();
    const adds = screen.getAllByRole("button", { name: /^Add/ });
    expect((adds[1] as HTMLButtonElement).disabled).toBe(true);
    expect((adds[2] as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(adds[0]);
    expect(out()[0]).toMatchObject({ field: "contact_id", values: ["c1"] });
    expect(screen.getByRole("button", { name: "Remove Amy Ok" })).toBeTruthy();
  });

  it("whatsapp channel flags only missing phone", async () => {
    render(<Harness channel="whatsapp" initial={empty} />);
    await search();
    expect(screen.queryByText("unsubscribed")).toBeNull();
    expect(screen.getByText("no phone")).toBeTruthy();
  });

  it("seeded ids show as a count; clear all drops the row", async () => {
    render(<Harness initial={[{ field: "contact_id", op: "in", values: ["s1", "s2"] }]} />);
    expect(screen.getByText(/2 contacts picked from the Contacts tab/)).toBeTruthy();
    await search();
    fireEvent.click(screen.getAllByRole("button", { name: /^Add/ })[0]);
    expect(out()[0]).toMatchObject({ values: ["s1", "s2", "c1"] });
    expect(screen.getByText(/2 contacts picked from the Contacts tab/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear all" }));
    expect(out()).toEqual([]);
  });

  it("removing the last chip removes the filter row", async () => {
    render(<Harness initial={empty} />);
    await search();
    fireEvent.click(screen.getAllByRole("button", { name: /^Add/ })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Remove Amy Ok" }));
    expect(out()).toEqual([]);
  });

  it("disables Add at the cap with a message", async () => {
    const ids = Array.from({ length: 500 }, (_, i) => `id${i}`);
    render(<Harness initial={[{ field: "contact_id", op: "in", values: ids }]} />);
    await search();
    expect((screen.getAllByRole("button", { name: /^Add/ })[0] as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/limit of 500/i)).toBeTruthy();
  });

  it("a pick triggers the debounced count preview", async () => {
    render(<Harness initial={empty} />);
    await search();
    fireEvent.click(screen.getAllByRole("button", { name: /^Add/ })[0]);
    await waitFor(
      () => expect((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls.some((c) => String(c[0]).includes("preview"))).toBe(true),
      { timeout: 2000 },
    );
  });
});
