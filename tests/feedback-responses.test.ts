import { describe, it, expect } from "vitest";
import { keyAnswersByQuestionId } from "@/lib/data/feedback-responses";

// Regression coverage for the Important-5 fix: ResponseDetail used to build
// stars[]/videos[] by pushing an answer only when it existed, which silently
// shifted every later answer of the same type once an earlier question of
// that type went unanswered (starQuestions.map((q, i) => r.stars[i]) then
// reads the WRONG question's rating). keyAnswersByQuestionId keys answers by
// question_id instead, so a missing answer is a genuine gap, never a shift.
describe("keyAnswersByQuestionId", () => {
  it("returns an empty object for no answers", () => {
    expect(keyAnswersByQuestionId([])).toEqual({});
  });

  it("keys each answer by its question_id, mapping snake_case to camelCase", () => {
    const answers = [
      { question_id: "q1", star_value: 5, video_url: null },
      { question_id: "q3", star_value: null, video_url: "https://drive.google.com/file/d/abc/preview" },
    ];
    expect(keyAnswersByQuestionId(answers)).toEqual({
      q1: { starValue: 5, videoUrl: null },
      q3: { starValue: null, videoUrl: "https://drive.google.com/file/d/abc/preview" },
    });
  });

  it("leaves a middle question with no answer entirely absent — not shifted, not null-filled", () => {
    // Simulates a response that answered q1 and q3 (both stars questions)
    // but skipped q2, which sits between them in the question list. No
    // feedback_answers row exists for q2 at all in that case.
    const answers = [
      { question_id: "q1", star_value: 4, video_url: null },
      { question_id: "q3", star_value: 2, video_url: null },
    ];
    const keyed = keyAnswersByQuestionId(answers);
    expect(keyed.q2).toBeUndefined();
    expect(keyed.q1.starValue).toBe(4);
    // q3's rating stays attached to q3 — the old positional array would
    // have read this back as q2's rating instead.
    expect(keyed.q3.starValue).toBe(2);
  });

  it("last write wins if the same question_id appears twice (defensive — should never happen given the unique response/question pairing)", () => {
    const answers = [
      { question_id: "q1", star_value: 1, video_url: null },
      { question_id: "q1", star_value: 5, video_url: null },
    ];
    expect(keyAnswersByQuestionId(answers).q1.starValue).toBe(5);
  });
});
