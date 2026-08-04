/**
 * PZ Admin Portal — unified Web App router.
 *
 * Single entry point for all admin-portal server actions. Each feature area
 * (LMS, Attendance, Feedback, ...) gets its own .gs file with handler
 * functions; this router just validates the shared token and dispatches on
 * `action`.
 *
 * Wire contract (matches src/lib/*\/gas-client.ts on the Next.js side):
 *   Request:  POST JSON body { action: <string>, token: <string>, ...action-specific fields }
 *   Response: JSON { status: "success", ...fields } | { status: "error", message: <string> }
 *
 * Security ordering: the shared SCRIPT_TOKEN is checked BEFORE any handler
 * runs and BEFORE any Drive/Sheets access happens for this request. This
 * mirrors the existing attendance script's convention — never touch Drive
 * for an unauthenticated caller.
 */

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);

    var PROPS = PropertiesService.getScriptProperties();
    var expectedToken = PROPS.getProperty("SCRIPT_TOKEN");

    if (!body || body.token !== expectedToken) {
      return _json({ status: "error", message: "Wrong password." });
    }

    switch (body.action) {
      case "uploadLessonPdf":
        return _json(handleUploadLessonPdf(body));

      // Future actions live in their own .gs files within this same
      // project and get dispatched here, e.g.:
      //   case "checkin":       return _json(handleCheckin(body));       // Attendance.gs
      //   case "roster":        return _json(handleRoster(body));        // Attendance.gs
      //   case "submitFeedback":return _json(handleSubmitFeedback(body));// Feedback.gs

      default:
        return _json({ status: "error", message: "Unknown action: " + body.action });
    }
  } catch (err) {
    return _json({ status: "error", message: String(err) });
  }
}

/**
 * Wraps a plain object as a JSON ContentService response.
 */
function _json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
