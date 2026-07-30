/**
 * PZ Academy — Sheets Sync bridge.
 *
 * ONE standalone script (not bound to any single sheet) serves every batch's
 * Google Sheet. Onboarding a new sheet is a `registerSheet` call from the app
 * — no visit to the Apps Script editor, no new deployment. This works because
 * an installable trigger can be created programmatically for ANY spreadsheet
 * the deploying account can edit, via ScriptApp.newTrigger(...).forSpreadsheet(id) —
 * it does not need to live inside that spreadsheet's own bound-script project.
 *
 * One-time setup, ever (not per sheet):
 *   1. script.google.com -> New project, paste this file in.
 *   2. Project Settings -> Script Properties, add:
 *        SYNC_SECRET              = <same value as SHEETS_SYNC_SECRET in .env.local>
 *        WEBHOOK_URL              = https://<your-domain>/api/webhooks/sheets-sync
 *        COL_EMAIL                = <exact header text of the email column>
 *        COL_NAME                 = <exact header text of the name column>       (optional)
 *        COL_PHONE                = <exact header text of the phone column>      (optional)
 *        COL_PAYMENT_CONFIRMATION = <exact header text of the dropdown column>
 *        COL_AMOUNT               = <exact header text of the amount column>
 *      These column headers are assumed IDENTICAL across every registered
 *      sheet (they all come from the same WordPress form template). A sheet
 *      with genuinely different headers needs a follow-up design, not
 *      supported here.
 *   3. Deploy -> New deployment -> Web app -> Execute as "Me", access
 *      "Anyone" -> copy the /exec URL into .env.local as GAS_SHEETS_SYNC_URL.
 *   4. The deploying Google account must have edit access to every sheet
 *      that gets registered — same Drive/team as today's sheets.
 *
 * Per new batch sheet, from then on: the admin panel calls `registerSheet`
 * with that sheet's ID, which installs the onEdit trigger on it. No manual
 * GAS step at all. (GAS caps installable triggers at ~20 per script per
 * user — comfortably enough for years of batches; an `unregisterSheet`
 * action can be added later if a batch's sheet is retired and the cap is
 * ever a concern.)
 *
 * This script auto-creates two tracking columns ("SyncedAt", "AppSyncValue")
 * at the end of row 1 of each registered sheet the first time it reacts to
 * an edit there, if they don't already exist. Do not delete them — they are
 * how the script tells "a fresh submission" apart from "our own outbound
 * write landing back as an edit" (which must NOT re-fire the webhook).
 */

const TRACKING_COLUMNS = ["SyncedAt", "AppSyncValue"];

/**
 * Shared by every sheet's installable trigger — e.source/e.range always
 * belong to whichever spreadsheet the edit actually happened in, so this one
 * function serves all registered sheets without needing to know which sheet
 * it's running for ahead of time.
 */
function onEdit(e) {
  try {
    const sheet = e.range.getSheet();
    const sheetId = sheet.getParent().getId();
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
      sheetId: sheetId,
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

/**
 * Inbound: the Next.js app pushing a confirmed status back to a sheet
 * (`applyStatus`), or asking this script to start watching a new sheet
 * (`registerSheet`) so onboarding a batch never needs the Apps Script editor.
 */
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

  if (body.action === "registerSheet") {
    return handleRegisterSheet_(body);
  }

  if (body.action === "applyStatus") {
    return handleApplyStatus_(body);
  }

  return jsonResponse_({ status: "error", message: "Unknown action: " + body.action });
}

/**
 * Installs the onEdit watcher on a new sheet by ID. Idempotent — calling
 * this again for a sheet that's already registered is a harmless no-op, so
 * the app can safely call it every time a course's sheet_id is (re)saved.
 */
function handleRegisterSheet_(body) {
  if (!body.sheetId) {
    return jsonResponse_({ status: "error", message: "Missing sheetId" });
  }

  try {
    const alreadyRegistered = ScriptApp.getProjectTriggers().some(
      (t) => t.getHandlerFunction() === "onEdit" && t.getTriggerSourceId() === body.sheetId,
    );
    if (alreadyRegistered) {
      return jsonResponse_({ status: "success", message: "Already registered" });
    }

    ScriptApp.newTrigger("onEdit").forSpreadsheet(body.sheetId).onEdit().create();
    return jsonResponse_({ status: "success", message: "Sheet registered" });
  } catch (err) {
    // Most common cause: the deploying account doesn't have edit access to
    // this spreadsheet ID — share the sheet with that account and retry.
    return jsonResponse_({ status: "error", message: String(err) });
  }
}

/** Writes a confirmed status back into whichever sheet the enrollment is linked to. */
function handleApplyStatus_(body) {
  if (!body.sheetId) {
    return jsonResponse_({ status: "error", message: "Missing sheetId" });
  }

  try {
    const sheet = SpreadsheetApp.openById(body.sheetId).getSheets()[0];
    const props = PropertiesService.getScriptProperties();
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
