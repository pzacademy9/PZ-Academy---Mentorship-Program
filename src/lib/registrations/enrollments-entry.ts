const REGISTRATIONS = "/dashboard/admin/enrollments/registrations";
const APP = "/dashboard/admin/enrollments/app";

/**
 * Where the bare /dashboard/admin/enrollments address should send the visitor.
 * No params: Page registrations. Any param (old App sign-ups links): the App sign-ups
 * page, params kept.
 */
export function enrollmentsEntryTarget(query: Record<string, string | string[] | undefined>): string {
  const params = new URLSearchParams();
  let any = false;
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined) continue;
    any = true;
    for (const v of Array.isArray(value) ? value : [value]) params.append(key, v);
  }
  if (!any) return REGISTRATIONS;
  return `${APP}?${params.toString()}`;
}
