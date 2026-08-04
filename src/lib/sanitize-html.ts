import DOMPurify from "isomorphic-dompurify";

/**
 * The one allowlist for admin-authored lesson HTML (Tiptap's output).
 * Applied on write (updateLesson, src/lib/data/admin-lms.ts) AND on render
 * (LessonContent.tsx) — an admin account compromise between those two points
 * would otherwise become stored XSS for every enrolled student. Matches the
 * toolbar RichTextEditor actually exposes: bold/italic/underline, lists,
 * links, images. Nothing script-capable is on the list.
 */
const ALLOWED_TAGS = [
  "p", "br", "strong", "em", "u", "s",
  "ul", "ol", "li",
  "a", "img",
  "h2", "h3", "blockquote", "code", "pre",
];
const ALLOWED_ATTR = ["href", "src", "alt", "target", "rel"];

export function sanitizeLessonHtml(html: string): string {
  return DOMPurify.sanitize(html, { ALLOWED_TAGS, ALLOWED_ATTR });
}
