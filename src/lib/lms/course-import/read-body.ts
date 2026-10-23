import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { COURSE_IMPORT_LIMITS } from "./format";

const MAX_CHARS = COURSE_IMPORT_LIMITS.maxChars;
// Up to 4 bytes per character in UTF-8, plus the JSON wrapper.
const MAX_BODY_BYTES = MAX_CHARS * 4 + 1_000;

const bodySchema = z.object({ text: z.string().min(1).max(MAX_CHARS) });

// Reads the posted file text. The size check runs on the raw body before any
// JSON parsing. Returns the text, or a ready 400 response.
export async function readImportText(req: NextRequest): Promise<{ text: string } | { response: NextResponse }> {
  const tooBig = () =>
    ({ response: NextResponse.json({ errors: ["That file is too big to import."] }, { status: 400 }) });

  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return tooBig();
  const rawBody = await req.text().catch(() => "");
  if (rawBody.length > MAX_BODY_BYTES) return tooBig();
  let json: unknown = null;
  try { json = JSON.parse(rawBody); } catch { json = null; }
  if (json && typeof json === "object" && typeof (json as { text?: unknown }).text === "string"
      && (json as { text: string }).text.length > MAX_CHARS) {
    return tooBig();
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return { response: NextResponse.json({ errors: ["Choose a file or paste the text first."] }, { status: 400 }) };
  }
  return { text: parsed.data.text };
}
