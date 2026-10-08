import {
  MAX_CAMPAIGN_RECIPIENTS, hasNameTag, varietyBlocked, describeDropped,
  splitTodayTomorrow, defaultCampaignName, classifyRefusal, pauseReasonText,
} from "@/lib/crm/campaign-rules";

describe("variety", () => {
  it("detects the name tags with stray whitespace", () => {
    expect(hasNameTag("Hi {{first_name}}")).toBe(true);
    expect(hasNameTag("Hi {{ full_name }}")).toBe(true);
    expect(hasNameTag("Hi there")).toBe(false);
    expect(hasNameTag("Hi {{email}}")).toBe(false);
  });
  it("blocks a name-less message only above 3 recipients", () => {
    expect(varietyBlocked("Hello", 3)).toBe(false);
    expect(varietyBlocked("Hello", 4)).toBe(true);
    expect(varietyBlocked("Hello {{first_name}}", 500)).toBe(false);
  });
});

describe("describeDropped", () => {
  it("lists only non-zero reasons in plain words", () => {
    expect(describeDropped({ notOwned: 0, doNotContact: 3, noPhone: 1, duplicates: 0 })).toEqual([
      "3 skipped: asked not to be messaged",
      "1 skipped: no phone number",
    ]);
    expect(describeDropped({ notOwned: 2, doNotContact: 0, noPhone: 0, duplicates: 4 })).toEqual([
      "2 skipped: not your contact",
      "4 skipped: picked twice",
    ]);
    expect(describeDropped({ notOwned: 0, doNotContact: 0, noPhone: 0, duplicates: 0 })).toEqual([]);
  });
});

describe("splitTodayTomorrow", () => {
  it("never goes negative and sums to the selection", () => {
    expect(splitTodayTomorrow(85, 46)).toEqual({ today: 46, tomorrow: 39 });
    expect(splitTodayTomorrow(10, 46)).toEqual({ today: 10, tomorrow: 0 });
    expect(splitTodayTomorrow(10, 0)).toEqual({ today: 0, tomorrow: 10 });
    expect(splitTodayTomorrow(10, -5)).toEqual({ today: 0, tomorrow: 10 });
  });
});

it("defaultCampaignName is stable and readable", () => {
  expect(defaultCampaignName(new Date("2026-10-06T10:00:00Z"))).toBe("Campaign 6 Oct");
});

describe("classifyRefusal", () => {
  it("permanent per-person refusals block the recipient", () => {
    for (const r of ["do-not-contact", "no-phone", "not-owner", "not-found"]) expect(classifyRefusal(r)).toBe("block-recipient");
  });
  it("number or window problems pause the campaign", () => {
    for (const r of ["frozen", "quiet_hours", "daily_cap", "hourly_cap", "number-not-assigned"]) expect(classifyRefusal(r)).toBe("pause");
  });
  it("short waits and errors just retry", () => {
    for (const r of ["spacing", "db-error", "something-new"]) expect(classifyRefusal(r)).toBe("retry");
  });
});

it("pauseReasonText prefers the server message", () => {
  expect(pauseReasonText("quiet_hours", "Messaging opens at 09:00.")).toBe("Messaging opens at 09:00.");
  expect(pauseReasonText("daily_cap")).toBe("Today's new chats are used up.");
  expect(pauseReasonText("frozen")).toBe("This number is paused.");
  expect(pauseReasonText("number-not-assigned")).toBe("No WhatsApp number is assigned to you.");
  expect(pauseReasonText("other")).toBe("Sending is paused.");
});

it("the cap is 2000", () => expect(MAX_CAMPAIGN_RECIPIENTS).toBe(2000));
