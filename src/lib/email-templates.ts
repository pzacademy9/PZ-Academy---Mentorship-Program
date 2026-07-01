/**
 * Email template functions for authentication events.
 * These templates are clean, professional HTML with no tracking pixels.
 * Uses PZ Academy brand colors: deep green #0f3d22, bright green #7ed957, pale green #c8f0a0
 */

const brandColors = {
  deepGreen: "#0f3d22",
  brightGreen: "#7ed957",
  paleGreen: "#c8f0a0",
  darkGray: "#333333",
  lightGray: "#666666",
  border: "#e0e0e0",
};

const baseStyles = `
  font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  color: ${brandColors.darkGray};
  line-height: 1.6;
`;

const headingStyles = `
  font-family: 'Montserrat', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  font-weight: 600;
  color: ${brandColors.deepGreen};
`;

/**
 * Email template for user invitation
 */
export function inviteEmailHtml(email: string, actionLink: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're Invited to PZ Academy</title>
</head>
<body style="margin: 0; padding: 0; ${baseStyles} background-color: #f9faf8;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="100%" max-width="560" border="0" cellspacing="0" cellpadding="0" style="background-color: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);">
          <!-- Header -->
          <tr>
            <td style="background-color: ${brandColors.deepGreen}; padding: 40px 30px; text-align: center;">
              <h1 style="${headingStyles} margin: 0; font-size: 28px; color: ${brandColors.brightGreen};">PZ Academy</h1>
              <p style="margin: 8px 0 0; color: ${brandColors.paleGreen}; font-size: 14px;">by Pharmacozyme</p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="${headingStyles} font-size: 22px; margin: 0 0 20px;">You're Invited!</h2>

              <p style="margin: 0 0 20px; color: ${brandColors.lightGray};">
                Welcome to <strong>PZ Academy</strong>. You've been invited to join our mentorship platform.
              </p>

              <p style="margin: 0 0 30px; color: ${brandColors.lightGray};">
                Click the button below to accept your invitation and get started:
              </p>

              <!-- CTA Button -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 30px 0;">
                <tr>
                  <td align="center">
                    <a href="${actionLink}" style="background-color: ${brandColors.brightGreen}; color: ${brandColors.deepGreen}; text-decoration: none; font-weight: 700; font-size: 16px; padding: 14px 40px; border-radius: 6px; display: inline-block;">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 30px 0 0; padding-top: 20px; border-top: 1px solid ${brandColors.border}; color: ${brandColors.lightGray}; font-size: 13px;">
                This invitation link expires in 7 days. If you did not expect this invitation, please disregard this email.
              </p>

              <!-- Unsubscribe -->
              <p style="margin: 20px 0 0; color: ${brandColors.lightGray}; font-size: 12px;">
                <a href="mailto:${email}?subject=Remove%20from%20PZ%20Academy" style="color: ${brandColors.brightGreen}; text-decoration: none;">Stop receiving emails</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f0f0f0; padding: 20px 30px; text-align: center; border-top: 1px solid ${brandColors.border};">
              <p style="margin: 0; color: ${brandColors.lightGray}; font-size: 12px;">
                PZ Academy Mentorship Platform<br>
                © 2024 Pharmacozyme. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Email template for signup email confirmation
 */
export function signupConfirmEmailHtml(email: string, actionLink: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirm Your Email Address</title>
</head>
<body style="margin: 0; padding: 0; ${baseStyles} background-color: #f9faf8;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="100%" max-width="560" border="0" cellspacing="0" cellpadding="0" style="background-color: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);">
          <!-- Header -->
          <tr>
            <td style="background-color: ${brandColors.deepGreen}; padding: 40px 30px; text-align: center;">
              <h1 style="${headingStyles} margin: 0; font-size: 28px; color: ${brandColors.brightGreen};">PZ Academy</h1>
              <p style="margin: 8px 0 0; color: ${brandColors.paleGreen}; font-size: 14px;">by Pharmacozyme</p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="${headingStyles} font-size: 22px; margin: 0 0 20px;">Verify Your Email</h2>

              <p style="margin: 0 0 20px; color: ${brandColors.lightGray};">
                Thank you for signing up! We're excited to have you on board.
              </p>

              <p style="margin: 0 0 30px; color: ${brandColors.lightGray};">
                Please verify your email address by clicking the button below:
              </p>

              <!-- CTA Button -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 30px 0;">
                <tr>
                  <td align="center">
                    <a href="${actionLink}" style="background-color: ${brandColors.brightGreen}; color: ${brandColors.deepGreen}; text-decoration: none; font-weight: 700; font-size: 16px; padding: 14px 40px; border-radius: 6px; display: inline-block;">
                      Verify Email Address
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 30px 0 0; padding-top: 20px; border-top: 1px solid ${brandColors.border}; color: ${brandColors.lightGray}; font-size: 13px;">
                This verification link expires in 24 hours. If you did not create this account, please ignore this email.
              </p>

              <p style="margin: 15px 0 0; color: ${brandColors.lightGray}; font-size: 13px;">
                <strong>Account email:</strong> ${email}
              </p>

              <!-- Unsubscribe -->
              <p style="margin: 20px 0 0; color: ${brandColors.lightGray}; font-size: 12px;">
                <a href="mailto:${email}?subject=Remove%20from%20PZ%20Academy" style="color: ${brandColors.brightGreen}; text-decoration: none;">Stop receiving emails</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f0f0f0; padding: 20px 30px; text-align: center; border-top: 1px solid ${brandColors.border};">
              <p style="margin: 0; color: ${brandColors.lightGray}; font-size: 12px;">
                PZ Academy Mentorship Platform<br>
                © 2024 Pharmacozyme. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Email template for password reset
 */
export function resetPasswordEmailHtml(email: string, actionLink: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Reset Your Password</title>
</head>
<body style="margin: 0; padding: 0; ${baseStyles} background-color: #f9faf8;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="100%" max-width="560" border="0" cellspacing="0" cellpadding="0" style="background-color: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);">
          <!-- Header -->
          <tr>
            <td style="background-color: ${brandColors.deepGreen}; padding: 40px 30px; text-align: center;">
              <h1 style="${headingStyles} margin: 0; font-size: 28px; color: ${brandColors.brightGreen};">PZ Academy</h1>
              <p style="margin: 8px 0 0; color: ${brandColors.paleGreen}; font-size: 14px;">by Pharmacozyme</p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="${headingStyles} font-size: 22px; margin: 0 0 20px;">Reset Your Password</h2>

              <p style="margin: 0 0 20px; color: ${brandColors.lightGray};">
                We received a request to reset the password for your PZ Academy account.
              </p>

              <p style="margin: 0 0 30px; color: ${brandColors.lightGray};">
                Click the button below to create a new password:
              </p>

              <!-- CTA Button -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 30px 0;">
                <tr>
                  <td align="center">
                    <a href="${actionLink}" style="background-color: ${brandColors.brightGreen}; color: ${brandColors.deepGreen}; text-decoration: none; font-weight: 700; font-size: 16px; padding: 14px 40px; border-radius: 6px; display: inline-block;">
                      Reset Password
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 30px 0 0; padding-top: 20px; border-top: 1px solid ${brandColors.border}; color: ${brandColors.lightGray}; font-size: 13px;">
                This link expires in 1 hour for your security. If you did not request a password reset, you can safely ignore this email.
              </p>

              <p style="margin: 15px 0 0; color: ${brandColors.lightGray}; font-size: 13px;">
                <strong>Account email:</strong> ${email}
              </p>

              <!-- Security Notice -->
              <p style="margin: 20px 0 0; padding: 15px; background-color: #f0f0f0; border-radius: 4px; border-left: 4px solid ${brandColors.brightGreen}; color: ${brandColors.lightGray}; font-size: 12px;">
                <strong>Security Tip:</strong> Never share your password with anyone. PZ Academy support will never ask for your password.
              </p>

              <!-- Unsubscribe -->
              <p style="margin: 20px 0 0; color: ${brandColors.lightGray}; font-size: 12px;">
                <a href="mailto:${email}?subject=Remove%20from%20PZ%20Academy" style="color: ${brandColors.brightGreen}; text-decoration: none;">Stop receiving emails</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f0f0f0; padding: 20px 30px; text-align: center; border-top: 1px solid ${brandColors.border};">
              <p style="margin: 0; color: ${brandColors.lightGray}; font-size: 12px;">
                PZ Academy Mentorship Platform<br>
                © 2024 Pharmacozyme. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Email template for email change confirmation
 */
export function emailChangeConfirmEmailHtml(email: string, actionLink: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Confirm Your New Email Address</title>
</head>
<body style="margin: 0; padding: 0; ${baseStyles} background-color: #f9faf8;">
  <table width="100%" border="0" cellspacing="0" cellpadding="0">
    <tr>
      <td align="center" style="padding: 40px 20px;">
        <table width="100%" max-width="560" border="0" cellspacing="0" cellpadding="0" style="background-color: white; border-radius: 8px; box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);">
          <!-- Header -->
          <tr>
            <td style="background-color: ${brandColors.deepGreen}; padding: 40px 30px; text-align: center;">
              <h1 style="${headingStyles} margin: 0; font-size: 28px; color: ${brandColors.brightGreen};">PZ Academy</h1>
              <p style="margin: 8px 0 0; color: ${brandColors.paleGreen}; font-size: 14px;">by Pharmacozyme</p>
            </td>
          </tr>

          <!-- Content -->
          <tr>
            <td style="padding: 40px 30px;">
              <h2 style="${headingStyles} font-size: 22px; margin: 0 0 20px;">Confirm Your Email Change</h2>

              <p style="margin: 0 0 20px; color: ${brandColors.lightGray};">
                You requested to change the email address associated with your PZ Academy account.
              </p>

              <p style="margin: 0 0 30px; color: ${brandColors.lightGray};">
                Click the button below to confirm this change:
              </p>

              <!-- CTA Button -->
              <table width="100%" border="0" cellspacing="0" cellpadding="0" style="margin: 30px 0;">
                <tr>
                  <td align="center">
                    <a href="${actionLink}" style="background-color: ${brandColors.brightGreen}; color: ${brandColors.deepGreen}; text-decoration: none; font-weight: 700; font-size: 16px; padding: 14px 40px; border-radius: 6px; display: inline-block;">
                      Confirm Email Change
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin: 30px 0 0; padding-top: 20px; border-top: 1px solid ${brandColors.border}; color: ${brandColors.lightGray}; font-size: 13px;">
                This link expires in 24 hours. If you did not request this email change, please ignore this email. Your account will not be affected.
              </p>

              <p style="margin: 15px 0 0; color: ${brandColors.lightGray}; font-size: 13px;">
                <strong>New email address:</strong> ${email}
              </p>

              <!-- Security Notice -->
              <p style="margin: 20px 0 0; padding: 15px; background-color: #f0f0f0; border-radius: 4px; border-left: 4px solid ${brandColors.brightGreen}; color: ${brandColors.lightGray}; font-size: 12px;">
                <strong>Security Tip:</strong> If you did not make this request, please secure your account immediately by resetting your password.
              </p>

              <!-- Unsubscribe -->
              <p style="margin: 20px 0 0; color: ${brandColors.lightGray}; font-size: 12px;">
                <a href="mailto:${email}?subject=Remove%20from%20PZ%20Academy" style="color: ${brandColors.brightGreen}; text-decoration: none;">Stop receiving emails</a>
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color: #f0f0f0; padding: 20px 30px; text-align: center; border-top: 1px solid ${brandColors.border};">
              <p style="margin: 0; color: ${brandColors.lightGray}; font-size: 12px;">
                PZ Academy Mentorship Platform<br>
                © 2024 Pharmacozyme. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
