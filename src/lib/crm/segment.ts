/**
 * Segment definition and its translation into PostgREST predicates over
 * crm_contact_segment_source. Pure — no I/O, no database, safe to import
 * from client components.
 *
 * Filters combine with AND only. Nested boolean logic is deliberately
 * excluded: it is what turns a segment builder into its own project, and
 * nothing in the first campaigns needs it.
 */

export type SegmentFilter =
  | { field: "import_batch_id"; op: "in"; values: string[] }
  | { field: "course_id"; op: "in"; values: string[] }
  | { field: "row_type"; op: "eq"; value: string }
  | { field: "product_label"; op: "contains"; value: string }
  | { field: "promo_code"; op: "eq"; value: string }
  | { field: "discovery_source"; op: "in"; values: string[] }
  | { field: "country"; op: "in"; values: string[] }
  | { field: "profession"; op: "contains"; value: string }
  | { field: "purchase_count"; op: "gte" | "lte"; value: number }
  | { field: "last_purchase_at"; op: "before" | "after"; value: string }
  | { field: "has_platform_account"; op: "eq"; value: boolean };

export type QueryOp =
  | { kind: "overlaps"; column: string; values: string[] }
  | { kind: "contains"; column: string; values: string[] }
  | { kind: "in"; column: string; values: string[] }
  | { kind: "ilike"; column: string; pattern: string }
  | { kind: "eq" | "gte" | "lte" | "lt" | "gt"; column: string; value: string | number | boolean };

/** Field metadata for the builder UI. Keeping it beside the type prevents drift. */
export const SEGMENT_FIELDS: ReadonlyArray<{ field: SegmentFilter["field"]; label: string; hint: string }> = [
  { field: "row_type", label: "Row type", hint: "group_leader finds people who recruited other buyers" },
  { field: "purchase_count", label: "Number of purchases", hint: "2 or more finds proven repeat buyers" },
  { field: "last_purchase_at", label: "Last purchase", hint: "before a date finds win-back candidates" },
  { field: "has_platform_account", label: "Has platform account", hint: "false finds buyers still only in a spreadsheet" },
  { field: "discovery_source", label: "Discovery source", hint: "match creative to the channel that acquired them" },
  { field: "country", label: "Country", hint: "PK, AE, SA" },
  { field: "product_label", label: "Product label contains", hint: "substring of the registration option" },
  { field: "import_batch_id", label: "Import batch", hint: "one cohort sheet — also how warm-up waves are cut" },
  { field: "course_id", label: "Course", hint: "only set where a batch was mapped to a course" },
  { field: "promo_code", label: "Promo code", hint: "exact match" },
  { field: "profession", label: "Profession contains", hint: "substring" },
];

/**
 * Never optional and never removable: excludes contacts with no email,
 * contacts who unsubscribed, and addresses Brevo has suppressed. Folded into
 * is_sendable by the view so one predicate covers all three.
 */
const SENDABLE_GUARD: QueryOp = { kind: "eq", column: "is_sendable", value: true };

export function buildSegmentFilters(filters: SegmentFilter[]): QueryOp[] {
  const ops: QueryOp[] = [];

  for (const filter of filters) {
    switch (filter.field) {
      case "import_batch_id":
        if (filter.values.length > 0) ops.push({ kind: "overlaps", column: "import_batch_ids", values: filter.values });
        break;
      case "course_id":
        if (filter.values.length > 0) ops.push({ kind: "overlaps", column: "course_ids", values: filter.values });
        break;
      case "promo_code":
        if (filter.value !== "") ops.push({ kind: "contains", column: "promo_codes", values: [filter.value] });
        break;
      case "row_type":
        // row_types is an aggregated array: "is a group leader" means the
        // array contains that value, not that a scalar equals it.
        if (filter.value !== "") ops.push({ kind: "contains", column: "row_types", values: [filter.value] });
        break;
      case "product_label":
        if (filter.value !== "") ops.push({ kind: "ilike", column: "product_labels_text", pattern: `%${filter.value}%` });
        break;
      case "profession":
        if (filter.value !== "") ops.push({ kind: "ilike", column: "profession", pattern: `%${filter.value}%` });
        break;
      case "discovery_source":
        if (filter.values.length > 0) ops.push({ kind: "in", column: "discovery_source", values: filter.values });
        break;
      case "country":
        if (filter.values.length > 0) ops.push({ kind: "in", column: "country", values: filter.values });
        break;
      case "purchase_count":
        ops.push({ kind: filter.op, column: "purchase_count", value: filter.value });
        break;
      case "last_purchase_at":
        ops.push({ kind: filter.op === "before" ? "lt" : "gt", column: "last_purchase_at", value: filter.value });
        break;
      case "has_platform_account":
        ops.push({ kind: "eq", column: "has_platform_account", value: filter.value });
        break;
    }
  }

  ops.push(SENDABLE_GUARD);
  return ops;
}
