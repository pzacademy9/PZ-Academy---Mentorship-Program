import sanitizeHtml from "sanitize-html";

/**
 * The one allowlist for admin-authored lesson HTML (Tiptap's output).
 * Applied on write (updateLesson, src/lib/data/admin-lms.ts) AND on render
 * (LessonContent.tsx) — an admin account compromise between those two points
 * would otherwise become stored XSS for every enrolled student. Matches the
 * toolbar RichTextEditor actually exposes: bold/italic/underline, lists,
 * links, images. Nothing script-capable is on the list.
 *
 * Uses `sanitize-html` (pure CJS, no jsdom) rather than isomorphic-dompurify
 * here specifically: both call sites above are Server Components/functions,
 * and isomorphic-dompurify's Node path pulls in jsdom, whose
 * html-encoding-sniffer dependency requires the ESM-only @exodus/bytes via
 * plain CommonJS require() — that throws ERR_REQUIRE_ESM at runtime in
 * Vercel's serverless functions (and fails the webpack build outright if the
 * package isn't externalized). Note that "use client" components are STILL
 * server-rendered, so a static import of isomorphic-dompurify there resolves
 * to the Node/jsdom build on the server and crashes the same way. It must be
 * loaded lazily client-side only (dynamic import() inside a useEffect), as
 * CampaignsPanel.tsx does.
 */
const ALLOWED_TAGS = [
  "p", "br", "strong", "em", "u", "s",
  "ul", "ol", "li",
  "a", "img",
  "h2", "h3", "blockquote", "code", "pre",
];
const ALLOWED_ATTR = ["href", "src", "alt", "target", "rel"];

export function sanitizeLessonHtml(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: { "*": ALLOWED_ATTR },
  });
}
