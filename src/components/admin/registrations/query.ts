// Shared by the filter bar, the table pager and the page: one way to build a list link so
// changing one filter never drops the others.
export interface RegistrationQuery {
  status?: string;
  mode?: string;
  pageId?: string;
  agentId?: string;
  q?: string;
  p?: number;
}

export function registrationHref(basePath: string, current: RegistrationQuery, override: Partial<RegistrationQuery> = {}): string {
  const merged: RegistrationQuery = { ...current, ...override };
  const sp = new URLSearchParams();
  if (merged.status && merged.status !== "all") sp.set("status", merged.status);
  if (merged.mode) sp.set("mode", merged.mode);
  if (merged.pageId) sp.set("pageId", merged.pageId);
  if (merged.agentId) sp.set("agentId", merged.agentId);
  if (merged.q) sp.set("q", merged.q);
  if (merged.p && merged.p > 1) sp.set("p", String(merged.p));
  const qs = sp.toString();
  return qs ? `${basePath}?${qs}` : basePath;
}
