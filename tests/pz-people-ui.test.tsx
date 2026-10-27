import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PeopleLookup } from "@/components/admin/people/PeopleLookup";

const hamid = { id: "a", pzId: "Hamid-1002", name: "Hamid Ali", emails: ["hamid@gmail.com"], batches: 2 };
const other = { id: "b", pzId: "Hamid-4821", name: "Hamid A.", emails: ["h.ali@yahoo.com"], batches: 1 };

async function setup(mergeResult: { ok: true } | { ok: false; message: string } = { ok: true }) {
  const search = vi
    .fn()
    .mockResolvedValueOnce({ ok: true, people: [hamid, other], truncated: false })
    .mockResolvedValue({ ok: true, people: [{ ...hamid, batches: 3 }], truncated: false });
  const merge = vi.fn(async () => mergeResult);
  render(<PeopleLookup search={search} merge={merge} />);
  fireEvent.change(screen.getByLabelText("Search people"), { target: { value: "hamid" } });
  fireEvent.click(screen.getByRole("button", { name: "Search" }));
  await waitFor(() => expect(screen.getByText("Hamid-4821")).toBeTruthy());
  return { search, merge };
}

describe("PeopleLookup", () => {
  it("shows ID, name, emails and number of batches", async () => {
    await setup();
    expect(screen.getByText("Hamid Ali")).toBeTruthy();
    expect(screen.getByText("hamid@gmail.com")).toBeTruthy();
    expect(screen.getByText("2 batches")).toBeTruthy();
    expect(screen.getByText("1 batch")).toBeTruthy();
  });

  it("does not search for fewer than 3 characters", () => {
    const search = vi.fn();
    render(<PeopleLookup search={search} merge={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Search people"), { target: { value: "ab" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    expect(screen.getByText("Type at least 3 characters.")).toBeTruthy();
    expect(search).not.toHaveBeenCalled();
  });

  it("only offers merging once two people are selected", async () => {
    await setup();
    expect(screen.queryByRole("button", { name: "Merge into this person" })).toBeNull();
    fireEvent.click(screen.getByLabelText("Select Hamid-1002"));
    expect(screen.queryByRole("button", { name: "Merge into this person" })).toBeNull();
    fireEvent.click(screen.getByLabelText("Select Hamid-4821"));
    expect(screen.getAllByRole("button", { name: "Merge into this person" })).toHaveLength(2);
  });

  it("asks for confirmation naming both IDs and merges only after confirming", async () => {
    const { merge, search } = await setup();
    fireEvent.click(screen.getByLabelText("Select Hamid-1002"));
    fireEvent.click(screen.getByLabelText("Select Hamid-4821"));
    // keep Hamid-1002 (first card)
    fireEvent.click(screen.getAllByRole("button", { name: "Merge into this person" })[0]);
    expect(
      screen.getByText(
        "Merge Hamid-4821 into Hamid-1002? The first ID will keep working and point to the second person. This cannot be undone.",
      ),
    ).toBeTruthy();
    expect(merge).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Yes, merge them" }));
    await waitFor(() => expect(merge).toHaveBeenCalledWith("a", "b"));
    await waitFor(() => expect(screen.getByText("Done. Hamid-4821 now points to Hamid-1002 and still works.")).toBeTruthy());
    expect(search).toHaveBeenLastCalledWith("Hamid-1002");
    expect(screen.queryByText("Hamid-4821")).toBeNull();
  });

  it("cancel leaves everything unmerged", async () => {
    const { merge } = await setup();
    fireEvent.click(screen.getByLabelText("Select Hamid-1002"));
    fireEvent.click(screen.getByLabelText("Select Hamid-4821"));
    fireEvent.click(screen.getAllByRole("button", { name: "Merge into this person" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(merge).not.toHaveBeenCalled();
  });

  it("shows the plain error when the merge fails", async () => {
    await setup({ ok: false, message: "Could not merge these people. Nothing was changed. Please try again." });
    fireEvent.click(screen.getByLabelText("Select Hamid-1002"));
    fireEvent.click(screen.getByLabelText("Select Hamid-4821"));
    fireEvent.click(screen.getAllByRole("button", { name: "Merge into this person" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Yes, merge them" }));
    await waitFor(() => expect(screen.getByText(/Could not merge these people/)).toBeTruthy());
  });

  it("tells the admin when only the first 20 matches are shown", async () => {
    const search = vi.fn().mockResolvedValue({ ok: true, people: [hamid, other], truncated: true });
    render(<PeopleLookup search={search} merge={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Search people"), { target: { value: "hamid" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() =>
      expect(screen.getByText("Showing the first 20 matches. Type more of the name to narrow it down.")).toBeTruthy(),
    );
  });

  it("does not show the truncation line when nothing was cut", async () => {
    await setup();
    expect(screen.queryByText(/Showing the first 20 matches/)).toBeNull();
  });

  it("after a merge, a failed refresh shows only a short neutral line, not the error", async () => {
    const search = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, people: [hamid, other], truncated: false })
      .mockResolvedValue({ ok: false, message: "Could not search people. Please try again." });
    const merge = vi.fn(async () => ({ ok: true as const }));
    render(<PeopleLookup search={search} merge={merge} />);
    fireEvent.change(screen.getByLabelText("Search people"), { target: { value: "hamid" } });
    fireEvent.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(screen.getByText("Hamid-4821")).toBeTruthy());
    fireEvent.click(screen.getByLabelText("Select Hamid-1002"));
    fireEvent.click(screen.getByLabelText("Select Hamid-4821"));
    fireEvent.click(screen.getAllByRole("button", { name: "Merge into this person" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Yes, merge them" }));
    await waitFor(() => expect(screen.getByText("Merged. The list could not refresh, search again.")).toBeTruthy());
    expect(screen.queryByText(/Could not search people/)).toBeNull();
    expect(screen.queryByText(/^Done\./)).toBeNull();
  });
});
