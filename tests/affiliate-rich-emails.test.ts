import { describe, it, expect } from "vitest";
import {
  progressEmail,
  welcomeEmailRich,
  motivationEmail,
  messageBlockRich,
  messageBlockPlain,
  type ProgressInput,
  type TopRow,
} from "@/lib/affiliates/rich-emails";

const top: TopRow[] = [
  { rank: 1, publicName: "Ali K.", team: "Blue", paid: 12, isMe: false },
  { rank: 2, publicName: "Sara M.", team: null, paid: 7, isMe: true },
];

function base(over: Partial<ProgressInput> = {}): ProgressInput {
  return {
    name: "Sara Malik",
    code: "SARA10",
    paid: 7,
    commissionPkr: 2100,
    balancePkr: 2100,
    percent: 10,
    rank: 2,
    gapLine: "You need 5 more participants to overtake Ali K. (rank #1)",
    top,
    supportWa: "https://wa.me/923001234567",
    message: "",
    ...over,
  };
}

function topTable(html: string): string {
  const a = html.indexOf("Leaderboard - Top 10");
  const b = html.indexOf("Your Goals");
  return html.slice(a, b);
}

describe("progressEmail", () => {
  it("shows the stat boxes with paid, PKR commission, rank and percent", () => {
    const r = progressEmail(base());
    expect(r.subject).toContain("a new paid registration under your code");
    expect(r.html).toContain(">7<");
    expect(r.html).toContain("PKR 2,100");
    expect(r.html).toContain("#2");
    expect(r.html).toContain("10%");
  });

  it("shows the green withdraw banner only when balancePkr >= 3500, with the line \"Please send your payment details on WhatsApp\"", () => {
    const line = "Please send your payment details on WhatsApp";
    expect(progressEmail(base({ balancePkr: 3499.99 })).html).not.toContain(line);
    expect(progressEmail(base({ balancePkr: 3500 })).html).toContain(line);
  });

  it("shows the certificate banner only when paid >= 10", () => {
    expect(progressEmail(base({ paid: 9 })).html).not.toContain("Certificate Now Available");
    expect(progressEmail(base({ paid: 10 })).html).toContain("Certificate Now Available");
  });

  it("marks the affiliate's own top-10 row and shows no money for other rows", () => {
    const html = progressEmail(base()).html;
    const t = topTable(html);
    expect(t).toContain("(YOU)");
    expect(t).toContain("Ali K.");
    expect(t).not.toContain("PKR");
    expect(t.match(/\(YOU\)/g)).toHaveLength(1);
  });

  it("with rank null and an empty top list still builds", () => {
    const r = progressEmail(base({ rank: null, top: [], gapLine: "" }));
    expect(r.html).toContain("N/A");
    expect(r.html).toContain("</html>");
  });

  it("escapes script tags, quotes and ampersands in name, code and top names; emoji and Arabic pass through", () => {
    const evil = `<script>alert("x")</script> & 'q'`;
    const r = progressEmail(
      base({
        name: evil + " \u{1F600} \u0645\u0631\u062D\u0628\u0627",
        code: evil,
        top: [{ rank: 1, publicName: evil, team: evil, paid: 3, isMe: false }],
      }),
    );
    expect(r.html).not.toContain("<script");
    expect(r.html).toContain("&lt;script&gt;");
    expect(r.html).toContain("&amp;");
    expect(r.html).toContain("&quot;x&quot;");
    expect(r.html).toContain("&#39;q&#39;");
    expect(r.html).toContain("\u{1F600}");
    expect(r.html).toContain("\u0645\u0631\u062D\u0628\u0627");
  });

  it("main support button label is exactly \"Message us on WhatsApp\" in both emails", () => {
    expect(progressEmail(base()).html).toContain(">Message us on WhatsApp</a>");
    const m = motivationEmail({ name: "Z", code: "Z", leaderLine: null, top: [], supportWa: "https://wa.me/1" });
    expect(m.html).toContain(">Message us on WhatsApp</a>");
  });

  it("balance 3499.6 shows PKR 1 more, never PKR 0 more, and no withdraw banner", () => {
    const html = progressEmail(base({ balancePkr: 3499.6 })).html;
    expect(html).not.toContain("PKR 0 more");
    expect(html).toContain("PKR 1 more");
    expect(html).not.toContain("Withdrawal Now Available");
  });

  it("includes the message block when a message is given", () => {
    expect(progressEmail(base({ message: "Hi team" })).html).toContain("Hi team");
  });
});

describe("message blocks", () => {
  it("messageBlockRich turns an https link into a button anchor and leaves a javascript: or http: address as plain escaped text", () => {
    const h = messageBlockRich("Join https://example.com/a?x=1&y=2. Also javascript:alert(1) and http://bad.com");
    expect(h).toContain(`href="https://example.com/a?x=1&amp;y=2"`);
    expect(h).toContain("display:inline-block");
    expect(h).not.toContain('href="javascript');
    expect(h).not.toContain('href="http://');
    expect(h).toContain("javascript:alert(1)");
    expect(h).toContain("http://bad.com");
  });

  it("messageBlockPlain writes the same link as a normal anchor, no button styling", () => {
    const h = messageBlockPlain("Join https://example.com/a");
    expect(h).toContain(`<a href="https://example.com/a"`);
    expect(h).not.toContain("display:inline-block");
  });

  it("both return empty string for blank or whitespace", () => {
    for (const m of ["", "  \n "]) {
      expect(messageBlockRich(m)).toBe("");
      expect(messageBlockPlain(m)).toBe("");
    }
  });

  it("escapes html in the message", () => {
    expect(messageBlockRich("<b>x</b>")).not.toContain("<b>");
    expect(messageBlockPlain("<b>x</b>")).not.toContain("<b>");
  });
});

describe("motivationEmail", () => {
  it("shows the code, the earn thresholds (certificate at 10, withdrawal at PKR 3,500) and a top-5 table with no money", () => {
    const six: TopRow[] = Array.from({ length: 6 }, (_, i) => ({
      rank: i + 1,
      publicName: `Person${i + 1} X.`,
      team: "Red",
      paid: 10 - i,
      isMe: false,
    }));
    const r = motivationEmail({
      name: "Zed",
      code: "ZED10",
      leaderLine: "Current leader: Person1 X. with 10 participants.",
      top: six,
      supportWa: "https://wa.me/923001234567",
    });
    expect(r.subject).toBe("Zed, a note about your affiliate code ZED10");
    expect(r.html).toContain("ZED10");
    expect(r.html).toContain("10 participants");
    expect(r.html).toContain("PKR 3,500");
    expect(r.html).toContain("Current leader: Person1 X.");
    const a = r.html.indexOf("Top 5 Leaderboard");
    const table = r.html.slice(a, r.html.indexOf("</table>", a));
    expect(table).not.toContain("PKR");
    expect(table).toContain("Person5 X.");
    expect(table).not.toContain("Person6 X.");
  });

  it("builds with a null leader line and empty top", () => {
    const r = motivationEmail({ name: "Z", code: "Z", leaderLine: null, top: [], supportWa: "x" });
    expect(r.html).toContain("</html>");
  });
});

describe("welcomeEmailRich", () => {
  const w = {
    name: "Sana",
    code: "SANA10",
    team: "Team Blue",
    link: "https://example.com/a/tok",
    supportWa: "https://wa.me/1",
    groupWa: "https://chat.whatsapp.com/x",
  };
  it("shows the details, both links and a personal subject", () => {
    const r = welcomeEmailRich(w);
    expect(r.subject).toBe("Sana, your Pharmacozyme affiliate details");
    expect(r.html).toContain("SANA10");
    expect(r.html).toContain("Team Blue");
    expect(r.html).toContain(`href="https://example.com/a/tok"`);
    expect(r.html).toContain(`href="https://chat.whatsapp.com/x"`);
    expect(r.html.replace("<!DOCTYPE html>", "")).not.toContain("!");
  });
  it("escapes values, drops non-https links and includes the message block", () => {
    const r = welcomeEmailRich({ ...w, name: "<b>x</b>", link: "http://bad.com", messageHtml: messageBlockPlain("Hi team") });
    expect(r.html).not.toContain("<b>x");
    expect(r.html).not.toContain("http://bad.com");
    expect(r.html).toContain("Hi team");
  });
});
