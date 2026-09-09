import { describe, it, expect } from "vitest";
import { buildSegmentFilters, type SegmentFilter } from "@/lib/crm/segment";

const SENDABLE_GUARD = { kind: "eq", column: "is_sendable", value: true };

describe("buildSegmentFilters", () => {
  it("always appends the sendable guard, even for an empty segment", () => {
    // The single most important behaviour here. An admin must not be able to
    // construct a segment that includes unsubscribed or bounced addresses.
    expect(buildSegmentFilters([])).toEqual([SENDABLE_GUARD]);
  });

  it("keeps the sendable guard when other filters are present", () => {
    const ops = buildSegmentFilters([{ field: "country", op: "in", values: ["PK"] }]);
    expect(ops).toContainEqual(SENDABLE_GUARD);
  });

  it("maps row_type to an array containment check", () => {
    // row_types is an aggregated array on the view, so "is a group leader"
    // is containment, not equality.
    expect(buildSegmentFilters([{ field: "row_type", op: "eq", value: "group_leader" }])).toEqual([
      { kind: "contains", column: "row_types", values: ["group_leader"] },
      SENDABLE_GUARD,
    ]);
  });

  it("maps import_batch_id to an array overlap check", () => {
    expect(buildSegmentFilters([{ field: "import_batch_id", op: "in", values: ["b1", "b2"] }])).toEqual([
      { kind: "overlaps", column: "import_batch_ids", values: ["b1", "b2"] },
      SENDABLE_GUARD,
    ]);
  });

  it("maps product_label to a case-insensitive substring match", () => {
    expect(buildSegmentFilters([{ field: "product_label", op: "contains", value: "Early Bird" }])).toEqual([
      { kind: "ilike", column: "product_labels_text", pattern: "%Early Bird%" },
      SENDABLE_GUARD,
    ]);
  });

  it("maps scalar contact fields directly", () => {
    expect(buildSegmentFilters([{ field: "discovery_source", op: "in", values: ["instagram", "facebook"] }])).toEqual([
      { kind: "in", column: "discovery_source", values: ["instagram", "facebook"] },
      SENDABLE_GUARD,
    ]);
    expect(buildSegmentFilters([{ field: "has_platform_account", op: "eq", value: false }])).toEqual([
      { kind: "eq", column: "has_platform_account", value: false },
      SENDABLE_GUARD,
    ]);
  });

  it("maps purchase_count comparisons", () => {
    expect(buildSegmentFilters([{ field: "purchase_count", op: "gte", value: 2 }])).toEqual([
      { kind: "gte", column: "purchase_count", value: 2 },
      SENDABLE_GUARD,
    ]);
  });

  it("maps last_purchase_at before/after to lt/gt", () => {
    expect(buildSegmentFilters([{ field: "last_purchase_at", op: "before", value: "2026-03-01" }])).toEqual([
      { kind: "lt", column: "last_purchase_at", value: "2026-03-01" },
      SENDABLE_GUARD,
    ]);
    expect(buildSegmentFilters([{ field: "last_purchase_at", op: "after", value: "2026-03-01" }])).toEqual([
      { kind: "gt", column: "last_purchase_at", value: "2026-03-01" },
      SENDABLE_GUARD,
    ]);
  });

  it("combines several filters and still guards once", () => {
    const filters: SegmentFilter[] = [
      { field: "row_type", op: "eq", value: "group_leader" },
      { field: "purchase_count", op: "gte", value: 2 },
      { field: "country", op: "in", values: ["PK"] },
    ];
    const ops = buildSegmentFilters(filters);
    expect(ops).toHaveLength(4);
    expect(ops.filter((o) => o.column === "is_sendable")).toHaveLength(1);
  });

  it("drops an empty values list rather than producing a match-nothing query", () => {
    // An unfinished filter in the builder UI must not silently empty the
    // whole segment.
    expect(buildSegmentFilters([{ field: "country", op: "in", values: [] }])).toEqual([SENDABLE_GUARD]);
  });
});
