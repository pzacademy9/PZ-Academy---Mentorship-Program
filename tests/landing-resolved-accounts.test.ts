// @vitest-environment node
// tests/landing-resolved-accounts.test.ts
// The status email lists the central payment accounts of the lead's region.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { PPC_CONFIG, contentWith } from "./helpers/landing-fixtures";
import type { RegistrationRecord } from "@/lib/data/landing-registrations";
import type { RegistrablePage } from "@/lib/data/landing-public";

const m = vi.hoisted(() => ({ listPaymentAccounts: vi.fn(), resolveAccountKeysSafe: vi.fn() }));
vi.mock("@/lib/data/landing-payment-accounts", () => ({ listPaymentAccounts: m.listPaymentAccounts }));
vi.mock("@/lib/data/landing-payment-countries", () => ({ resolveAccountKeysSafe: m.resolveAccountKeysSafe }));
vi.mock("@/lib/data/landing-enrollment", () => ({ resolveAccess: vi.fn() }));

import { emailContext } from "@/lib/landing/registration/status-email";

const lead = (over: Partial<RegistrationRecord> = {}) =>
  ({ id: "reg-1", region: "PK", status: "pending", name: "A", email: "a@x.com", refId: "PZA-PPC-001", optionLabel: "Full", optionKeys: ["full"], mode: "live", groupSize: 1, expectedAmount: 4800, currency: "PKR", ...over }) as RegistrationRecord;
const page = { id: "page-1", slug: "ppc", title: "PPC", status: "published", content: contentWith(PPC_CONFIG), registration: PPC_CONFIG, sheetId: "s", driveFolderId: "f", refPrefix: "PPC", courseId: null, variantKey: "" } as RegistrablePage;

beforeEach(() => {
  m.listPaymentAccounts.mockReset();
  m.resolveAccountKeysSafe.mockReset();
  m.resolveAccountKeysSafe.mockResolvedValue({ PK: ["hbl", "easypaisa"], UAE: ["mashreq"] });
  m.listPaymentAccounts.mockResolvedValue([{ key: "hbl", label: "HBL", kind: "bank", rows: [], displayText: "" }]);
});

describe("emailContext accounts", () => {
  it("lists the accounts of the resolved keys for the lead's region", async () => {
    const ctx = await emailContext(lead(), page);
    expect(m.listPaymentAccounts).toHaveBeenCalledWith(["hbl", "easypaisa"]);
    expect(ctx.accounts.map((a) => a.key)).toEqual(["hbl"]);
  });
  it("lists none for a free registration, without asking for accounts", async () => {
    const ctx = await emailContext(lead({ status: "free" }), page);
    expect(ctx.accounts).toEqual([]);
    expect(m.listPaymentAccounts).not.toHaveBeenCalled();
  });
});
