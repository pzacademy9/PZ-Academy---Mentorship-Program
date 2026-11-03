import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("server-only", () => ({}));

type Opts = { host?: string; videoId?: string; playerVars?: Record<string, unknown>; events?: { onReady?: () => void } };
class FakePlayer {
  static last: FakePlayer | null = null;
  /** The real player has no methods until its iframe is ready; false lets a test stay in that state. */
  static autoReady = true;
  state = 1;
  opts: Opts;
  paused = 0;
  played = 0;
  destroyed = false;
  getPlayerState!: () => number;
  pauseVideo!: () => void;
  playVideo!: () => void;
  constructor(_el: HTMLElement, opts: Opts) {
    this.opts = opts;
    FakePlayer.last = this;
    if (FakePlayer.autoReady) this.becomeReady();
  }
  becomeReady() {
    this.getPlayerState = () => this.state;
    this.pauseVideo = () => { this.state = 2; this.paused += 1; };
    this.playVideo = () => { this.state = 1; this.played += 1; };
    this.opts.events?.onReady?.();
  }
  destroy() { this.destroyed = true; }
}
const api = vi.hoisted(() => ({ loader: vi.fn() }));
vi.mock("@/lib/landing/youtube-api", () => ({ loadYouTubeApi: api.loader }));

import { DemoPlayer } from "@/components/landing/sections/DemoPlayer";
import { DemoVideo } from "@/components/landing/sections/DemoVideo";
import { openRegistration } from "@/components/landing/registration/registration-bus";

const register = { url: "https://x.com/r", label: "Join", closed: false };
const ID = "dQw4w9WgXcQ";

function player(over: Partial<React.ComponentProps<typeof DemoPlayer>> = {}) {
  return <DemoPlayer id={ID} title="Fake lecture" seconds={20} popupTitle="Enjoying the session?" popupText="Register now to join the full course." register={register} {...over} />;
}
async function start(over: Partial<React.ComponentProps<typeof DemoPlayer>> = {}) {
  render(player(over));
  await act(async () => { fireEvent.click(screen.getByRole("button", { name: /play video/i })); });
  await act(async () => { await vi.advanceTimersByTimeAsync(0); });
}
const watch = async (seconds: number) => { await act(async () => { await vi.advanceTimersByTimeAsync(seconds * 1000); }); };

beforeEach(() => {
  vi.useFakeTimers();
  FakePlayer.last = null;
  FakePlayer.autoReady = true;
  api.loader.mockReset();
  api.loader.mockResolvedValue({ Player: FakePlayer });
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

describe("DemoVideo (server part)", () => {
  const html = (data: Record<string, unknown>) => renderToStaticMarkup(<>{DemoVideo({ data, register })}</>);
  it("renders nothing without a valid link", () => {
    expect(html({ heading: "H" })).toBe("");
    expect(html({ heading: "H", url: "https://example.com/x" })).toBe("");
  });
  it("with a good link shows the heading, subheading and a thumbnail, and loads nothing from YouTube", () => {
    const o = html({ heading: "Watch a demo session", subheading: "See how it is taught", url: `https://youtu.be/${ID}`, pauseEvery: "20" });
    expect(o).toContain("Watch a demo session");
    expect(o).toContain("See how it is taught");
    expect(o).toContain("Play video");
    expect(o).not.toContain("<iframe");
    expect(o).not.toContain("<script");
  });
});

describe("DemoPlayer", () => {
  it("after play, creates the player on the nocookie host with the video id", async () => {
    await start();
    expect(FakePlayer.last).not.toBeNull();
    expect(FakePlayer.last!.opts.host).toBe("https://www.youtube-nocookie.com");
    expect(FakePlayer.last!.opts.videoId).toBe(ID);
  });

  it("after 20 s of playing, pauses the video and shows the popup with the Register button", async () => {
    await start();
    await watch(19);
    expect(screen.queryByRole("dialog")).toBeNull();
    await watch(2);
    expect(FakePlayer.last!.paused).toBe(1);
    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("Enjoying the session?");
    expect(dialog.textContent).toContain("Register now to join the full course.");
    expect(dialog.textContent).toContain("Join");
    expect(screen.getByRole("button", { name: /keep watching/i })).toBeTruthy();
  });

  it("pauseEvery 15 pauses at 15 s", async () => {
    await start({ seconds: 15 });
    await watch(14);
    expect(screen.queryByRole("dialog")).toBeNull();
    await watch(2);
    expect(screen.getByRole("dialog")).toBeTruthy();
  });

  it("time spent paused is not watched time: the popup never shows", async () => {
    await start();
    FakePlayer.last!.state = 2;
    await watch(60);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("Keep watching hides the popup, plays again, and the popup comes back after another interval", async () => {
    await start();
    await watch(21);
    fireEvent.click(screen.getByRole("button", { name: /keep watching/i }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(FakePlayer.last!.played).toBe(1);
    await watch(19);
    expect(screen.queryByRole("dialog")).toBeNull();
    await watch(2);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(FakePlayer.last!.paused).toBe(2);
  });

  it("Escape works like Keep watching", async () => {
    await start();
    await watch(21);
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(FakePlayer.last!.played).toBe(1);
  });

  it("uses the closed notice when registration is closed", async () => {
    await start({ register: { ...register, closed: true } });
    await watch(21);
    expect(screen.getByRole("dialog").textContent).toContain("Registration is closed");
    expect(screen.getByRole("dialog").querySelector("a")).toBeNull();
  });

  it("shows the Live / Recorded menu when the page has two modes", async () => {
    await start({ register: { ...register, builtIn: true, modes: ["live", "recorded"] } });
    await watch(21);
    const trigger = screen.getByRole("dialog").querySelector("button[aria-haspopup]");
    expect(trigger).not.toBeNull();
  });

  it("opening registration hides the popup and the video stays paused", async () => {
    await start();
    await watch(21);
    act(() => { openRegistration(null); });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(FakePlayer.last!.state).toBe(2);
  });

  it("leaves full screen when the popup shows", async () => {
    const exit = vi.fn(() => Promise.resolve());
    Object.defineProperty(document, "fullscreenElement", { value: document.body, configurable: true });
    document.exitFullscreen = exit;
    await start();
    await watch(21);
    expect(exit).toHaveBeenCalled();
    Object.defineProperty(document, "fullscreenElement", { value: null, configurable: true });
  });

  it("if the YouTube script cannot load, a plain video is shown and no popup ever appears", async () => {
    api.loader.mockResolvedValue(null);
    await start();
    expect(document.querySelector("iframe")?.getAttribute("src")).toContain(`youtube-nocookie.com/embed/${ID}`);
    await watch(120);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("the popup card fits a small phone: limited height and scrolls", async () => {
    await start();
    await watch(21);
    const card = screen.getByRole("dialog");
    expect(card.className).toMatch(/max-h-\[/);
    expect(card.className).toContain("overflow-y-auto");
  });

  it("does not touch the player before it is ready, then counts from ready", async () => {
    FakePlayer.autoReady = false;
    const errors: unknown[] = [];
    const onErr = (e: ErrorEvent) => { errors.push(e.error); e.preventDefault(); };
    window.addEventListener("error", onErr);
    await start();
    await watch(30);
    expect(errors).toEqual([]);
    expect(screen.queryByRole("dialog")).toBeNull();
    act(() => { FakePlayer.last!.becomeReady(); });
    await watch(19);
    expect(screen.queryByRole("dialog")).toBeNull();
    await watch(2);
    expect(screen.getByRole("dialog")).toBeTruthy();
    window.removeEventListener("error", onErr);
  });

  it("re-rendering while the popup is open does not pull focus back into it", async () => {
    const { rerender } = render(<><input aria-label="other" />{player()}</>);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: /play video/i })); });
    await act(async () => { await vi.advanceTimersByTimeAsync(0); });
    await watch(21);
    const other = screen.getByLabelText("other") as HTMLInputElement;
    other.focus();
    expect(document.activeElement).toBe(other);
    rerender(<><input aria-label="other" />{player({ popupText: "Changed text" })}</>);
    expect(document.activeElement).toBe(other);
  });

  it("the popup sits above the phone bottom bar and the WhatsApp button", async () => {
    await start();
    await watch(21);
    expect(screen.getByRole("dialog").parentElement!.className).toContain("z-[45]");
  });

  it("the Live / Recorded menu opens upward so the popup card does not clip it", async () => {
    await start({ register: { ...register, builtIn: true, modes: ["live", "recorded"] } });
    await watch(21);
    const trigger = screen.getByRole("dialog").querySelector("button[aria-haspopup]") as HTMLElement;
    fireEvent.click(trigger);
    expect(screen.getByRole("dialog").innerHTML).toContain("bottom-full");
  });

  it("opening registration from elsewhere pauses the video, so no popup waits under the form", async () => {
    await start();
    await watch(5);
    act(() => { openRegistration(null); });
    expect(FakePlayer.last!.paused).toBe(1);
    expect(FakePlayer.last!.state).toBe(2);
    await watch(60);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("stops the timer and destroys the player when removed", async () => {
    await start();
    const p = FakePlayer.last!;
    cleanup();
    expect(p.destroyed).toBe(true);
  });
});
