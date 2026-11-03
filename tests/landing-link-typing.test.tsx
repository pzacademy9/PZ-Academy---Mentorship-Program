import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { FieldInput } from "@/components/admin/landing/FieldInput";
import { SectionForm } from "@/components/admin/landing/SectionForm";
import { SECTION_DEFS } from "@/lib/landing/sections";
import { updateSectionData, emptyContent } from "@/lib/landing/content";
import { youtubeId } from "@/lib/landing/simple-text";

const yt = (SECTION_DEFS.video_reviews.fields.find((f) => f.key === "items")!.itemFields ?? []).find((f) => f.kind === "youtube")!;
const urlField = SECTION_DEFS.hero.fields.find((f) => f.key === "secondaryCtaUrl")!;

describe("typing into a link box", () => {
  it("keeps what is typed and explains it, without saving an unusable link", () => {
    const onChange = vi.fn();
    render(<FieldInput field={yt} value="" onChange={onChange} />);
    const box = screen.getByLabelText(yt.label) as HTMLInputElement;
    fireEvent.change(box, { target: { value: "https://example.com/x" } });
    expect(box.value).toBe("https://example.com/x");
    expect(screen.getByText(/doesn't look like a youtube link/i)).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("passes a good YouTube link on as soon as it is complete", () => {
    const onChange = vi.fn();
    render(<FieldInput field={yt} value="" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(yt.label), { target: { value: "https://youtu.be/dQw4w9WgXcQ" } });
    expect(onChange).toHaveBeenCalledWith("https://youtu.be/dQw4w9WgXcQ");
  });

  it("emptying the box passes the empty value on", () => {
    const onChange = vi.fn();
    render(<FieldInput field={yt} value="https://youtu.be/dQw4w9WgXcQ" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText(yt.label), { target: { value: "" } });
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("a plain link box keeps unfinished text too and flags it", () => {
    const onChange = vi.fn();
    render(<FieldInput field={urlField} value="" onChange={onChange} />);
    const box = screen.getByLabelText(urlField.label) as HTMLInputElement;
    fireEvent.change(box, { target: { value: "still not" } });
    expect(box.value).toBe("still not");
    expect(screen.getByText(/starting with https/i)).toBeTruthy();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("the real video reviews form (which cleans every edit) lets you type then paste a link", () => {
    function Harness() {
      const [data, setData] = useState<Record<string, unknown>>({ heading: "H", items: [{ url: "", caption: "" }] });
      const c = emptyContent("course");
      const sec = { id: "s1", type: "video_reviews" as const, enabled: true, data };
      return (
        <SectionForm
          type="video_reviews"
          data={data}
          onChange={(d) => {
            const next = updateSectionData({ ...c, sections: [sec] }, "s1", d);
            setData(next.sections[0].data);
          }}
        />
      );
    }
    render(<Harness />);
    const box = screen.getByLabelText("YouTube link") as HTMLInputElement;
    fireEvent.change(box, { target: { value: "https://www.youtube.com/wat" } });
    expect(box.value).toBe("https://www.youtube.com/wat");
    fireEvent.change(box, { target: { value: "https://www.youtube.com/watch?v=dQw4w9WgXcQ" } });
    expect(box.value).toBe("https://www.youtube.com/watch?v=dQw4w9WgXcQ");
    expect(screen.queryByText(/doesn't look like a youtube link/i)).toBeNull();
  });
});

describe("youtubeId", () => {
  it("accepts live-stream links", () => {
    expect(youtubeId("https://www.youtube.com/live/dQw4w9WgXcQ?si=abc")).toBe("dQw4w9WgXcQ");
  });
});
