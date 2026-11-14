import { describe, it, expect } from "vitest";
import { renderTemplate, whatsappDigits, whatsappHref, mailtoHref, searchAffiliates } from "@/lib/affiliates/message-templates";

describe("renderTemplate", () => {
  it("fills name and code", () => {
    expect(renderTemplate("Hi {name}, use {code}", { name: "Sara", code: "SARA10" })).toBe("Hi Sara, use SARA10");
  });
  it("uses 'your code' when there is no code", () => {
    expect(renderTemplate("Use {code}", { name: "Sara", code: null })).toBe("Use your code");
  });
  it("renders special characters in a name literally", () => {
    expect(renderTemplate("Hi {name}", { name: "A$&B", code: null })).toBe("Hi A$&B");
  });
  it("replaces every occurrence", () => {
    expect(renderTemplate("{name} {name}", { name: "X", code: null })).toBe("X X");
  });
});

describe("whatsappDigits", () => {
  it("turns a local number into 92 form", () => {
    expect(whatsappDigits("0300 123 4567")).toBe("923001234567");
  });
  it("strips plus, spaces and dashes", () => {
    expect(whatsappDigits("+92 300-1234567")).toBe("923001234567");
  });
  it("drops a leading 00", () => {
    expect(whatsappDigits("0092 300 1234567")).toBe("923001234567");
  });
  it("returns null for too few digits", () => {
    expect(whatsappDigits("12345")).toBeNull();
    expect(whatsappDigits("")).toBeNull();
  });
});

describe("whatsappHref", () => {
  it("builds a wa.me link with encoded text", () => {
    expect(whatsappHref("0300 123 4567", "Hi there & bye")).toBe("https://wa.me/923001234567?text=Hi%20there%20%26%20bye");
  });
  it("returns null for a bad number", () => {
    expect(whatsappHref("123", "x")).toBeNull();
  });
});

describe("mailtoHref", () => {
  it("encodes subject and body with CRLF newlines", () => {
    expect(mailtoHref("a@b.com", "Hi there", "Line1\nLine2")).toBe("mailto:a@b.com?subject=Hi%20there&body=Line1%0D%0ALine2");
  });
});

describe("searchAffiliates", () => {
  const rows = [
    { name: "Sara Khan", email: "sara@example.com", code: "SARA10" },
    { name: "Ali Raza", email: "ali@other.org", code: null },
  ];
  it("returns all for an empty query", () => {
    expect(searchAffiliates(rows, "   ")).toEqual(rows);
  });
  it("ignores case and extra spaces", () => {
    expect(searchAffiliates(rows, "  SARA   kh ")).toEqual([rows[0]]);
  });
  it("matches email and code", () => {
    expect(searchAffiliates(rows, "@example")).toEqual([rows[0]]);
    expect(searchAffiliates(rows, "sara10")).toEqual([rows[0]]);
  });
  it("handles a null code", () => {
    expect(searchAffiliates(rows, "zzz")).toEqual([]);
  });
});
