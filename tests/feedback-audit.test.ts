import { describe, it, expect } from "vitest";
import { describeAuditAction, type AuditActionInfo } from "@/lib/data/feedback-audit";

const EXPECTED: Record<string, AuditActionInfo> = {
  createFeedbackSession: { label: "Created session", category: "sessions", tone: "create" },
  updateFeedbackSessionDetails: { label: "Updated session details", category: "sessions", tone: "neutral" },
  updateFeedbackSessionQuestions: { label: "Updated session questions", category: "sessions", tone: "neutral" },
  setFeedbackSessionStatus: { label: "Changed session status", category: "sessions", tone: "neutral" },
  setFeedbackSessionMentor: { label: "Changed session mentor", category: "sessions", tone: "neutral" },
  deleteFeedbackSession: { label: "Deleted session", category: "sessions", tone: "destructive" },
  setCoverImage: { label: "Set cover image", category: "sessions", tone: "neutral" },
  removeCoverImage: { label: "Removed cover image", category: "sessions", tone: "neutral" },
  createFeedbackProgram: { label: "Created program", category: "programs", tone: "create" },
  deleteFeedbackProgram: { label: "Deleted program", category: "programs", tone: "destructive" },
  deleteResponse: { label: "Deleted response", category: "responses", tone: "destructive" },
  showResponse: { label: "Showed response", category: "responses", tone: "moderate" },
  hideResponse: { label: "Hid response", category: "responses", tone: "moderate" },
  featureResponse: { label: "Featured response", category: "responses", tone: "moderate" },
  unfeatureResponse: { label: "Unfeatured response", category: "responses", tone: "moderate" },
  saveQuestionBank: { label: "Updated question bank", category: "questionBank", tone: "neutral" },
  generateShareToken: { label: "Generated share link", category: "sharing", tone: "share" },
};

describe("describeAuditAction", () => {
  it("maps every known action string to its exact label/category/tone", () => {
    for (const [action, expected] of Object.entries(EXPECTED)) {
      expect(describeAuditAction(action)).toEqual(expected);
    }
  });

  it("falls back to a neutral sessions-category entry for an unrecognized action, using the raw string as the label", () => {
    expect(describeAuditAction("someFutureAction")).toEqual({
      label: "someFutureAction",
      category: "sessions",
      tone: "neutral",
    });
  });
});
