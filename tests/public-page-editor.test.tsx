import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { readFileSync } from "node:fs";

vi.mock("@/components/admin/landing/LibraryImageField", () => ({
  LibraryImageField: ({ value, onChange, labelledBy }: { value: string; onChange: (v: string) => void; labelledBy?: string }) => (
    <input aria-labelledby={labelledBy} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

import { PublicPageEditor, type PublicPageValue } from "@/components/admin/program/PublicPageEditor";
import { normalizeSections } from "@/lib/marketing/course-sections";

const start = (): PublicPageValue => ({
  publicVideoUrl: "",
  certificateImageUrl: "",
  topic: "",
  startsAt: "",
  outcomes: ["Fake outcome A", "Fake outcome B"],
  features: [],
  faqs: [{ question: "Fake Q?", answer: "Fake A." }],
  pageSections: normalizeSections(null),
});

let latest: PublicPageValue;
function Harness({ type = "course" as const }: { type?: "course" | "webinar" }) {
  const [v, setV] = useState<PublicPageValue>(start);
  latest = v;
  return <PublicPageEditor value={v} onChange={setV} courseSlug="fake" courseType={type} />;
}

const sectionsBox = () => screen.getByRole("group", { name: /page sections/i });
const rows = () => within(sectionsBox()).getAllByRole("listitem");

describe("PublicPageEditor", () => {
  it("edits the preview video and certificate picture", () => {
    render(<Harness />);
    fireEvent.change(screen.getByLabelText(/preview video/i), { target: { value: "https://youtu.be/abcDEF12345" } });
    fireEvent.change(screen.getByLabelText(/certificate picture/i), { target: { value: "https://fake.example/c.png" } });
    expect(latest.publicVideoUrl).toBe("https://youtu.be/abcDEF12345");
    expect(latest.certificateImageUrl).toBe("https://fake.example/c.png");
  });

  it("adds, edits, moves and removes 'What you'll learn' lines", () => {
    render(<Harness />);
    const box = screen.getByRole("group", { name: /what you.ll learn/i });
    fireEvent.click(within(box).getByRole("button", { name: /add a line/i }));
    expect(latest.outcomes).toEqual(["Fake outcome A", "Fake outcome B", ""]);
    const inputs = within(box).getAllByRole("textbox");
    fireEvent.change(inputs[2], { target: { value: "Fake outcome C" } });
    fireEvent.click(within(box).getAllByRole("button", { name: /move up/i })[2]);
    expect(latest.outcomes).toEqual(["Fake outcome A", "Fake outcome C", "Fake outcome B"]);
    fireEvent.click(within(box).getAllByRole("button", { name: /remove/i })[0]);
    expect(latest.outcomes).toEqual(["Fake outcome C", "Fake outcome B"]);
  });

  it("adds and removes questions", () => {
    render(<Harness />);
    const box = screen.getByRole("group", { name: /questions and answers/i });
    fireEvent.click(within(box).getByRole("button", { name: /add a question/i }));
    expect(latest.faqs).toHaveLength(2);
    fireEvent.click(within(box).getAllByRole("button", { name: /remove/i })[0]);
    expect(latest.faqs).toEqual([{ question: "", answer: "" }]);
  });

  it("moves a page section, hides it and gives it a heading", () => {
    render(<Harness />);
    expect(rows()[0].textContent).toMatch(/About/);
    fireEvent.click(within(rows()[1]).getByRole("button", { name: /move up/i }));
    expect(latest.pageSections.map((s) => s.key).slice(0, 2)).toEqual(["learn", "about"]);
    fireEvent.click(within(rows()[0]).getByRole("checkbox", { name: /show/i }));
    expect(latest.pageSections[0]).toMatchObject({ key: "learn", visible: false });
    fireEvent.change(within(rows()[0]).getByRole("textbox", { name: /heading/i }), { target: { value: "Fake heading" } });
    expect(latest.pageSections[0].title).toBe("Fake heading");
  });

  it("the first section cannot move up and the last cannot move down", () => {
    render(<Harness />);
    expect((within(rows()[0]).getByRole("button", { name: /move up/i }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(rows()[rows().length - 1]).getByRole("button", { name: /move down/i }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("a webinar has no certificate picture or certificate section", () => {
    render(<Harness type="webinar" />);
    expect(screen.queryByLabelText(/certificate picture/i)).toBeNull();
    expect(rows().map((r) => r.textContent).join(" ")).not.toMatch(/Certificate/);
  });

  it("every button is a big enough tap target", () => {
    render(<Harness />);
    for (const b of screen.getAllByRole("button")) expect(b.className).toMatch(/min-h-11/);
  });

  it("the certificate picture uses the library, in the misc folder", () => {
    const s = readFileSync("src/components/admin/program/PublicPageEditor.tsx", "utf8");
    expect(s).toMatch(/<LibraryImageField[\s\S]*?folder="misc"/);
  });
});

describe("PublicPageEditor: topic and webinar date", () => {
  it("edits the topic and offers used topics", () => {
    render(<PublicPageEditor value={{ ...start(), topic: "" }} onChange={(v) => (latest = v)} courseSlug="fake" courseType="course" topicOptions={["Fake Topic A", "Fake Topic B"]} />);
    const box = screen.getByLabelText("Topic") as HTMLInputElement;
    expect(box.getAttribute("list")).toBe("course-topic-options");
    expect(document.querySelectorAll("#course-topic-options option")).toHaveLength(2);
    fireEvent.change(box, { target: { value: "Fake Topic A" } });
    expect(latest.topic).toBe("Fake Topic A");
    expect(screen.queryByLabelText(/webinar date/i)).toBeNull();
  });
  it("a webinar's date is typed in Pakistan time and kept as UTC", () => {
    render(<Harness type="webinar" />);
    const box = screen.getByLabelText(/webinar date and time/i) as HTMLInputElement;
    fireEvent.change(box, { target: { value: "2026-11-10T19:00" } });
    expect(latest.startsAt).toBe("2026-11-10T14:00:00.000Z");
    expect(box.value).toBe("2026-11-10T19:00");
    fireEvent.change(box, { target: { value: "" } });
    expect(latest.startsAt).toBe("");
  });
});

describe("PublicPageEditor: topic only where lists have topic buttons", () => {
  it("hides Topic for a webinar", () => {
    render(<Harness type="webinar" />);
    expect(screen.queryByLabelText("Topic")).toBeNull();
  });
});
