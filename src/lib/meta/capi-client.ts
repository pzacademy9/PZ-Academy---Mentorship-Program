import type { MetaEvent } from "./capi-payload";

const GRAPH_VERSION = "v21.0";
const TIMEOUT_MS = 10_000;

export async function sendMetaEvent(
  pixelId: string,
  event: MetaEvent,
): Promise<void> {
  const token = process.env.META_CAPI_ACCESS_TOKEN ?? "";
  if (!token) throw new Error("Meta key not set");
  const testCode = process.env.META_CAPI_TEST_EVENT_CODE ?? "";

  const body: Record<string, unknown> = { data: [event], access_token: token };
  if (testCode) body.test_event_code = testCode;

  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${pixelId}/events`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    },
  );
  if (!res.ok) {
    throw new Error(`Meta rejected the event (HTTP ${res.status})`);
  }
}
