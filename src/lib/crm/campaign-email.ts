/**
 * Plain-text-style shell for campaign emails — deliberately NOT the branded
 * card/banner look used elsewhere (welcomeEmailHtml in src/lib/brevo.ts).
 * A colored banner header + boxed card + logo is a template signal Gmail's
 * bulk classifier weighs same as tracking pixels do; this shell reads like
 * a note typed by a person instead. No logo, no background color, no card,
 * left-aligned, system font stack (not a web font — a web font is itself a
 * signal since a personal email client can't render one).
 *
 * The unsubscribe line is injected HERE, by the sender, rather than being
 * written into each campaign body. An admin cannot omit it, which is the
 * point: a bulk send without a working unsubscribe link damages the sending
 * domain's reputation and is not recoverable quickly. Kept as a plain text
 * line, not a styled footer bar, to match the rest of the shell.
 */

export function buildCampaignHtml(opts: { bodyHtml: string; unsubscribeUrl: string }): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;background:#ffffff;margin:0;padding:24px 16px;">
  <div style="max-width:560px;margin:0 auto;color:#222222;line-height:1.6;font-size:15px;">
    ${opts.bodyHtml}
    <p style="color:#767676;font-size:12px;line-height:1.6;margin:32px 0 0;">
      You're getting this because you registered for a PZ Academy program.
      <a href="${opts.unsubscribeUrl}" style="color:#767676;">Unsubscribe</a>
    </p>
  </div>
</body>
</html>`;
}
