import { buildCampaignHtml } from "@/lib/crm/campaign-email";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Plain-text body to email HTML: escaped, https links clickable, newlines kept. */
export function buildParticipantHtml(opts: { bodyText: string; unsubscribeUrl: string }): string {
  const escaped = escapeHtml(opts.bodyText.replace(/\r\n?/g, "\n"));
  const linked = escaped.replace(/https:\/\/[^\s<]+/g, (url) => {
    // Keep trailing punctuation outside the link.
    const m = url.match(/^(.*?)([.,;:!?)]*)$/)!;
    return `<a href="${m[1]}">${m[1]}</a>${m[2]}`;
  });
  return buildCampaignHtml({ bodyHtml: linked.replace(/\n/g, "<br>"), unsubscribeUrl: opts.unsubscribeUrl });
}
