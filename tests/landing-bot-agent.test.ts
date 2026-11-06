import { describe, expect, it } from "vitest";
import { isBotUserAgent } from "@/lib/landing/bot-agent";

const CHROME_ANDROID = "Mozilla/5.0 (Linux; Android 13; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
const SAFARI_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

describe("isBotUserAgent", () => {
  it("lets real phone and laptop browsers through", () => {
    expect(isBotUserAgent(CHROME_ANDROID)).toBe(false);
    expect(isBotUserAgent(SAFARI_IOS)).toBe(false);
    expect(isBotUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0")).toBe(false);
  });
  it("catches crawlers, link previews, headless browsers and scripts", () => {
    for (const ua of [
      "Mozilla/5.0 AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0.0.0 Safari/537.36",
      "WhatsApp/2.23.20.0 A",
      "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)",
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
      "TelegramBot (like TwitterBot)",
      "Slackbot-LinkExpanding 1.0",
      "curl/8.4.0",
      "python-requests/2.31.0",
      "Mozilla/5.0 Chrome-Lighthouse",
    ]) expect(isBotUserAgent(ua), ua).toBe(true);
  });
  it("treats a missing or empty browser name as a bot (every real browser sends one)", () => {
    expect(isBotUserAgent(null)).toBe(true);
    expect(isBotUserAgent(undefined)).toBe(true);
    expect(isBotUserAgent("   ")).toBe(true);
  });
});
