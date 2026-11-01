import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { StudentIdsPanel } from "@/components/admin/ids/StudentIdsPanel";
import { rowFromLabels } from "@/lib/pzid/id-list";

const rows = [
  rowFromLabels("Sample Doctor-0012", "PPC4-0012", ["Live - Full Course"]),
  rowFromLabels("Sample Clinician-0045", "PPC4-0045", ["Live - Modules: M1"]),
  rowFromLabels("Sample Resident-0104", "PPC4-0104", ["Live - Modules: M1", "Live - Modules: M3"]),
  rowFromLabels("Sample Scholar-0138", "PPC4-0138", ["garbage"]),
];

let write: ReturnType<typeof vi.fn>;
beforeEach(() => {
  write = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText: write }, configurable: true });
});
afterEach(cleanup);

const chip = (re: RegExp) => screen.getByRole("button", { name: re });

describe("StudentIdsPanel", () => {
  it("shows counts on the chips and stat cards", () => {
    render(<StudentIdsPanel pageTitle="PPC Batch 4" rows={rows} />);
    expect(chip(/^All\s*4/).textContent).toContain("4");
    expect(chip(/^Full course\s*1/).textContent).toContain("1");
    expect(chip(/^Module 1\s*2/).textContent).toContain("2");
    expect(chip(/^Module 2\s*0/).textContent).toContain("0");
    expect(screen.getByText("Total enrolled")).toBeTruthy();
    expect(screen.getByText("Modular")).toBeTruthy();
  });

  it("filters by module chip and resets", () => {
    render(<StudentIdsPanel pageTitle="B" rows={rows} />);
    fireEvent.click(chip(/^Module 3/));
    expect(screen.getByText("Sample Resident-0104")).toBeTruthy();
    expect(screen.queryByText("Sample Doctor-0012")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Reset" }));
    expect(screen.getByText("Sample Doctor-0012")).toBeTruthy();
  });

  it("searches by PZ ID and shows the empty state", () => {
    render(<StudentIdsPanel pageTitle="B" rows={rows} />);
    const box = screen.getByPlaceholderText("Search by name or PZ ID");
    fireEvent.change(box, { target: { value: "0045" } });
    expect(screen.getByText("Sample Clinician-0045")).toBeTruthy();
    expect(screen.queryByText("Sample Doctor-0012")).toBeNull();
    fireEvent.change(box, { target: { value: "zzz" } });
    expect(screen.getByText("No students match this filter.")).toBeTruthy();
  });

  it("copies one PZ ID and shows Copied", async () => {
    render(<StudentIdsPanel pageTitle="B" rows={rows} />);
    const btn = screen.getByRole("button", { name: "Copy ID PPC4-0045" });
    fireEvent.click(btn);
    await waitFor(() => expect(btn.textContent).toContain("Copied"));
    expect(write).toHaveBeenCalledWith("PPC4-0045");
  });

  it("copies all IDs in the filter as Name - PZ ID lines", async () => {
    render(<StudentIdsPanel pageTitle="B" rows={rows} />);
    fireEvent.click(chip(/^Module 1/));
    fireEvent.click(screen.getByRole("button", { name: /Copy all IDs in this filter/ }));
    await waitFor(() => expect(write).toHaveBeenCalled());
    expect(write).toHaveBeenCalledWith("Sample Clinician-0045 - PPC4-0045\nSample Resident-0104 - PPC4-0104");
  });

  it("says Copy failed when the clipboard is blocked, without throwing", async () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    render(<StudentIdsPanel pageTitle="B" rows={rows} />);
    const btn = screen.getByRole("button", { name: "Copy ID PPC4-0045" });
    fireEvent.click(btn);
    await waitFor(() => expect(btn.textContent).toContain("Copy failed"));
  });

  it("shows a Scope not set chip only when someone has no readable scope", () => {
    const { unmount } = render(<StudentIdsPanel pageTitle="B" rows={rows} />);
    fireEvent.click(chip(/^Scope not set\s*1/));
    expect(screen.getByText("Sample Scholar-0138")).toBeTruthy();
    expect(screen.queryByText("Sample Doctor-0012")).toBeNull();
    unmount();
    render(<StudentIdsPanel pageTitle="B" rows={rows.slice(0, 3)} />);
    expect(screen.queryByRole("button", { name: /^Scope not set/ })).toBeNull();
  });

  it("handles an empty batch", () => {
    render(<StudentIdsPanel pageTitle="B" rows={[]} />);
    expect(screen.getByText("No students enrolled yet.")).toBeTruthy();
    expect((screen.getByRole("button", { name: /Copy all IDs in this filter/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /Download ID PDF/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("never shows an email", () => {
    const { container } = render(<StudentIdsPanel pageTitle="B" rows={rows} />);
    expect(container.textContent).not.toContain("@");
  });
});
