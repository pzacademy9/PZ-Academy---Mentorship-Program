// File rules for the mentor application. The CV and photo travel inside one
// request, and the host refuses requests over about 4.5 MB (files grow by a
// third when encoded), so the two files together must stay well under that.

export const MAX_CV_BYTES = 2 * 1024 * 1024;
export const MAX_PHOTO_BYTES = 1024 * 1024;
export const CV_ACCEPT = ".pdf,.doc,.docx";
export const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";

const mb = (n: number) => `${Math.round((n / (1024 * 1024)) * 10) / 10} MB`;

/** A plain-words problem with the CV, or null when it is fine. */
export function cvProblem(file: { name: string; size: number }): string | null {
  if (!/\.(pdf|docx?)$/i.test(file.name)) return "Please choose a PDF or Word file for your CV.";
  if (file.size > MAX_CV_BYTES) return `Your CV is ${mb(file.size)}. Please use a file under ${mb(MAX_CV_BYTES)} (save it as PDF to make it smaller).`;
  return null;
}

/** Checked after the photo has been made smaller in the browser. */
export function photoProblem(file: { name: string; type: string; size: number }): string | null {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return "Please choose a JPG, PNG or WEBP photo.";
  if (file.size > MAX_PHOTO_BYTES) return `Your photo is ${mb(file.size)} even after making it smaller. Please choose a photo under ${mb(MAX_PHOTO_BYTES)}.`;
  return null;
}

/** Image type from the file name, for storing the photo with the right type. */
export function imageMime(name: string): string {
  if (/\.png$/i.test(name)) return "image/png";
  if (/\.webp$/i.test(name)) return "image/webp";
  return "image/jpeg";
}
