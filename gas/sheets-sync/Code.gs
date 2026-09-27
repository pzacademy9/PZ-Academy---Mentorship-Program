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
 * This file can live in its own Apps Script project, OR share one project
 * with gas/payment-screenshots/Code.gs (both are pasted in as separate .gs
 * files under one project) — either way there is only ONE doPost for the
 * whole project, so this file's doPost also dispatches
 * uploadPaymentScreenshot requests to that other file's handler. See the
 * comment on doPost below.
 *
 * One-time setup, ever (not per sheet):
 *   1. script.google.com -> New project (or reuse the existing
 *      payment-screenshots project), paste this file in as an additional
 *      .gs file.
 *   2. Project Settings -> Script Properties, add:
 *        SYNC_SECRET              = <same value as SHEETS_SYNC_SECRET in .env.local>
 *        WEBHOOK_URL              = https://<your-domain>/api/webhooks/sheets-sync
 *        COL_EMAIL                = <exact header text of the email column>
 *        COL_NAME                 = <exact header text of the name column>       (optional)
 *        COL_PHONE                = <exact header text of the phone column>      (optional)
 *        COL_PAYMENT_CONFIRMATION = <exact header text of the dropdown column>
 *        COL_AMOUNT               = <exact header text of the amount column>
 *      (If sharing the payment-screenshots project, its SHARED_SECRET
 *      property stays as-is — different property name, no collision.)
 *      These column headers are assumed IDENTICAL across every registered
 *      sheet (they all come from the same WordPress form template). A sheet
 *      with genuinely different headers needs a follow-up design, not
 *      supported here.
 *   3. Deploy -> New deployment -> Web app -> Execute as "Me", access
 *      "Anyone" -> copy the /exec URL into .env.local as GAS_SHEETS_SYNC_URL.
 *      If sharing the payment-screenshots project, this is the SAME /exec
 *      URL as GAS_WEBAPP_URL — both env vars just point at one deployment now.
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
 * Single entry point for the whole "PZ Academy Platform" GAS project — a
 * project has exactly one doPost, so this also dispatches the unrelated
 * Drive-upload bridges (gas/payment-screenshots/Code.gs: payment screenshots,
 * course images, AND private lesson documents) that share this project. Each
 * action checks its own secret property (SYNC_SECRET here, SHARED_SECRET for
 * uploadPaymentScreenshot/uploadCourseImage/uploadPrivateDocument/
 * fetchPrivateDocument/trashFile) rather than one shared gate, since they're logically
 * separate integrations that just happen to live behind one exec URL now.
 */
function doPost(e) {
  let body;
  try {
    body = JSON.parse(e.postData.contents);
  } catch (err) {
    return jsonResponse_({ status: "error", message: "Invalid JSON body" });
  }

  if (body.action === "uploadPaymentScreenshot") {
    return handleUploadPaymentScreenshot_(body);
  }

  if (body.action === "uploadMentorshipFile") {
    return handleUploadMentorshipFile_(body);
  }

  if (body.action === "uploadCourseImage") {
    return handleUploadCourseImage_(body);
  }

  if (body.action === "uploadPrivateDocument") {
    return handleUploadPrivateDocument_(body);
  }

  if (body.action === "fetchPrivateDocument") {
    return handleFetchPrivateDocument_(body);
  }

  if (body.action === "trashFile") {
    return handleTrashFile_(body);
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

  if (body.action === "listSheetTabs") {
    return handleListSheetTabs_(body);
  }

  if (body.action === "readSheetRows") {
    return handleReadSheetRows_(body);
  }

  if (body.action === "registerLeadSheet") {
    return handleRegisterLeadSheet_(body);
  }

  if (body.action === "applyLeadSync") {
    return handleApplyLeadSync_(body);
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

/**
 * Lists every tab in a spreadsheet with its header row and data row count,
 * so the app can offer a tab picker and auto-guess a column mapping without
 * downloading the whole sheet first.
 *
 * Headers come from row 1. Sheets whose row 1 is blank return an empty
 * header array rather than failing — the admin can still pick the tab and
 * map columns by index.
 */
function handleListSheetTabs_(body) {
  if (!body.sheetId) {
    return jsonResponse_({ status: "error", message: "Missing sheetId" });
  }

  try {
    var ss = SpreadsheetApp.openById(body.sheetId);
    var tabs = ss.getSheets().map(function (sheet) {
      var lastRow = sheet.getLastRow();
      var lastCol = sheet.getLastColumn();
      var headers = [];
      if (lastRow >= 1 && lastCol >= 1) {
        headers = sheet.getRange(1, 1, 1, lastCol).getDisplayValues()[0];
      }
      return {
        name: sheet.getName(),
        headers: headers,
        // Exclude the header row from the count the admin sees.
        rowCount: Math.max(0, lastRow - 1),
      };
    });
    return jsonResponse_({ status: "success", tabs: tabs, sheetName: ss.getName() });
  } catch (err) {
    // Most common cause: the deploying account lacks access to this
    // spreadsheet ID. Share the sheet with that account and retry.
    return jsonResponse_({ status: "error", message: String(err) });
  }
}

/**
 * Reads a page of data rows (header row excluded) from one tab.
 *
 * Paginated deliberately. Apps Script enforces a six-minute execution
 * ceiling and a response size limit, and several of these cohort sheets are
 * large. getDisplayValues() rather than getValues() so numbers, dates, and
 * phone numbers arrive exactly as a human sees them in the sheet — a phone
 * column formatted as a number would otherwise lose its leading zero before
 * normalizePhone ever sees it.
 */
function handleReadSheetRows_(body) {
  if (!body.sheetId || !body.tabName) {
    return jsonResponse_({ status: "error", message: "Missing sheetId or tabName" });
  }

  var offset = Number(body.offset) || 0;
  var limit = Math.min(Number(body.limit) || 500, 500);

  try {
    var ss = SpreadsheetApp.openById(body.sheetId);
    var sheet = ss.getSheetByName(body.tabName);
    if (!sheet) {
      return jsonResponse_({ status: "error", message: "No tab named " + body.tabName });
    }

    var lastRow = sheet.getLastRow();
    var lastCol = sheet.getLastColumn();
    var total = Math.max(0, lastRow - 1);

    if (total === 0 || offset >= total || lastCol < 1) {
      return jsonResponse_({ status: "success", rows: [], total: total, nextOffset: null });
    }

    // +2 converts a zero-based data offset into a 1-based sheet row that
    // skips the header: data row 0 lives at sheet row 2.
    var startRow = offset + 2;
    var count = Math.min(limit, total - offset);
    var rows = sheet.getRange(startRow, 1, count, lastCol).getDisplayValues();

    var consumed = offset + count;
    return jsonResponse_({
      status: "success",
      rows: rows,
      total: total,
      nextOffset: consumed < total ? consumed : null,
    });
  } catch (err) {
    return jsonResponse_({ status: "error", message: String(err) });
  }
}

/**
 * Installs the leads-specific onEdit watcher on the ONE leads sheet, and
 * remembers its ID in a script property so handleApplyLeadSync_ knows which
 * spreadsheet to write into without the app passing sheetId on every call.
 * A separate handler function (onEditLeads, not onEdit) means this sheet's
 * column layout (id/status/notes) never shares script properties with the
 * unrelated enrollment sheets' COL_EMAIL/COL_PAYMENT_CONFIRMATION config.
 *
 * One-time script properties this action's project needs, set once in
 * Project Settings -> Script Properties (in addition to the existing
 * SYNC_SECRET/WEBHOOK_URL/COL_* ones already documented at the top of this
 * file):
 *   WEBHOOK_URL_LEADS = https://<your-domain>/api/sync/from-sheets
 *   LEADS_COL_ID         = <exact header text of the id column>
 *   LEADS_COL_STATUS     = <exact header text of the status column>
 *   LEADS_COL_NOTES      = <exact header text of the notes column>
 *   LEADS_COL_NAME       = <exact header text of the name column>        (optional)
 *   LEADS_COL_EMAIL      = <exact header text of the email column>       (optional)
 *   LEADS_COL_PHONE      = <exact header text of the phone column>       (optional)
 *   LEADS_COL_PROFESSION = <exact header text of the profession column>  (optional)
 *   LEADS_COL_CAMPAIGN   = <exact header text of the campaign column>    (optional)
 *   LEADS_COL_AGENT      = <exact header text of the agent column>       (optional)
 * LEADS_SHEET_ID is set automatically by this action — do not set it by hand.
 */
function handleRegisterLeadSheet_(body) {
  if (!body.sheetId) {
    return jsonResponse_({ status: "error", message: "Missing sheetId" });
  }

  try {
    const props = PropertiesService.getScriptProperties();
    const alreadyRegistered = ScriptApp.getProjectTriggers().some(
      (t) => t.getHandlerFunction() === "onEditLeads" && t.getTriggerSourceId() === body.sheetId,
    );
    if (!alreadyRegistered) {
      ScriptApp.newTrigger("onEditLeads").forSpreadsheet(body.sheetId).onEdit().create();
    }
    props.setProperty("LEADS_SHEET_ID", body.sheetId);
    return jsonResponse_({ status: "success", message: "Lead sheet registered" });
  } catch (err) {
    return jsonResponse_({ status: "error", message: String(err) });
  }
}

/**
 * Writes one lead's full row into the registered leads sheet, matched by
 * the id column. Appends a fresh row the first time a given lead syncs
 * (leads are created in Supabase first, so the first sync for any lead has
 * no existing sheet row yet); every later sync updates that row in place.
 * Sets AppSyncValue so onEditLeads can tell its own echo apart from a real
 * ops-team edit, exactly like handleApplyStatus_ does for enrollments.
 */
function handleApplyLeadSync_(body) {
  const props = PropertiesService.getScriptProperties();
  const sheetId = props.getProperty("LEADS_SHEET_ID");
  if (!sheetId) {
    return jsonResponse_({ status: "error", message: "No lead sheet registered yet" });
  }
  if (!body.row || !body.row.id) {
    return jsonResponse_({ status: "error", message: "Missing row.id" });
  }

  try {
    const sheet = SpreadsheetApp.openById(sheetId).getSheets()[0];
    const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    ensureTrackingColumns_(sheet, headerRow, props);

    const idCol = headerIndex_(headerRow, props.getProperty("LEADS_COL_ID"));
    const statusCol = headerIndex_(headerRow, props.getProperty("LEADS_COL_STATUS"));
    const notesCol = headerIndex_(headerRow, props.getProperty("LEADS_COL_NOTES"));
    const appSyncValueCol = headerIndex_(headerRow, "AppSyncValue");
    const syncedAtCol = headerIndex_(headerRow, "SyncedAt");
    if (idCol === -1 || statusCol === -1 || notesCol === -1) {
      return jsonResponse_({ status: "error", message: "Lead sheet is missing id/status/notes columns" });
    }

    const ids =
      sheet.getLastRow() > 1 ? sheet.getRange(2, idCol + 1, sheet.getLastRow() - 1, 1).getValues() : [];
    const existingRowIndex = ids.findIndex((r) => String(r[0]).trim() === String(body.row.id).trim());
    const targetRow = existingRowIndex === -1 ? sheet.getLastRow() + 1 : existingRowIndex + 2;

    const nameCol = headerIndex_(headerRow, props.getProperty("LEADS_COL_NAME"));
    const emailCol = headerIndex_(headerRow, props.getProperty("LEADS_COL_EMAIL"));
    const phoneCol = headerIndex_(headerRow, props.getProperty("LEADS_COL_PHONE"));
    const professionCol = headerIndex_(headerRow, props.getProperty("LEADS_COL_PROFESSION"));
    const campaignCol = headerIndex_(headerRow, props.getProperty("LEADS_COL_CAMPAIGN"));
    const agentCol = headerIndex_(headerRow, props.getProperty("LEADS_COL_AGENT"));

    sheet.getRange(targetRow, idCol + 1).setValue(body.row.id);
    if (nameCol !== -1) sheet.getRange(targetRow, nameCol + 1).setValue(body.row.name || "");
    if (emailCol !== -1) sheet.getRange(targetRow, emailCol + 1).setValue(body.row.email || "");
    if (phoneCol !== -1) sheet.getRange(targetRow, phoneCol + 1).setValue(body.row.phone || "");
    if (professionCol !== -1) sheet.getRange(targetRow, professionCol + 1).setValue(body.row.profession || "");
    if (campaignCol !== -1) sheet.getRange(targetRow, campaignCol + 1).setValue(body.row.campaignName || "");
    if (agentCol !== -1) sheet.getRange(targetRow, agentCol + 1).setValue(body.row.agentName || "");
    sheet.getRange(targetRow, statusCol + 1).setValue(body.row.status || "");
    sheet.getRange(targetRow, notesCol + 1).setValue(body.row.notes || "");

    const syncValue = String(body.row.status || "") + "|" + String(body.row.notes || "");
    if (appSyncValueCol !== -1) sheet.getRange(targetRow, appSyncValueCol + 1).setValue(syncValue);
    if (syncedAtCol !== -1) sheet.getRange(targetRow, syncedAtCol + 1).setValue(new Date());

    return jsonResponse_({ status: "success", message: "Lead sheet updated" });
  } catch (err) {
    return jsonResponse_({ status: "error", message: String(err) });
  }
}

/**
 * Installable trigger for the ONE leads sheet, registered by
 * handleRegisterLeadSheet_. Separate from onEdit (which serves enrollment
 * sheets) because it reads a completely different column layout. Only
 * status/notes edits are ever forwarded — every other cell is app-owned.
 */
function onEditLeads(e) {
  try {
    const sheet = e.range.getSheet();
    const headerRow = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const props = PropertiesService.getScriptProperties();
    ensureTrackingColumns_(sheet, headerRow, props);

    const editedRow = e.range.getRow();
    if (editedRow === 1) return;

    const idCol = headerIndex_(headerRow, props.getProperty("LEADS_COL_ID"));
    const statusCol = headerIndex_(headerRow, props.getProperty("LEADS_COL_STATUS"));
    const notesCol = headerIndex_(headerRow, props.getProperty("LEADS_COL_NOTES"));
    const appSyncValueCol = headerIndex_(headerRow, "AppSyncValue");
    if (idCol === -1 || statusCol === -1 || notesCol === -1) return;

    const editedCol = e.range.getColumn();
    if (editedCol !== statusCol + 1 && editedCol !== notesCol + 1) return;

    const id = sheet.getRange(editedRow, idCol + 1).getValue();
    if (!id) return; // a row not yet synced from the app — nothing to report back on

    const status = sheet.getRange(editedRow, statusCol + 1).getValue();
    const notes = sheet.getRange(editedRow, notesCol + 1).getValue();

    // Loop guard: this exact combination is what the app itself last wrote —
    // this edit is that write echoing back, not a real ops-team edit.
    const lastAppValue = appSyncValueCol !== -1 ? sheet.getRange(editedRow, appSyncValueCol + 1).getValue() : "";
    const currentValue = String(status || "") + "|" + String(notes || "");
    if (currentValue === lastAppValue) return;

    UrlFetchApp.fetch(props.getProperty("WEBHOOK_URL_LEADS"), {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify({
        token: props.getProperty("SYNC_SECRET"),
        id: String(id),
        status: String(status || ""),
        notes: String(notes || ""),
        updatedAt: new Date().toISOString(),
      }),
      muteHttpExceptions: true,
    });
  } catch (err) {
    console.error(String(err));
  }
}
