/**
 * PZ Academy — Mentorship Sync bridge.
 *
 * Dedicated bridge for the two mentorship Sheets (bookings, applications) —
 * kept separate from gas/sheets-sync/Code.gs on purpose: that script is
 * conceptually built around "a sheet belongs to a course," and this
 * integration has exactly two fixed sheets, so it doesn't need a self-service
 * registerSheet flow. See
 * docs/superpowers/specs/2026-08-05-mentorship-bookings-applications-design.md,
 * "Decisions already made".
 *
 * One-time setup:
 *   1. script.google.com -> New project, paste this file in.
 *   2. Project Settings -> Script Properties, add:
 *        MENTORSHIP_SYNC_SECRET = <same value as MENTORSHIP_SYNC_SECRET in .env.local>
 *        WEBHOOK_URL            = https://<your-domain>/api/webhooks/mentorship-sync
 *        BOOKING_SHEET_ID       = <the booking Sheet's spreadsheet ID>
 *        APPLICATION_SHEET_ID   = <the application Sheet's spreadsheet ID>
 *        BOOKING_COL_EMAIL      = <exact header text of the email column, booking sheet>
 *        BOOKING_COL_STATUS     = <exact header text of the Status column, booking sheet>
 *        APPLICATION_COL_EMAIL  = <exact header text of the email column, application sheet>
 *        APPLICATION_COL_STATUS = <exact header text of the Status column, application sheet>
 *      The booking and application sheets come from two different, unrelated
 *      Apps Script forms — unlike the course-enrollment sheets (all sharing
 *      one WordPress template), their headers are not guaranteed to match, so
 *      each sheet gets its own email/status column property.
 *      Both sheets need a "Status" column added by hand if they don't already
 *      have one, with values Pending / Confirmed / Cancelled (booking sheet)
 *      or Pending / Approved / Rejected (application sheet) — exact wording
 *      matters, see displayValueForBookingStatus_/displayValueForApplicationStatus_
 *      and src/lib/validations/mentorship-sync.ts's mapBookingSheetStatus/
 *      mapApplicationSheetStatus on the Next.js side.
 *   3. Deploy -> New deployment -> Web app -> Execute as "Me", access "Anyone"
 *      -> copy the /exec URL into .env.local as MENTORSHIP_SYNC_URL.
 *   4. Run installTriggers() once from the Apps Script editor (select it in
 *      the function dropdown, click Run, authorize when prompted). Installs
 *      the onEdit watcher on both fixed sheets. Re-running is a harmless
 *      no-op.
 *
 * This script auto-creates "SyncedAt" and "AppSyncValue" tracking columns at
 * the end of row 1 of each sheet the first time it reacts to an edit there —
 * do not delete them. SyncedAt tells a fresh row apart from a hand-edit to
 * Status; AppSyncValue is the loop-guard to prevent re-firing webhooks on the
 * script's own outbound writes.
 */

const TRACKING_COLUMNS = ["SyncedAt", "AppSyncValue"];

function installTriggers() {
  const props = PropertiesService.getScriptProperties();
  installTriggerFor_(props.getProperty("BOOKING_SHEET_ID"));
  installTriggerFor_(props.getProperty("APPLICATION_SHEET_ID"));
}

function installTriggerFor_(sheetId) {
  if (!sheetId) return;
  const already = ScriptApp.getProjectTriggers().some(
    (t) => t.getHandlerFunction() === "onEdit" && t.getTriggerSourceId() === sheetId,
  );
  if (already) return;
  ScriptApp.newTrigger("onEdit").forSpreadsheet(sheetId).onEdit().create();
}

function onEdit(e) {
  try {
    const sheet = e.range.getSheet();
    const sheetId = sheet.getParent().getId();
    const props = PropertiesService.getScriptProperties();

    const sheetKind = sheetKindForId_(sheetId, props);
    if (!sheetKind) return; // an edit on a sheet this script doesn't watch

    const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    ensureTrackingColumns_(sheet, headerRow);

    const editedRow = e.range.getRow();
    if (editedRow === 1) return; // header row

    const colEmailProp = sheetKind === "booking" ? "BOOKING_COL_EMAIL" : "APPLICATION_COL_EMAIL";
    const colStatusProp = sheetKind === "booking" ? "BOOKING_COL_STATUS" : "APPLICATION_COL_STATUS";
    const statusCol = headerIndex_(headerRow, props.getProperty(colStatusProp));
    const emailCol = headerIndex_(headerRow, props.getProperty(colEmailProp));
    const syncedAtCol = headerIndex_(headerRow, "SyncedAt");
    const appSyncValueCol = headerIndex_(headerRow, "AppSyncValue");
    if (statusCol === -1 || emailCol === -1) return;

    const editedCol = e.range.getColumn();
    const syncedAt = sheet.getRange(editedRow, syncedAtCol + 1).getValue();
    const isNewRow = !syncedAt;
    if (!isNewRow && editedCol !== statusCol + 1) return;

    const statusValue = String(sheet.getRange(editedRow, statusCol + 1).getValue()).trim();
    const emailValue = String(sheet.getRange(editedRow, emailCol + 1).getValue()).trim();
    if (!statusValue || !emailValue) return;

    // Loop guard: if this exact value is what the app itself last pushed via
    // handleApplyStatus_, this edit IS our own outbound write echoing back.
    const lastAppValue = sheet.getRange(editedRow, appSyncValueCol + 1).getValue();
    if (!isNewRow && statusValue === lastAppValue) return;

    const payload = {
      secret: props.getProperty("MENTORSHIP_SYNC_SECRET"),
      action: isNewRow ? "newSubmission" : "statusChange",
      sheetKind: sheetKind,
      row: { email: emailValue, status: statusValue },
    };

    UrlFetchApp.fetch(props.getProperty("WEBHOOK_URL"), {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });

    sheet.getRange(editedRow, syncedAtCol + 1).setValue(new Date());
  } catch (err) {
    console.error(String(err));
  }
}

function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse_({ status: "error", message: "Invalid JSON body" });
  }

  const props = PropertiesService.getScriptProperties();
  if (!body || body.secret !== props.getProperty("MENTORSHIP_SYNC_SECRET")) {
    return jsonResponse_({ status: "error", message: "Wrong password." });
  }

  if (body.action === "applyStatus") {
    return handleApplyStatus_(body, props);
  }

  return jsonResponse_({ status: "error", message: "Unknown action: " + body.action });
}

/** Writes a confirmed status back into whichever sheet the booking/application belongs to. */
function handleApplyStatus_(body, props) {
  if (!body.sheetKind || !body.email || !body.status) {
    return jsonResponse_({ status: "error", message: "Missing sheetKind, email, or status" });
  }

  try {
    const sheetId =
      body.sheetKind === "booking"
        ? props.getProperty("BOOKING_SHEET_ID")
        : props.getProperty("APPLICATION_SHEET_ID");
    const sheet = SpreadsheetApp.openById(sheetId).getSheets()[0];
    const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const colEmailProp = body.sheetKind === "booking" ? "BOOKING_COL_EMAIL" : "APPLICATION_COL_EMAIL";
    const colStatusProp = body.sheetKind === "booking" ? "BOOKING_COL_STATUS" : "APPLICATION_COL_STATUS";
    const emailCol = headerIndex_(headerRow, props.getProperty(colEmailProp));
    const statusCol = headerIndex_(headerRow, props.getProperty(colStatusProp));

    const emails = sheet.getRange(2, emailCol + 1, sheet.getLastRow() - 1, 1).getValues();
    // Match the LAST occurrence (most-recently-submitted row for that
    // email), consistent with the webhook route's
    // .order("created_at", { ascending: false }).limit(1) — for a repeat
    // mentee/applicant, both directions must act on the same row.
    let targetRow = -1;
    for (let i = emails.length - 1; i >= 0; i--) {
      if (String(emails[i][0]).trim().toLowerCase() === String(body.email).trim().toLowerCase()) {
        targetRow = i;
        break;
      }
    }
    if (targetRow === -1) {
      return jsonResponse_({ status: "error", message: "No row found for that email" });
    }

    const sheetRow = targetRow + 2;
    const display =
      body.sheetKind === "booking"
        ? displayValueForBookingStatus_(body.status)
        : displayValueForApplicationStatus_(body.status);
    const appSyncValueCol = headerIndex_(headerRow, "AppSyncValue");
    sheet.getRange(sheetRow, statusCol + 1).setValue(display);
    sheet.getRange(sheetRow, appSyncValueCol + 1).setValue(display);

    return jsonResponse_({ status: "success", message: "Sheet updated" });
  } catch (err) {
    return jsonResponse_({ status: "error", message: String(err) });
  }
}

function displayValueForBookingStatus_(status) {
  if (status === "confirmed") return "Confirmed";
  if (status === "cancelled") return "Cancelled";
  return "Pending";
}

function displayValueForApplicationStatus_(status) {
  if (status === "approved") return "Approved";
  if (status === "rejected") return "Rejected";
  return "Pending";
}

function sheetKindForId_(sheetId, props) {
  if (sheetId === props.getProperty("BOOKING_SHEET_ID")) return "booking";
  if (sheetId === props.getProperty("APPLICATION_SHEET_ID")) return "application";
  return null;
}

function headerIndex_(headerRow, headerText) {
  if (!headerText) return -1;
  return headerRow.indexOf(headerText);
}

function ensureTrackingColumns_(sheet, headerRow) {
  let lastCol = sheet.getLastColumn();
  let changed = false;
  for (const name of TRACKING_COLUMNS) {
    if (headerRow.indexOf(name) === -1) {
      lastCol += 1;
      sheet.getRange(1, lastCol).setValue(name);
      headerRow.push(name);
      changed = true;
    }
  }
  if (changed) SpreadsheetApp.flush();
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
