import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CoverThumb } from "@/components/ui/CoverThumb";

const SUPA = "https://abcdefgh.supabase.co";

describe("CoverThumb", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = SUPA;
  });

  it("renders an img for an allowed Supabase url", () => {
    const url = `${SUPA}/storage/v1/object/public/media/a.png`;
    const { container } = render(<CoverThumb url={url} title="Alpha" />);
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe(url);
  });

  it("proxies a Drive thumbnail url", () => {
    const { container } = render(
      <CoverThumb url="https://drive.google.com/thumbnail?id=ABC123" title="Alpha" />,
    );
    expect(container.querySelector("img")?.getAttribute("src")).toBe("/api/cover/ABC123");
  });

  it.each([null, "", "https://evil.example/x.png"])("shows the placeholder for %s", (url) => {
    const { container } = render(<CoverThumb url={url} title="beta course" />);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("B")).toBeTruthy();
  });

  it("falls back to the placeholder when the image errors", () => {
    const { container } = render(
      <CoverThumb url="https://drive.google.com/thumbnail?id=ABC123" title="Gamma" />,
    );
    fireEvent.error(container.querySelector("img") as HTMLImageElement);
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("G")).toBeTruthy();
  });
});

describe("CoverThumb placeholder letter", () => {
  it("uses a whole emoji, not half a surrogate pair", () => {
    render(<CoverThumb url={null} title="🎓 Course" />);
    expect(screen.getByText("🎓")).toBeTruthy();
  });
  it("uses the first Urdu letter", () => {
    render(<CoverThumb url={null} title="  اردو کورس" />);
    expect(screen.getByText("ا")).toBeTruthy();
  });
});
