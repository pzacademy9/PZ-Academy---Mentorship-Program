/** Plain-words messages and HTTP statuses for a failed team change. */
export const TEAM_FAILURES: Record<string, [string, number]> = {
  "not-found": ["That account no longer exists.", 404],
  "is-super-admin": ["The Super Admin cannot be changed here.", 409],
  "is-mentor": ["That account is a mentor. A mentor cannot also be on the team.", 409],
  "is-sales-agent": ["Sales agents are managed in Sales Hub, Team.", 409],
  "not-team-member": ["That person is not on the team.", 409],
  "memory-not-saved": ["They were switched off, but their Add back details were not saved. Add them again from scratch if needed.", 500],
  "db-error": ["Could not save changes.", 500],
};

export function teamFailure(reason: string): { error: string; status: number } {
  const [error, status] = TEAM_FAILURES[reason] ?? TEAM_FAILURES["db-error"];
  return { error, status };
}
