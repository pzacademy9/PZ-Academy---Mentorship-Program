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
  it("strips the leading plus and encodes the message", () => {
    const link = buildWhatsAppLink("+923001234567", "Hi {{first_name}}!", "Ayesha Khan");
    expect(link).toBe("https://wa.me/923001234567?text=Hi%20Ayesha!");
  });

  it("substitutes both merge tags", () => {
    const link = buildWhatsAppLink("+923001234567", "{{full_name}} ({{first_name}})", "Ayesha Khan");
    expect(decodeURIComponent(link.split("?text=")[1])).toBe("Ayesha Khan (Ayesha)");
  });

  it("leaves a message with no merge tags untouched", () => {
    const link = buildWhatsAppLink("+923001234567", "Hello there, no personalization here.", "Ayesha Khan");
    expect(decodeURIComponent(link.split("?text=")[1])).toBe("Hello there, no personalization here.");
  });

  it("does not crash on a single-word name", () => {
    const link = buildWhatsAppLink("+923001234567", "Hi {{first_name}}, {{full_name}}", "Somaan");
    expect(decodeURIComponent(link.split("?text=")[1])).toBe("Hi Somaan, Somaan");
  });

  it("strips any non-digit characters from the phone, not just the leading plus", () => {
    const link = buildWhatsAppLink("+92 300 1234567", "Hi", "A");
    expect(link.startsWith("https://wa.me/923001234567?")).toBe(true);
  });
});
