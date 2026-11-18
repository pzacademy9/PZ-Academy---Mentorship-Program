import { render, screen, fireEvent } from "@testing-library/react";
import { vi, describe, it, expect } from "vitest";
import { ContactsPanel } from "@/components/admin/crm/ContactsPanel";

const push = vi.fn();
const toastError = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { error: (...a: unknown[]) => toastError(...a), success: vi.fn() } }));
// A light stand-in for the list so 5001 picks do not mean 5001 rendered rows.
vi.mock("@/components/admin/crm/ContactsList", () => ({
  ContactsList: ({ onToggle }: { onToggle: (id: string) => void }) => (
    <button onClick={() => { for (let i = 0; i < 5001; i++) onToggle(`c${i}`); }}>Pick 5001</button>
  ),
}));

describe("Give to a sales agent limit", () => {
  it("refuses more than 5000 picks and does not navigate", () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({}) })));
    render(<ContactsPanel initialRows={[]} initialTotal={0} />);
    fireEvent.click(screen.getByRole("button", { name: "Pick 5001" }));
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Give to a sales agent" }));
    expect(toastError).toHaveBeenCalledWith("Select 5000 contacts or fewer at a time.");
    expect(push).not.toHaveBeenCalled();
  });
});
