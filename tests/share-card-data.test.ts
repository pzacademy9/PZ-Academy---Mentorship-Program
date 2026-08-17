import { describe, it, expect } from "vitest";
import { flattenShareView } from "@/lib/mentorship/share-card-data";
import type { ShareView, ShareSession } from "@/lib/mentorship/gas";

function makeSession(overrides: Partial<ShareSession> = {}): ShareSession {
  return {
    id: "s1",
    name: "Session One",
    speaker: "Dr. Speaker",
    date: "2026-08-01",
    coverUrl: "",
    responseCount: 0,
    avgRating: null,
    perQuestion: [],
    responses: [],
    ...overrides,
  };
}

describe("flattenShareView", () => {
  describe("session branch", () => {
    it("passes avgRating and responseCount through unchanged", () => {
      const view: ShareView = {
        type: "session",
        session: makeSession({ avgRating: 4.2, responseCount: 7 }),
      };
      const result = flattenShareView(view);
      expect(result.avg).toBe(4.2);
      expect(result.count).toBe(7);
      expect(result.title).toBe("Session One");
    });

    it("maps an empty coverUrl string to null", () => {
      const view: ShareView = {
        type: "session",
        session: makeSession({ coverUrl: "" }),
      };
      expect(flattenShareView(view).coverUrl).toBeNull();
    });

    it("keeps a real coverUrl", () => {
      const view: ShareView = {
        type: "session",
        session: makeSession({ coverUrl: "https://example.com/cover.jpg" }),
      };
      expect(flattenShareView(view).coverUrl).toBe("https://example.com/cover.jpg");
    });
  });

  describe("program branch", () => {
    it("excludes a null-rated session from the average but includes its responseCount in the sum", () => {
      const view: ShareView = {
        type: "program",
        program: { id: "p1", name: "Program One", type: "cohort", coverUrl: "" },
        sessions: [
          makeSession({ id: "s1", avgRating: 4.0, responseCount: 3 }),
          makeSession({ id: "s2", avgRating: null, responseCount: 5 }),
          makeSession({ id: "s3", avgRating: 5.0, responseCount: 2 }),
        ],
      };
      const result = flattenShareView(view);
      // (4.0 + 5.0) / 2 = 4.5 — s2's null rating is excluded, not treated as 0
      expect(result.avg).toBe(4.5);
      // 3 + 5 + 2 = 10 — all sessions' responseCount summed, including the unrated one
      expect(result.count).toBe(10);
      expect(result.title).toBe("Program One");
    });

    it("returns avg: null when every session is unrated, but still sums response counts", () => {
      const view: ShareView = {
        type: "program",
        program: { id: "p2", name: "Program Two", type: "cohort", coverUrl: "" },
        sessions: [
          makeSession({ id: "s1", avgRating: null, responseCount: 2 }),
          makeSession({ id: "s2", avgRating: null, responseCount: 4 }),
        ],
      };
      const result = flattenShareView(view);
      expect(result.avg).toBeNull();
      expect(result.count).toBe(6);
    });

    it("maps an empty program coverUrl string to null", () => {
      const view: ShareView = {
        type: "program",
        program: { id: "p3", name: "Program Three", type: "cohort", coverUrl: "" },
        sessions: [makeSession({ avgRating: 3, responseCount: 1 })],
      };
      expect(flattenShareView(view).coverUrl).toBeNull();
    });
  });
});
