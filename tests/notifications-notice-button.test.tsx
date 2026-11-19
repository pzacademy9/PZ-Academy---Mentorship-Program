import { render, screen } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach } from "vitest";
import { canSendNotice } from "@/components/dashboard/nav";
import NotificationsPage from "@/app/dashboard/notifications/page";

const viewer = vi.hoisted(() => ({ value: { role: "student", areas: undefined } as { role: string; areas: string[] | undefined } }));

vi.mock("next/navigation", () => ({ redirect: vi.fn(), useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/components/dashboard/NotificationHistory", () => ({ NotificationHistory: () => <div>history</div> }));
vi.mock("@/lib/data/notifications", () => ({ getNotifications: vi.fn(async () => []), getUnreadNotificationCount: vi.fn(async () => 0) }));
vi.mock("@/lib/auth/viewer-areas", () => ({ getViewerRoleAndAreas: vi.fn(async () => viewer.value) }));
vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: async () => ({ auth: { getUser: async () => ({ data: { user: { id: "u1" } } }) } }),
}));

beforeEach(() => { viewer.value = { role: "student", areas: undefined }; });

describe("canSendNotice", () => {
  it("follows role and areas", () => {
    expect(canSendNotice("super_admin")).toBe(true);
    expect(canSendNotice("admin", undefined)).toBe(true);
    expect(canSendNotice("manager", undefined)).toBe(false);
    expect(canSendNotice("manager", ["notifications"])).toBe(true);
    expect(canSendNotice("manager", ["terms"])).toBe(false);
    expect(canSendNotice("admin", [])).toBe(false);
    expect(canSendNotice("student")).toBe(false);
    expect(canSendNotice("mentor")).toBe(false);
    expect(canSendNotice("sales_agent")).toBe(false);
  });
});

describe("Notifications page", () => {
  it("shows Send a notice for super admin", async () => {
    viewer.value = { role: "super_admin", areas: undefined };
    render(await NotificationsPage());
    expect(screen.getByRole("link", { name: /Send a notice/ }).getAttribute("href")).toBe("/dashboard/admin/notifications");
  });
  it("hides it for a student", async () => {
    render(await NotificationsPage());
    expect(screen.queryByText(/Send a notice/)).toBeNull();
  });
});
