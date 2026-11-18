import { readFileSync } from "node:fs";
import { render, screen, fireEvent } from "@testing-library/react";
import { vi, describe, it, expect } from "vitest";
import { ContactsPanel } from "@/components/admin/crm/ContactsPanel";
import type { ContactRow } from "@/lib/data/admin-crm-contacts";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const FILES = [
  "src/components/admin/crm/ContactsPanel.tsx",
  "src/components/admin/crm/ContactsList.tsx",
  "src/components/admin/crm/ContactsActions.tsx",
  "tests/contacts-guided-actions.test.tsx",
  "tests/contacts-guided-actions-limit.test.tsx",
  "tests/contacts-guided-list.test.tsx",
  "tests/contacts-guided-encoding.test.tsx",
];

const row: ContactRow = {
  id: "c0", fullName: "Person 0", email: "person0@example.com", phoneE164: "+923000000000",
  country: "Pakistan", discoverySource: "sheet", purchaseCount: 0, productLabels: [], unsubscribed: false,
};

describe("contacts source encoding", () => {
  it.each(FILES)("%s is valid UTF-8", (file) => {
    const bytes = readFileSync(file);
    expect(() => new TextDecoder("utf-8", { fatal: true }).decode(bytes)).not.toThrow();
  });

  it("the converted form shows the real ellipsis character", () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ courses: [], values: [], batches: [] }) })));
    render(<ContactsPanel initialRows={[row]} initialTotal={1} />);
    fireEvent.click(screen.getByLabelText("Select Person 0"));
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Mark as converted" }));
    expect(screen.getByRole("option", { name: "Select a course\u2026" })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Other program (type a name)" }));
    fireEvent.click(screen.getByRole("radio", { name: "Existing course" }));
    expect(screen.getByRole("option", { name: "Select a course\u2026" })).toBeTruthy();
  });
});
