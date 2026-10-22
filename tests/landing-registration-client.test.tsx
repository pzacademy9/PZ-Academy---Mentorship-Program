// tests/landing-registration-client.test.tsx
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, renderHook, act } from "@testing-library/react";
import fs from "node:fs";
import path from "node:path";

vi.mock("server-only", () => ({}));

import { pickRegion } from "@/lib/landing/registration/region-pick";
import { captureAttribution, readAgentRef, readAttribution, readFbc, AGENT_REF_KEY } from "@/components/landing/registration/attribution";
import type { KV } from "@/components/landing/registration/storage";
import { buildFunnelBody, getSessionId, sendFunnelEvent } from "@/components/landing/registration/funnel";
import { installPixel, track, __resetPixelForTests } from "@/components/landing/registration/pixel";
import { PixelLoader } from "@/components/landing/registration/PixelLoader";
import { RegistrationLauncher } from "@/components/landing/registration/RegistrationLauncher";
import { RegistrationHost } from "@/components/landing/registration/RegistrationHost";
import { RegisterButton } from "@/components/landing/RegisterButton";
import { LandingRenderer } from "@/components/landing/LandingRenderer";
import { useRegistrationConfig } from "@/components/landing/registration/useRegistrationConfig";
import { usePricingQuote, type Selection } from "@/components/landing/registration/usePricingQuote";
import { emptyContent, updateRegistration, updateSettings } from "@/lib/landing/content";
import { ppcConfig, publicConfig } from "./fixtures/registration-fixtures";

function memKV(): KV & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v), removeItem: (k) => void data.delete(k) };
}
const DAY = 86_400_000;
const fetchMock = () => fetch as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); __resetPixelForTests(); delete (window as { fbq?: unknown }).fbq; document.head.querySelectorAll("script[src*='fbevents']").forEach((s) => s.remove()); });
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("pickRegion", () => {
  const regions = ppcConfig.regions; // PK, UAE, KSA, INTL
  it("maps geo country codes to region keys", () => {
    expect(pickRegion(regions, "AE", "PK")).toBe("UAE");
    expect(pickRegion(regions, "SA", "PK")).toBe("KSA");
    expect(pickRegion(regions, "pk", "UAE")).toBe("PK");
  });
  it("sends an unlisted country to International when offered, else the default", () => {
    expect(pickRegion(regions, "GB", "PK")).toBe("INTL");
    expect(pickRegion(regions.filter((r) => r.key !== "INTL"), "GB", "UAE")).toBe("UAE");
  });
  it("uses the default with no country, and a valid ?region= override wins", () => {
    expect(pickRegion(regions, null, "KSA")).toBe("KSA");
    expect(pickRegion(regions, "AE", "PK", "ksa")).toBe("KSA");
    expect(pickRegion(regions, "AE", "PK", "XX")).toBe("UAE");
    expect(pickRegion([], "AE", "PK")).toBe("");
  });
});

describe("attribution", () => {
  it("stores ?ref= for 30 days and forgets it after", () => {
    const local = memKV();
    captureAttribution("?ref=Ayesha-7k2", 1_000, local, memKV());
    expect(readAgentRef(1_000 + 29 * DAY, local)).toBe("ayesha-7k2");
    expect(readAgentRef(1_000 + 31 * DAY, local)).toBe("");
    expect(local.data.has(AGENT_REF_KEY)).toBe(false);
  });
  it("ignores a malformed ref and keeps an earlier valid one", () => {
    const local = memKV();
    captureAttribution("?ref=good-1", 0, local, memKV());
    captureAttribution("?ref=<script>", 10, local, memKV());
    expect(readAgentRef(20, local)).toBe("good-1");
  });
  it("a corrupt stored ref reads as none", () => {
    const local = memKV();
    local.setItem(AGENT_REF_KEY, "{not json");
    expect(readAgentRef(0, local)).toBe("");
  });
  it("captures UTMs for the session and builds fbc from fbclid; the _fbc cookie wins", () => {
    const local = memKV(); const session = memKV();
    captureAttribution("?utm_source=fb&utm_campaign=ppc3&x=1&fbclid=IwAR123abcdef", 5_000, local, session);
    const a = readAttribution(6_000, local, session, "_fbp=fb.1.111.222; other=1");
    expect(a.utm).toEqual({ utm_source: "fb", utm_campaign: "ppc3" });
    expect(a.fbc).toBe("fb.1.5000.IwAR123abcdef");
    expect(a.fbp).toBe("fb.1.111.222");
    expect(readFbc(6_000, local, "_fbc=fb.1.9.FROMCOOKIE")).toBe("fb.1.9.FROMCOOKIE");
  });
  it("stores ?src=website in the session utm", () => {
    const session = memKV();
    captureAttribution("?src=website", 0, memKV(), session);
    expect(readAttribution(0, memKV(), session, "").utm).toEqual({ src: "website" });
  });
  it("keeps the agent ref exactly as before when ?ref and ?src arrive together", () => {
    const local = memKV(); const session = memKV();
    captureAttribution("?ref=agent-one&src=website", 1_000, local, session);
    expect(readAgentRef(1_000, local)).toBe("agent-one");
    expect(JSON.parse(local.data.get(AGENT_REF_KEY) as string)).toEqual({ code: "agent-one", exp: 1_000 + 30 * DAY });
    expect(readAttribution(1_000, local, session, "").utm).toEqual({ src: "website" });
  });
  it("a later visit with only ?src=website does not remove or overwrite a stored ref", () => {
    const local = memKV(); const session = memKV();
    captureAttribution("?ref=agent-one", 1_000, local, session);
    const before = local.data.get(AGENT_REF_KEY);
    captureAttribution("?src=website", 2_000, local, session);
    expect(local.data.get(AGENT_REF_KEY)).toBe(before);
    expect(readAgentRef(2_000, local)).toBe("agent-one");
  });
  it("works with no storage at all", () => {
    expect(() => captureAttribution("?ref=abc&utm_source=x", 0, null, null)).not.toThrow();
    expect(readAttribution(0, null, null, "")).toEqual({ refCode: "", utm: {}, fbp: "", fbc: "" });
  });
});

describe("funnel events", () => {
  it("keeps one session id per tab", () => {
    const s = memKV();
    expect(getSessionId(s)).toBe(getSessionId(s));
  });
  it("builds the event body with the session, UTMs and a live agent ref", () => {
    const local = memKV(); const session = memKV();
    captureAttribution("?ref=agent-1&utm_campaign=ppc3", 0, local, session);
    const body = JSON.parse(buildFunnelBody("start", 10, local, session));
    expect(body).toEqual({ sessionId: getSessionId(session), type: "start", utm: { utm_campaign: "ppc3" }, ref: "agent-1" });
    expect(JSON.parse(buildFunnelBody("view", 31 * DAY, local, session)).ref).toBeUndefined();
  });
  it("sends with sendBeacon to the page's event route and falls back to fetch", () => {
    const beacon = vi.fn().mockReturnValue(true);
    vi.stubGlobal("navigator", { ...navigator, sendBeacon: beacon });
    sendFunnelEvent("ppc b3", "start");
    expect(beacon).toHaveBeenCalledTimes(1);
    expect(beacon.mock.calls[0][0]).toBe("/api/landing/ppc%20b3/event");
    expect((beacon.mock.calls[0][1] as Blob).type).toBe("application/json");
    beacon.mockReturnValue(false);
    fetchMock().mockResolvedValue({ ok: true });
    sendFunnelEvent("ppc", "view");
    expect(fetchMock()).toHaveBeenCalledWith("/api/landing/ppc/event", expect.objectContaining({ method: "POST", keepalive: true }));
  });
});

describe("Pixel", () => {
  it("does nothing without a valid pixel id", () => {
    expect(installPixel("")).toBe(false);
    expect(installPixel("abc")).toBe(false);
    expect(document.querySelector("script[src*='fbevents']")).toBeNull();
  });
  it("queues events tracked before install, then installs once and flushes them with their event ids", () => {
    const id = track("Lead", { content_name: "PPC" }, "evt-1");
    expect(id).toBe("evt-1");
    expect(installPixel("2299307960538116")).toBe(true);
    expect(installPixel("2299307960538116")).toBe(false);
    expect(document.querySelectorAll("script[src*='fbevents']")).toHaveLength(1);
    const q = (window as unknown as { fbq: { queue: unknown[][] } }).fbq.queue;
    expect(q[0]).toEqual(["init", "2299307960538116"]);
    expect(q).toContainEqual(["track", "Lead", { content_name: "PPC" }, { eventID: "evt-1" }]);
  });
  it("PixelLoader loads after the page is interactive and sends PageView and ViewContent", async () => {
    vi.useFakeTimers();
    render(<PixelLoader pixelId="2299307960538116" contentName="PPC Batch 3" />);
    expect(document.querySelector("script[src*='fbevents']")).toBeNull();
    await act(async () => { vi.advanceTimersByTime(1600); });
    expect(document.querySelector("script[src*='fbevents']")).not.toBeNull();
    const q = (window as unknown as { fbq: { queue: unknown[][] } }).fbq.queue;
    expect(q.map((e) => e[1])).toEqual(expect.arrayContaining(["PageView", "ViewContent"]));
  });
  it("PixelLoader renders nothing and loads nothing without an id", async () => {
    vi.useFakeTimers();
    render(<PixelLoader pixelId="" contentName="x" />);
    await act(async () => { vi.advanceTimersByTime(5000); });
    expect(document.querySelector("script[src*='fbevents']")).toBeNull();
  });
});

describe("launcher, host and Register button", () => {
  it("clicking a launcher lazy-loads the modal into the host", async () => {
    render(<><RegistrationLauncher className="x"><span>Register now</span></RegistrationLauncher><RegistrationHost slug="ppc" tracking={false} /></>);
    expect(screen.queryByRole("dialog")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Register now" }));
    // The real modal pulls in the whole flow; a cold module transform can be slow when the suite runs in parallel.
    expect(await screen.findByRole("dialog", {}, { timeout: 15000 })).toBeTruthy();
  }, 20000);
  it("RegisterButton: built-in opens the dialog, closed shows the notice, otherwise a safe link", () => {
    const { rerender } = render(<RegisterButton register={{ url: "https://x.com", label: "Join", closed: false, builtIn: true }} />);
    const b = screen.getByRole("link", { name: "Join" });
    expect(b.getAttribute("aria-haspopup")).toBe("dialog");
    expect(b.getAttribute("href")).toBe("https://x.com");
    rerender(<RegisterButton register={{ url: "https://x.com", label: "Join", closed: true, builtIn: true }} announce />);
    expect(screen.getByRole("status").textContent).toMatch(/registration is closed/i);
    rerender(<RegisterButton register={{ url: "https://x.com", label: "Join", closed: false }} />);
    expect(screen.getByRole("link", { name: "Join" }).getAttribute("href")).toBe("https://x.com");
  });
  it("built-in Register with a safe URL is a link that opens the modal (preventDefault), and modifier-clicks pass through", async () => {
    render(<><RegisterButton register={{ url: "https://x.com", label: "Join", closed: false, builtIn: true }} /><RegistrationHost slug="ppc" tracking={false} /></>);
    const a = screen.getByRole("link", { name: "Join" });
    expect(fireEvent.click(a, { ctrlKey: true })).toBe(true); // not prevented: opens in a new tab as usual
    expect(fireEvent.click(a, { metaKey: true })).toBe(true);
    expect(fireEvent.click(a, { button: 1 })).toBe(true);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(fireEvent.click(a)).toBe(false); // default prevented
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });
  it("built-in Register with no or an unsafe URL is a button", () => {
    const { rerender } = render(<RegisterButton register={{ url: "", label: "Join", closed: false, builtIn: true }} />);
    expect(screen.getByRole("button", { name: "Join" }).getAttribute("aria-haspopup")).toBe("dialog");
    rerender(<RegisterButton register={{ url: "javascript:alert(1)", label: "Join", closed: false, builtIn: true }} />);
    expect(screen.getByRole("button", { name: "Join" })).toBeTruthy();
    expect(screen.queryByRole("link")).toBeNull();
  });
  it("LandingRenderer uses the built-in form only on the public route (slug given) when registration is on", () => {
    const base = updateSettings(emptyContent("course"), { registerUrl: "https://old.example/register" });
    // One mode: the plain link launcher (two modes render the Live / Recorded menu, see landing-register-menu.test.tsx).
    const on = updateRegistration(base, { ...ppcConfig, modes: ["live"] });
    const { container, unmount } = render(<LandingRenderer content={on} status="published" kind="course" pageTitle="PPC" slug="ppc" />);
    expect(container.querySelectorAll("a[href='https://old.example/register'][aria-haspopup='dialog']").length).toBeGreaterThan(0);
    unmount();
    const preview = render(<LandingRenderer content={on} status="published" kind="course" pageTitle="PPC" />);
    expect(preview.container.querySelector("a[href='https://old.example/register']")).not.toBeNull();
    preview.unmount();
    const off = render(<LandingRenderer content={updateRegistration(base, { ...ppcConfig, enabled: false })} status="published" kind="course" pageTitle="PPC" slug="ppc" />);
    expect(off.container.querySelector("a[href='https://old.example/register']")).not.toBeNull();
  });
});

describe("guards (source scans)", () => {
  const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");
  it("the public page never reads cookies() or headers()", () => {
    const src = read("src/app/e/[slug]/page.tsx");
    expect(src).not.toMatch(/\bcookies\s*\(/);
    expect(src).not.toMatch(/\bheaders\s*\(/);
    expect(src).toMatch(/export const revalidate = 3600/);
  });
  it("nothing on the page imports the modal statically; it is only loaded with import()", () => {
    for (const f of ["src/components/landing/LandingRenderer.tsx", "src/components/landing/RegisterButton.tsx", "src/components/landing/registration/RegistrationLauncher.tsx", "src/components/landing/registration/RegistrationHost.tsx", "src/components/landing/registration/registration-bus.ts"]) {
      expect(read(f), f).not.toMatch(/from\s+["'][^"']*RegistrationModal["']/);
    }
    expect(read("src/components/landing/registration/RegistrationHost.tsx")).toMatch(/import\(\s*["']\.\/RegistrationModal["']\s*\)/);
  });
});

describe("useRegistrationConfig", () => {
  it("loads the config and the logged-in profile together", async () => {
    fetchMock().mockImplementation(async (url: string) => url === "/api/landing/me"
      ? { ok: true, json: async () => ({ name: "Ayesha Khan", email: "ayesha@mail.com", whatsapp: "923001234567", profession: "Pharmacist" }) }
      : { ok: true, status: 200, json: async () => publicConfig(ppcConfig) });
    const { result } = renderHook(() => useRegistrationConfig("ppc"));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    if (result.current.status !== "ready") throw new Error("not ready");
    expect(result.current.me?.email).toBe("ayesha@mail.com");
    expect(result.current.config.pageId).toBe("page-1");
  });
  it("treats a failed or empty profile call as a guest", async () => {
    fetchMock().mockImplementation(async (url: string) => url === "/api/landing/me"
      ? { ok: true, json: async () => null }
      : { ok: true, status: 200, json: async () => publicConfig(ppcConfig) });
    const { result } = renderHook(() => useRegistrationConfig("ppc"));
    await waitFor(() => expect(result.current.status).toBe("ready"));
    expect(result.current.status === "ready" && result.current.me).toBeNull();
  });
  it("reports a missing page and retries a network error", async () => {
    fetchMock().mockImplementation(async (url: string) => (url === "/api/landing/me" ? { ok: false } : { ok: false, status: 404, json: async () => ({}) }));
    const a = renderHook(() => useRegistrationConfig("gone"));
    await waitFor(() => expect(a.result.current.status).toBe("error"));
    expect(a.result.current.status === "error" && a.result.current.message).toMatch(/isn't available/i);
    fetchMock().mockReset();
    fetchMock().mockRejectedValueOnce(new Error("offline")).mockResolvedValue({ ok: false });
    const b = renderHook(() => useRegistrationConfig("ppc"));
    await waitFor(() => expect(b.result.current.status).toBe("error"));
    fetchMock().mockImplementation(async (url: string) => url === "/api/landing/me" ? { ok: false } : { ok: true, status: 200, json: async () => publicConfig(ppcConfig) });
    act(() => b.result.current.retry());
    await waitFor(() => expect(b.result.current.status).toBe("ready"));
  });
});

describe("usePricingQuote", () => {
  const sel = (over: Partial<Selection> = {}): Selection => ({ regionKey: "PK", mode: "live", optionKeys: ["full"], tierKey: "individual", groupSize: 1, ...over });
  const serverQuote = (total: number) => ({ quote: { ok: true, currency: "PKR", regionKey: "PK", mode: "live", optionKeys: ["full"], tierKey: "individual", groupSize: 1, earlyBirdApplied: true, isFree: false, listPerPerson: 6000, perPerson: total, total, savings: 6000 - total } });

  it("shows the local price at once, then the server's", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-13T10:00:00Z"));
    fetchMock().mockResolvedValue({ ok: true, json: async () => serverQuote(4700) });
    const { result } = renderHook(() => usePricingQuote({ slug: "ppc", config: ppcConfig, selection: sel(), promoCode: "", email: "", debounceMs: 5 }));
    expect(result.current.source).toBe("local");
    expect(result.current.quote).toMatchObject({ ok: true, total: 4800 });
    await waitFor(() => expect(result.current.source).toBe("server"));
    expect(result.current.quote).toMatchObject({ ok: true, total: 4700 });
    const body = JSON.parse(fetchMock().mock.calls[0][1].body);
    expect(body).toEqual({ regionKey: "PK", mode: "live", optionKeys: ["full"], tierKey: "individual", groupSize: 1 });
  });
  it("sends the promo code and email only when a code is applied, and returns the promo result", async () => {
    fetchMock().mockResolvedValue({ ok: true, json: async () => ({ ...serverQuote(4800), promo: { ok: true, promoId: "p1", code: "PZ10", discount: 480, total: 4320 } }) });
    const { result } = renderHook(() => usePricingQuote({ slug: "ppc", config: ppcConfig, selection: sel(), promoCode: "PZ10", email: "a@b.co", debounceMs: 5 }));
    await waitFor(() => expect(result.current.promo).toMatchObject({ ok: true, total: 4320 }));
    expect(JSON.parse(fetchMock().mock.calls[0][1].body)).toMatchObject({ promoCode: "PZ10", email: "a@b.co" });
  });
  it("debounces quick changes and never shows an older answer for a newer choice", async () => {
    let resolveFirst: (v: unknown) => void = () => {};
    fetchMock()
      .mockImplementationOnce(() => new Promise((r) => { resolveFirst = r; }))
      .mockResolvedValue({ ok: true, json: async () => serverQuote(4000) });
    const { result, rerender } = renderHook((p: { s: Selection }) => usePricingQuote({ slug: "ppc", config: ppcConfig, selection: p.s, promoCode: "", email: "", debounceMs: 5 }), { initialProps: { s: sel() } });
    await waitFor(() => expect(fetchMock()).toHaveBeenCalledTimes(1));
    rerender({ s: sel({ regionKey: "UAE" }) });
    expect(fetchMock().mock.calls[0][1].signal.aborted).toBe(true);
    resolveFirst({ ok: true, json: async () => serverQuote(1) });
    await waitFor(() => expect(result.current.source).toBe("server"));
    expect(result.current.quote).toMatchObject({ total: 4000 });
  });
  it("keeps the local price when the server is unreachable, and sends nothing with no option chosen", async () => {
    fetchMock().mockRejectedValue(new Error("offline"));
    const a = renderHook(() => usePricingQuote({ slug: "ppc", config: ppcConfig, selection: sel(), promoCode: "", email: "", debounceMs: 5 }));
    await waitFor(() => expect(a.result.current.pending).toBe(false));
    expect(a.result.current.source).toBe("local");
    expect(a.result.current.quote?.ok).toBe(true);
    fetchMock().mockReset();
    const b = renderHook(() => usePricingQuote({ slug: "ppc", config: ppcConfig, selection: sel({ optionKeys: [] }), promoCode: "", email: "", debounceMs: 5 }));
    expect(b.result.current.quote).toBeNull();
    await new Promise((r) => setTimeout(r, 20));
    expect(fetchMock()).not.toHaveBeenCalled();
  });
});

describe("variant scope in the widget fetch layer", () => {
  const urls = () => fetchMock().mock.calls.map((c) => String(c[0]));
  it("pickRegion: exactly one region always wins over the visitor's country and ?region=", () => {
    const uae = [{ key: "UAE" }] as never;
    expect(pickRegion(uae, "PK", "PK")).toBe("UAE");
    expect(pickRegion(uae, "PK", "PK", "PK")).toBe("UAE");
    expect(pickRegion(uae, null, "")).toBe("UAE");
  });
  it("useRegistrationConfig sends ?v= only when a variant is given", async () => {
    fetchMock().mockImplementation(async (url: string) => url === "/api/landing/me"
      ? { ok: true, json: async () => null }
      : { ok: true, status: 200, json: async () => publicConfig(ppcConfig) });
    const a = renderHook(() => useRegistrationConfig("ppc", true, "uae/module-2"));
    await waitFor(() => expect(a.result.current.status).toBe("ready"));
    expect(urls()).toContain("/api/landing/ppc/config?v=uae%2Fmodule-2");
    fetchMock().mockClear();
    const b = renderHook(() => useRegistrationConfig("ppc", true, ""));
    await waitFor(() => expect(b.result.current.status).toBe("ready"));
    expect(urls()).toContain("/api/landing/ppc/config");
    expect(urls().some((u) => u.includes("v="))).toBe(false);
  });
  it("usePricingQuote and submitRegistration append ?v= only with a variant", async () => {
    fetchMock().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    const sel: Selection = { regionKey: "PK", mode: "live", optionKeys: ["full"], tierKey: "individual", groupSize: 1 };
    renderHook(() => usePricingQuote({ slug: "ppc", config: ppcConfig, selection: sel, promoCode: "", email: "", debounceMs: 1, variant: "uae/module-2" }));
    await waitFor(() => expect(urls()).toContain("/api/landing/ppc/quote?v=uae%2Fmodule-2"));
    fetchMock().mockClear();
    renderHook(() => usePricingQuote({ slug: "ppc", config: ppcConfig, selection: sel, promoCode: "", email: "", debounceMs: 1 }));
    await waitFor(() => expect(urls()).toContain("/api/landing/ppc/quote"));
    const { submitRegistration } = await import("@/components/landing/registration/submit");
    fetchMock().mockClear();
    await submitRegistration("ppc", {} as never, null, { variant: "uae/module-2" });
    expect(urls()).toEqual(["/api/landing/ppc/register?v=uae%2Fmodule-2"]);
    fetchMock().mockClear();
    await submitRegistration("ppc", {} as never, null);
    expect(urls()).toEqual(["/api/landing/ppc/register"]);
  });
});
