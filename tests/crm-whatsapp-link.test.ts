import { describe, it, expect } from "vitest";
import { buildWhatsAppLink, firstNameOf } from "@/lib/crm/whatsapp-link";

describe("firstNameOf", () => {
  it("returns the first token of a multi-word name", () => {
    expect(firstNameOf("Ayesha Khan")).toBe("Ayesha");
  });

  it("returns the whole name when there is no space", () => {
    // Real data in this CRM — e.g. contact "Somaan" has no surname on file.
    expect(firstNameOf("Somaan")).toBe("Somaan");
  });

  it("returns an empty string for a blank name", () => {
    expect(firstNameOf("   ")).toBe("");
  });

  it("collapses repeated internal whitespace", () => {
    expect(firstNameOf("  Ayesha   Khan ")).toBe("Ayesha");
  });
});

describe("buildWhatsAppLink", () => {
  it("links straight to web.whatsapp.com/send with phone and encoded message", () => {
    const link = buildWhatsAppLink("+923001234567", "Hi {{first_name}}!", "Ayesha Khan");
    const url = new URL(link);
    expect(url.origin + url.pathname).toBe("https://web.whatsapp.com/send");
    expect(url.searchParams.get("phone")).toBe("923001234567");
    expect(url.searchParams.get("text")).toBe("Hi Ayesha!");
  });

  it("substitutes both merge tags", () => {
    const link = buildWhatsAppLink("+923001234567", "{{full_name}} ({{first_name}})", "Ayesha Khan");
    expect(new URL(link).searchParams.get("text")).toBe("Ayesha Khan (Ayesha)");
  });

  it("leaves a message with no merge tags untouched", () => {
    const link = buildWhatsAppLink("+923001234567", "Hello there, no personalization here.", "Ayesha Khan");
    expect(new URL(link).searchParams.get("text")).toBe("Hello there, no personalization here.");
  });

  it("does not crash on a single-word name", () => {
    const link = buildWhatsAppLink("+923001234567", "Hi {{first_name}}, {{full_name}}", "Somaan");
    expect(new URL(link).searchParams.get("text")).toBe("Hi Somaan, Somaan");
  });

  it("strips any non-digit characters from the phone, not just the leading plus", () => {
    const link = buildWhatsAppLink("+92 300 1234567", "Hi", "A");
    expect(new URL(link).searchParams.get("phone")).toBe("923001234567");
  });

  it("falls back to 'there' for both merge tags when the name is blank, matching the email channel's merge-tags.ts", () => {
    const link = buildWhatsAppLink("+923001234567", "Hi {{first_name}}, ({{full_name}})", "   ");
    expect(new URL(link).searchParams.get("text")).toBe("Hi there, (there)");
  });

  it("tolerates internal whitespace inside a merge tag, e.g. {{ first_name }}", () => {
    const link = buildWhatsAppLink("+923001234567", "Hi {{ first_name }}", "Ayesha Khan");
    expect(new URL(link).searchParams.get("text")).toBe("Hi Ayesha");
  });
});
