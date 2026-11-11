import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { PodiumImage } from "@/components/progress/portal/PodiumImage";
import { SharePodium } from "@/components/progress/portal/SharePodium";
import { podiumImageEntry } from "@/lib/progress/leaderboard";

const entries = [
  { name: "Alpha", rank: 1, score: 7 },
  { name: "Bravo", rank: 2, score: 5 },
];

describe("PodiumImage optional props", () => {
  it("defaults keep the student wording", () => {
    const html = renderToStaticMarkup(<PodiumImage title="Batch" label="Overall" entries={entries} size="square" />);
    expect(html).toContain("pts");
    expect(html).toContain("Overall · Top 2");
    expect(html).toContain("LEADERBOARD");
  });

  it("unit and heading replace the points word and the label pill", () => {
    const html = renderToStaticMarkup(
      <PodiumImage title="Pharmacozyme Affiliates" label="x" entries={entries} size="square" unit="paid sales" heading="Affiliate leaderboard · This month" />,
    );
    expect(html).toContain("paid sales");
    expect(html).not.toContain(">pts<");
    expect(html).toContain("Affiliate leaderboard · This month");
    expect(html).not.toContain("Top 2");
  });

  it("fallbackLabel changes the non-Latin wording only when given", () => {
    const arabic = { name: "علي", rank: 2, score: 3 };
    expect(podiumImageEntry(arabic).name).toBe("Student #2");
    expect(podiumImageEntry(arabic, "Affiliate").name).toBe("Affiliate #2");
    const html = renderToStaticMarkup(<PodiumImage title="T" label="L" entries={[arabic]} size="square" fallbackLabel="Affiliate" />);
    expect(html).toContain("Affiliate #2");
    expect(renderToStaticMarkup(<PodiumImage title="T" label="L" entries={[arabic]} size="square" />)).toContain("Student #2");
  });
});

describe("SharePodium optional props", () => {
  const blob = new Blob(["x"], { type: "image/png" });
  it("defaults fetch the student picture URLs", async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, blob: async () => blob, headers: new Headers({ "content-type": "image/png" }) });
    vi.stubGlobal("fetch", f);
    render(<SharePodium slug="b1" title="B" pick="overall" label="Overall" />);
    fireEvent.click(screen.getByRole("button", { name: /Share podium/ }));
    await waitFor(() => expect(f).toHaveBeenCalledTimes(2));
    expect(f.mock.calls.map((c) => c[0])).toEqual(["/api/progress-podium/b1?size=square", "/api/progress-podium/b1?size=story"]);
  });

  it("imageUrl is used instead when given", async () => {
    const f = vi.fn().mockResolvedValue({ ok: true, blob: async () => blob, headers: new Headers({ "content-type": "image/png" }) });
    vi.stubGlobal("fetch", f);
    render(<SharePodium slug="x" title="B" pick="month" label="This month" imageUrl={(s) => `/api/admin/affiliates/podium?period=month&size=${s}`} fileBase="affiliates" />);
    fireEvent.click(screen.getByRole("button", { name: /Share podium/ }));
    await waitFor(() => expect(f).toHaveBeenCalledTimes(2));
    expect(f.mock.calls.map((c) => c[0])).toEqual([
      "/api/admin/affiliates/podium?period=month&size=square",
      "/api/admin/affiliates/podium?period=month&size=story",
    ]);
  });
});
