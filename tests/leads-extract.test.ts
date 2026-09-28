import { describe, it, expect } from "vitest";
import { extractEmail, extractPhone, extractName, extractProfession } from "@/lib/leads/extract";

describe("extractEmail", () => {
  it("finds an email inside pasted chat text", () => {
    expect(extractEmail("Hi, you can reach me at ali.khan@example.com anytime")).toBe("ali.khan@example.com");
  });

  it("returns null when no email is present", () => {
    expect(extractEmail("Hey I'm interested in the pharmacology course")).toBeNull();
  });
});

describe("extractPhone", () => {
  it("normalizes an inline Pakistani mobile number to E.164", () => {
    expect(extractPhone("call me on 03234267102 after 6pm")).toBe("+923234267102");
  });

  it("returns null when no plausible phone number is present", () => {
    expect(extractPhone("I'm a pharmacist looking to join the diabetes course")).toBeNull();
  });

  it("skips a run of digits that normalizePhone can't parse", () => {
    expect(extractPhone("order number 12345")).toBeNull();
  });
});

describe("extractName", () => {
  it("matches 'my name is'", () => {
    expect(extractName("Hello, my name is Ayesha Malik and I want to enroll")).toBe("Ayesha Malik");
  });

  it("matches \"i'm\" case-insensitively", () => {
    expect(extractName("hi i'm Bilal, saw your ad on facebook")).toBe("Bilal");
  });

  it("matches 'this is'", () => {
    expect(extractName("This is Sana, following up on the DPC course")).toBe("Sana");
  });

  it("returns null when no name pattern matches", () => {
    expect(extractName("interested in the course, please share details")).toBeNull();
  });

  it("matches a 'Name:' labeled line", () => {
    const text = `Name: Mahnoor Bhatti\nEmail: mahnoorsaleem716@gmail.com\nRef: PZA-DMC1-035\nRegistration: Live – Modules: M1 – Individual\n\nPlease verify my payment. Thank you!`;
    expect(extractName(text)).toBe("Mahnoor Bhatti");
  });

  it("matches a bare name as the first line of the paste", () => {
    const text = `Hamza Ansari\nH2@gmail.com\n+92099999222\nPharmacist`;
    expect(extractName(text)).toBe("Hamza Ansari");
  });
});

describe("extractProfession", () => {
  it("matches \"i'm a <profession>\"", () => {
    expect(extractProfession("Hi I'm a pharmacist working in a hospital")).toBe("pharmacist working in a hospital");
  });

  it("matches 'i am an <profession>' and stops at punctuation", () => {
    expect(extractProfession("I am an intern doctor. Want to know the fee")).toBe("intern doctor");
  });

  it("matches 'i work as a <profession>'", () => {
    expect(extractProfession("i work as a clinical pharmacist, currently in Lahore")).toBe("clinical pharmacist");
  });

  it("returns null when no profession pattern matches", () => {
    expect(extractProfession("just want to know the course fee")).toBeNull();
  });

  it("matches a 'Profession:' labeled line", () => {
    const text = `Name: Mahnoor Bhatti\nProfession: Community Pharmacist\nEmail: mahnoorsaleem716@gmail.com`;
    expect(extractProfession(text)).toBe("Community Pharmacist");
  });
});

describe("full realistic paste", () => {
  it("extracts every field from one combined message", () => {
    const text = `Hi, my name is Ayesha Malik. I'm a pharmacist at a private hospital. My email is ayesha.malik@example.com. Interested in the diabetes course, can you share the fee? My number is 03234267102 in case whatsapp doesn't show it.`;
    expect(extractName(text)).toBe("Ayesha Malik");
    expect(extractProfession(text)).toBe("pharmacist at a private hospital");
    expect(extractEmail(text)).toBe("ayesha.malik@example.com");
    expect(extractPhone(text)).toBe("+923234267102");
  });
});
