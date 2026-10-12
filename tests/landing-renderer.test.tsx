import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { renderToString } from "react-dom/server";

vi.mock("server-only", () => ({}));
vi.mock("next/link", () => ({ default: ({ href, children, ...r }: { href: string; children: React.ReactNode }) => <a href={href} {...r}>{children}</a> }));

import { SimpleText } from "@/components/landing/SimpleText";
import { LandingImage } from "@/components/landing/LandingImage";
import { Countdown } from "@/components/landing/Countdown";
import { LandingRenderer } from "@/components/landing/LandingRenderer";
import { RegisterButton } from "@/components/landing/RegisterButton";
import { Hero } from "@/components/landing/sections/Hero";
import { emptyContent, updateSectionData, toggleSection, updateSettings, addSection } from "@/lib/landing/content";

afterEach(() => vi.useRealTimers());

describe("SimpleText", () => {
  it("renders bold, bullets and safe links as elements", () => {
    const { container } = render(<SimpleText text={"Hi **there**\n\n- one\n- two\n\n[site](https://a.com)"} />);
    expect(container.querySelector("strong")?.textContent).toBe("there");
    expect(container.querySelectorAll("li")).toHaveLength(2);
    const a = container.querySelector("a")!;
    expect(a.getAttribute("href")).toBe("https://a.com");
    expect(a.getAttribute("rel")).toContain("noopener");
  });
  it("never creates a script element or an unsafe href from hostile text", () => {
    const { container } = render(<SimpleText text={"<script>alert(1)</script> [x](javascript:alert(1)) [y](//evil.com)"} />);
    expect(container.querySelector("script")).toBeNull();
    for (const a of Array.from(container.querySelectorAll("a"))) {
      expect(a.getAttribute("href")).not.toMatch(/^javascript:|^\/\//i);
    }
    expect(container.textContent).toContain("<script>alert(1)</script>");
  });
});

describe("LandingImage", () => {
  it("renders nothing for an empty src", () => {
    const { container } = render(<LandingImage src="" alt="" width={100} height={100} />);
    expect(container.firstChild).toBeNull();
  });
  it("sets dimensions and lazy loading by default, eager+high priority when priority", () => {
    const { container, rerender } = render(<LandingImage src="https://a.com/x.jpg" alt="x" width={1200} height={800} />);
    const img = container.querySelector("img")!;
    expect(img.getAttribute("width")).toBe("1200");
    expect(img.getAttribute("loading")).toBe("lazy");
    rerender(<LandingImage src="https://a.com/x.jpg" alt="x" width={1200} height={800} priority />);
    expect(container.querySelector("img")!.getAttribute("loading")).toBe("eager");
    expect(container.querySelector("img")!.getAttribute("fetchpriority")).toBe("high");
  });
  it("proxies a Drive link through /api/cover", () => {
    const { container } = render(<LandingImage src="https://drive.google.com/thumbnail?id=ABC123_x" alt="x" width={10} height={10} />);
    expect(container.querySelector("img")!.getAttribute("src")).toBe("/api/cover/ABC123_x");
  });
});

describe("Countdown", () => {
  it("server/first render is a fixed-height shell with label and placeholder (no numbers, no shift)", () => {
    const html = renderToString(<Countdown to="2026-10-15T03:00:00Z" label="Early Bird ends" />);
    expect(html).toContain("Early Bird ends");
    expect(html).toContain("–d –h –m");
    expect(html).toContain("min-h-[2.5rem]");
    expect(html).not.toMatch(/d+d d+h/);
  });
  it("fills in the numbers after mount for a future date, and renders nothing for a past or invalid one", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-12T00:00:00Z"));
    const { container, rerender } = render(<Countdown to="2026-10-15T03:00:00Z" label="Early Bird ends" />);
    await vi.advanceTimersByTimeAsync(0);
    expect(container.textContent).toMatch(/Early Bird ends/);
    expect(container.textContent).toContain("3d 3h 0m");
    expect(container.textContent).not.toContain("–");
    rerender(<Countdown to="2026-10-01T00:00:00Z" label="x" />);
    await vi.advanceTimersByTimeAsync(0);
    expect(container.textContent).toBe("");
    rerender(<Countdown to="garbage" label="x" />);
    await vi.advanceTimersByTimeAsync(0);
    expect(container.textContent).toBe("");
  });
});

describe("RegisterButton guard", () => {
  it("never renders an anchor for an unsafe URL (guard exercised directly, not via normalizeContent)", () => {
    for (const url of ["javascript:alert(1)", "//evil.com", ""]) {
      const { container, unmount } = render(<RegisterButton register={{ url, label: "Register now", closed: false }} />);
      expect(container.querySelector("a")).toBeNull();
      expect(container.textContent).toBe("Register now");
      unmount();
    }
    const ok = render(<RegisterButton register={{ url: "https://x.com/r", label: "Register now", closed: false }} />);
    expect(ok.container.querySelector("a")!.getAttribute("href")).toBe("https://x.com/r");
  });
});

describe("Hero secondary CTA guard", () => {
  it("does not render an anchor for a hostile secondaryCtaUrl passed directly to Hero", () => {
    for (const url of ["javascript:alert(1)", "//evil.com"]) {
      const { container, unmount } = render(
        <>{Hero({ data: { headline: "H", secondaryCtaLabel: "Watch", secondaryCtaUrl: url }, register: { url: "https://x.com/r", label: "Register now", closed: false } })}</>,
      );
      expect(Array.from(container.querySelectorAll("a")).some((a) => a.getAttribute("href") === url)).toBe(false);
      expect(container.textContent).not.toContain("Watch");
      unmount();
    }
  });
});

describe("LandingRenderer", () => {
  const base = () => {
    let c = emptyContent("webinar");
    c = updateSectionData(c, c.sections[0].id, { headline: "Diabetes <b>Webinar</b>", subheadline: "Hello" });
    return updateSettings(c, { registerUrl: "https://pharmacozyme.com/register" });
  };
  it("renders the headline as text, never as markup", () => {
    const { container } = render(<LandingRenderer content={base()} status="published" kind="webinar" />);
    expect(screen.getAllByText(/Diabetes <b>Webinar<\/b>/).length).toBeGreaterThan(0);
    expect(container.querySelector("h1 b")).toBeNull();
  });
  it("skips disabled sections", () => {
    let c = base();
    const faq = c.sections.find((s) => s.type === "faq")!;
    c = updateSectionData(c, faq.id, { heading: "UNIQUE-FAQ-HEADING", items: [{ q: "Q", a: "A" }] });
    expect(render(<LandingRenderer content={c} status="published" kind="webinar" />).container.textContent).toContain("UNIQUE-FAQ-HEADING");
    c = toggleSection(c, faq.id);
    expect(render(<LandingRenderer content={c} status="published" kind="webinar" />).container.textContent).not.toContain("UNIQUE-FAQ-HEADING");
  });
  it("points the Register buttons at the configured link", () => {
    const { container } = render(<LandingRenderer content={base()} status="published" kind="webinar" />);
    const links = Array.from(container.querySelectorAll("a")).filter((a) => a.getAttribute("href") === "https://pharmacozyme.com/register");
    expect(links.length).toBeGreaterThan(0);
  });
  it("hides the countdown strip on a closed page but shows it on an open one", () => {
    const c = updateSettings(base(), { countdownTo: "2099-01-01T00:00:00Z", countdownLabel: "Registration closes in" });
    const open = render(<LandingRenderer content={c} status="published" kind="webinar" />);
    expect(open.container.textContent).toMatch(/Registration closes in/);
    open.unmount();
    const closed = render(<LandingRenderer content={c} status="closed" kind="webinar" />);
    expect(closed.container.textContent).not.toMatch(/Registration closes in/);
  });
  it("shows a closed notice and no Register link when status is closed", () => {
    const { container } = render(<LandingRenderer content={base()} status="closed" kind="webinar" />);
    expect(container.textContent).toMatch(/registration is closed/i);
    expect(Array.from(container.querySelectorAll("a")).some((a) => a.getAttribute("href") === "https://pharmacozyme.com/register")).toBe(false);
  });
  it("does not crash on a section whose data is damaged", () => {
    const c = base();
    (c.sections[0] as { data: unknown }).data = { headline: 42, badges: "nope" };
    expect(() => render(<LandingRenderer content={c} status="published" kind="webinar" />)).not.toThrow();
  });
  it("renders a WhatsApp float only when a number is set, with digits only in the link", () => {
    const none = render(<LandingRenderer content={base()} status="published" kind="webinar" />).container;
    expect(none.querySelector('a[href^="https://wa.me/"]')).toBeNull();
    const c = updateSettings(base(), { whatsappNumber: "+92 300-1234567" });
    const { container } = render(<LandingRenderer content={c} status="published" kind="webinar" />);
    expect(container.querySelector('a[href="https://wa.me/923001234567"]')).not.toBeNull();
  });

  // ---- rulings from earlier reviews ----
  it("falls back to 'Register now' for an empty CTA label (hero, final CTA, settings)", () => {
    let c = base();
    const hero = c.sections.find((s) => s.type === "hero")!;
    const fin = c.sections.find((s) => s.type === "final_cta")!;
    c = updateSectionData(c, hero.id, { headline: "H", primaryCtaLabel: "   " });
    c = updateSectionData(c, fin.id, { headline: "Ready", buttonLabel: "" });
    c = updateSettings(c, { registerLabel: "" });
    const { container } = render(<LandingRenderer content={c} status="published" kind="webinar" />);
    const reg = Array.from(container.querySelectorAll("a")).filter((a) => a.getAttribute("href") === "https://pharmacozyme.com/register");
    expect(reg.length).toBeGreaterThan(2);
    for (const a of reg) expect(a.textContent?.trim()).toBe("Register now");
  });
  it("shows a duplicated nav label once and links it to the first matching section", () => {
    let c = base();
    c = addSection(c, "rich_text");
    const texts = c.sections.filter((s) => s.type === "rich_text");
    expect(texts.length).toBe(2);
    c = updateSectionData(c, texts[0].id, { heading: "One", body: "a" });
    c = updateSectionData(c, texts[1].id, { heading: "Two", body: "b" });
    const { container } = render(<LandingRenderer content={c} status="published" kind="webinar" />);
    const nav = container.querySelector("nav")!;
    const about = Array.from(nav.querySelectorAll("a")).filter((a) => a.textContent?.trim() === "About");
    // the desktop list and the mobile menu may both render it, but every one points at the first block
    expect(about.length).toBeGreaterThan(0);
    for (const a of about) expect(a.getAttribute("href")).toBe(`#${texts[0].id}`);
    expect(nav.querySelectorAll(`a[href="#${texts[1].id}"]`)).toHaveLength(0);
  });
  it("does not render an unsafe register URL as a link", () => {
    const c = base();
    c.settings.registerUrl = "javascript:alert(1)";
    const { container } = render(<LandingRenderer content={c} status="published" kind="webinar" />);
    expect(Array.from(container.querySelectorAll("a")).some((a) => /^javascript:/i.test(a.getAttribute("href") ?? ""))).toBe(false);
  });
  it("keeps the hero image eager at 1200x800 and other images lazy", () => {
    let c = base();
    const hero = c.sections.find((s) => s.type === "hero")!;
    c = updateSectionData(c, hero.id, { headline: "H", image: "https://a.com/hero.jpg" });
    const rt = c.sections.find((s) => s.type === "rich_text")!;
    c = updateSectionData(c, rt.id, { heading: "T", body: "b", image: "https://a.com/other.jpg" });
    const { container } = render(<LandingRenderer content={c} status="published" kind="webinar" />);
    const heroImg = container.querySelector('img[src="https://a.com/hero.jpg"]')!;
    expect(heroImg.getAttribute("loading")).toBe("eager");
    expect(heroImg.getAttribute("width")).toBe("1200");
    expect(heroImg.getAttribute("height")).toBe("800");
    expect(container.querySelector('img[src="https://a.com/other.jpg"]')!.getAttribute("loading")).toBe("lazy");
  });
  it("renders empty list sections as nothing (no heading)", () => {
    let c = base();
    const faq = c.sections.find((s) => s.type === "faq")!;
    c = updateSectionData(c, faq.id, { heading: "EMPTY-FAQ-HEADING", items: [] });
    const { container } = render(<LandingRenderer content={c} status="published" kind="webinar" />);
    expect(container.textContent).not.toContain("EMPTY-FAQ-HEADING");
  });
  it("uses native details/summary for the FAQ", () => {
    let c = base();
    const faq = c.sections.find((s) => s.type === "faq")!;
    c = updateSectionData(c, faq.id, { heading: "FAQ", items: [{ q: "Why?", a: "Because." }] });
    const { container } = render(<LandingRenderer content={c} status="published" kind="webinar" />);
    expect(container.querySelector("details summary")?.textContent).toContain("Why?");
  });
  it("shows a YouTube thumbnail with no iframe until clicked, then the nocookie embed", () => {
    let c = emptyContent("course");
    const vr = c.sections.find((s) => s.type === "video_reviews")!;
    c = updateSectionData(c, vr.id, { heading: "Reviews", items: [{ url: "https://youtu.be/dQw4w9WgXcQ", caption: "Great" }] });
    c = updateSettings(c, { registerUrl: "https://pharmacozyme.com/register" });
    const { container } = render(<LandingRenderer content={c} status="published" kind="course" />);
    expect(container.querySelector("iframe")).toBeNull();
    expect(container.querySelector('img[src="https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg"]')).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /play/i }));
    const frame = container.querySelector("iframe")!;
    expect(frame.getAttribute("src")).toMatch(/^https:\/\/www\.youtube-nocookie\.com\/embed\/dQw4w9WgXcQ/);
  });
});
