import { describe, it, expect, vi, beforeEach } from "vitest";

const send = vi.fn();
vi.mock("server-only", () => ({}));
vi.mock("@getbrevo/brevo", () => ({
  BrevoClient: class {
    transactionalEmails = { sendTransacEmail: send };
  },
}));

import { sendParticipantEmail } from "@/lib/brevo-participants";

const opts = { to: "a@b.com", toName: "A", subject: "S", htmlContent: "<p>x</p>" };

beforeEach(() => {
  send.mockReset();
  delete process.env.BREVO_API_KEY_PARTICIPANTS;
  process.env.BREVO_SENDER_EMAIL = "fallback@pz.test";
  process.env.BREVO_SENDER_NAME = "Fallback";
  delete process.env.BREVO_SENDER_EMAIL_PARTICIPANTS;
  delete process.env.BREVO_SENDER_NAME_PARTICIPANTS;
});

describe("sendParticipantEmail", () => {
  it("returns not set up, without throwing or calling Brevo, when the key is missing", async () => {
    expect(await sendParticipantEmail(opts)).toEqual({ ok: false, error: "Participant email is not set up" });
    expect(send).not.toHaveBeenCalled();
  });
  it("sends with the fallback sender when the key is set", async () => {
    process.env.BREVO_API_KEY_PARTICIPANTS = "k";
    send.mockResolvedValue({});
    expect(await sendParticipantEmail(opts)).toEqual({ ok: true });
    expect(send).toHaveBeenCalledWith({
      sender: { email: "fallback@pz.test", name: "Fallback" },
      to: [{ email: "a@b.com", name: "A" }],
      subject: "S",
      htmlContent: "<p>x</p>",
    });
  });
  it("prefers the participant sender env", async () => {
    process.env.BREVO_API_KEY_PARTICIPANTS = "k";
    process.env.BREVO_SENDER_EMAIL_PARTICIPANTS = "p@pz.test";
    process.env.BREVO_SENDER_NAME_PARTICIPANTS = "P";
    send.mockResolvedValue({});
    await sendParticipantEmail(opts);
    expect(send.mock.calls[0][0].sender).toEqual({ email: "p@pz.test", name: "P" });
  });
  it("returns the error message instead of throwing when Brevo fails", async () => {
    process.env.BREVO_API_KEY_PARTICIPANTS = "k";
    send.mockRejectedValue(new Error("boom"));
    expect(await sendParticipantEmail(opts)).toEqual({ ok: false, error: "boom" });
  });
});
