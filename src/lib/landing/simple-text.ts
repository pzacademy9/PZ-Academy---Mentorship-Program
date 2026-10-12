/**
 * The only "rich text" admin-authored landing copy supports: **bold**, lines
 * starting "- " as bullets, and [label](url) links. Output is a small AST
 * rendered as React elements (see SimpleText.tsx) so admin text can never
 * become markup. URLs are allow-listed here, once.
 */

export function isSafeUrl(url: string): boolean {
  const v = url.trim();
  if (v === "") return false;
  if (v.startsWith("#")) return true;
  if (v.startsWith("/") && !v.startsWith("//")) return true;
  try {
    return ["http:", "https:", "mailto:", "tel:"].includes(new URL(v).protocol);
  } catch {
    return false;
  }
}

const YT_ID = /^[A-Za-z0-9_-]{11}$/;

export function youtubeId(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  const host = u.hostname.replace(/^www\./, "");
  let id: string | null = null;
  if (host === "youtu.be") id = u.pathname.slice(1).split("/")[0] || null;
  else if (host === "youtube.com" || host === "m.youtube.com") {
    if (u.pathname === "/watch") id = u.searchParams.get("v");
    else {
      const m = u.pathname.match(/^\/(?:shorts|embed)\/([^/]+)/);
      id = m ? m[1] : null;
    }
  }
  return id && YT_ID.test(id) ? id : null;
}

export type Inline =
  | { t: "text"; v: string }
  | { t: "bold"; v: string }
  | { t: "link"; v: string; href: string };
export type Block = { t: "p"; inline: Inline[] } | { t: "ul"; items: Inline[][] };

const INLINE = /\*\*(.+?)\*\*|\[([^\]]+)\]\(([^)\s]+)\)/g;

function parseInline(line: string): Inline[] {
  const out: Inline[] = [];
  let last = 0;
  for (const m of Array.from(line.matchAll(INLINE))) {
    const at = m.index ?? 0;
    if (at > last) out.push({ t: "text", v: line.slice(last, at) });
    if (m[1] !== undefined) out.push({ t: "bold", v: m[1] });
    else if (isSafeUrl(m[3])) out.push({ t: "link", v: m[2], href: m[3] });
    else out.push({ t: "text", v: m[2] });
    last = at + m[0].length;
  }
  if (last < line.length) out.push({ t: "text", v: line.slice(last) });
  return out;
}

export function parseSimpleText(src: string): Block[] {
  const blocks: Block[] = [];
  let para: string[] = [];
  let list: string[] = [];
  const flushPara = () => {
    if (para.length) blocks.push({ t: "p", inline: parseInline(para.join(" ")) });
    para = [];
  };
  const flushList = () => {
    if (list.length) blocks.push({ t: "ul", items: list.map(parseInline) });
    list = [];
  };
  for (const raw of src.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) { flushPara(); flushList(); continue; }
    if (line.startsWith("- ")) { flushPara(); list.push(line.slice(2)); continue; }
    flushList();
    para.push(line);
  }
  flushPara();
  flushList();
  return blocks;
}
