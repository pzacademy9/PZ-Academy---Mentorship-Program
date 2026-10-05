/** Maps a data-layer failure reason to an HTTP status for /api/sales and /api/admin/sales routes. */
export function statusForReason(reason: string): number {
  switch (reason) {
    case "not-found":
      return 404;
    case "not-owner":
    case "not-allowed":
    case "number-not-assigned":
      return 403;
    case "already-claimed":
    case "do-not-contact":
    case "no-phone":
    case "duplicate":
      return 409;
    case "frozen":
    case "quiet_hours":
    case "daily_cap":
    case "hourly_cap":
    case "spacing":
      return 429;
    case "db-error":
      return 500;
    default:
      return 400;
  }
}
