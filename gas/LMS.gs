/**
 * PZ Admin Portal — LMS handlers.
 *
 * Currently just the lesson-PDF upload used by the course builder's
 * "add lesson PDF" flow. Router.gs has already validated the shared
 * SCRIPT_TOKEN before this function is ever called.
 *
 * Convention: other feature areas (attendance check-in/roster, feedback
 * submission) can be added later as Attendance.gs / Feedback.gs in this
 * same unified Apps Script project, each exporting their own
 * handleXxx(body) functions that Router.gs dispatches to by `action`.
 * They are NOT implemented here.
 */

/**
 * Decodes a base64 PDF and saves it into the configured Drive folder.
 *
 * @param {Object} body - Parsed request body. Expected shape:
 *   {
 *     action: "uploadLessonPdf",
 *     token: <string>,        // already verified by Router.gs
 *     pdfBase64: <string>,    // base64 file contents, no "data:" prefix
 *     mimeType: "application/pdf",
 *     fileName: <string>
 *   }
 * @return {Object} { status: "success", url, fileId } | { status: "error", message }
 */
function handleUploadLessonPdf(body) {
  try {
    var bytes = Utilities.base64Decode(body.pdfBase64);
    var blob = Utilities.newBlob(bytes, body.mimeType, body.fileName);

    var folderId = PropertiesService.getScriptProperties().getProperty("LMS_PDF_FOLDER_ID");
    var folder = DriveApp.getFolderById(folderId);
    var file = folder.createFile(blob);

    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return { status: "success", url: file.getUrl(), fileId: file.getId() };
  } catch (err) {
    return { status: "error", message: String(err) };
  }
}
