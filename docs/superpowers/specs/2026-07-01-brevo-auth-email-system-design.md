# Production-Grade Brevo Auth Email System Design

**Date:** 2026-07-01  
**Status:** Ready for Implementation  
**Scope:** Replace Supabase SMTP relay with Brevo API + async queue for robust auth emails

---

## 1. Problem Statement

Current system uses Supabase SMTP relay (smtp-relay.brevo.com) to send auth emails. Issues:

1. **Spam folder delivery** — shared IP reputation (77.32.148.27) causes Gmail to filter invites
2. **No retry logic** — failed sends are silent, users don't receive invites
3. **No visibility** — admins can't see which emails failed or why
4. **Synchronous only** — if Brevo is slow/down, auth event blocks briefly
5. **No analytics** — can't track opens, bounces, or delivery issues

**Goal:** Production-grade email system with retries, queue, rate limiting, metrics, and admin visibility.

---

## 2. Solution Overview

### 2.1 Architecture

**Two-layer system:**

**Layer 1: Sync (Auth Hook)**
- Supabase emits auth event (user.invited, user.signed_up, passwordrecovery.created, user.email_change.confirmed)
- Auth Hook POST to Edge Function with event data
- Function validates email + checks rate limit
- Function inserts into `email_queue` table
- Returns immediately (queue item created, email pending)

**Layer 2: Async (Cron + Queue Processor)**
- Cron job runs every 30 seconds
- Queries `email_queue` for pending items
- Batches up to 10 emails per run
- Sends via Brevo API
- On success: mark sent, log metrics
- On failure: increment retry_count, set next_retry timestamp with exponential backoff
- Max 3 retries: 1min → 5min → 30min
- After 3 failures: mark failed, insert error_log for admin alert

**Webhooks (Async)**
- Brevo sends delivery events (open, click, bounce, complaint, delivered) to Edge Function webhook
- Function updates `email_metrics` table
- Admin dashboard queries metrics per user/event type

### 2.2 Data Flow Diagram

```
Auth Event (user.invited, etc.)
    ↓
Supabase Auth Hook
    ↓
Edge Function: send-auth-email (sync)
    ├─ Validate email
    ├─ Rate limit check (100/min)
    ├─ Build email from template
    ├─ Insert into email_queue {status: 'pending', retry_count: 0}
    └─ Return {ok: true}
    ↓
[30s interval]
    ↓
Cron Function: process-email-queue (async)
    ├─ Query email_queue WHERE status='pending' AND next_retry_at <= NOW()
    ├─ Batch 10 items
    ├─ For each:
    │  ├─ Send via Brevo API
    │  ├─ On success: UPDATE status='sent', log_metrics()
    │  ├─ On failure:
    │     ├─ IF retry_count < 3: INCREMENT retry_count, SET next_retry_at
    │     ├─ ELSE: UPDATE status='failed', INSERT auth_email_logs
    └─ Return {processed: N, sent: M, failed: K}
    ↓
Brevo Webhooks (events: delivered, open, click, bounce, complaint)
    ↓
Edge Function: brevo-webhook-handler
    ├─ Verify Brevo signature
    ├─ INSERT into email_metrics {event_type, user_email, timestamp, ...}
    └─ Return {ok: true}
    ↓
Admin Dashboard (Future)
    ├─ Queries email_queue (pending, sent, failed)
    ├─ Queries email_metrics (delivery rate, open rate, bounces)
    ├─ Queries auth_email_logs (errors)
```

---

## 3. Database Schema

### 3.1 `email_queue` Table

Stores all auth emails (pending, sent, failed).

```sql
CREATE TABLE email_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Event metadata
  event_type TEXT NOT NULL, -- 'user.invited' | 'user.signed_up' | 'passwordrecovery.created' | 'user.email_change.confirmed'
  user_id UUID,
  user_email TEXT NOT NULL,
  
  -- Email content
  subject TEXT NOT NULL,
  html_content TEXT NOT NULL,
  
  -- Delivery tracking
  status TEXT NOT NULL DEFAULT 'pending', -- 'pending' | 'sent' | 'failed'
  brevo_message_id TEXT, -- Brevo's response message ID
  
  -- Retry logic
  retry_count INT DEFAULT 0,
  next_retry_at TIMESTAMP,
  last_error TEXT,
  last_error_at TIMESTAMP,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  sent_at TIMESTAMP,
  
  -- Rate limiting (help query optimization)
  created_minute TIMESTAMP DEFAULT DATE_TRUNC('minute', NOW())
);

-- Indexes
CREATE INDEX idx_email_queue_status ON email_queue(status);
CREATE INDEX idx_email_queue_next_retry ON email_queue(next_retry_at) WHERE status='pending';
CREATE INDEX idx_email_queue_created_minute ON email_queue(created_minute);
```

### 3.2 `email_metrics` Table

Brevo webhook events (open, click, bounce, complaint, delivered).

```sql
CREATE TABLE email_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Reference
  email_queue_id UUID REFERENCES email_queue(id),
  user_email TEXT NOT NULL,
  
  -- Event
  event_type TEXT NOT NULL, -- 'delivered' | 'open' | 'click' | 'bounce' | 'complaint' | 'unsubscribe'
  event_timestamp TIMESTAMP NOT NULL,
  
  -- Metadata
  brevo_message_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  bounce_type TEXT, -- 'permanent' | 'temporary' (if bounce)
  complaint_type TEXT, -- ISP complaint reason (if complaint)
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_email_metrics_user_email ON email_metrics(user_email);
CREATE INDEX idx_email_metrics_event_type ON email_metrics(event_type);
CREATE INDEX idx_email_metrics_queue_id ON email_metrics(email_queue_id);
```

### 3.3 `auth_email_logs` Table

Failed emails + errors for admin visibility.

```sql
CREATE TABLE auth_email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  event_type TEXT NOT NULL,
  user_email TEXT NOT NULL,
  
  error_message TEXT NOT NULL,
  error_details JSONB, -- Full Brevo error response
  
  retry_count INT DEFAULT 0,
  final_attempt_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT NOW()
);

-- Index
CREATE INDEX idx_auth_email_logs_user_email ON auth_email_logs(user_email);
```

---

## 4. Email Templates

**File:** `src/lib/email-templates.ts`

Four functions: one per auth event.

### 4.1 Template Principles

- **Clean HTML:** no tracking pixels, no fancy images
- **No tracking redirects:** links are direct, not wrapped in Brevo click-tracking URLs
- **Dark mode safe:** use explicit colors, not transparent backgrounds
- **Unsubscribe link:** include in footer (helps deliverability, required by CAN-SPAM)
- **Plain text fallback:** consider adding for better inbox placement
- **Simple design:** minimal CSS, semantic HTML

### 4.2 Templates

```typescript
// invite-email
inviteEmailHtml(email: string, actionLink: string): string

// signup-confirmation-email
signupConfirmEmailHtml(email: string, actionLink: string): string

// password-reset-email
resetPasswordEmailHtml(email: string, actionLink: string): string

// email-change-confirmation
emailChangeConfirmEmailHtml(email: string, actionLink: string): string
```

Each returns clean HTML string (no tracking pixels, direct links).

---

## 5. Edge Functions

### 5.1 `send-auth-email` (Sync)

**Path:** `supabase/functions/send-auth-email/index.ts`

**Trigger:** Auth Hook on user.invited, user.signed_up, passwordrecovery.created, user.email_change.confirmed

**Input:**
```json
{
  "event": {
    "type": "user.invited|user.signed_up|...",
    "user": {
      "id": "uuid",
      "email": "user@example.com"
    },
    "action_link": "https://..."
  }
}
```

**Logic:**
1. Extract email, event type, action link
2. Validate email (non-empty, valid format)
3. Rate limit check: `SELECT COUNT(*) FROM email_queue WHERE created_minute = DATE_TRUNC('minute', NOW())` > 100? Reject
4. Select template based on event type
5. Build HTML
6. INSERT into email_queue {event_type, user_email, subject, html_content, status='pending'}
7. Return `{ok: true}`

**Error Handling:**
- Invalid email → return `{error: "Invalid email"}`
- Rate limit exceeded → return `{error: "Rate limit exceeded"}`
- DB insert fails → log error, return `{error: "Database error"}`

### 5.2 `process-email-queue` (Cron)

**Path:** `supabase/functions/process-email-queue/index.ts`

**Trigger:** Cron job every 30 seconds

**Logic:**
1. Query `SELECT * FROM email_queue WHERE status='pending' AND (next_retry_at IS NULL OR next_retry_at <= NOW()) LIMIT 10`
2. For each email:
   a. Call Brevo API: `sendTransacEmail({to, subject, htmlContent})`
   b. If success:
      - UPDATE email_queue SET status='sent', brevo_message_id=response.messageId, sent_at=NOW()
      - Log to console: "Email sent: {email}, messageId={id}"
   c. If failure:
      - Check retry_count
      - If < 3: UPDATE email_queue SET retry_count++, next_retry_at=backoff_timestamp(retry_count), last_error=error, last_error_at=NOW()
      - If >= 3: UPDATE email_queue SET status='failed', last_error=error; INSERT into auth_email_logs {event_type, user_email, error_message, error_details, retry_count}
      - Log to console: "Email failed: {email}, retry_count={count}, next_retry={timestamp}"
3. Return `{processed: N, sent: M, failed: K, retry: L}`

**Backoff Logic:**
```
retry_count=0: first attempt (happens in sync function immediately fails)
retry_count=1: wait 1 min
retry_count=2: wait 5 min
retry_count=3: wait 30 min
retry_count>3: mark failed
```

### 5.3 `brevo-webhook-handler` (Webhooks)

**Path:** `supabase/functions/brevo-webhook-handler/index.ts`

**Trigger:** Brevo webhooks (events: delivered, open, click, bounce, complaint, unsubscribe)

**Input:**
```json
{
  "email": "user@example.com",
  "message-id": "uuid",
  "event": "delivered|open|click|bounce|complaint",
  "ts": 1234567890,
  ...
}
```

**Logic:**
1. Verify Brevo signature (HMAC-SHA256 using BREVO_WEBHOOK_SECRET)
2. Extract event data
3. Query email_queue by brevo_message_id to find email_queue_id
4. INSERT into email_metrics {email_queue_id, user_email, event_type, event_timestamp, brevo_message_id, ip_address, user_agent, bounce_type, complaint_type}
5. Return `{ok: true}`

**Note:** Webhook is async and optional — failures don't affect email sending.

---

## 6. Configuration & Secrets

### 6.1 Environment Variables

**In `.env.local`:**
```
BREVO_API_KEY=xxx
BREVO_SENDER_EMAIL=pz@academy.pharmacozyme.com
BREVO_SENDER_NAME=PZ Academy
BREVO_WEBHOOK_SECRET=xxx (from Brevo webhook settings)
```

**In Supabase Edge Function Secrets:**
```
BREVO_API_KEY=xxx
BREVO_WEBHOOK_SECRET=xxx
```

### 6.2 Setup Steps

1. Create `email_queue`, `email_metrics`, `auth_email_logs` tables (migration)
2. Create `src/lib/email-templates.ts` with four template functions
3. Deploy `send-auth-email` Edge Function
4. Deploy `process-email-queue` Edge Function
5. Deploy `brevo-webhook-handler` Edge Function
6. Create Cron job in Supabase: run `process-email-queue` every 30 seconds
7. Configure Brevo webhooks: set URL to brevo-webhook-handler function, select events (delivered, open, click, bounce, complaint)
8. **Disable SMTP in Supabase Auth → SMTP Settings** (toggle off)
9. Create Auth Hook: on user.invited, user.signed_up, passwordrecovery.created, user.email_change.confirmed → POST to send-auth-email

---

## 7. Admin Dashboard (Future)

### 7.1 Queue Status
- Pending emails count + oldest pending
- Failed emails count + recent failures
- Retry queue (next attempts in next hour)

### 7.2 Metrics
- Delivery rate (sent / total)
- Open rate (opened / sent)
- Click rate (clicked / sent)
- Bounce rate (bounced / sent)
- Complaint rate (complaints / sent)

### 7.3 Error Logs
- Recent failures (last 24h)
- User email, event type, error message, retry count

---

## 8. Testing Strategy

### 8.1 Unit Tests

- `email-templates.ts`: render functions produce valid HTML
- Backoff logic: verify retry intervals
- Rate limit logic: verify count > 100 blocks

### 8.2 Integration Tests

- Auth Hook → send-auth-email → email_queue inserted
- Cron → process-email-queue → email sent via Brevo API (mock or staging)
- Brevo webhook → email_metrics inserted

### 8.3 Manual Tests

1. Invite user from admin
2. Check email received in inbox (not spam)
3. Click link, verify auth flow completes
4. Check email_queue table: status='sent'
5. Check email_metrics table: 'delivered' event logged
6. Simulate Brevo failure: set BREVO_API_KEY to invalid
7. Check cron processes queue, marks failed, logs error
8. Fix API key, run cron again, email retries and succeeds

---

## 9. Success Criteria

- [x] Emails sent via Brevo API (not SMTP relay)
- [x] Clean HTML templates (no tracking pixels)
- [x] Async queue system with retries
- [x] Rate limiting (100 emails/min)
- [x] Error logging + admin visibility
- [x] Metrics tracking (delivery, open, click, bounce)
- [x] Cron job processes queue reliably
- [x] Auth event flow: invite → email → received (inbox, not spam)
- [x] Brevo webhooks integrated
- [x] SMTP disabled in Supabase

---

## 10. Implementation Order

1. **Database:** migrations for email_queue, email_metrics, auth_email_logs
2. **Templates:** src/lib/email-templates.ts
3. **Edge Functions:** send-auth-email, process-email-queue, brevo-webhook-handler
4. **Cron:** schedule process-email-queue every 30s
5. **Auth Hooks:** configure in Supabase
6. **Brevo Webhooks:** configure in Brevo
7. **Disable SMTP:** Supabase Auth → SMTP Settings
8. **Manual tests:** verify flow end-to-end
9. **Metrics dashboard:** query email_metrics table (future)

---

## 11. Rollback Plan

If issues arise:

1. **Emergency disable:** keep SMTP configured; Edge Function can fall back to queue → manual processing
2. **Revert to SMTP:** delete Edge Functions, re-enable SMTP (quick, loses queue benefits)
3. **Partial revert:** disable cron (stops retries) but keep sync path (prevents new emails)

---

## 12. Appendix: Brevo API Integration

### 12.1 sendTransacEmail Call

```typescript
import { BrevoClient } from "@getbrevo/brevo";

const brevo = new BrevoClient({ apiKey: process.env.BREVO_API_KEY });

const result = await brevo.transactionalEmails.sendTransacEmail({
  sender: {
    email: process.env.BREVO_SENDER_EMAIL,
    name: process.env.BREVO_SENDER_NAME,
  },
  to: [{ email, name: email.split("@")[0] }],
  subject,
  htmlContent,
  // NO tracking enabled (avoid click-tracking redirects)
  params: {},
});

// result.messageId on success
// throws error on failure
```

### 12.2 Brevo Webhook Signature Verification

```typescript
import { createHmac } from "crypto";

function verifyBrevoSignature(body: string, signature: string): boolean {
  const hash = createHmac("sha256", process.env.BREVO_WEBHOOK_SECRET!)
    .update(body)
    .digest("hex");
  return hash === signature;
}
```

---

**End of Design Document**
