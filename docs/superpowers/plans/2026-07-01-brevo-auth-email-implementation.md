# Brevo Auth Email System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Supabase SMTP relay with Brevo API-based async queue system supporting retries, rate limiting, and email metrics for production-grade auth emails (invites, password reset, email verification, signup confirmation).

**Architecture:** Auth events trigger synchronous Edge Function that validates and enqueues emails to `email_queue` table. Separate Cron job processes queue every 30 seconds, retrying failures with exponential backoff (1min → 5min → 30min). Brevo webhooks update `email_metrics` for delivery/open/click/bounce tracking. Admin visibility via `auth_email_logs` for failed sends.

**Tech Stack:** Supabase (Auth + Edge Functions + Cron + RLS), Brevo API v3, PostgreSQL, TypeScript, Deno runtime

## Global Constraints

- Brevo SDK: @getbrevo/brevo v5.0.4 (already installed)
- Email sender: pz@academy.pharmacozyme.com
- Sender name: PZ Academy
- Rate limit: 100 emails/minute
- Retry backoff: 1min, 5min, 30min (max 3 attempts)
- Cron interval: 30 seconds
- Queue batch size: 10 emails per cron run
- No tracking pixels in HTML emails
- No click-tracking redirects (direct links only)

---

## File Structure

### Database (Migrations)

- Create: `supabase/migrations/[timestamp]_create_email_queue.sql` — email queue with retry tracking
- Create: `supabase/migrations/[timestamp]_create_email_metrics.sql` — Brevo webhook events
- Create: `supabase/migrations/[timestamp]_create_auth_email_logs.sql` — failed email log for admins

### Source Code

- Create: `src/lib/email-templates.ts` — HTML template functions for 4 auth events
- Create: `supabase/functions/send-auth-email/index.ts` — sync Edge Function (Auth Hook target)
- Create: `supabase/functions/process-email-queue/index.ts` — async cron-triggered queue processor
- Create: `supabase/functions/brevo-webhook-handler/index.ts` — webhook endpoint for Brevo events
- Modify: `.env.local` — add BREVO_WEBHOOK_SECRET

### Tests

- Create: `src/lib/__tests__/email-templates.test.ts` — template HTML validation

---

## Task 1: Create Database Migrations

**Files:**
- Create: `supabase/migrations/[timestamp]_create_email_queue.sql`
- Create: `supabase/migrations/[timestamp]_create_email_metrics.sql`
- Create: `supabase/migrations/[timestamp]_create_auth_email_logs.sql`

**Produces:**
- Tables: `email_queue`, `email_metrics`, `auth_email_logs` with indexes
- RLS policies: all tables select/insert enabled for authenticated users + service role

### Steps

- [ ] **Step 1: Create email_queue migration**

Create file: `supabase/migrations/20260701000000_create_email_queue.sql`

```sql
CREATE TABLE email_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Event metadata
  event_type TEXT NOT NULL,
  user_id UUID,
  user_email TEXT NOT NULL,
  
  -- Email content
  subject TEXT NOT NULL,
  html_content TEXT NOT NULL,
  
  -- Delivery tracking
  status TEXT NOT NULL DEFAULT 'pending',
  brevo_message_id TEXT,
  
  -- Retry logic
  retry_count INT DEFAULT 0,
  next_retry_at TIMESTAMP,
  last_error TEXT,
  last_error_at TIMESTAMP,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  sent_at TIMESTAMP,
  created_minute TIMESTAMP DEFAULT DATE_TRUNC('minute', NOW())
);

CREATE INDEX idx_email_queue_status ON email_queue(status);
CREATE INDEX idx_email_queue_next_retry ON email_queue(next_retry_at) WHERE status='pending';
CREATE INDEX idx_email_queue_created_minute ON email_queue(created_minute);

-- RLS
ALTER TABLE email_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service role full access" ON email_queue
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow authenticated users to view own emails" ON email_queue
  FOR SELECT USING (auth.uid() = user_id);
```

- [ ] **Step 2: Create email_metrics migration**

Create file: `supabase/migrations/20260701000001_create_email_metrics.sql`

```sql
CREATE TABLE email_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Reference
  email_queue_id UUID REFERENCES email_queue(id) ON DELETE SET NULL,
  user_email TEXT NOT NULL,
  
  -- Event
  event_type TEXT NOT NULL,
  event_timestamp TIMESTAMP NOT NULL,
  
  -- Metadata
  brevo_message_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  bounce_type TEXT,
  complaint_type TEXT,
  
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_email_metrics_user_email ON email_metrics(user_email);
CREATE INDEX idx_email_metrics_event_type ON email_metrics(event_type);
CREATE INDEX idx_email_metrics_queue_id ON email_metrics(email_queue_id);

-- RLS
ALTER TABLE email_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service role full access" ON email_metrics
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow authenticated users to view own metrics" ON email_metrics
  FOR SELECT USING (user_email = auth.jwt() ->> 'email');
```

- [ ] **Step 3: Create auth_email_logs migration**

Create file: `supabase/migrations/20260701000002_create_auth_email_logs.sql`

```sql
CREATE TABLE auth_email_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  event_type TEXT NOT NULL,
  user_email TEXT NOT NULL,
  
  error_message TEXT NOT NULL,
  error_details JSONB,
  
  retry_count INT DEFAULT 0,
  final_attempt_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_auth_email_logs_user_email ON auth_email_logs(user_email);

-- RLS
ALTER TABLE auth_email_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow service role full access" ON auth_email_logs
  FOR ALL USING (auth.role() = 'service_role');

CREATE POLICY "Allow admins to view" ON auth_email_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
    )
  );
```

- [ ] **Step 4: Apply migrations locally**

Run from `pz-academy-platform/` root:

```bash
supabase migration up
```

Expected: Three migrations applied, no errors.

- [ ] **Step 5: Verify tables created**

Run from `pz-academy-platform/` root:

```bash
supabase db list
```

Expected output includes: `email_queue`, `email_metrics`, `auth_email_logs`

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/
git commit -m "feat: add email queue, metrics, and logs tables with RLS"
```

---

## Task 2: Create Email Templates

**Files:**
- Create: `src/lib/email-templates.ts`
- Create: `src/lib/__tests__/email-templates.test.ts`

**Produces:**
- Export: `inviteEmailHtml(email: string, actionLink: string): string`
- Export: `signupConfirmEmailHtml(email: string, actionLink: string): string`
- Export: `resetPasswordEmailHtml(email: string, actionLink: string): string`
- Export: `emailChangeConfirmEmailHtml(email: string, actionLink: string): string`

### Steps

- [ ] **Step 1: Write template tests**

Create file: `src/lib/__tests__/email-templates.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import {
  inviteEmailHtml,
  signupConfirmEmailHtml,
  resetPasswordEmailHtml,
  emailChangeConfirmEmailHtml,
} from '../email-templates';

describe('email-templates', () => {
  it('inviteEmailHtml produces valid HTML', () => {
    const html = inviteEmailHtml('user@example.com', 'https://example.com/accept');
    expect(html).toContain('<html');
    expect(html).toContain('https://example.com/accept');
    expect(html).toContain('user@example.com');
    expect(html).not.toContain('{{'); // no unresolved templates
  });

  it('signupConfirmEmailHtml produces valid HTML', () => {
    const html = signupConfirmEmailHtml('user@example.com', 'https://example.com/confirm');
    expect(html).toContain('<html');
    expect(html).toContain('https://example.com/confirm');
    expect(html).not.toContain('{{');
  });

  it('resetPasswordEmailHtml produces valid HTML', () => {
    const html = resetPasswordEmailHtml('user@example.com', 'https://example.com/reset');
    expect(html).toContain('<html');
    expect(html).toContain('https://example.com/reset');
    expect(html).not.toContain('{{');
  });

  it('emailChangeConfirmEmailHtml produces valid HTML', () => {
    const html = emailChangeConfirmEmailHtml('user@example.com', 'https://example.com/change');
    expect(html).toContain('<html');
    expect(html).toContain('https://example.com/change');
    expect(html).not.toContain('{{');
  });

  it('templates do not contain tracking pixels', () => {
    const templates = [
      inviteEmailHtml('test@example.com', 'http://x'),
      signupConfirmEmailHtml('test@example.com', 'http://x'),
      resetPasswordEmailHtml('test@example.com', 'http://x'),
      emailChangeConfirmEmailHtml('test@example.com', 'http://x'),
    ];

    templates.forEach(html => {
      expect(html).not.toMatch(/sendibt3\.com/i);
      expect(html).not.toMatch(/pixel|tracking/i);
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm run test -- src/lib/__tests__/email-templates.test.ts
```

Expected: FAIL — "Cannot find module '../email-templates'"

- [ ] **Step 3: Create email-templates.ts with all four functions**

Create file: `src/lib/email-templates.ts`

```typescript
export function inviteEmailHtml(email: string, actionLink: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f7faf5; margin: 0; padding: 20px;">
  <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(15, 61, 34, 0.08);">
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #0f3d22 0%, #194b32 100%); padding: 32px; text-align: center;">
      <h1 style="color: #7ed957; font-size: 24px; font-weight: 700; margin: 0; font-family: 'Montserrat', sans-serif;">PZ Academy</h1>
      <p style="color: #c8f0a0; margin: 8px 0 0; font-size: 14px;">by Pharmacozyme</p>
    </div>

    <!-- Body -->
    <div style="padding: 32px;">
      <h2 style="color: #0f3d22; font-size: 20px; font-weight: 600; margin: 0 0 16px; font-family: 'Montserrat', sans-serif;">You've been invited</h2>
      <p style="color: #4d6b54; line-height: 1.6; margin: 0 0 24px; font-size: 14px;">
        You've been invited to join PZ Academy. Click the button below to accept and create your account.
      </p>

      <!-- CTA Button -->
      <div style="text-align: center; margin: 32px 0;">
        <a href="${actionLink}" style="background: #7ed957; color: #0f3d22; font-weight: 600; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-size: 14px; display: inline-block; font-family: 'Montserrat', sans-serif;">
          Accept Invitation →
        </a>
      </div>

      <p style="color: #4d6b54; font-size: 12px; line-height: 1.6; margin: 24px 0 0;">
        This link expires in 24 hours. If you didn't expect this invitation, you can safely ignore this email.
      </p>

      <!-- Footer -->
      <hr style="border: none; border-top: 1px solid #d4eacc; margin: 24px 0;">
      <p style="color: #4d6b54; font-size: 12px; margin: 0;">
        <strong>Need help?</strong> WhatsApp us: <a href="https://wa.me/923700199429" style="color: #0f3d22; text-decoration: none;">+92 370 019 9429</a>
      </p>
      <p style="color: #4d6b54; font-size: 12px; margin: 8px 0 0;">
        <a href="https://pz-academy.pharmacozyme.com" style="color: #0f3d22; text-decoration: none;">Visit PZ Academy</a>
      </p>
    </div>
  </div>
</body>
</html>
  `;
}

export function signupConfirmEmailHtml(email: string, actionLink: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f7faf5; margin: 0; padding: 20px;">
  <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(15, 61, 34, 0.08);">
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #0f3d22 0%, #194b32 100%); padding: 32px; text-align: center;">
      <h1 style="color: #7ed957; font-size: 24px; font-weight: 700; margin: 0; font-family: 'Montserrat', sans-serif;">PZ Academy</h1>
      <p style="color: #c8f0a0; margin: 8px 0 0; font-size: 14px;">by Pharmacozyme</p>
    </div>

    <!-- Body -->
    <div style="padding: 32px;">
      <h2 style="color: #0f3d22; font-size: 20px; font-weight: 600; margin: 0 0 16px; font-family: 'Montserrat', sans-serif;">Verify your email</h2>
      <p style="color: #4d6b54; line-height: 1.6; margin: 0 0 24px; font-size: 14px;">
        Thank you for signing up! Please verify your email address to complete your registration.
      </p>

      <!-- CTA Button -->
      <div style="text-align: center; margin: 32px 0;">
        <a href="${actionLink}" style="background: #7ed957; color: #0f3d22; font-weight: 600; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-size: 14px; display: inline-block; font-family: 'Montserrat', sans-serif;">
          Verify Email →
        </a>
      </div>

      <p style="color: #4d6b54; font-size: 12px; line-height: 1.6; margin: 24px 0 0;">
        This link expires in 24 hours. If you didn't create this account, you can safely ignore this email.
      </p>

      <!-- Footer -->
      <hr style="border: none; border-top: 1px solid #d4eacc; margin: 24px 0;">
      <p style="color: #4d6b54; font-size: 12px; margin: 0;">
        <strong>Need help?</strong> WhatsApp us: <a href="https://wa.me/923700199429" style="color: #0f3d22; text-decoration: none;">+92 370 019 9429</a>
      </p>
    </div>
  </div>
</body>
</html>
  `;
}

export function resetPasswordEmailHtml(email: string, actionLink: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f7faf5; margin: 0; padding: 20px;">
  <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(15, 61, 34, 0.08);">
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #0f3d22 0%, #194b32 100%); padding: 32px; text-align: center;">
      <h1 style="color: #7ed957; font-size: 24px; font-weight: 700; margin: 0; font-family: 'Montserrat', sans-serif;">PZ Academy</h1>
      <p style="color: #c8f0a0; margin: 8px 0 0; font-size: 14px;">by Pharmacozyme</p>
    </div>

    <!-- Body -->
    <div style="padding: 32px;">
      <h2 style="color: #0f3d22; font-size: 20px; font-weight: 600; margin: 0 0 16px; font-family: 'Montserrat', sans-serif;">Reset your password</h2>
      <p style="color: #4d6b54; line-height: 1.6; margin: 0 0 24px; font-size: 14px;">
        We received a request to reset your password. Click the button below to set a new password.
      </p>

      <!-- CTA Button -->
      <div style="text-align: center; margin: 32px 0;">
        <a href="${actionLink}" style="background: #7ed957; color: #0f3d22; font-weight: 600; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-size: 14px; display: inline-block; font-family: 'Montserrat', sans-serif;">
          Reset Password →
        </a>
      </div>

      <p style="color: #4d6b54; font-size: 12px; line-height: 1.6; margin: 24px 0 0;">
        This link expires in 1 hour. If you didn't request a password reset, please ignore this email and your account will remain secure.
      </p>

      <!-- Footer -->
      <hr style="border: none; border-top: 1px solid #d4eacc; margin: 24px 0;">
      <p style="color: #4d6b54; font-size: 12px; margin: 0;">
        <strong>Need help?</strong> WhatsApp us: <a href="https://wa.me/923700199429" style="color: #0f3d22; text-decoration: none;">+92 370 019 9429</a>
      </p>
    </div>
  </div>
</body>
</html>
  `;
}

export function emailChangeConfirmEmailHtml(email: string, actionLink: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f7faf5; margin: 0; padding: 20px;">
  <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(15, 61, 34, 0.08);">
    
    <!-- Header -->
    <div style="background: linear-gradient(135deg, #0f3d22 0%, #194b32 100%); padding: 32px; text-align: center;">
      <h1 style="color: #7ed957; font-size: 24px; font-weight: 700; margin: 0; font-family: 'Montserrat', sans-serif;">PZ Academy</h1>
      <p style="color: #c8f0a0; margin: 8px 0 0; font-size: 14px;">by Pharmacozyme</p>
    </div>

    <!-- Body -->
    <div style="padding: 32px;">
      <h2 style="color: #0f3d22; font-size: 20px; font-weight: 600; margin: 0 0 16px; font-family: 'Montserrat', sans-serif;">Confirm your new email</h2>
      <p style="color: #4d6b54; line-height: 1.6; margin: 0 0 24px; font-size: 14px;">
        You requested to change your email address to <strong>${email}</strong>. Click the button below to confirm this change.
      </p>

      <!-- CTA Button -->
      <div style="text-align: center; margin: 32px 0;">
        <a href="${actionLink}" style="background: #7ed957; color: #0f3d22; font-weight: 600; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-size: 14px; display: inline-block; font-family: 'Montserrat', sans-serif;">
          Confirm Email Change →
        </a>
      </div>

      <p style="color: #4d6b54; font-size: 12px; line-height: 1.6; margin: 24px 0 0;">
        This link expires in 24 hours. If you didn't request this change, please ignore this email.
      </p>

      <!-- Footer -->
      <hr style="border: none; border-top: 1px solid #d4eacc; margin: 24px 0;">
      <p style="color: #4d6b54; font-size: 12px; margin: 0;">
        <strong>Need help?</strong> WhatsApp us: <a href="https://wa.me/923700199429" style="color: #0f3d22; text-decoration: none;">+92 370 019 9429</a>
      </p>
    </div>
  </div>
</body>
</html>
  `;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npm run test -- src/lib/__tests__/email-templates.test.ts
```

Expected: PASS — all 5 tests pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/email-templates.ts src/lib/__tests__/email-templates.test.ts
git commit -m "feat: add email template functions for 4 auth events"
```

---

## Task 3: Create send-auth-email Edge Function

**Files:**
- Create: `supabase/functions/send-auth-email/index.ts`

**Consumes:**
- `email-templates.ts` (not directly, but matches function names)
- `email_queue` table (insert)

**Produces:**
- HTTP endpoint: `POST /functions/v1/send-auth-email`
- Input: `{event: {type: string, user: {id, email}, action_link: string}}`
- Output: `{ok: true}` or `{error: string}`

### Steps

- [ ] **Step 1: Create send-auth-email function skeleton**

Create file: `supabase/functions/send-auth-email/index.ts`

```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  // CORS headers
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  try {
    const { event } = await req.json();

    // Validate input
    if (!event?.user?.email || !event?.action_link) {
      return new Response(
        JSON.stringify({ error: "Missing email or action_link" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const email = event.user.email;
    const actionLink = event.action_link;
    const eventType = event.type;

    // Rate limit check
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
    const { count, error: countError } = await supabase
      .from("email_queue")
      .select("*", { count: "exact", head: true })
      .gte("created_at", oneMinuteAgo);

    if (countError) {
      console.error("Rate limit check error:", countError);
      return new Response(
        JSON.stringify({ error: "Rate limit check failed" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if ((count || 0) > 100) {
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded (100/min)" }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }

    // Build HTML based on event type
    let subject = "";
    let htmlContent = "";

    if (eventType === "user.invited") {
      subject = "You've been invited to PZ Academy";
      htmlContent = inviteEmailHtml(email, actionLink);
    } else if (eventType === "user.signed_up") {
      subject = "Verify your email - PZ Academy";
      htmlContent = signupConfirmEmailHtml(email, actionLink);
    } else if (eventType === "passwordrecovery.created") {
      subject = "Reset your password - PZ Academy";
      htmlContent = resetPasswordEmailHtml(email, actionLink);
    } else if (eventType === "user.email_change.confirmed") {
      subject = "Confirm your new email - PZ Academy";
      htmlContent = emailChangeConfirmEmailHtml(email, actionLink);
    } else {
      return new Response(
        JSON.stringify({ error: `Unknown event type: ${eventType}` }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Insert into email_queue
    const { error: insertError } = await supabase
      .from("email_queue")
      .insert({
        event_type: eventType,
        user_id: event.user.id,
        user_email: email,
        subject,
        html_content: htmlContent,
        status: "pending",
      });

    if (insertError) {
      console.error("Queue insert error:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to queue email" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`Email queued: ${eventType} to ${email}`);

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("send-auth-email error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

// Template functions (copied from email-templates.ts)
function inviteEmailHtml(email: string, actionLink: string): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body style="font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f7faf5; margin: 0; padding: 20px;"><div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(15, 61, 34, 0.08);"><div style="background: linear-gradient(135deg, #0f3d22 0%, #194b32 100%); padding: 32px; text-align: center;"><h1 style="color: #7ed957; font-size: 24px; font-weight: 700; margin: 0; font-family: 'Montserrat', sans-serif;">PZ Academy</h1><p style="color: #c8f0a0; margin: 8px 0 0; font-size: 14px;">by Pharmacozyme</p></div><div style="padding: 32px;"><h2 style="color: #0f3d22; font-size: 20px; font-weight: 600; margin: 0 0 16px; font-family: 'Montserrat', sans-serif;">You've been invited</h2><p style="color: #4d6b54; line-height: 1.6; margin: 0 0 24px; font-size: 14px;">You've been invited to join PZ Academy. Click the button below to accept and create your account.</p><div style="text-align: center; margin: 32px 0;"><a href="${actionLink}" style="background: #7ed957; color: #0f3d22; font-weight: 600; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-size: 14px; display: inline-block; font-family: 'Montserrat', sans-serif;">Accept Invitation →</a></div><p style="color: #4d6b54; font-size: 12px; line-height: 1.6; margin: 24px 0 0;">This link expires in 24 hours. If you didn't expect this invitation, you can safely ignore this email.</p><hr style="border: none; border-top: 1px solid #d4eacc; margin: 24px 0;"><p style="color: #4d6b54; font-size: 12px; margin: 0;"><strong>Need help?</strong> WhatsApp us: <a href="https://wa.me/923700199429" style="color: #0f3d22; text-decoration: none;">+92 370 019 9429</a></p><p style="color: #4d6b54; font-size: 12px; margin: 8px 0 0;"><a href="https://pz-academy.pharmacozyme.com" style="color: #0f3d22; text-decoration: none;">Visit PZ Academy</a></p></div></div></body></html>`;
}

function signupConfirmEmailHtml(email: string, actionLink: string): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body style="font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f7faf5; margin: 0; padding: 20px;"><div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(15, 61, 34, 0.08);"><div style="background: linear-gradient(135deg, #0f3d22 0%, #194b32 100%); padding: 32px; text-align: center;"><h1 style="color: #7ed957; font-size: 24px; font-weight: 700; margin: 0; font-family: 'Montserrat', sans-serif;">PZ Academy</h1><p style="color: #c8f0a0; margin: 8px 0 0; font-size: 14px;">by Pharmacozyme</p></div><div style="padding: 32px;"><h2 style="color: #0f3d22; font-size: 20px; font-weight: 600; margin: 0 0 16px; font-family: 'Montserrat', sans-serif;">Verify your email</h2><p style="color: #4d6b54; line-height: 1.6; margin: 0 0 24px; font-size: 14px;">Thank you for signing up! Please verify your email address to complete your registration.</p><div style="text-align: center; margin: 32px 0;"><a href="${actionLink}" style="background: #7ed957; color: #0f3d22; font-weight: 600; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-size: 14px; display: inline-block; font-family: 'Montserrat', sans-serif;">Verify Email →</a></div><p style="color: #4d6b54; font-size: 12px; line-height: 1.6; margin: 24px 0 0;">This link expires in 24 hours. If you didn't create this account, you can safely ignore this email.</p><hr style="border: none; border-top: 1px solid #d4eacc; margin: 24px 0;"><p style="color: #4d6b54; font-size: 12px; margin: 0;"><strong>Need help?</strong> WhatsApp us: <a href="https://wa.me/923700199429" style="color: #0f3d22; text-decoration: none;">+92 370 019 9429</a></p></div></div></body></html>`;
}

function resetPasswordEmailHtml(email: string, actionLink: string): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body style="font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f7faf5; margin: 0; padding: 20px;"><div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(15, 61, 34, 0.08);"><div style="background: linear-gradient(135deg, #0f3d22 0%, #194b32 100%); padding: 32px; text-align: center;"><h1 style="color: #7ed957; font-size: 24px; font-weight: 700; margin: 0; font-family: 'Montserrat', sans-serif;">PZ Academy</h1><p style="color: #c8f0a0; margin: 8px 0 0; font-size: 14px;">by Pharmacozyme</p></div><div style="padding: 32px;"><h2 style="color: #0f3d22; font-size: 20px; font-weight: 600; margin: 0 0 16px; font-family: 'Montserrat', sans-serif;">Reset your password</h2><p style="color: #4d6b54; line-height: 1.6; margin: 0 0 24px; font-size: 14px;">We received a request to reset your password. Click the button below to set a new password.</p><div style="text-align: center; margin: 32px 0;"><a href="${actionLink}" style="background: #7ed957; color: #0f3d22; font-weight: 600; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-size: 14px; display: inline-block; font-family: 'Montserrat', sans-serif;">Reset Password →</a></div><p style="color: #4d6b54; font-size: 12px; line-height: 1.6; margin: 24px 0 0;">This link expires in 1 hour. If you didn't request a password reset, please ignore this email and your account will remain secure.</p><hr style="border: none; border-top: 1px solid #d4eacc; margin: 24px 0;"><p style="color: #4d6b54; font-size: 12px; margin: 0;"><strong>Need help?</strong> WhatsApp us: <a href="https://wa.me/923700199429" style="color: #0f3d22; text-decoration: none;">+92 370 019 9429</a></p></div></div></body></html>`;
}

function emailChangeConfirmEmailHtml(email: string, actionLink: string): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head><body style="font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f7faf5; margin: 0; padding: 20px;"><div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 2px 8px rgba(15, 61, 34, 0.08);"><div style="background: linear-gradient(135deg, #0f3d22 0%, #194b32 100%); padding: 32px; text-align: center;"><h1 style="color: #7ed957; font-size: 24px; font-weight: 700; margin: 0; font-family: 'Montserrat', sans-serif;">PZ Academy</h1><p style="color: #c8f0a0; margin: 8px 0 0; font-size: 14px;">by Pharmacozyme</p></div><div style="padding: 32px;"><h2 style="color: #0f3d22; font-size: 20px; font-weight: 600; margin: 0 0 16px; font-family: 'Montserrat', sans-serif;">Confirm your new email</h2><p style="color: #4d6b54; line-height: 1.6; margin: 0 0 24px; font-size: 14px;">You requested to change your email address to <strong>${email}</strong>. Click the button below to confirm this change.</p><div style="text-align: center; margin: 32px 0;"><a href="${actionLink}" style="background: #7ed957; color: #0f3d22; font-weight: 600; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-size: 14px; display: inline-block; font-family: 'Montserrat', sans-serif;">Confirm Email Change →</a></div><p style="color: #4d6b54; font-size: 12px; line-height: 1.6; margin: 24px 0 0;">This link expires in 24 hours. If you didn't request this change, please ignore this email.</p><hr style="border: none; border-top: 1px solid #d4eacc; margin: 24px 0;"><p style="color: #4d6b54; font-size: 12px; margin: 0;"><strong>Need help?</strong> WhatsApp us: <a href="https://wa.me/923700199429" style="color: #0f3d22; text-decoration: none;">+92 370 019 9429</a></p></div></div></body></html>`;
}
```

- [ ] **Step 2: Test deployment locally**

```bash
supabase functions deploy send-auth-email
```

Expected: Function deployed successfully to `http://localhost:54321/functions/v1/send-auth-email`

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/send-auth-email/
git commit -m "feat: create send-auth-email edge function with rate limiting and queue"
```

---

## Task 4: Create process-email-queue Edge Function

**Files:**
- Create: `supabase/functions/process-email-queue/index.ts`

**Consumes:**
- `email_queue` table (read pending, update sent/failed)
- `auth_email_logs` table (insert on failure after retries)
- Brevo API (send)

**Produces:**
- HTTP endpoint: `POST /functions/v1/process-email-queue`
- Output: `{processed: N, sent: M, failed: K, retry: L}`

### Steps

- [ ] **Step 1: Create process-email-queue function**

Create file: `supabase/functions/process-email-queue/index.ts`

```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { BrevoClient } from "https://esm.sh/@getbrevo/brevo@5";

const brevo = new BrevoClient({
  apiKey: Deno.env.get("BREVO_API_KEY")!,
});

interface EmailQueueItem {
  id: string;
  user_email: string;
  subject: string;
  html_content: string;
  retry_count: number;
  event_type: string;
}

function getNextRetryTime(retryCount: number): Date {
  const now = new Date();
  if (retryCount === 1) {
    return new Date(now.getTime() + 60 * 1000); // 1 min
  } else if (retryCount === 2) {
    return new Date(now.getTime() + 5 * 60 * 1000); // 5 min
  } else if (retryCount === 3) {
    return new Date(now.getTime() + 30 * 60 * 1000); // 30 min
  }
  return now;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Query pending emails
    const now = new Date().toISOString();
    const { data: pendingEmails, error: queryError } = await supabase
      .from("email_queue")
      .select("*")
      .eq("status", "pending")
      .or(`next_retry_at.is.null,next_retry_at.lte.${now}`)
      .limit(10);

    if (queryError) {
      console.error("Queue query error:", queryError);
      return new Response(
        JSON.stringify({ error: "Failed to query queue" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    let sent = 0;
    let failed = 0;
    let retry = 0;

    for (const email of (pendingEmails || []) as EmailQueueItem[]) {
      try {
        // Send via Brevo
        const result = await brevo.transactionalEmails.sendTransacEmail({
          sender: {
            email: Deno.env.get("BREVO_SENDER_EMAIL")!,
            name: Deno.env.get("BREVO_SENDER_NAME")!,
          },
          to: [{ email: email.user_email }],
          subject: email.subject,
          htmlContent: email.html_content,
        });

        // Update to sent
        await supabase
          .from("email_queue")
          .update({
            status: "sent",
            brevo_message_id: result.messageId,
            sent_at: new Date().toISOString(),
          })
          .eq("id", email.id);

        console.log(`✓ Email sent: ${email.user_email} (${email.event_type})`);
        sent++;
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        const nextRetryCount = email.retry_count + 1;

        if (nextRetryCount < 4) {
          // Retry
          const nextRetryTime = getNextRetryTime(nextRetryCount);
          await supabase
            .from("email_queue")
            .update({
              retry_count: nextRetryCount,
              next_retry_at: nextRetryTime.toISOString(),
              last_error: errorMsg,
              last_error_at: new Date().toISOString(),
            })
            .eq("id", email.id);

          console.log(
            `↻ Email retry queued: ${email.user_email}, retry_count=${nextRetryCount}, next_retry=${nextRetryTime.toISOString()}`
          );
          retry++;
        } else {
          // Failed permanently
          await supabase
            .from("email_queue")
            .update({
              status: "failed",
              last_error: errorMsg,
              last_error_at: new Date().toISOString(),
            })
            .eq("id", email.id);

          await supabase.from("auth_email_logs").insert({
            event_type: email.event_type,
            user_email: email.user_email,
            error_message: errorMsg,
            error_details: { original_error: errorMsg },
            retry_count: nextRetryCount,
            final_attempt_at: new Date().toISOString(),
          });

          console.error(
            `✗ Email failed permanently: ${email.user_email} (${email.event_type})`
          );
          failed++;
        }
      }
    }

    return new Response(
      JSON.stringify({
        processed: (pendingEmails || []).length,
        sent,
        failed,
        retry,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("process-email-queue error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
```

- [ ] **Step 2: Test deployment**

```bash
supabase functions deploy process-email-queue
```

Expected: Function deployed to `http://localhost:54321/functions/v1/process-email-queue`

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/process-email-queue/
git commit -m "feat: create process-email-queue cron function with retry backoff"
```

---

## Task 5: Create brevo-webhook-handler Edge Function

**Files:**
- Create: `supabase/functions/brevo-webhook-handler/index.ts`

**Consumes:**
- `email_queue` table (query by brevo_message_id)
- `email_metrics` table (insert)
- Brevo webhook signature (verify)

**Produces:**
- HTTP endpoint: `POST /functions/v1/brevo-webhook-handler`
- Output: `{ok: true}`

### Steps

- [ ] **Step 1: Create brevo-webhook-handler function**

Create file: `supabase/functions/brevo-webhook-handler/index.ts`

```typescript
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function verifyBrevoSignature(body: string, signature: string): boolean {
  const crypto = await Deno.crypto;
  const key = new TextEncoder().encode(Deno.env.get("BREVO_WEBHOOK_SECRET")!);
  const signatureBytes = await crypto.subtle.sign("HMAC", await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]), new TextEncoder().encode(body));
  
  const hex = Array.from(new Uint8Array(signatureBytes))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  
  return hex === signature;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { "Access-Control-Allow-Origin": "*" } });
  }

  try {
    const body = await req.text();
    const signature = req.headers.get("x-brevo-signature");

    if (!signature || !verifyBrevoSignature(body, signature)) {
      console.warn("Invalid Brevo signature");
      return new Response(
        JSON.stringify({ error: "Invalid signature" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const event = JSON.parse(body);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Find email_queue item by message-id
    const { data: emailQueue } = await supabase
      .from("email_queue")
      .select("id")
      .eq("brevo_message_id", event["message-id"])
      .single();

    // Insert into email_metrics
    const { error: insertError } = await supabase
      .from("email_metrics")
      .insert({
        email_queue_id: emailQueue?.id,
        user_email: event.email,
        event_type: event.event,
        event_timestamp: new Date(event.ts * 1000).toISOString(),
        brevo_message_id: event["message-id"],
        ip_address: event.ip || null,
        user_agent: event["user-agent"] || null,
        bounce_type: event["bounce_type"] || null,
        complaint_type: event["complaint_type"] || null,
      });

    if (insertError) {
      console.error("Metrics insert error:", insertError);
    } else {
      console.log(`✓ Metrics recorded: ${event.email} - ${event.event}`);
    }

    return new Response(
      JSON.stringify({ ok: true }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("brevo-webhook-handler error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
```

- [ ] **Step 2: Test deployment**

```bash
supabase functions deploy brevo-webhook-handler
```

Expected: Function deployed

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/brevo-webhook-handler/
git commit -m "feat: create brevo-webhook-handler for metrics tracking"
```

---

## Task 6: Configure Cron Job

**Scope:** Set up Supabase Cron scheduler to run process-email-queue every 30 seconds

### Steps

- [ ] **Step 1: Verify cron extension enabled in Supabase**

Visit Supabase Dashboard → Project → Database → Extensions

Check: `pg_cron` is installed. If not, enable it.

Expected: pg_cron listed under Extensions

- [ ] **Step 2: Add cron job via Supabase dashboard**

Supabase Dashboard → Scheduled Jobs (or SQL Editor)

Run:

```sql
SELECT cron.schedule(
  'process-email-queue',
  '30 seconds',
  'SELECT net.http_post(
    url:=current_setting(''app.functions_url'') || ''/process-email-queue'',
    headers:=jsonb_build_object(
      ''Authorization'', ''Bearer '' || current_setting(''app.anon_key''),
      ''Content-Type'', ''application/json''
    ),
    body:=jsonb_build_object(),
    timeout_milliseconds:=30000
  ) as request_id;'
);
```

Expected: Cron job created, runs every 30 seconds

**Alternative:** If using Supabase CLI:

```bash
# Check in Supabase dashboard Scheduled Jobs panel
# (No direct CLI command; configure via dashboard)
```

- [ ] **Step 3: Test cron by checking logs**

Wait 30+ seconds, then check Edge Function logs in Supabase Dashboard.

Expected: `process-email-queue` invoked every 30 seconds with output `{processed: 0, sent: 0, failed: 0, retry: 0}`

---

## Task 7: Configure Auth Hooks

**Scope:** Wire Supabase Auth events to send-auth-email Edge Function

### Steps

- [ ] **Step 1: Get send-auth-email function URL**

Supabase Dashboard → Edge Functions → send-auth-email → copy URL

Example: `https://whqdasotjlhvrjmgiffk.functions.supabase.co/send-auth-email`

- [ ] **Step 2: Create Auth Hook for user.invited**

Supabase Dashboard → Authentication → Hooks

Click "+ Create a new hook"

- Name: `send-auth-email-invited`
- Event: `user.invited`
- HTTP method: `POST`
- URL: `https://whqdasotjlhvrjmgiffk.functions.supabase.co/send-auth-email`
- Headers:
  - `Content-Type: application/json`
- Request body template:

```json
{
  "event": {
    "type": "user.invited",
    "user": {
      "id": "{{ .user.id }}",
      "email": "{{ .user.email }}"
    },
    "action_link": "{{ .data.action_link }}"
  }
}
```

Click Save

- [ ] **Step 3: Create Auth Hook for user.signed_up**

Create new hook:

- Name: `send-auth-email-signup`
- Event: `user.signed_up`
- URL: (same as above)
- Body:

```json
{
  "event": {
    "type": "user.signed_up",
    "user": {
      "id": "{{ .user.id }}",
      "email": "{{ .user.email }}"
    },
    "action_link": "{{ .data.confirmation_url }}"
  }
}
```

- [ ] **Step 4: Create Auth Hook for passwordrecovery.created**

Create new hook:

- Name: `send-auth-email-reset`
- Event: `passwordrecovery.created`
- URL: (same)
- Body:

```json
{
  "event": {
    "type": "passwordrecovery.created",
    "user": {
      "id": "{{ .user.id }}",
      "email": "{{ .user.email }}"
    },
    "action_link": "{{ .data.recovery_link }}"
  }
}
```

- [ ] **Step 5: Create Auth Hook for user.email_change.confirmed**

Create new hook:

- Name: `send-auth-email-change-confirm`
- Event: `user.email_change.confirmed`
- URL: (same)
- Body:

```json
{
  "event": {
    "type": "user.email_change.confirmed",
    "user": {
      "id": "{{ .user.id }}",
      "email": "{{ .data.new_email }}"
    },
    "action_link": "{{ .data.confirmation_url }}"
  }
}
```

Click Save for each hook.

Expected: 4 hooks created in Supabase Dashboard

---

## Task 8: Configure Brevo Webhooks

**Scope:** Wire Brevo delivery events to brevo-webhook-handler

### Steps

- [ ] **Step 1: Get brevo-webhook-handler URL**

Supabase Dashboard → Edge Functions → brevo-webhook-handler → copy URL

Example: `https://whqdasotjlhvrjmgiffk.functions.supabase.co/brevo-webhook-handler`

- [ ] **Step 2: Add webhook in Brevo**

Brevo Dashboard → Settings → Webhooks

Click "Add a new webhook"

- URL: `https://whqdasotjlhvrjmgiffk.functions.supabase.co/brevo-webhook-handler`
- Events: Select `delivered`, `open`, `click`, `bounce`, `complaint`, `unsubscribe`
- Click Save

Expected: Webhook created, shows URL and events

- [ ] **Step 3: Copy Brevo webhook secret**

Brevo Dashboard → Settings → Webhooks → click webhook → copy "API Key" or "Secret"

Add to `.env.local`:

```
BREVO_WEBHOOK_SECRET=xxx
```

Also add to Supabase Edge Function secrets:

```bash
supabase secrets set BREVO_WEBHOOK_SECRET=xxx
```

---

## Task 9: Disable SMTP in Supabase

**Scope:** Turn off SMTP relay, use Edge Functions only

### Steps

- [ ] **Step 1: Disable SMTP in Supabase Auth**

Supabase Dashboard → Authentication → Email Templates → SMTP Settings

Toggle "Enable custom SMTP" to **OFF**

Expected: SMTP fields grayed out

- [ ] **Step 2: Verify no SMTP config remains**

Supabase Dashboard → Authentication → Email Templates

Confirm: all email templates are now template code (not SMTP-based)

---

## Task 10: End-to-End Manual Test

**Scope:** Verify full flow: invite → email queued → cron processes → delivered

### Steps

- [ ] **Step 1: Invite a test user**

Supabase Dashboard → Authentication → Users → Add user manually

Email: `test-invite@example.com` (use a real email you can check)

Click "Send invite email"

Expected: User created, invite sent

- [ ] **Step 2: Check email_queue table**

Supabase Dashboard → SQL Editor

```sql
SELECT * FROM email_queue WHERE user_email = 'test-invite@example.com';
```

Expected: 1 row, `status='pending'`

- [ ] **Step 3: Manually trigger cron (or wait 30s)**

Option A: Call function via HTTP:

```bash
curl -X POST https://whqdasotjlhvrjmgiffk.functions.supabase.co/process-email-queue \
  -H "Authorization: Bearer $(supabase status | grep 'anon key' | awk '{print $NF}')" \
  -H "Content-Type: application/json"
```

Option B: Wait 30 seconds for cron to trigger automatically.

Expected: Response `{processed: 1, sent: 1, failed: 0, retry: 0}`

- [ ] **Step 4: Check email_queue status**

```sql
SELECT * FROM email_queue WHERE user_email = 'test-invite@example.com';
```

Expected: `status='sent'`, `brevo_message_id` populated, `sent_at` set

- [ ] **Step 5: Check inbox**

Check test-invite@example.com inbox (and spam folder).

Expected: Email received in **inbox (not spam)**

Subject: "You've been invited to PZ Academy"

- [ ] **Step 6: Verify email content**

Open email, verify:
- Clean HTML layout
- No tracking pixels
- Invite link present
- PZ Academy branding (colors, fonts)
- No spam signals

Expected: Professional, clean email

- [ ] **Step 7: Check email_metrics (optional)**

Once you open email in Gmail/Outlook:

```sql
SELECT * FROM email_metrics WHERE user_email = 'test-invite@example.com';
```

Expected: `event_type='delivered'` and/or `'open'` rows appear (within minutes, as Brevo sends webhooks)

- [ ] **Step 8: Test failure scenario (optional)**

Simulate Brevo API failure:

1. Set invalid `BREVO_API_KEY` in Supabase secrets
2. Invite another user
3. Cron processes queue
4. Email marked for retry (retry_count=1, next_retry in 1 min)
5. Check `email_queue`: `status='pending'`, `retry_count=1`

Expected: Error logged, email queued for retry

- [ ] **Step 9: Commit test results**

```bash
git log --oneline -n 10
```

Expected: 6+ commits (migrations, templates, 3 functions, configs)

All code working, email delivered to inbox.

---

## Summary

**Files Created:**
- 3 database migrations
- 1 email templates library
- 3 Edge Functions
- Configuration: Cron, Auth Hooks, Brevo webhooks, SMTP disabled

**Deliverable:**
- Production-grade async email system with retries, rate limiting, and metrics
- All auth emails (invite, signup, reset, email change) sent via Brevo API
- Admin visibility via `auth_email_logs` and `email_metrics`
- End-to-end tested: invite → queue → send → inbox

**Next Steps (Future):**
- Admin dashboard querying `email_metrics` for delivery/open/bounce rates
- Alert system for failed emails in `auth_email_logs`
- A/B testing email templates via Brevo template system

