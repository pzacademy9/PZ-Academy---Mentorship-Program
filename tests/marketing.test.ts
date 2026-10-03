import { describe, it, expect } from "vitest";
import { buildFeaturedCard, getBannerStatus } from "@/lib/data/marketing";

describe("buildFeaturedCard", () => {
  it("labels a course-type item and links to its slug", () => {
    const card = buildFeaturedCard(
      { slug: "dose-calc", title: "Dose Calculations", tagline: "Master pediatric dosing.", type: "course", durationText: null, durationWeeks: 8 },
      0,
    );
    expect(card).toEqual({
      title: "Dose Calculations",
      desc: "Master pediatric dosing.",
      badge: "Course",
      duration: "8 Weeks",
      href: "/courses/dose-calc",
      grad: "from-pz-solid-forest to-pz-solid-mid",
    });
  });

  it("labels a webinar-type item as Webinar", () => {
    const card = buildFeaturedCard(
      { slug: "live-qa", title: "Live Q&A", tagline: null, type: "webinar", durationText: "2 Hours", durationWeeks: null },
      0,
    );
    expect(card.badge).toBe("Webinar");
    expect(card.duration).toBe("2 Hours");
    expect(card.desc).toBe("");
  });

  it("prefers durationText over durationWeeks when both are set", () => {
    const card = buildFeaturedCard(
      { slug: "x", title: "X", tagline: null, type: "course", durationText: "Ongoing", durationWeeks: 12 },
      0,
    );
    expect(card.duration).toBe("Ongoing");
  });

  it("falls back to null duration when neither field is set", () => {
    const card = buildFeaturedCard(
      { slug: "x", title: "X", tagline: null, type: "course", durationText: null, durationWeeks: null },
      0,
    );
    expect(card.duration).toBeNull();
  });

  it("cycles the gradient palette by index", () => {
    const base = { slug: "x", title: "X", tagline: null, type: "course" as const, durationText: null, durationWeeks: null };
    expect(buildFeaturedCard(base, 0).grad).toBe("from-pz-solid-forest to-pz-solid-mid");
    expect(buildFeaturedCard(base, 1).grad).toBe("from-pz-solid-deep to-pz-solid-forest");
    expect(buildFeaturedCard(base, 2).grad).toBe("from-pz-solid-mid to-pz-solid-deep");
    expect(buildFeaturedCard(base, 3).grad).toBe("from-pz-solid-forest to-pz-solid-mid");
  });
});

describe("getBannerStatus", () => {
  const now = new Date("2026-08-27T12:00:00Z");

  it("returns inactive when is_active is false, regardless of schedule", () => {
    expect(
      getBannerStatus({ isActive: false, activeFrom: null, activeUntil: null }, now),
    ).toBe("inactive");
  });

  it("returns scheduled when active_from is in the future", () => {
    expect(
      getBannerStatus({ isActive: true, activeFrom: "2026-09-01T00:00:00Z", activeUntil: null }, now),
    ).toBe("scheduled");
  });

  it("returns expired when active_until is in the past", () => {
    expect(
      getBannerStatus({ isActive: true, activeFrom: null, activeUntil: "2026-08-01T00:00:00Z" }, now),
    ).toBe("expired");
  });

  it("returns active when is_active is true and now falls within the window", () => {
    expect(
      getBannerStatus(
        { isActive: true, activeFrom: "2026-08-01T00:00:00Z", activeUntil: "2026-09-01T00:00:00Z" },
        now,
      ),
    ).toBe("active");
  });

  it("returns active when is_active is true and no schedule is set", () => {
    expect(getBannerStatus({ isActive: true, activeFrom: null, activeUntil: null }, now)).toBe("active");
  });
});
