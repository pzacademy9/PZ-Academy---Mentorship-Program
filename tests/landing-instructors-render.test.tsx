import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";

vi.mock("server-only", () => ({}));

import { Instructors } from "@/components/landing/sections/Instructors";
import { INSTRUCTORS_OLD } from "./fixtures/instructors-old-data";

const register = { url: "https://x.com/r", label: "Join", closed: false };
const html = (data: Record<string, unknown>) => renderToStaticMarkup(<>{Instructors({ data, register })}</>);
const PHOTO = "https://drive.google.com/uc?export=view&id=fakephoto1";
const person = (n: number, extra: Record<string, unknown> = {}) => ({ name: `Fake Person ${n}`, role: `Title ${n}`, bio: `Bio ${n}`, photo: PHOTO, credentials: "", ...extra });

describe("classic instructors", () => {
  it("classic layout equals the saved fixture byte for byte", () => {
    const expected = readFileSync("tests/fixtures/instructors-classic-old.html", "utf8");
    expect(html({ ...INSTRUCTORS_OLD, layout: "classic" })).toBe(expected);
    expect(html(INSTRUCTORS_OLD)).toBe(expected);
  });
});

describe("layout a", () => {
  it("with one person shows portrait, name, title, bio and credentials", () => {
    const o = html({ heading: "Meet", layout: "a", items: [person(1, { credentials: "- First line\n\n- Second line\nThird line" })] });
    expect(o).toContain("<img");
    expect(o).toContain("Fake Person 1");
    expect(o).toContain("Title 1");
    expect(o).toContain("Bio 1");
    const lis = o.match(/<li[^>]*>.*?<\/li>/g) ?? [];
    expect(lis).toHaveLength(3);
    expect(lis[0]).toContain("First line");
    expect(lis[1]).toContain("Second line");
    expect(lis[2]).toContain("Third line");
    expect(o).not.toContain("- First");
    expect(o).toContain("lg:grid-cols-2");
  });

  it("with two people shows two cards side by side", () => {
    const o = html({ layout: "a", items: [person(1), person(2)] });
    expect(o).toContain("md:grid-cols-2");
    expect(o).toContain("Fake Person 1");
    expect(o).toContain("Fake Person 2");
  });

  it("with eight people renders eight cards", () => {
    const o = html({ layout: "a", items: Array.from({ length: 8 }, (_, i) => person(i + 1)) });
    expect(o.match(/<article/g)).toHaveLength(8);
  });

  it("a person with no photo renders no image and keeps the text", () => {
    for (const items of [[person(1, { photo: "" })], [person(1, { photo: "" }), person(2, { photo: "" })]]) {
      const o = html({ layout: "a", items });
      expect(o).not.toContain("<img");
      expect(o).toContain("Fake Person 1");
      expect(o).toContain("Bio 1");
    }
  });

  it("a person with only a name renders without a title, bio or credentials list", () => {
    for (const layout of ["a", "b"]) {
      const o = html({ layout, items: [{ name: "Only Name" }] });
      expect(o).toContain("Only Name");
      expect(o).not.toContain("<ul");
      expect(o).not.toContain("<img");
      expect(o).not.toMatch(/uppercase/);
    }
  });

  it("an empty credentials value renders no list", () => {
    expect(html({ layout: "a", items: [person(1, { credentials: "" })] })).not.toContain("<ul");
    expect(html({ layout: "a", items: [person(1, { credentials: "  \n - \n-  " })] })).not.toContain("<ul");
  });

  it("an empty heading renders no heading", () => {
    expect(html({ heading: "", layout: "a", items: [person(1)] })).not.toContain("<h2");
    expect(html({ heading: "Hello", layout: "a", items: [person(1)] })).toContain("<h2");
  });
});

describe("layout b", () => {
  it("renders on the deep green band", () => {
    const one = html({ layout: "b", items: [person(1, { credentials: "- A" })] });
    expect(one).toContain("bg-landing-deep");
    expect(one).toContain("Fake Person 1");
    const many = html({ layout: "b", heading: "Team", items: [person(1), person(2), person(3)] });
    expect(many).toContain("bg-landing-deep");
    expect(many.match(/<article/g)).toHaveLength(3);
    expect(many).toContain("Team");
  });
});

describe("all new layouts", () => {
  for (const layout of ["a", "b"]) {
    it(`${layout}: no Stitch demo text`, () => {
      const o = html({ layout, items: [person(1), person(2)] });
      for (const bad of ["14+", "2,400", "98.4", "Cohort", "PharmaZyme", "Office hours", "Trials run"]) expect(o).not.toContain(bad);
    });
    it(`${layout}: long unbroken words wrap and nothing is truncated`, () => {
      const o = html({ layout, items: [person(1, { name: "N".repeat(150), bio: "B".repeat(300), credentials: `- ${"C".repeat(200)}` })] });
      expect(o).toContain("break-words");
      expect(o).not.toMatch(/truncate|line-clamp/);
    });
    it(`${layout}: no people renders nothing`, () => {
      expect(html({ layout, items: [] })).toBe("");
    });
  }
});
