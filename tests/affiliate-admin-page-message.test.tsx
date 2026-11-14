import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement } from "react";

vi.mock("server-only", () => ({}));
const m = vi.hoisted(() => ({ readEmailMessage: vi.fn(), getEmailMessage: vi.fn() }));
vi.mock("@/lib/auth/require-admin", () => ({ requireAdminPage: async () => ({}) }));
vi.mock("@/lib/data/affiliates", () => ({ listAffiliates: async () => [] }));
vi.mock("@/lib/data/affiliate-emails", () => ({ affiliatesWithFailedEmail: async () => new Set<string>() }));
vi.mock("@/lib/data/affiliate-email-settings", () => ({ readEmailMessage: m.readEmailMessage, getEmailMessage: m.getEmailMessage }));
const pay = vi.hoisted(() => ({ list: vi.fn() }));
const tpl = vi.hoisted(() => ({ list: vi.fn() }));
const snd = vi.hoisted(() => ({ list: vi.fn() }));
vi.mock("@/lib/data/affiliate-motivation-sends", () => ({ listMotivationSends: snd.list }));
vi.mock("@/lib/data/affiliate-templates", () => ({ listAffiliateTemplates: tpl.list }));
vi.mock("@/lib/data/affiliate-payouts", () => ({ listAdminPayouts: pay.list }));
vi.mock("@/lib/data/affiliate-leaderboard", () => ({ getAffiliateBoard: async () => null, getBoardToken: async () => null }));

import { tabSubtitle } from "@/lib/affiliates/hub-routes";
import AdminAffiliatesPage from "@/app/dashboard/admin/affiliates/page";

function propsOf(el: ReactElement) {
  const kids = (el.props as { children: ReactElement[] }).children;
  return (kids[kids.length - 1] as ReactElement).props as { emailMessage: string; emailMessageFailed: boolean };
}

beforeEach(() => {
  m.readEmailMessage.mockReset();
  m.getEmailMessage.mockReset();
  pay.list.mockReset().mockResolvedValue([]);
  tpl.list.mockReset().mockResolvedValue([]);
  snd.list.mockReset().mockResolvedValue([]);
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("admin affiliates page: message read", () => {
  it("passes the failed flag when the message read throws", async () => {
    m.readEmailMessage.mockRejectedValue(new Error("db down"));
    const p = propsOf((await AdminAffiliatesPage({})) as ReactElement);
    expect(p.emailMessageFailed).toBe(true);
    expect(p.emailMessage).toBe("");
  });
  it("passes the saved text and no failure when the read works", async () => {
    m.readEmailMessage.mockResolvedValue("Hi");
    const p = propsOf((await AdminAffiliatesPage({})) as ReactElement);
    expect(p.emailMessageFailed).toBe(false);
    expect(p.emailMessage).toBe("Hi");
  });
});

describe("admin affiliates page: payouts read", () => {
  it("passes an empty list and the failed flag when the payouts read throws", async () => {
    pay.list.mockRejectedValue(new Error("db down"));
    const kids = ((await AdminAffiliatesPage({})) as ReactElement).props.children as ReactElement[];
    const p = kids[kids.length - 1].props as { payouts: unknown[]; payoutsFailed: boolean };
    expect(p.payoutsFailed).toBe(true);
    expect(p.payouts).toEqual([]);
  });
});

describe("admin affiliates page: section from the address", () => {
  const tabOf = async (sp?: { tab?: string }) => {
    m.readEmailMessage.mockResolvedValue("");
    const kids = ((await AdminAffiliatesPage({ searchParams: sp })) as ReactElement).props.children as ReactElement[];
    return (kids[kids.length - 1].props as { tab: string }).tab;
  };
  it("opens the section named in ?tab=", async () => {
    expect(await tabOf({ tab: "payouts" })).toBe("payouts");
  });
  it("opens Applications for a missing or mistyped tab", async () => {
    expect(await tabOf({})).toBe("applications");
    expect(await tabOf({ tab: "nope" })).toBe("applications");
  });
});

describe("admin affiliates page: templates and subtitle", () => {
  const kidsOf = async (sp?: { tab?: string }) => {
    m.readEmailMessage.mockResolvedValue("");
    return ((await AdminAffiliatesPage({ searchParams: sp })) as ReactElement).props.children as ReactElement[];
  };
  it("passes templates split by channel", async () => {
    tpl.list.mockResolvedValue([
      { id: "1", channel: "whatsapp", name: "W", subject: null, body: "b" },
      { id: "2", channel: "email", name: "E", subject: "s", body: "b" },
    ]);
    const kids = await kidsOf({ tab: "affiliates" });
    const p = kids[kids.length - 1].props as { templates: { whatsapp: { id: string }[]; email: { id: string }[] }; templatesFailed: boolean };
    expect(p.templatesFailed).toBe(false);
    expect(p.templates.whatsapp.map((t) => t.id)).toEqual(["1"]);
    expect(p.templates.email.map((t) => t.id)).toEqual(["2"]);
  });
  it("passes no templates and the failed flag when the read throws", async () => {
    tpl.list.mockRejectedValue(new Error("db down"));
    const kids = await kidsOf({ tab: "affiliates" });
    const p = kids[kids.length - 1].props as { templates: unknown; templatesFailed: boolean };
    expect(p.templatesFailed).toBe(true);
    expect(p.templates).toBeNull();
  });
  it("shows the subtitle of the open section", async () => {
    for (const tab of ["applications", "affiliates", "payouts", "leaderboard", "emails"] as const) {
      const kids = await kidsOf({ tab });
      const header = kids[0] as ReactElement;
      const sub = (header.props as { children: ReactElement[] }).children[1];
      expect((sub.props as { children: string }).children).toBe(tabSubtitle(tab));
    }
  });
});

describe("admin affiliates page: per-tab loading", () => {
  const run = async (tab: string) => {
    m.readEmailMessage.mockResolvedValue("");
    return ((await AdminAffiliatesPage({ searchParams: { tab } })) as ReactElement).props.children as ReactElement[];
  };
  it("loads neither templates nor sends on Applications", async () => {
    const kids = await run("applications");
    expect(tpl.list).not.toHaveBeenCalled();
    expect(snd.list).not.toHaveBeenCalled();
    const p = kids[kids.length - 1].props as { templates: unknown; templatesFailed: boolean; sends: unknown[]; sendsFailed: boolean };
    expect(p.templates).toBeNull();
    expect(p.templatesFailed).toBe(false);
    expect(p.sends).toEqual([]);
    expect(p.sendsFailed).toBe(false);
  });
  it("loads only templates on Affiliates", async () => {
    await run("affiliates");
    expect(tpl.list).toHaveBeenCalledTimes(1);
    expect(snd.list).not.toHaveBeenCalled();
  });
  it("loads only sends on Emails and flags a failed read", async () => {
    snd.list.mockRejectedValue(new Error("db down"));
    const kids = await run("emails");
    expect(tpl.list).not.toHaveBeenCalled();
    expect(snd.list).toHaveBeenCalledTimes(1);
    const p = kids[kids.length - 1].props as { sendsFailed: boolean; sends: unknown[] };
    expect(p.sendsFailed).toBe(true);
    expect(p.sends).toEqual([]);
  });
});
