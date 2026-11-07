import { describe, expect, it } from "vitest";
import { buildAffiliateCode, initialsFor } from "@/lib/affiliates/code";

describe("buildAffiliateCode", () => {
  it("uses the first letter of the first and last name, then the serial", () => {
    expect(buildAffiliateCode("Dr. Ayesha Khan", 321)).toBe("AK321");
  });
  it("ignores titles anywhere before the name, with or without a dot", () => {
    expect(buildAffiliateCode("Prof Dr Ali Raza Shah", 322)).toBe("AS322");
    expect(buildAffiliateCode("  mr.  bilal  ahmed ", 326)).toBe("BA326");
    expect(buildAffiliateCode("Engr. Sana Malik", 328)).toBe("SM328");
    expect(buildAffiliateCode("Miss Hina Raza", 329)).toBe("HR329");
  });
  it("uses the first two letters of a one-word name", () => {
    expect(buildAffiliateCode("Zainab", 323)).toBe("ZA323");
  });
  it("falls back to AF when there are not two Latin letters to use", () => {
    expect(buildAffiliateCode("Dr", 324)).toBe("AF324");
    expect(buildAffiliateCode("عائشہ", 325)).toBe("AF325");
    expect(buildAffiliateCode("", 330)).toBe("AF330");
    expect(buildAffiliateCode("A", 331)).toBe("AF331");
  });
  it("treats a hyphenated first name as one word", () => {
    expect(buildAffiliateCode("Ayesha-Noor Khan", 327)).toBe("AK327");
  });
  it("is always letters followed by digits, whatever the name holds", () => {
    for (const n of ["O'Neil Tariq", "Dr.  ", "12345", "<script>x</script> Ali", "Muhammad  Ali  Jinnah"]) {
      expect(buildAffiliateCode(n, 400), n).toMatch(/^[A-Z]{2}400$/);
    }
  });
});

describe("initialsFor", () => {
  it("returns two uppercase letters", () => {
    expect(initialsFor("Dr. Ayesha Khan")).toBe("AK");
    expect(initialsFor("Zainab")).toBe("ZA");
    expect(initialsFor("Dr")).toBe("AF");
  });
});
