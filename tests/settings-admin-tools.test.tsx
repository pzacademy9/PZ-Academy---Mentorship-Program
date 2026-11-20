import { render, screen } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { ADMIN_TOOLS, toolsForRole } from "@/components/dashboard/nav";
import { AdminToolCards } from "@/components/dashboard/AdminToolCards";
import SettingsPage from "@/app/dashboard/settings/page";

const viewer = vi.hoisted(() => ({ value: { role: "student", areas: undefined } as { role: string; areas: string[] | undefined } }));

vi.mock("next/navigation", () => ({ redirect: vi.fn(), useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/components/dashboard/SettingsForm", () => ({ SettingsForm: () => <div>profile form</div> }));
vi.mock("@/lib/auth/viewer-areas", () => ({ getViewerRoleAndAreas: vi.fn(async () => viewer.value) }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) },
    from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { full_name: "A", avatar_url: null } }) }) }) }),
  }),
}));

beforeEach(() => { viewer.value = { role: "student", areas: undefined }; });

describe("AdminToolCards", () => {
  it("renders four links with the right hrefs", () => {
    render(<AdminToolCards tools={ADMIN_TOOLS} />);
    expect(screen.getByRole("heading", { name: "Admin tools" })).toBeTruthy();
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(ADMIN_TOOLS.map((t) => t.href));
    expect(hrefs).toHaveLength(4);
  });
  it("renders nothing for an empty list", () => {
    const { container } = render(<AdminToolCards tools={toolsForRole("student")} />);
    expect(container.innerHTML).toBe("");
  });
});

describe("Settings page", () => {
  it("manager with terms sees only the Terms card", async () => {
    viewer.value = { role: "manager", areas: ["terms"] };
    render(await SettingsPage());
    expect(screen.getByText("profile form")).toBeTruthy();
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0].getAttribute("href")).toBe("/dashboard/admin/terms");
  });
  it("student sees the form and no Admin tools heading", async () => {
    render(await SettingsPage());
    expect(screen.getByText("profile form")).toBeTruthy();
    expect(screen.queryByText("Admin tools")).toBeNull();
  });
});
