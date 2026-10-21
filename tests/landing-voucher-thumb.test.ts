import { describe, it, expect } from "vitest";
import { driveFileId, voucherThumbSrc } from "@/lib/landing/registration/voucher-thumb";

describe("driveFileId", () => {
  it("reads the three Drive link forms", () => {
    expect(driveFileId("https://drive.google.com/file/d/ABC_123-x/view?usp=sharing")).toBe("ABC_123-x");
    expect(driveFileId("https://drive.google.com/open?id=ABC_123-x")).toBe("ABC_123-x");
    expect(driveFileId("https://drive.google.com/uc?export=view&id=ABC_123-x")).toBe("ABC_123-x");
    expect(driveFileId("https://docs.google.com/file/d/DOC1/edit")).toBe("DOC1");
  });
  it("rejects other hosts, schemes and empties", () => {
    expect(driveFileId("https://example.com/file/d/ABC/view")).toBeNull();
    expect(driveFileId("https://drive.google.com.evil.com/file/d/ABC/view")).toBeNull();
    expect(driveFileId("http://drive.google.com/file/d/ABC/view")).toBeNull();
    expect(driveFileId("javascript:alert(1)//drive.google.com/file/d/ABC")).toBeNull();
    expect(driveFileId("https://drive.google.com/drive/folders/ABC")).toBeNull();
    expect(driveFileId("not a url")).toBeNull();
    expect(driveFileId("")).toBeNull();
    expect(driveFileId(null)).toBeNull();
  });
});

describe("voucherThumbSrc", () => {
  it("builds the thumbnail url", () => {
    expect(voucherThumbSrc("https://drive.google.com/file/d/ABC/view")).toBe("https://drive.google.com/thumbnail?id=ABC&sz=w160");
  });
  it("is null for anything that is not a Drive link", () => {
    expect(voucherThumbSrc("https://example.com/a.png")).toBeNull();
    expect(voucherThumbSrc(null)).toBeNull();
  });
});
