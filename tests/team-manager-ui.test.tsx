import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/ui/confirm-dialog", () => ({ useConfirm: () => async () => true }));

import { TeamManager } from "@/components/admin/team/TeamManager";
import { accessSummary, areaLabel, diffFromStarting } from "@/lib/team/summary";
import { AREAS } from "@/lib/team/areas";
import type { TeamMember } from "@/lib/data/team-access";

const none = { extra: [], removed: [] };
const members: TeamMember[] = [
  { id: "owner", email: "owner@test.dev", fullName: "Owner Test", role: "super_admin", custom: none, active: true },
  { id: "m1", email: "mia@test.dev", fullName: "Mia Manager", role: "manager", custom: { extra: ["marketing"], removed: ["landing_pages"] }, active: true },
  { id: "a1", email: "ali@test.dev", fullName: "Ali Admin", role: "admin", custom: none, active: true },
  { id: "x1", email: "sam@test.dev", fullName: "Sam Off", role: "student", custom: { extra: [], removed: [] }, active: false },
];

describe("accessSummary", () => {
  it("names the role alone when nothing is custom", () => {
    expect(accessSummary("manager", none)).toBe("Manager");
    expect(accessSummary("admin", none)).toBe("Admin");
    expect(accessSummary("super_admin", none)).toBe("Super Admin");
  });
  it("lists what is added and what is taken away, in plain words", () => {
    expect(accessSummary("manager", { extra: ["marketing"], removed: ["landing_pages"] })).toBe("Manager, plus Marketing, minus Landing pages");
  });
});

describe("diffFromStarting", () => {
  it("turns a ticked list back into plus and minus against the role", () => {
    const ticked = AREAS.filter((a) => a !== "team" && a !== "landing_pages" && a !== "terms" && a !== "payment_accounts" && a !== "sheet_sync");
    expect(diffFromStarting("admin", ticked)).toEqual({ extra: [], removed: ["landing_pages"] });
  });
});

describe("areaLabel", () => {
  it("has a plain label for every area", () => {
    for (const a of AREAS) expect(areaLabel(a).length).toBeGreaterThan(2);
  });
});

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ ok: true }) })));
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("TeamManager", () => {
  it("shows the summary line and a Custom tag for a manager with custom areas", () => {
    render(<TeamManager members={members} />);
    expect(screen.getByText("Manager, plus Marketing, minus Landing pages")).toBeTruthy();
    expect(screen.getAllByText("Custom").length).toBe(1);
  });
  it("gives the super admin no Edit or Switch off button", () => {
    render(<TeamManager members={members} />);
    const row = screen.getByText("Owner Test").closest("li")!;
    expect(row.querySelector("button")).toBeNull();
  });
  it("never offers Team as a tickable area", () => {
    render(<TeamManager members={members} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Mia Manager" }));
    const row = within(screen.getByText("Mia Manager").closest("li")!);
    expect(row.queryByLabelText("Team")).toBeNull();
    expect(screen.queryByLabelText("Team")).toBeNull();
    expect((row.getByLabelText("Marketing") as HTMLInputElement).checked).toBe(true);
    expect((row.getByLabelText("Landing pages") as HTMLInputElement).checked).toBe(false);
  });
  it("saves a changed tick as plus and minus against the role", async () => {
    render(<TeamManager members={members} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Ali Admin" }));
    const row = within(screen.getByText("Ali Admin").closest("li")!);
    fireEvent.click(row.getByLabelText("Landing pages"));
    fireEvent.click(row.getByRole("button", { name: "Save access" }));
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/admin/team/a1");
    expect((init as RequestInit).method).toBe("PATCH");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ role: "admin", extra: [], removed: ["landing_pages"] });
  });
  it("offers Add back for a switched-off person and links sales agents to Sales Hub", () => {
    render(<TeamManager members={members} />);
    expect(screen.getByRole("button", { name: "Add back Sam Off" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Sales Hub/ }).getAttribute("href")).toBe("/dashboard/admin/sales-hub/team");
  });
});
