import { describe, it, expect } from "vitest";
import { parseQuizPaste, QUIZ_PASTE_EXAMPLE } from "@/lib/lms/quiz-paste";

const two = "What is 2+2?\nA) 3\nB) 4\nC) 5\nAnswer: B\n\nCapital of France?\nA) Paris\nB) Rome\nAnswer: A";

describe("parseQuizPaste", () => {
  it("parses a clean 2-question block", () => {
    const r = parseQuizPaste(two);
    expect(r.errors).toEqual([]);
    expect(r.questions).toEqual([
      { question: "What is 2+2?", options: ["3", "4", "5"], correctIndex: 1 },
      { question: "Capital of France?", options: ["Paris", "Rome"], correctIndex: 0 },
    ]);
  });
  it("handles CRLF input", () => {
    const r = parseQuizPaste(two.replace(/\n/g, "\r\n"));
    expect(r.errors).toEqual([]);
    expect(r.questions).toHaveLength(2);
  });
  it("handles blank lines between and within blocks", () => {
    const r = parseQuizPaste("\n\nQ?\n\nA) x\n\nB) y\n\nAnswer: B\n\n\n\nQ2?\nA) p\nB) q\nAnswer: A\n");
    expect(r.errors).toEqual([]);
    expect(r.questions.map((q) => q.correctIndex)).toEqual([1, 0]);
  });
  it.each(["1. Hello?", "Q1. Hello?", "Question 3: Hello?", "3) Hello?", "**Q1.** Hello?"])(
    "strips leading numbering: %s",
    (line) => {
      const r = parseQuizPaste(`${line}\nA) x\nB) y\nAnswer: A`);
      expect(r.errors).toEqual([]);
      expect(r.questions[0].question).toBe("Hello?");
    },
  );
  it.each(["A) x", "a. x", "(A) x", "A: x", "- A) x", "• a) x", "A.  x"])(
    "accepts option marker: %s",
    (line) => {
      const r = parseQuizPaste(`Q?\n${line}\nB) y\nAnswer: A`);
      expect(r.errors).toEqual([]);
      expect(r.questions[0].options).toEqual(["x", "y"]);
    },
  );
  it.each([
    "Answer: b",
    "Ans: B",
    "Correct answer: B",
    "Correct: B)",
    "Answer: B) y",
    "**Answer: B**",
    "Answer - B",
  ])("accepts answer line: %s", (line) => {
    const r = parseQuizPaste(`Q?\nA) x\nB) y\n${line}`);
    expect(r.errors).toEqual([]);
    expect(r.questions[0].correctIndex).toBe(1);
  });
  it("joins multi-line question text with a space", () => {
    const r = parseQuizPaste("First part\nsecond part?\nA) x\nB) y\nAnswer: A");
    expect(r.questions[0].question).toBe("First part second part?");
  });
  it("normalises curly quotes, nbsp and tabs", () => {
    const r = parseQuizPaste("Q\u00a0“hi”?\nA)\tit’s\nB)\u00a0no\nAnswer: A");
    expect(r.questions[0].question).toBe('Q "hi"?');
    expect(r.questions[0].options).toEqual(["it's", "no"]);
  });
  it("errors when the answer letter has no matching option", () => {
    const r = parseQuizPaste("Q?\nA) x\nB) y\nAnswer: C");
    expect(r.questions).toEqual([]);
    expect(r.errors).toEqual([
      { questionNumber: 1, line: 1, message: "Question 1: answer C does not match any option" },
    ]);
  });
  it("errors when no answer is marked", () => {
    const r = parseQuizPaste("Q?\nA) x\nB) y");
    expect(r.errors[0]).toMatchObject({ questionNumber: 1, message: "Question 1: no correct answer marked" });
  });
  it("errors on a single option", () => {
    const r = parseQuizPaste("Q?\nA) x\nAnswer: A");
    expect(r.errors[0].message).toBe("Question 1: needs at least 2 answer options");
  });
  it("errors on seven options", () => {
    const r = parseQuizPaste("Q?\nA) a\nB) b\nC) c\nD) d\nE) e\nF) f\nG) g\nAnswer: A");
    expect(r.errors[0].message).toBe("Question 1: more than 6 options");
    expect(r.questions).toEqual([]);
  });
  it("errors on question over 1000 characters", () => {
    const r = parseQuizPaste(`${"x".repeat(1001)}\nA) a\nB) b\nAnswer: A`);
    expect(r.errors[0].message).toBe("Question 1: question is longer than 1000 characters");
  });
  it("returns nothing for empty input", () => {
    expect(parseQuizPaste("")).toEqual({ questions: [], errors: [] });
    expect(parseQuizPaste("  \n\t\n")).toEqual({ questions: [], errors: [] });
  });
  it("an error in question 2 does not stop question 3", () => {
    const r = parseQuizPaste(
      "First?\nA) a\nB) b\nAnswer: A\n\nSecond?\nA) a\nAnswer: A\n\nThird?\nA) a\nB) b\nAnswer: B",
    );
    expect(r.questions.map((q) => q.question)).toEqual(["First?", "Third?"]);
    expect(r.errors).toEqual([
      { questionNumber: 2, line: 6, message: "Question 2: needs at least 2 answer options" },
    ]);
  });
  it("reports question number counting broken blocks and the block's first line", () => {
    const r = parseQuizPaste("One?\nA) a\nB) b\nTwo?\nA) a\nB) b\nAnswer: A");
    expect(r.errors[0]).toMatchObject({ questionNumber: 1, line: 1, message: "Question 1: no correct answer marked" });
    expect(r.questions).toHaveLength(1);
  });
  it("QUIZ_PASTE_EXAMPLE parses cleanly into 2 questions", () => {
    const r = parseQuizPaste(QUIZ_PASTE_EXAMPLE);
    expect(r.errors).toEqual([]);
    expect(r.questions).toHaveLength(2);
    expect(r.questions[0].options).toHaveLength(4);
  });
});

describe("parseQuizPaste fix round 1", () => {
  it("joins wrapped text on the last option", () => {
    const r = parseQuizPaste("Q?\nA) x\nB) long text\ncontinued\nAnswer: B");
    expect(r.errors).toEqual([]);
    expect(r.questions[0].options).toEqual(["x", "long text continued"]);
  });
  it("joins wrapped text on a non-last option and multi-line wraps", () => {
    const r = parseQuizPaste("Q?\nA) long\ncontinued\nmore\nB) y\nAnswer: B");
    expect(r.errors).toEqual([]);
    expect(r.questions[0].options).toEqual(["long continued more", "y"]);
  });
  it("keeps multi-line question text before options", () => {
    const r = parseQuizPaste("line one\nline two\nA) x\nB) y\nAnswer: A");
    expect(r.questions[0].question).toBe("line one line two");
  });
  it.each(["2.5 mg of X is given?", "0.9% saline is?", "10.5 mL of Y?", "12.5% dextrose?"])(
    "keeps decimal-leading question: %s",
    (q) => {
      const r = parseQuizPaste(`${q}\nA) x\nB) y\nAnswer: A`);
      expect(r.errors).toEqual([]);
      expect(r.questions[0].question).toBe(q);
    },
  );
  it.each(["12. Hello?", "Q: Hello?", "Q. Hello?", "3) Hello?"])("still strips: %s", (q) => {
    const r = parseQuizPaste(`${q}\nA) x\nB) y\nAnswer: A`);
    expect(r.questions[0].question).toBe("Hello?");
  });
  it("errors when option letters skip", () => {
    const r = parseQuizPaste("Fine?\nA) a\nB) b\nAnswer: A\n\nBad?\nA) a\nC) c\nD) d\nAnswer: C");
    expect(r.questions).toHaveLength(1);
    expect(r.errors).toEqual([
      { questionNumber: 2, line: 6, message: "Question 2: options must be A, B, C in order (found C after A)" },
    ]);
  });
  it("errors on duplicate option letters", () => {
    const r = parseQuizPaste("Bad?\nA) a\nA) b\nAnswer: A");
    expect(r.questions).toEqual([]);
    expect(r.errors[0].message).toBe("Question 1: options must be A, B, C in order (found A after A)");
  });
  it("ignores Explanation / Rationale / Reason lines and their wraps", () => {
    const r = parseQuizPaste(
      "One?\nA) a\nB) b\nAnswer: A\n**Explanation:** because\nof reasons\n\nTwo?\nA) a\nB) b\nAnswer: B\nRationale: x\n\nThree?\nA) a\nB) b\nAnswer: A\nreason: y",
    );
    expect(r.errors).toEqual([]);
    expect(r.questions.map((q) => q.question)).toEqual(["One?", "Two?", "Three?"]);
  });
  it.each(["Answer: Option B", "Answer is B", "Correct option: B", "Right answer: B", "Correct answer is B."])(
    "accepts answer form: %s",
    (line) => {
      const r = parseQuizPaste(`Q?\nA) x\nB) y\n${line}`);
      expect(r.errors).toEqual([]);
      expect(r.questions[0].correctIndex).toBe(1);
    },
  );
  it("does not treat 'Correct: A drug that...' as an answer line", () => {
    const r = parseQuizPaste("Correct: A drug that cures?\nA) x\nB) y\nAnswer: B");
    expect(r.errors).toEqual([]);
    expect(r.questions[0].question).toBe("Correct: A drug that cures?");
  });
  it("treats U+2028, U+2029 and VT as line breaks", () => {
    const r = parseQuizPaste("1. Q?\u2028A) x\u2029B) y\u000bAnswer: B");
    expect(r.errors).toEqual([]);
    expect(r.questions[0]).toEqual({ question: "Q?", options: ["x", "y"], correctIndex: 1 });
  });
});
