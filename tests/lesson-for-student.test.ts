// @vitest-environment node
import { describe, it, expect, vi } from "vitest";

vi.mock("server-only", () => ({}));

type Mode = "error" | "throw" | "ok";
let mode: Mode = "error";

function client() {
  return {
    rpc: async () => ({
      data: [
        { module_id: "m-1", module_title: "M", module_order: 1, lesson_id: "l-1", lesson_title: "L", lesson_order: 1, content_type: "text", status: "unlocked", has_quiz: false },
      ],
      error: null,
    }),
    from(table: string) {
      let cols = "";
      const b: Record<string, unknown> = {
        select: (c: string) => { cols = c; return b; },
        eq: () => b,
        maybeSingle: async () => {
          if (table === "courses") return { data: { id: "c-1", slug: "s", title: "C", faqs: [] }, error: null };
          if (table === "lessons" && cols.startsWith("id, title")) {
            return { data: { id: "l-1", title: "L", content_type: "text", video_url: "https://youtu.be/a", text_content: "<p>t</p>", pdf_url: null, pdf_file_id: null, resource_urls: [], documents: [], module_id: "m-1" }, error: null };
          }
          if (mode === "throw") throw new Error("boom");
          if (mode === "error") return { data: null, error: { message: "column does not exist" } };
          if (table === "lessons") return { data: { video_url_2: "https://youtu.be/b", module_id: "m-1" }, error: null };
          return { data: { resource_urls: [{ label: "R", url: "https://x" }], documents: [] }, error: null };
        },
      };
      return b;
    },
  };
}
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: async () => client() }));

import { getLessonForStudent } from "@/lib/data/lms";

describe("getLessonForStudent tolerant extras", () => {
  it.each(["error", "throw"] as const)("still returns the lesson when extra queries %s", async (m) => {
    mode = m;
    const l = await getLessonForStudent("s", "l-1");
    expect(l?.videoUrl).toBe("https://youtu.be/a");
    expect(l?.videoUrl2).toBeNull();
    expect(l?.moduleNotes).toEqual({ moduleId: "m-1", resources: [], documents: [] });
  });

  it("returns video 2 and module notes when the migration is applied", async () => {
    mode = "ok";
    const l = await getLessonForStudent("s", "l-1");
    expect(l?.videoUrl2).toBe("https://youtu.be/b");
    expect(l?.moduleNotes.moduleId).toBe("m-1");
    expect(l?.moduleNotes.resources).toHaveLength(1);
  });
});
