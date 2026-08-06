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
 *        COL_EMAIL              = <exact header text of the email column, both sheets>
 *        COL_STATUS             = <exact header text of the Status column, both sheets>
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
 * This script auto-creates a "SyncedAt" tracking column at the end of row 1
 * of each sheet the first time it reacts to an edit there — do not delete it,
 * it is how the script tells a fresh row apart from a hand-edit to Status.
 */

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
    ensureTrackingColumn_(sheet, headerRow);

    const editedRow = e.range.getRow();
    if (editedRow === 1) return; // header row

    const statusCol = headerIndex_(headerRow, props.getProperty("COL_STATUS"));
    const emailCol = headerIndex_(headerRow, props.getProperty("COL_EMAIL"));
    const syncedAtCol = headerIndex_(headerRow, "SyncedAt");
    if (statusCol === -1 || emailCol === -1) return;

    const editedCol = e.range.getColumn();
    const syncedAt = sheet.getRange(editedRow, syncedAtCol + 1).getValue();
    const isNewRow = !syncedAt;
    if (!isNewRow && editedCol !== statusCol + 1) return;

    const statusValue = String(sheet.getRange(editedRow, statusCol + 1).getValue()).trim();
    const emailValue = String(sheet.getRange(editedRow, emailCol + 1).getValue()).trim();
    if (!statusValue || !emailValue) return;

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
    const emailCol = headerIndex_(headerRow, props.getProperty("COL_EMAIL"));
    const statusCol = headerIndex_(headerRow, props.getProperty("COL_STATUS"));

    const emails = sheet.getRange(2, emailCol + 1, sheet.getLastRow() - 1, 1).getValues();
    const targetRow = emails.findIndex(
      (r) => String(r[0]).trim().toLowerCase() === String(body.email).trim().toLowerCase(),
    );
    if (targetRow === -1) {
      return jsonResponse_({ status: "error", message: "No row found for that email" });
    }

    const sheetRow = targetRow + 2;
    const display =
      body.sheetKind === "booking"
        ? displayValueForBookingStatus_(body.status)
        : displayValueForApplicationStatus_(body.status);
    sheet.getRange(sheetRow, statusCol + 1).setValue(display);

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

function ensureTrackingColumn_(sheet, headerRow) {
  if (headerRow.indexOf("SyncedAt") !== -1) return;
  const lastCol = sheet.getLastColumn() + 1;
  sheet.getRange(1, lastCol).setValue("SyncedAt");
  headerRow.push("SyncedAt");
  SpreadsheetApp.flush();
}

function jsonResponse_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
