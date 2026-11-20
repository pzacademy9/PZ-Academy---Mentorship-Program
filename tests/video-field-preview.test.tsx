import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { VideoField } from "@/components/admin/program/VideoField";

afterEach(cleanup);

const YT = "https://www.youtube.com/watch?v=abc123";

describe("VideoField preview", () => {
  it("shows the thumbnail and a Play preview button for a YouTube link", () => {
    const { container } = render(<VideoField label="Video" value={YT} onSave={() => {}} />);
    const img = container.querySelector("img");
    expect(img?.getAttribute("src")).toBe("https://img.youtube.com/vi/abc123/hqdefault.jpg");
    expect(img?.getAttribute("loading")).toBe("lazy");
    const btn = screen.getByRole("button", { name: "Play preview" });
    expect(btn.getAttribute("type")).toBe("button");
    expect(container.querySelector("iframe")).toBeNull();
  });

  it("swaps to the no-cookie embed when Play preview is pressed", () => {
    const { container } = render(<VideoField label="Video" value={YT} onSave={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Play preview" }));
    const frame = container.querySelector("iframe");
    expect(frame?.getAttribute("src")).toBe("https://www.youtube-nocookie.com/embed/abc123");
    expect(frame?.getAttribute("title")).toBe("Video preview");
    expect(frame?.getAttribute("allow")).toBe("encrypted-media; picture-in-picture");
    expect(container.querySelector("img")).toBeNull();
  });

  it("shows a plain placeholder for Vimeo, then the Vimeo embed", () => {
    const { container } = render(<VideoField label="Video" value="https://vimeo.com/12345" onSave={() => {}} />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getAllByText("Video found").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Play preview" }));
    expect(container.querySelector("iframe")?.getAttribute("src")).toBe("https://player.vimeo.com/video/12345");
  });

  it("shows no preview for empty, invalid or unsupported links", () => {
    for (const v of ["", "hello", "https://drive.google.com/file/d/abc/view"]) {
      const { container, unmount } = render(<VideoField label="Video" value={v} onSave={() => {}} />);
      expect(container.querySelector("img")).toBeNull();
      expect(container.querySelector("iframe")).toBeNull();
      expect(screen.queryByRole("button", { name: "Play preview" })).toBeNull();
      unmount();
    }
  });

  it("follows the typed draft and resets to the thumbnail when the link changes", () => {
    const { container } = render(<VideoField label="Video" value="" onSave={() => {}} />);
    const input = screen.getByRole("textbox");
    fireEvent.change(input, { target: { value: YT } });
    expect(container.querySelector("img")?.getAttribute("src")).toContain("/abc123/");
    fireEvent.click(screen.getByRole("button", { name: "Play preview" }));
    expect(container.querySelector("iframe")).not.toBeNull();
    fireEvent.change(input, { target: { value: "https://youtu.be/zzz999" } });
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector("img")?.getAttribute("src")).toContain("/zzz999/");
  });
});
