// Download links for cohort exports. Kept out of any "use client" file so the
// server can use them too.
export const cohortExportUrl = (ids: string[]): string =>
  `/api/admin/crm/cohorts/export?ids=${ids.join(",")}`;

export const cohortPlainUrl = (ids: string[]): string => `${cohortExportUrl(ids)}&format=plain`;
