/**
 * PZ Academy — Sheets Sync bridge.
 *
 * Bound to a single batch's Google Sheet (Extensions -> Apps Script from
 * within that sheet). Reacts to edits and keeps Supabase in sync in both
 * directions.
 *
 * One-time setup per sheet:
 *   1. Extensions -> Apps Script, paste this file in.
 *   2. Project Settings -> Script Properties, add:
 *        SYNC_SECRET            = <same value as SHEETS_SYNC_SECRET in .env.local>
 *        WEBHOOK_URL             = https://<your-domain>/api/webhooks/sheets-sync
 *        SHEET_ID                = <this sheet's spreadsheet ID>
 *        COL_EMAIL               = <exact header text of the email column>
 *        COL_NAME                = <exact header text of the name column>       (optional)
 *        COL_PHONE               = <exact header text of the phone column>      (optional)
 *        COL_PAYMENT_CONFIRMATION = <exact header text of the dropdown column>
 *        COL_AMOUNT              = <exact header text of the amount column>
 *   3. Triggers (clock icon in the left sidebar) -> Add Trigger -> onEdit ->
 *      From spreadsheet -> On edit -> Save. This MUST be an installable
 *      trigger, not the automatic simple trigger — UrlFetchApp calls are not
 *      allowed from simple triggers.
 *   4. Deploy -> New deployment -> Web app -> Execute as "Me", access
 *      "Anyone" -> copy the /exec URL into .env.local as GAS_SHEETS_SYNC_URL.
 *   5. This script auto-creates two tracking columns ("SyncedAt",
 *      "AppSyncValue") at the end of row 1 the first time it runs, if they
 *      don't already exist. Do not delete them — they are how the script
 *      tells "a fresh submission" apart from "our own outbound write landing
 *      back as an edit" (which must NOT re-fire the webhook).
 */

const TRACKING_COLUMNS = ["SyncedAt", "AppSyncValue"];

function onEdit(e) {
  try {
    const sheet = e.range.getSheet();
    const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const props = PropertiesService.getScriptProperties();

    ensureTrackingColumns_(sheet, headerRow, props);

    const editedRow = e.range.getRow();
    if (editedRow === 1) return; // header row

    const confirmationCol = headerIndex_(headerRow, props.getProperty("COL_PAYMENT_CONFIRMATION"));
    const syncedAtCol = headerIndex_(headerRow, "SyncedAt");
    const appSyncValueCol = headerIndex_(headerRow, "AppSyncValue");
    if (confirmationCol === -1) return;

    const editedCol = e.range.getColumn();
    // Only react to an edit that touches the Payment Confirmation column, or
    // a brand-new row that has never been synced at all.
    const syncedAt = sheet.getRange(editedRow, syncedAtCol + 1).getValue();
    const isNewRow = !syncedAt;
    if (!isNewRow && editedCol !== confirmationCol + 1) return;

    const confirmationValue = sheet.getRange(editedRow, confirmationCol + 1).getValue();
    if (!confirmationValue) return;

    // Loop guard: if this exact value is what the app itself last pushed,
    // this edit IS our own outbound write echoing back — skip it.
    const lastAppValue = sheet.getRange(editedRow, appSyncValueCol + 1).getValue();
    if (!isNewRow && confirmationValue === lastAppValue) return;

    const row = readRow_(sheet, editedRow, headerRow, props);
    const payload = {
      token: props.getProperty("SYNC_SECRET"),
      action: isNewRow ? "newSubmission" : "statusChange",
      sheetId: props.getProperty("SHEET_ID"),
      row: row,
    };

    UrlFetchApp.fetch(props.getProperty("WEBHOOK_URL"), {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    });

    sheet.getRange(editedRow, syncedAtCol + 1).setValue(new Date());
  } catch (err) {
    // onEdit errors are otherwise silent to the user — log so they show up
    // in the Apps Script executions dashboard.
    console.error(String(err));
  }
}

/** Inbound: the Next.js app pushing a confirmed status back to this sheet. */
function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse_({ status: "error", message: "Invalid JSON body" });
  }

  const props = PropertiesService.getScriptProperties();
  if (!body || body.token !== props.getProperty("SYNC_SECRET")) {
    return jsonResponse_({ status: "error", message: "Wrong password." });
  }

  if (body.action !== "applyStatus") {
    return jsonResponse_({ status: "error", message: "Unknown action: " + body.action });
  }

  try {
    const sheet = SpreadsheetApp.openById(props.getProperty("SHEET_ID")).getSheets()[0];
    const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const emailCol = headerIndex_(headerRow, props.getProperty("COL_EMAIL"));
    const confirmationCol = headerIndex_(headerRow, props.getProperty("COL_PAYMENT_CONFIRMATION"));
    const appSyncValueCol = headerIndex_(headerRow, "AppSyncValue");

    const emails = sheet.getRange(2, emailCol + 1, sheet.getLastRow() - 1, 1).getValues();
    const targetRow = emails.findIndex(
      (r) => String(r[0]).trim().toLowerCase() === String(body.email).trim().toLowerCase(),
    );
    if (targetRow === -1) {
      return jsonResponse_({ status: "error", message: "No row found for that email" });
    }

    const sheetRow = targetRow + 2; // +1 for header, +1 for 0-index
    const display = displayValueForStatus_(body.status);
    sheet.getRange(sheetRow, confirmationCol + 1).setValue(display);
    sheet.getRange(sheetRow, appSyncValueCol + 1).setValue(display);

    return jsonResponse_({ status: "success", message: "Sheet updated" });
  } catch (err) {
    return jsonResponse_({ status: "error", message: String(err) });
  }
}

/** Maps our enrollment_status back to the sheet's own dropdown wording. */
function displayValueForStatus_(status) {
  if (status === "active") return "Paid";
  if (status === "reserved") return "Reserved";
  return "Pending"; // pending, rejected, expired all read as Pending on the sheet
}

function headerIndex_(headerRow, headerText) {
  if (!headerText) return -1;
  return headerRow.indexOf(headerText);
}

function readRow_(sheet, rowNum, headerRow, props) {
  const emailCol = headerIndex_(headerRow, props.getProperty("COL_EMAIL"));
  const nameCol = headerIndex_(headerRow, props.getProperty("COL_NAME"));
  const phoneCol = headerIndex_(headerRow, props.getProperty("COL_PHONE"));
  const confirmationCol = headerIndex_(headerRow, props.getProperty("COL_PAYMENT_CONFIRMATION"));
  const amountCol = headerIndex_(headerRow, props.getProperty("COL_AMOUNT"));

  const rowValues = sheet.getRange(rowNum, 1, 1, sheet.getLastColumn()).getValues()[0];
  return {
    email: emailCol !== -1 ? String(rowValues[emailCol]).trim() : "",
    name: nameCol !== -1 ? String(rowValues[nameCol]).trim() : undefined,
    phone: phoneCol !== -1 ? String(rowValues[phoneCol]).trim() : undefined,
    paymentConfirmation: confirmationCol !== -1 ? String(rowValues[confirmationCol]).trim() : "",
    amountPkr: amountCol !== -1 && rowValues[amountCol] !== "" ? Number(rowValues[amountCol]) : null,
  };
}

/** Appends the two tracking columns if this sheet doesn't already have them. */
function ensureTrackingColumns_(sheet, headerRow, props) {
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
