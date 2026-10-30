import { describe, expect, it } from "vitest";
import { isCsvSheet, parseCsv } from "@/lib/landing/mirror/csv";

describe("parseCsv", () => {
  it("handles a quoted field with a comma and a newline", () => {
    expect(parseCsv('a,"b,c\nd",e\n')).toEqual([["a", "b,c\nd", "e"]]);
  });
  it("handles doubled quotes", () => {
    expect(parseCsv('a,"say ""hi""",c')).toEqual([["a", 'say "hi"', "c"]]);
  });
  it("handles CRLF and LF", () => {
    expect(parseCsv("a,b\r\nc,d\ne,f\r\n")).toEqual([["a", "b"], ["c", "d"], ["e", "f"]]);
  });
  it("strips a leading BOM", () => {
    expect(parseCsv("\uFEFFName,Email\nx,y")[0]).toEqual(["Name", "Email"]);
  });
  it("ignores an empty trailing line but keeps empty cells", () => {
    expect(parseCsv("a,,c\n\n")).toEqual([["a", "", "c"]]);
  });
  it("keeps a last row with no final newline", () => {
    expect(parseCsv("a,b\nc,")).toEqual([["a", "b"], ["c", ""]]);
  });
});

describe("isCsvSheet", () => {
  it("is true when the header has the three required columns", () => {
    expect(isCsvSheet([["Name", "Email", "Submitted At", "Payment Confirmation"]])).toBe(true);
  });
  it("is false for an HTML page parsed as one cell", () => {
    expect(isCsvSheet(parseCsv("<!DOCTYPE html><html><body>Sign in</body></html>"))).toBe(false);
  });
  it("is false for empty input or a missing column", () => {
    expect(isCsvSheet([])).toBe(false);
    expect(isCsvSheet([["Email", "Submitted At"]])).toBe(false);
  });
});
