import { describe, it, expect, vi } from "vitest";
import { canShareFiles, sharePodiumImage } from "@/lib/progress/share-podium";

const okFetch = () => vi.fn(async () => new Response(new Blob(["png"], { type: "image/png" }), { status: 200 }));

describe("canShareFiles", () => {
  it("is true only when both share and canShare exist", () => {
    expect(canShareFiles(undefined)).toBe(false);
    expect(canShareFiles({} as Navigator)).toBe(false);
    expect(canShareFiles({ share: vi.fn(), canShare: vi.fn() } as unknown as Navigator)).toBe(true);
  });
});

describe("sharePodiumImage", () => {
  it("shares the picture as a file when the phone can", async () => {
    const share = vi.fn(async () => undefined);
    const nav = { share, canShare: vi.fn(() => true) } as unknown as Navigator;
    const download = vi.fn();
    const out = await sharePodiumImage("/api/x", "pod.png", "Sample", { fetch: okFetch(), navigator: nav, download });
    expect(out).toBe("shared");
    const arg = (share.mock.calls[0] as unknown as [{ files: File[]; title: string }])[0];
    expect(arg.files[0].name).toBe("pod.png");
    expect(arg.title).toBe("Sample");
    expect(download).not.toHaveBeenCalled();
  });

  it("downloads when sharing files is not possible", async () => {
    const download = vi.fn();
    expect(await sharePodiumImage("/api/x", "pod.png", "S", { fetch: okFetch(), navigator: undefined, download })).toBe("downloaded");
    expect(download).toHaveBeenCalledWith("/api/x", "pod.png");

    const nav = { share: vi.fn(), canShare: vi.fn(() => false) } as unknown as Navigator;
    expect(await sharePodiumImage("/api/x", "pod.png", "S", { fetch: okFetch(), navigator: nav, download })).toBe("downloaded");
  });

  it("downloads when the image request fails or share throws", async () => {
    const download = vi.fn();
    const nav = { share: vi.fn(async () => { throw new Error("NotAllowed"); }), canShare: vi.fn(() => true) } as unknown as Navigator;
    expect(await sharePodiumImage("/api/x", "p.png", "S", { fetch: okFetch(), navigator: nav, download })).toBe("downloaded");
    const bad = vi.fn(async () => new Response("no", { status: 404 }));
    expect(await sharePodiumImage("/api/x", "p.png", "S", { fetch: bad, navigator: nav, download })).toBe("downloaded");
    expect(download).toHaveBeenCalledTimes(2);
  });

  it("does nothing more when the person cancels the share sheet", async () => {
    const download = vi.fn();
    const abort = Object.assign(new Error("cancel"), { name: "AbortError" });
    const nav = { share: vi.fn(async () => { throw abort; }), canShare: vi.fn(() => true) } as unknown as Navigator;
    expect(await sharePodiumImage("/api/x", "p.png", "S", { fetch: okFetch(), navigator: nav, download })).toBe("cancelled");
    expect(download).not.toHaveBeenCalled();
  });
});
