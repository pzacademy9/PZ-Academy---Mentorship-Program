/**
 * Branded HTML shell for campaign emails, reusing the palette already used
 * by welcomeEmailHtml in src/lib/brevo.ts.
 *
 * The unsubscribe footer is injected HERE, by the sender, rather than being
 * written into each campaign body. An admin cannot omit it, which is the
 * point: a bulk send without a working unsubscribe link damages the sending
 * domain's reputation and is not recoverable quickly.
 */

export function buildCampaignHtml(opts: { bodyHtml: string; unsubscribeUrl: string }): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:Inter,sans-serif;background:#f2faf5;margin:0;padding:32px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(13,51,32,.10);">
    <div style="background:#0d3320;padding:32px;text-align:center;">
      <h1 style="color:#3ecf70;font-size:24px;margin:0;">PZ Academy</h1>
      <p style="color:#b0f5cc;margin:8px 0 0;">by Pharmacozyme</p>
    </div>
    <div style="padding:32px;color:#527a60;line-height:1.6;font-size:15px;">
      ${opts.bodyHtml}
    </div>
    <div style="padding:0 32px 28px;">
      <hr style="border:none;border-top:1px solid #d6ead9;margin:8px 0 16px;">
      <p style="color:#8aa596;font-size:12px;line-height:1.6;margin:0;">
        You are receiving this because you registered for a PZ Academy program.
        <br>
        <a href="${opts.unsubscribeUrl}" style="color:#527a60;text-decoration:underline;">Unsubscribe</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}
