import { describe, it, expect, vi, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { PeopleLookup } from "@/components/admin/people/PeopleLookup";
import type { FixActions } from "@/components/admin/people/PersonFixPanel";
import type { PersonDetail } from "@/lib/data/pz-people-fix";

afterEach(cleanup);

const row = { id: "a", pzId: "Hamza-1002", name: "Hamza Ali", emails: ["fake.hamid@example.com"], batches: 2 };
const detail = (over: Partial<PersonDetail> = {}): PersonDetail => ({
  id: "a",
  pzId: "Hamza-1002",
  name: "Hamza Ali",
  emails: ["fake.hamid@example.com"],
  oldIds: ["hamid-dr28"],
  batches: [{ title: "Fake Course Batch 1", mode: "live", status: "paid" }],
  quizResults: 4,
  attendance: 3,
  ...over,
});

function actions(over: Partial<FixActions> = {}): FixActions {
  return {
    load: vi.fn(async () => ({ ok: true as const, person: detail() })),
    rename: vi.fn(async () => ({ ok: true as const })),
    reissue: vi.fn(async () => ({ ok: true as const, oldId: "Hamza-1002", newId: "Hamid-1050" })),
    addEmail: vi.fn(async () => ({ ok: true as const })),
    removeEmail: vi.fn(async () => ({ ok: true as const })),
    sendId: vi.fn(async () => ({ ok: true as const })),
    ...over,
  };
}

async function open(fix: FixActions) {
  const search = vi.fn(async () => ({ ok: true as const, people: [row], truncated: false }));
  render(<PeopleLookup search={search} merge={vi.fn()} fix={fix} />);
  fireEvent.change(screen.getByLabelText("Search students"), { target: { value: "hamza" } });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  await waitFor(() => screen.getByRole("button", { name: "Fix or view Hamza-1002" }));
  fireEvent.click(screen.getByRole("button", { name: "Fix or view Hamza-1002" }));
  const panel = await screen.findByRole("region", { name: "Fix Hamza-1002" });
  return { panel, search };
}

describe("student fix panel", () => {
  it("shows the facts an admin needs to troubleshoot", async () => {
    const { panel } = await open(actions());
    expect(within(panel).getByText("Quiz results").nextSibling?.textContent).toBe("4");
    expect(within(panel).getByText("Classes attended").nextSibling?.textContent).toBe("3");
    expect(within(panel).getByText("hamid-dr28")).toBeTruthy();
    expect(within(panel).getByText("Fake Course Batch 1")).toBeTruthy();
  });

  it("saves a corrected name", async () => {
    const fix = actions();
    const { panel } = await open(fix);
    fireEvent.change(within(panel).getByLabelText("Full name"), { target: { value: "Hamid Ali" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Save name" }));
    await waitFor(() => expect(fix.rename).toHaveBeenCalledWith("a", "Hamid Ali"));
    expect(await within(panel).findByText("Name saved.")).toBeTruthy();
  });

  it("asks before giving a new ID, then shows both IDs", async () => {
    const fix = actions();
    const { panel } = await open(fix);
    fireEvent.click(within(panel).getByRole("button", { name: "Give a new ID" }));
    expect(fix.reissue).not.toHaveBeenCalled();
    const dialog = within(panel).getByRole("alertdialog", { name: "Confirm new ID" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Yes, give a new ID" }));
    await waitFor(() => expect(fix.reissue).toHaveBeenCalledWith("a"));
    expect(await within(panel).findByText("New ID: Hamid-1050. Hamza-1002 still works.")).toBeTruthy();
  });

  it("does not offer a new ID while a name change is unsaved", async () => {
    const { panel } = await open(actions());
    fireEvent.change(within(panel).getByLabelText("Full name"), { target: { value: "Hamid Ali" } });
    expect((within(panel).getByRole("button", { name: "Give a new ID" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("shows the plain message when adding an email fails", async () => {
    const fix = actions({ addEmail: vi.fn(async () => ({ ok: false as const, message: "This email belongs to Sara Khan (Sara-1003)." })) });
    const { panel } = await open(fix);
    fireEvent.change(within(panel).getByLabelText("Add an email"), { target: { value: "fake.sara@example.com" } });
    fireEvent.click(within(panel).getByRole("button", { name: "Add email" }));
    expect(await within(panel).findByText("This email belongs to Sara Khan (Sara-1003).")).toBeTruthy();
  });

  it("only lets an email be removed when there is another one", async () => {
    const { panel } = await open(actions());
    expect(within(panel).queryByRole("button", { name: /Remove/ })).toBeNull();
    cleanup();
    const fix = actions({ load: vi.fn(async () => ({ ok: true as const, person: detail({ emails: ["fake.a@example.com", "fake.b@example.com"] }) })) });
    const again = await open(fix);
    fireEvent.click(within(again.panel).getByRole("button", { name: "Remove fake.b@example.com" }));
    await waitFor(() => expect(fix.removeEmail).toHaveBeenCalledWith("a", "fake.b@example.com"));
  });

  it("sends the ID email to the chosen email", async () => {
    const fix = actions();
    const { panel } = await open(fix);
    fireEvent.click(within(panel).getByRole("button", { name: "Send ID email" }));
    await waitFor(() => expect(fix.sendId).toHaveBeenCalledWith("a", "fake.hamid@example.com"));
    expect(await within(panel).findByText("ID email sent to fake.hamid@example.com.")).toBeTruthy();
  });

  it("has no fix button when no fix tools are given", async () => {
    const search = vi.fn(async () => ({ ok: true as const, people: [row], truncated: false }));
    render(<PeopleLookup search={search} merge={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Search students"), { target: { value: "hamza" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => screen.getByText("Hamza-1002"));
    expect(screen.queryByRole("button", { name: /Fix or view/ })).toBeNull();
  });
});
