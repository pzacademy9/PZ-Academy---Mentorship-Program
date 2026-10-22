import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendMetaEvent } from "@/lib/meta/capi-client";
import type { MetaEvent } from "@/lib/meta/capi-payload";

const TOKEN = "SECRET-TOKEN-123";
const event: MetaEvent = {
  event_name: "Purchase",
  event_time: 1760000000,
  event_id: "purchase-r1",
  action_source: "website",
  event_source_url: "https://pharmacozyme.com/x",
  user_data: { em: ["abc"] },
  custom_data: { value: 10, currency: "AED" },
};

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("META_CAPI_ACCESS_TOKEN", TOKEN);
  vi.stubEnv("META_CAPI_TEST_EVENT_CODE", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("sendMetaEvent", () => {
  it("throws and never calls fetch when the token is missing", async () => {
    vi.stubEnv("META_CAPI_ACCESS_TOKEN", "");
    await expect(sendMetaEvent("123", event)).rejects.toThrow("Meta key not set");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts to the pixel URL with the token in the body only", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    await sendMetaEvent("999", event);
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/^https:\/\/graph\.facebook\.com\/v[\d.]+\/999\/events$/);
    expect(String(url)).not.toContain(TOKEN);
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.access_token).toBe(TOKEN);
    expect(body.data).toEqual([event]);
    expect(body).not.toHaveProperty("test_event_code");
  });

  it("includes the test code only when set", async () => {
    vi.stubEnv("META_CAPI_TEST_EVENT_CODE", "TEST42");
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    await sendMetaEvent("999", event);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).test_event_code).toBe("TEST42");
  });

  it("trims a token pasted with a trailing newline", async () => {
    vi.stubEnv("META_CAPI_ACCESS_TOKEN", `  ${TOKEN}\n`);
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    await sendMetaEvent("999", event);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).access_token).toBe(TOKEN);
  });

  it("treats a whitespace-only token as missing and never calls fetch", async () => {
    vi.stubEnv("META_CAPI_ACCESS_TOKEN", " \n\t ");
    await expect(sendMetaEvent("999", event)).rejects.toThrow("Meta key not set");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("trims the test code and ignores a blank one", async () => {
    fetchMock.mockResolvedValue({ ok: true, status: 200 });
    vi.stubEnv("META_CAPI_TEST_EVENT_CODE", "TEST42\n");
    await sendMetaEvent("999", event);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).test_event_code).toBe("TEST42");
    vi.stubEnv("META_CAPI_TEST_EVENT_CODE", "  \n");
    await sendMetaEvent("999", event);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).not.toHaveProperty("test_event_code");
  });

  it("throws a safe message on HTTP 400", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => `bad ${TOKEN} jane@example.com`,
    });
    const err = await sendMetaEvent("999", event).catch((e: Error) => e);
    expect((err as Error).message).toBe("Meta rejected the event (HTTP 400)");
    expect((err as Error).message).not.toContain(TOKEN);
  });

  it("rethrows network errors", async () => {
    fetchMock.mockRejectedValue(new Error("network down"));
    await expect(sendMetaEvent("999", event)).rejects.toThrow("network down");
  });
});
