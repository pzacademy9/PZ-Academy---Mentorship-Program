import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import { BatchPortal } from "@/components/progress/portal/BatchPortal";
import { buildPortalBatch, type PortalBatchView, type PortalResultRow } from "@/lib/progress/portal-build";

const cls = (number: number, state: "present" | "absent" | "upcoming", how: "check-in" | "admin" | null = null) => ({
  number,
  title: `Topic ${number}`,
  startsAt: "2026-03-01T10:00:00Z",
  state,
  how,
});

function view(over: Partial<PortalBatchView> = {}): PortalBatchView {
  return {
    title: "Sample Batch",
    slug: "sample-batch",
    kind: "course",
    minPct: 75,
    state: "live",
    coverUrl: null,
    students: 4,
    classesHeld: 3,
    sessions: [
      { id: "s1", number: 1, title: "Topic 1", quizMax: 100 },
      { id: "s2", number: 2, title: "Topic 2", quizMax: null },
    ],
    attendance: [
      {
        name: "Sample",
        pzId: "Sample-0001",
        mode: "live",
        attended: 2,
        held: 3,
        pct: 67,
        meetsMin: false,
        classes: [cls(1, "present", "check-in"), cls(2, "present", "admin"), cls(3, "absent"), cls(4, "upcoming")],
      },
      { name: "Faro", pzId: "Faro-0002", mode: "live", attended: 3, held: 3, pct: 100, meetsMin: true, classes: [cls(1, "present", "check-in")] },
      { name: "Bilal", pzId: "Bilal-0003", mode: "recorded", attended: null, held: null, pct: null, meetsMin: null, classes: [] },
      { name: "Newbie", pzId: "Newbie-0004", mode: "live", attended: 0, held: 0, pct: null, meetsMin: false, classes: [cls(1, "upcoming")] },
    ],
    overall: [
      { name: "Faro", pzId: "Faro-0002", mode: "live", score: 90, rank: 1 },
      { name: "Sample", pzId: "Sample-0001", mode: "live", score: 90, rank: 1 },
      { name: "Bilal", pzId: "Bilal-0003", mode: "recorded", score: 70, rank: null },
    ],
    perClass: {
      s1: [{ name: "Faro", pzId: "Faro-0002", mode: "live", score: 90, rank: 1 }],
      s2: [],
    },
    ...over,
  };
}

const tab = (name: string) => fireEvent.click(screen.getByRole("tab", { name }));

describe("BatchPortal header", () => {
  it("shows one h1, the state chip, real counts and the back link", () => {
    render(<BatchPortal view={view()} />);
    expect(screen.getAllByRole("heading", { level: 1 }).map((h) => h.textContent)).toEqual(["Sample Batch"]);
    expect(screen.getByText("Live")).toBeTruthy();
    expect(screen.getByText("3 classes held")).toBeTruthy();
    expect(screen.getByText("4 students")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Progress Portal/ }).getAttribute("href")).toBe("/progress");
  });

  it("shows the cover picture behind the header when there is one", () => {
    render(<BatchPortal view={view({ coverUrl: "https://x.test/c.jpg" })} />);
    expect(document.querySelector("img")?.getAttribute("src")).toBe("https://x.test/c.jpg");
  });

  it("completed and recorded batches get their own chip", () => {
    const { unmount } = render(<BatchPortal view={view({ state: "completed" })} />);
    expect(screen.getByText("Completed")).toBeTruthy();
    unmount();
    render(<BatchPortal view={view({ state: "recorded", students: 1 })} />);
    expect(screen.getByText("Recorded", { selector: "header *" })).toBeTruthy();
    expect(screen.getByText("1 student")).toBeTruthy();
  });

  it("tabs are real tabs with one tabpanel, Leaderboard first", () => {
    render(<BatchPortal view={view()} />);
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual(["Leaderboard", "Attendance", "Find me"]);
    expect(screen.getByRole("tab", { name: "Leaderboard" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
    tab("Attendance");
    expect(screen.getByRole("tab", { name: "Attendance" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getAllByRole("tabpanel")).toHaveLength(1);
  });
});

describe("BatchPortal attendance tab", () => {
  const open = (v = view()) => {
    render(<BatchPortal view={v} />);
    tab("Attendance");
  };

  it("shows the minimum note", () => {
    open();
    expect(screen.getByText("Minimum attendance: 75%")).toBeTruthy();
  });

  it("live row shows attended count, percent and target chip; below chip when under", () => {
    open();
    expect(screen.getByText("Attended 2 of 3 classes (67%)")).toBeTruthy();
    expect(screen.getByText("Below 75%")).toBeTruthy();
    expect(screen.getByText("Attended 3 of 3 classes (100%)")).toBeTruthy();
    expect(screen.getByText("Meets 75% target")).toBeTruthy();
    expect(screen.getByText("Sample-0001")).toBeTruthy();
  });

  it("recorded row says Not tracked, has no percent and no expander", () => {
    open();
    expect(screen.getByText("Not tracked")).toBeTruthy();
    expect(screen.getByText("Recorded student")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Bilal/ })).toBeNull();
  });

  it("a live student with no held class says No classes yet and shows no percent", () => {
    open();
    const row = screen.getByRole("button", { name: /Newbie/ });
    expect(within(row).getByText("No classes yet")).toBeTruthy();
    expect(row.textContent).not.toContain("%");
  });

  it("expands the class list inline and collapses it again", () => {
    open();
    const btn = screen.getByRole("button", { name: /Sample-0001/ });
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText(/Class 3 - Topic 3/)).toBeNull();
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByText("Class 1 - Topic 1")).toBeTruthy();
    expect(screen.getByText("Present (check-in)")).toBeTruthy();
    expect(screen.getByText("Present (by admin)")).toBeTruthy();
    expect(screen.getByText("Absent")).toBeTruthy();
    expect(screen.getAllByText("Upcoming").length).toBeGreaterThan(0);
    fireEvent.click(btn);
    expect(screen.queryByText(/Class 3 - Topic 3/)).toBeNull();
  });

  it("search matches name or PZ ID, ignoring case and spaces", () => {
    open();
    const box = screen.getByRole("searchbox", { name: "Search by name or PZ ID" });
    expect(screen.getByRole("status").textContent).toBe("Showing 4 of 4");
    fireEvent.change(box, { target: { value: " SAMPLE " } });
    expect(screen.getByRole("button", { name: /Sample-0001/ })).toBeTruthy();
    expect(screen.queryByText("Faro-0002")).toBeNull();
    expect(screen.getByRole("status").textContent).toBe("Showing 1 of 4");
    fireEvent.change(box, { target: { value: "faro-0002" } });
    expect(screen.queryByText("Sample-0001")).toBeNull();
    expect(screen.getByText("Faro-0002")).toBeTruthy();
    fireEvent.change(box, { target: { value: "zzz" } });
    expect(screen.getByText("No one matches")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toBe("Showing 0 of 4");
  });

  it("search finds a surname part", () => {
    const row = (name: string, pzId: string) => ({ name, pzId, mode: "live" as const, attended: 1, held: 1, pct: 100, meetsMin: true, classes: [cls(1, "present", "check-in")] });
    open(view({ attendance: [row("Sample Longname", "Sample-0001"), row("Faro Other", "Faro-0002")] }));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "LONG name" } });
    expect(screen.getByText("Sample Longname")).toBeTruthy();
    expect(screen.queryByText("Faro Other")).toBeNull();
  });

  it("no students says so", () => {
    open(view({ attendance: [], overall: [], perClass: {} }));
    expect(screen.getByText("No students yet")).toBeTruthy();
  });

  it("uses the first letter, not punctuation, for the avatar initial", () => {
    const rowOf = { name: "(Dr.) Sample Name", pzId: "Sample-0001", mode: "live" as const, attended: 1, held: 1, pct: 100, meetsMin: true, classes: [] };
    open(view({ attendance: [rowOf] }));
    const avatar = screen.getByRole("tabpanel").querySelector("span[aria-hidden].rounded-full");
    expect(avatar?.textContent).toBe("D");
  });

  it("shows the live student above the recorded ones", () => {
    const built = buildPortalBatch({
      pageId: "b1", title: "Sample Batch", slug: "sample-batch", kind: "course", minPct: 75,
      sessions: [{ id: "s1", number: 1, title: "Class 1", startsAt: "2026-03-01T10:00:00Z", audience: null, quizMax: null }],
      people: [
        { id: "p1", pzId: "Aaa-0001", displayName: "Aaa" },
        { id: "p2", pzId: "Zed-0002", displayName: "Zed" },
      ],
      regs: [
        { personId: "p1", mode: "recorded", optionLabel: "Recorded" },
        { personId: "p2", mode: "live", optionLabel: "Live" },
      ],
      marks: [], scores: [], now: new Date("2026-03-10T12:00:00Z"),
    });
    open(built);
    const before = () => screen.getByText("Zed-0002").compareDocumentPosition(screen.getByText("Aaa-0001")) & Node.DOCUMENT_POSITION_FOLLOWING;
    expect(before()).toBeTruthy();
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "-000" } });
    expect(before()).toBeTruthy();
  });
});

const liveRow = (name: string, score: number, rank: number): PortalResultRow => ({ name, pzId: `${name}-00`, mode: "live", score, rank });

describe("BatchPortal leaderboard", () => {
  it("podium shows tied first places, recorded student is not on it and has no rank", () => {
    render(<BatchPortal view={view()} />);
    const pod = screen.getByRole("list", { name: "Podium" });
    const places = within(pod).getAllByRole("listitem");
    expect(places).toHaveLength(2);
    expect(places.map((p) => p.textContent)).toEqual([expect.stringMatching(/Rank 1.*Faro.*90/), expect.stringMatching(/Rank 1.*Sample.*90/)]);
    expect(within(pod).queryByText("Bilal")).toBeNull();
    const rest = screen.getByRole("list", { name: "Everyone else" });
    const bilal = within(rest).getByText("Bilal").closest("li")!;
    expect(bilal.textContent).not.toMatch(/Rank/);
    expect(within(bilal).getByText("Recorded")).toBeTruthy();
    expect(within(bilal).getByText("70")).toBeTruthy();
  });

  it("shows a crown for first place and medals for second and third", () => {
    const rows = [liveRow("Ann Smith", 30, 1), liveRow("Ben", 20, 2), liveRow("Cat", 10, 3)];
    render(<BatchPortal view={view({ overall: rows })} />);
    expect(document.querySelectorAll("[data-podium-crown]")).toHaveLength(1);
    expect(document.querySelectorAll("[data-podium-medal]")).toHaveLength(2);
    expect(screen.getByText("AS")).toBeTruthy();
  });

  it("with one ranked student the podium has one place", () => {
    render(<BatchPortal view={view({ overall: [liveRow("Solo", 5, 1)] })} />);
    expect(within(screen.getByRole("list", { name: "Podium" })).getAllByRole("listitem")).toHaveLength(1);
  });

  it("lists ranks 4 to 10 with points and real attendance, then the rest behind a button", () => {
    const rows = Array.from({ length: 12 }, (_, i) => liveRow(`P${String.fromCharCode(65 + i)}`, 200 - i, i + 1));
    const att = [{ name: "PD", pzId: "PD-00", mode: "live" as const, attended: 3, held: 4, pct: 75, meetsMin: true, classes: [] }];
    render(<BatchPortal view={view({ overall: rows, attendance: att })} />);
    const top = within(screen.getByRole("list", { name: "Ranks 4 to 10" })).getAllByRole("listitem");
    expect(top).toHaveLength(7);
    expect(top[0].textContent).toMatch(/Rank 4/);
    expect(within(top[0]).getByText("3/4 classes attended")).toBeTruthy();
    expect(within(top[1]).queryByText(/classes attended/)).toBeNull();
    expect(screen.queryByText("PK")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show 2 more" }));
    expect(within(screen.getByRole("list", { name: "Everyone else" })).getAllByRole("listitem")).toHaveLength(2);
  });

  it("switches to one class and shows 'of max' only when known", () => {
    render(<BatchPortal view={view()} />);
    fireEvent.click(screen.getByRole("button", { name: "Class 1" }));
    expect(screen.getByRole("button", { name: "Class 1" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByText("of 100", { exact: false })).toBeTruthy();
    expect(screen.queryByText("Sample-0001")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Class 2" }));
    expect(screen.getByText("No results yet")).toBeTruthy();
  });

  it("no results at all says No results yet and hides Share podium", () => {
    render(<BatchPortal view={view({ overall: [], perClass: { s1: [], s2: [] } })} />);
    expect(screen.getByText("No results yet")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Share podium/ })).toBeNull();
  });

  it("only recorded results: no podium, rows without a rank", () => {
    render(<BatchPortal view={view({ overall: [{ name: "Bilal", pzId: "Bilal-0003", mode: "recorded", score: 70, rank: null }] })} />);
    expect(screen.queryByRole("list", { name: "Podium" })).toBeNull();
    expect(screen.getByText("No ranked students yet")).toBeTruthy();
    expect(screen.getByText("Bilal")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Share podium/ })).toBeNull();
  });
});

describe("BatchPortal share podium", () => {
  const png = () => new Response(new Blob(["png"], { type: "image/png" }), { status: 200, headers: { "Content-Type": "image/png" } });
  const created: Blob[] = [];
  const setup = (fetchImpl: (u: string) => Promise<Response> = async () => png()) => {
    const fetchMock = vi.fn(fetchImpl);
    vi.stubGlobal("fetch", fetchMock);
    created.length = 0;
    URL.createObjectURL = vi.fn((b: Blob) => {
      created.push(b);
      return "blob:fake";
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn();
    return fetchMock;
  };
  afterEach(() => vi.unstubAllGlobals());

  it("fetches both pictures for the chosen board when the menu opens", async () => {
    const fetchMock = setup();
    render(<BatchPortal view={view()} />);
    const btn = screen.getByRole("button", { name: /Share podium/ });
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual([
      "/api/progress-podium/sample-batch?size=square",
      "/api/progress-podium/sample-batch?size=story",
    ]);
    expect((screen.getByRole("button", { name: /Square/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getAllByText("Preparing…").length).toBe(2);
    await screen.findByText("1080 x 1080, for posts");
    expect((screen.getByRole("button", { name: /Square/ }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(btn);
    fireEvent.click(screen.getByRole("button", { name: "Class 1" }));
    fireEvent.click(btn);
    expect(fetchMock.mock.calls.map((c) => c[0])).toContain("/api/progress-podium/sample-batch?size=story&class=s1");
  });

  it("without file sharing, saves the already-fetched picture (no second request)", async () => {
    const fetchMock = setup();
    render(<BatchPortal view={view()} />);
    fireEvent.click(screen.getByRole("button", { name: /Share podium/ }));
    await screen.findByText("1080 x 1080, for posts");
    fireEvent.click(screen.getByRole("button", { name: /Square/ }));
    expect(created).toHaveLength(1);
    expect(created[0].type).toBe("image/png");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("a failed or non-PNG picture shows an error and is not saved", async () => {
    setup(async (u) => (u.includes("square") ? new Response("nope", { status: 500 }) : new Response("<html>", { status: 200, headers: { "Content-Type": "text/html" } })));
    render(<BatchPortal view={view()} />);
    fireEvent.click(screen.getByRole("button", { name: /Share podium/ }));
    expect((await screen.findAllByText("Could not make this picture. Please try again later.")).length).toBe(2);
    expect((screen.getByRole("button", { name: /Square/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(created).toHaveLength(0);
  });

  it("keeps the button on the right when the header wraps, and the menu never wider than the screen", () => {
    setup();
    render(<BatchPortal view={view()} />);
    const btn = screen.getByRole("button", { name: /Share podium/ });
    expect(btn.parentElement?.className).toMatch(/(^|\s)ml-auto(\s|$)/);
    fireEvent.click(btn);
    const menu = screen.getByRole("group", { name: "Share podium picture" });
    expect(menu.className).toContain("right-0");
    expect(menu.className).toContain("max-w-[calc(100vw-2rem)]");
  });

  it("moves focus into the menu and back to the button on Escape", async () => {
    setup();
    render(<BatchPortal view={view()} />);
    const btn = screen.getByRole("button", { name: /Share podium/ });
    btn.focus();
    fireEvent.click(btn);
    const menu = screen.getByRole("group", { name: "Share podium picture" });
    expect(menu.contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(btn);
    await screen.findByRole("button", { name: /Share podium/ });
  });
});

describe("BatchPortal tabs keyboard", () => {
  it("roving tabindex with arrows, Home and End; aria-controls only on the shown panel", () => {
    render(<BatchPortal view={view()} />);
    const tabs = () => screen.getAllByRole("tab");
    expect(tabs().map((t) => t.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"]);
    expect(tabs().map((t) => t.hasAttribute("aria-controls"))).toEqual([true, false, false]);
    expect(document.getElementById(tabs()[0].getAttribute("aria-controls")!)).not.toBeNull();
    tabs()[0].focus();
    fireEvent.keyDown(tabs()[0], { key: "ArrowRight" });
    expect(tabs()[1].getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tabs()[1]);
    expect(tabs().map((t) => t.getAttribute("tabindex"))).toEqual(["-1", "0", "-1"]);
    fireEvent.keyDown(tabs()[1], { key: "End" });
    expect(document.activeElement).toBe(tabs()[2]);
    fireEvent.keyDown(tabs()[2], { key: "ArrowRight" });
    expect(document.activeElement).toBe(tabs()[0]);
    fireEvent.keyDown(tabs()[0], { key: "ArrowLeft" });
    expect(document.activeElement).toBe(tabs()[2]);
    fireEvent.keyDown(tabs()[2], { key: "Home" });
    expect(tabs()[0].getAttribute("aria-selected")).toBe("true");
    expect(document.activeElement).toBe(tabs()[0]);
  });
});

describe("BatchPortal find me", () => {
  const rows = [liveRow("Ann", 100, 1), liveRow("Ben", 80, 2), liveRow("Cat", 80, 2), liveRow("Dan Longname", 75, 4)];
  const att = rows.map((r) => ({ name: r.name, pzId: r.pzId, mode: "live" as const, attended: 1, held: 2, pct: 50, meetsMin: false, classes: [] }));
  const open = () => {
    render(<BatchPortal view={view({ overall: rows, attendance: att, perClass: {} })} />);
    tab("Find me");
    return screen.getByRole("searchbox", { name: "Search by name or PZ ID" });
  };

  it("finds by name part or PZ ID ignoring case and spaces", () => {
    const box = open();
    fireEvent.change(box, { target: { value: " LONG name " } });
    expect(screen.getByRole("status").textContent).toBe("Showing 1 of 4");
    expect(screen.getByText("Dan Longname")).toBeTruthy();
    fireEvent.change(box, { target: { value: "ben-00" } });
    expect(screen.getByText("Ben")).toBeTruthy();
    expect(screen.queryByText("Ann")).toBeNull();
    fireEvent.change(box, { target: { value: "zzz" } });
    expect(screen.getByText("No one matches")).toBeTruthy();
  });

  it("one match is highlighted with the gap to the one above, and stays highlighted on the leaderboard", () => {
    const box = open();
    fireEvent.change(box, { target: { value: "dan" } });
    const found = screen.getByText("Dan Longname").closest("li")!;
    expect(found.getAttribute("aria-current")).toBe("true");
    expect(within(found).getByText("5 points behind Ben (rank 2)")).toBeTruthy();
    tab("Leaderboard");
    const onBoard = screen.getByText("Dan Longname").closest("li")!;
    expect(onBoard.getAttribute("aria-current")).toBe("true");
  });

  it("several matches: no highlight; rank 1 match has no gap line", () => {
    const box = open();
    fireEvent.change(box, { target: { value: "-00" } });
    expect(document.querySelector("[aria-current]")).toBeNull();
    fireEvent.change(box, { target: { value: "ann" } });
    expect(screen.queryByText(/points behind/)).toBeNull();
  });

  it("a recorded student is found but not ranked", () => {
    render(<BatchPortal view={view()} />);
    tab("Find me");
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "bilal" } });
    const found = screen.getByText("Bilal").closest("li")!;
    expect(found.textContent).not.toMatch(/Rank/);
    expect(within(found).getByText("Recorded students are not ranked")).toBeTruthy();
  });
});
