import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ readEmailMessage: vi.fn(), getEmailMessage: vi.fn() }));
vi.mock("@/lib/auth/require-admin", () => ({ requireAdminPage: async () => ({}) }));
vi.mock("@/lib/data/affiliates", () => ({ listAffiliates: async () => [] }));
vi.mock("@/lib/data/affiliate-emails", () => ({ affiliatesWithFailedEmail: async () => new Set<string>() }));
vi.mock("@/lib/data/affiliate-email-settings", () => ({ readEmailMessage: m.readEmailMessage, getEmailMessage: m.getEmailMessage }));
const pay = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("@/lib/data/affiliate-payouts", () => ({ listAdminPayouts: pay.list }));
vi.mock("@/lib/data/affiliate-leaderboard", () => ({ getAffiliateBoard: async () => null, getBoardToken: async () => null }));

import AdminAffiliatesPage from "@/app/dashboard/admin/affiliates/page";

function propsOf(el: ReactElement) {
  const kids = (el.props as { children: ReactElement[] }).children;
  return (kids[kids.length - 1] as ReactElement).props as { emailMessage: string; emailMessageFailed: boolean };
}

beforeEach(() => {
  m.readEmailMessage.mockReset();
  m.getEmailMessage.mockReset();
  pay.list.mockReset().mockResolvedValue([]);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("admin affiliates page: message read", () => {
  it("passes the failed flag when the message read throws", async () => {
    m.readEmailMessage.mockRejectedValue(new Error("db down"));
    const p = propsOf((await AdminAffiliatesPage()) as ReactElement);
    expect(p.emailMessageFailed).toBe(true);
    expect(p.emailMessage).toBe("");
  });
  it("passes the saved text and no failure when the read works", async () => {
    m.readEmailMessage.mockResolvedValue("Hi");
    const p = propsOf((await AdminAffiliatesPage()) as ReactElement);
    expect(p.emailMessageFailed).toBe(false);
    expect(p.emailMessage).toBe("Hi");
  });
});

describe("admin affiliates page: payouts read", () => {
  it("passes an empty list and the failed flag when the payouts read throws", async () => {
    pay.list.mockRejectedValue(new Error("db down"));
    const kids = ((await AdminAffiliatesPage()) as ReactElement).props.children as ReactElement[];
    const p = kids[kids.length - 1].props as { payouts: unknown[]; payoutsFailed: boolean };
    expect(p.payoutsFailed).toBe(true);
    expect(p.payouts).toEqual([]);
  });
});
