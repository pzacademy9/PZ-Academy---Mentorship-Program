# Master prompt: writing emails that land in Gmail Primary, not Promotions

Paste this into any AI conversation (or use as a standing system prompt) when
you need it to write or review a bulk/marketing email. Everything in here was
verified against real sends and Brevo/Gmail documentation during the PZ
Academy CRM build (Sept 2026) — not assumed, checked.

## The honest ceiling — read this first

Gmail's Promotions tab exists specifically to catch one-to-many broadcast
mail, and it does this **by design**, independent of authentication quality
or writing quality. Fully authenticated bulk mail from Amazon, LinkedIn,
Airbnb, etc. still lands in Promotions. Nothing below is a guarantee — it's a
set of real, verified levers that maximize the odds. The only thing that
reliably moves an individual sender into a specific recipient's Primary tab
long-term is that recipient's own engagement (opens, replies, manually
dragging the sender to Primary) accumulated across multiple sends. Set
expectations accordingly before optimizing further.

## Prerequisite (not a writing concern, but blocks everything else)

Before any wording advice matters, confirm the sending domain has SPF, DKIM,
and DMARC properly configured and *aligned to the exact From: domain* used to
send (subdomains do not inherit the root domain's SPF — they need their own
record). Verify this in your ESP's own domain-verification dashboard, not by
guessing from public DNS lookups — a sender can look broken from outside DNS
tooling while being genuinely verified inside the ESP. If authentication
isn't clean, fix that first; no amount of good copy compensates for it.

## What to write

1. **No banner, no logo, no colored header block, no "card" layout.** A
   branded visual header is itself a bulk-marketing signal, same category as
   a tracking pixel. Write the email like a plain personal note: white
   background, no boxed container, no drop shadow.
2. **System font stack, not a web font.** `-apple-system, BlinkMacSystemFont,
   Segoe UI, Roboto, sans-serif` — a loaded web font is something a real
   person's plain email client can't do, and reads as templated.
3. **Conversational tone, first person where possible.** Write it the way
   you'd write to one person, not "Dear valued subscriber."
4. **No spam-trigger words/patterns**: avoid "FREE" (especially capitalized
   or repeated), "register now," "click here," "act now," "limited time,"
   "guarantee," "100% free." If you need to mention no cost, work it into a
   sentence naturally ("open to everyone, no cost to attend") rather than as
   a standalone loud word.
5. **No emoji, no ALL CAPS, no exclamation marks** in subject or body. These
   are heavily weighted marketing-tone signals.
6. **One link, not a big colored CTA button.** A plain inline text link reads
   as correspondence; a button reads as a template.
7. **Ask for a reply.** A line like "Reply and let me know if you're coming"
   is the single highest-leverage line you can add — replies are the
   strongest per-recipient signal that exists, stronger than opens or clicks,
   and they're the thing that actually retrains Gmail's classifier for that
   recipient over time.
8. **Sender name should be a person, not just a brand.** "Hamza @ Company"
   reads more personal than "Company Marketing Team." (Changing this is
   often an infra-level decision — see below — not just a copy edit.)
9. **Keep the unsubscribe link.** Removing it to look "more personal" is
   counterproductive: it damages sender reputation long-term and is often a
   legal requirement. Keep it, just don't style it as a loud footer bar —
   a plain small text line is enough.

## What doesn't help (checked and ruled out — don't waste time here)

- **Per-contact tracking-consent flags** (e.g. Brevo's
  `contactPixelTrackingConsent`): these anonymize *who* triggered an open/
  click in the ESP's own reporting. They do **not** remove the tracking pixel
  or stop link-wrapping from the actual email HTML — the artifact Gmail's
  classifier actually sees is unchanged. Confirmed against Brevo's API docs
  directly; don't assume other ESPs differ without checking.
- **Disabling tracking at send time via an API parameter**: most transactional
  email APIs (checked: Brevo) have no such parameter. Tracking on/off, where
  it exists at all, is typically an account-level or per-webhook dashboard
  setting, not something you can toggle per-request in code.
- **A single clean send fixing categorization permanently**: it doesn't.
  Placement is evaluated per-send and shifts gradually with accumulated
  per-recipient engagement, not from one well-written email.

## Sanity check before sending

Read the finished email and ask: if a rushed colleague scanned this in two
seconds, would it look like a personal message to them, or an ad? If it has
a header banner, a button, an emoji, or the word "FREE" in caps, it will not
pass that test regardless of how good the underlying offer is.
