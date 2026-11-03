import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));
vi.mock("next/link", () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));

import { startSeconds } from "@/lib/landing/video-start";
import { SECTION_DEFS } from "@/lib/landing/sections";
import { YouTubeFacade } from "@/components/landing/sections/YouTubeFacade";
import { VideoReviews } from "@/components/landing/sections/VideoReviews";
import { Hero, heroPicture } from "@/components/landing/sections/Hero";
import { PageLoader } from "@/components/landing/PageLoader";
import { LandingRenderer } from "@/components/landing/LandingRenderer";
import { emptyContent, normalizeContent, type LandingContent } from "@/lib/landing/content";

afterEach(() => { cleanup(); vi.useRealTimers(); document.body.innerHTML = ""; });

describe("startSeconds", () => {
  it("reads plain seconds, minutes:seconds, hours:minutes:seconds and 1m30s style", () => {
    expect(startSeconds("90")).toBe(90);
    expect(startSeconds("1:30")).toBe(90);
    expect(startSeconds("01:02:03")).toBe(3723);
    expect(startSeconds("1m30s")).toBe(90);
    expect(startSeconds("2m")).toBe(120);
    expect(startSeconds("1h2m3s")).toBe(3723);
    expect(startSeconds(" 45s ")).toBe(45);
  });
  it("gives 0 (start from the beginning) for empty or unreadable entries", () => {
    for (const v of ["", "abc", "1:2:3:4", "-5", "1:99", "0", undefined, null, 12]) expect(startSeconds(v)).toBe(0);
  });
  it("accepts minutes over 99", () => {
    expect(startSeconds("100:00")).toBe(6000);
  });
  it("caps absurdly long times", () => {
    expect(startSeconds("99999999")).toBe(0);
  });
});

describe("the editor has a Start at box", () => {
  it("on the demo video and on every video review", () => {
    const demo = SECTION_DEFS.demo_video.fields.find((f) => f.key === "startAt");
    expect(demo?.kind).toBe("text");
    const items = SECTION_DEFS.video_reviews.fields.find((f) => f.key === "items");
    expect(items?.itemFields?.some((f) => f.key === "startAt" && f.kind === "text")).toBe(true);
  });
});

describe("video start", () => {
  it("the plain player starts at the chosen second", () => {
    const html = renderToStaticMarkup(<YouTubeFacade id="dQw4w9WgXcQ" title="t" short={false} autoStart start={90} />);
    expect(html).toContain("start=90");
  });
  it("no start gives no start parameter", () => {
    const html = renderToStaticMarkup(<YouTubeFacade id="dQw4w9WgXcQ" title="t" short={false} autoStart />);
    expect(html).not.toContain("start=");
  });
  it("a video review passes its own start time on click", () => {
    const reg = { url: "https://x.com/r", label: "Join", closed: false };
    render(<>{VideoReviews({ data: { items: [{ url: "https://youtu.be/dQw4w9WgXcQ", caption: "A", startAt: "1:30" }, { url: "https://youtu.be/aaaaaaaaaaa", caption: "B" }] }, register: reg })}</>);
    fireEvent.click(screen.getAllByRole("button", { name: /play video/i })[0]);
    expect(document.querySelector("iframe")?.getAttribute("src")).toContain("start=90");
  });
});

describe("highlights sit in a row on phones", () => {
  const reg = { url: "https://x.com/r", label: "Join", closed: false };
  const PC = "https://drive.google.com/uc?export=view&id=pcfile1";
  for (const style of ["classic", "fade", "split", "photo"]) {
    it(style, () => {
      const html = renderToStaticMarkup(<>{Hero({ data: { headline: "H", heroStyle: style, imagePc: PC, image: PC, badges: [{ text: "One" }, { text: "Two" }] }, register: reg })}</>);
      expect(html).toMatch(/<ul class="[^"]*(?<![:\w-])flex\b[^"]*\bflex-wrap\b[^"]*\bsm:grid\b[^"]*\bsm:grid-cols-3\b/);
    });
  }
});

describe("PageLoader", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  function withHero(complete: boolean) {
    const hero = document.createElement("section");
    hero.id = "hero-x";
    const img = document.createElement("img");
    Object.defineProperty(img, "complete", { value: complete, configurable: true });
    hero.appendChild(img);
    document.body.appendChild(hero);
    return img;
  }
  it("server render shows the loading screen with the logo", () => {
    const html = renderToStaticMarkup(<PageLoader heroId="hero-x" />);
    expect(html).toContain('role="status"');
    expect(html).toContain("Loading");
  });
  it("leaves once the hero picture is ready, but not before a short minimum", () => {
    withHero(true);
    render(<PageLoader heroId="hero-x" />);
    expect(screen.queryByRole("status")).not.toBeNull();
    act(() => { vi.advanceTimersByTime(200); });
    expect(screen.queryByRole("status")).not.toBeNull();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("waits for a picture that is still loading, then leaves when it loads", () => {
    const img = withHero(false);
    render(<PageLoader heroId="hero-x" />);
    act(() => { vi.advanceTimersByTime(1500); });
    expect(screen.queryByRole("status")).not.toBeNull();
    act(() => { img.dispatchEvent(new Event("load")); });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("always leaves after 3 seconds, even if the picture never loads", () => {
    withHero(false);
    render(<PageLoader heroId="hero-x" />);
    act(() => { vi.advanceTimersByTime(2900); });
    expect(screen.queryByRole("status")).not.toBeNull();
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("leaves at once when the picture fails to load", () => {
    const img = withHero(false);
    render(<PageLoader heroId="hero-x" />);
    act(() => { img.dispatchEvent(new Event("error")); });
    act(() => { vi.advanceTimersByTime(1000); });
    expect(screen.queryByRole("status")).toBeNull();
  });
  it("has a pure-CSS 3 second fail-safe in case the page script never runs", () => {
    const html = renderToStaticMarkup(<PageLoader heroId="hero-x" />);
    expect(html).toMatch(/animation:[^"]*3s/);
  });
});

function page(heroData: Record<string, unknown>): LandingContent {
  const c = emptyContent("course");
  c.sections = [{ id: "hero-a", type: "hero", enabled: true, data: { headline: "H", ...heroData } }] as LandingContent["sections"];
  return normalizeContent(c);
}

describe("the loader on the public page", () => {
  const out = (content: LandingContent, slug?: string) => renderToStaticMarkup(<LandingRenderer content={content} status="published" kind="course" slug={slug} />);
  it("shows on a public page whose hero has a picture", () => {
    expect(out(page({ heroStyle: "fade", imagePc: "https://drive.google.com/uc?export=view&id=pcfile1" }), "my-page")).toContain('aria-label="Loading page"');
  });
  it("is skipped when the hero has no picture", () => {
    expect(out(page({ heroStyle: "fade" }), "my-page")).not.toContain('aria-label="Loading page"');
  });
  it("is skipped in the admin preview (no slug)", () => {
    expect(out(page({ heroStyle: "fade", imagePc: "https://drive.google.com/uc?export=view&id=pcfile1" }))).not.toContain('aria-label="Loading page"');
  });
});

describe("heroPicture follows the hero style", () => {
  const P = "https://drive.google.com/uc?export=view&id=pcfile1";
  it("classic and split use only the single picture", () => {
    expect(heroPicture({ heroStyle: "classic", imagePc: P })).toBe(false);
    expect(heroPicture({ heroStyle: "split", imagePc: P })).toBe(false);
    expect(heroPicture({ heroStyle: "split", image: P })).toBe(true);
    expect(heroPicture({ image: P })).toBe(true);
  });
  it("fade, editorial, photo and poster use the computer or phone picture", () => {
    for (const heroStyle of ["fade", "editorial", "photo", "poster"]) {
      if (heroStyle !== "poster") expect(heroPicture({ heroStyle, image: P })).toBe(false);
      expect(heroPicture({ heroStyle, imagePhone: P })).toBe(true);
      expect(heroPicture({ heroStyle, imagePc: P })).toBe(true);
    }
  });
  it("a poster with no picture falls back to classic, which uses the single picture", () => {
    expect(heroPicture({ heroStyle: "poster", image: P })).toBe(true);
  });
});
