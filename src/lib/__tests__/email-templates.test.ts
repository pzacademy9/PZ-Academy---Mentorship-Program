import { describe, it, expect } from "vitest";
import {
  inviteEmailHtml,
  signupConfirmEmailHtml,
  resetPasswordEmailHtml,
  emailChangeConfirmEmailHtml,
} from "@/lib/email-templates";

describe("Email Templates", () => {
  const testEmail = "test@example.com";
  const testActionLink = "https://app.example.com/auth/confirm?token=abc123";

  describe("inviteEmailHtml", () => {
    it("returns valid HTML", () => {
      const html = inviteEmailHtml(testEmail, testActionLink);
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toMatch(/<html[^>]*>/);
      expect(html).toContain("</html>");
    });

    it("includes the action link", () => {
      const html = inviteEmailHtml(testEmail, testActionLink);
      expect(html).toContain(testActionLink);
    });

    it("includes the email address", () => {
      const html = inviteEmailHtml(testEmail, testActionLink);
      expect(html).toContain(testEmail);
    });

    it("has no unresolved template placeholders", () => {
      const html = inviteEmailHtml(testEmail, testActionLink);
      expect(html).not.toMatch(/\{\{/);
    });

    it("has no tracking pixels", () => {
      const html = inviteEmailHtml(testEmail, testActionLink);
      expect(html).not.toMatch(/sendibt3\.com|pixel|tracking/i);
    });
  });

  describe("signupConfirmEmailHtml", () => {
    it("returns valid HTML", () => {
      const html = signupConfirmEmailHtml(testEmail, testActionLink);
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toMatch(/<html[^>]*>/);
      expect(html).toContain("</html>");
    });

    it("includes the action link", () => {
      const html = signupConfirmEmailHtml(testEmail, testActionLink);
      expect(html).toContain(testActionLink);
    });

    it("includes the email address", () => {
      const html = signupConfirmEmailHtml(testEmail, testActionLink);
      expect(html).toContain(testEmail);
    });

    it("has no unresolved template placeholders", () => {
      const html = signupConfirmEmailHtml(testEmail, testActionLink);
      expect(html).not.toMatch(/\{\{/);
    });

    it("has no tracking pixels", () => {
      const html = signupConfirmEmailHtml(testEmail, testActionLink);
      expect(html).not.toMatch(/sendibt3\.com|pixel|tracking/i);
    });
  });

  describe("resetPasswordEmailHtml", () => {
    it("returns valid HTML", () => {
      const html = resetPasswordEmailHtml(testEmail, testActionLink);
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toMatch(/<html[^>]*>/);
      expect(html).toContain("</html>");
    });

    it("includes the action link", () => {
      const html = resetPasswordEmailHtml(testEmail, testActionLink);
      expect(html).toContain(testActionLink);
    });

    it("includes the email address", () => {
      const html = resetPasswordEmailHtml(testEmail, testActionLink);
      expect(html).toContain(testEmail);
    });

    it("has no unresolved template placeholders", () => {
      const html = resetPasswordEmailHtml(testEmail, testActionLink);
      expect(html).not.toMatch(/\{\{/);
    });

    it("has no tracking pixels", () => {
      const html = resetPasswordEmailHtml(testEmail, testActionLink);
      expect(html).not.toMatch(/sendibt3\.com|pixel|tracking/i);
    });
  });

  describe("emailChangeConfirmEmailHtml", () => {
    it("returns valid HTML", () => {
      const html = emailChangeConfirmEmailHtml(testEmail, testActionLink);
      expect(html).toContain("<!DOCTYPE html>");
      expect(html).toMatch(/<html[^>]*>/);
      expect(html).toContain("</html>");
    });

    it("includes the action link", () => {
      const html = emailChangeConfirmEmailHtml(testEmail, testActionLink);
      expect(html).toContain(testActionLink);
    });

    it("includes the email address", () => {
      const html = emailChangeConfirmEmailHtml(testEmail, testActionLink);
      expect(html).toContain(testEmail);
    });

    it("has no unresolved template placeholders", () => {
      const html = emailChangeConfirmEmailHtml(testEmail, testActionLink);
      expect(html).not.toMatch(/\{\{/);
    });

    it("has no tracking pixels", () => {
      const html = emailChangeConfirmEmailHtml(testEmail, testActionLink);
      expect(html).not.toMatch(/sendibt3\.com|pixel|tracking/i);
    });
  });

  describe("Global template quality", () => {
    it("all templates have no tracking pixels across all functions", () => {
      const templates = [
        inviteEmailHtml(testEmail, testActionLink),
        signupConfirmEmailHtml(testEmail, testActionLink),
        resetPasswordEmailHtml(testEmail, testActionLink),
        emailChangeConfirmEmailHtml(testEmail, testActionLink),
      ];

      templates.forEach((html) => {
        expect(html).not.toMatch(/sendibt3\.com|pixel|tracking/i);
      });
    });
  });
});
