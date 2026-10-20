import { buildCampaignHtml } from "@/lib/crm/campaign-email";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** Plain-text body to email HTML: escaped, https links clickable, newlines kept. */
export function buildParticipantHtml(opts: { bodyText: string; unsubscribeUrl: string }): string {
  const escaped = escapeHtml(opts.bodyText.replace(/\r\n?/g, "\n"));
  const linked = escaped.replace(/https:\/\/[^\s<]+/g, (url) => {
    // Keep a trailing escaped character (&#39; &quot; &lt; &gt; &amp;) and trailing punctuation outside the link.
    let link = url;
    let tail = "";
    for (;;) {
      const entity = link.match(/&(?:#39|quot|lt|gt|amp);$/);
      if (entity) {
        tail = entity[0] + tail;
        link = link.slice(0, -entity[0].length);
        continue;
      }
      const punct = link.match(/[.,;:!?)]$/);
      if (punct) {
        tail = punct[0] + tail;
        link = link.slice(0, -1);
        continue;
      }
      break;
    }
    return `<a href="${link}">${link}</a>${tail}`;
  });
  return buildCampaignHtml({ bodyHtml: linked.replace(/\n/g, "<br>"), unsubscribeUrl: opts.unsubscribeUrl });
}
