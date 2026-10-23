// Parses quiz text pasted from Word / PDF / ChatGPT into structured questions.
// Limits mirror quizQuestionCreateSchema (question <= 1000 chars, 2 to 6 options).
// Anything that breaks a limit becomes an error, never a silent truncation.

export type ParsedQuestion = {
  question: string;
  options: string[];
  correctIndex: number;
};

export type QuizPasteError = {
  questionNumber: number;
  line: number;
  message: string;
};

export type QuizPasteResult = {
  questions: ParsedQuestion[];
  errors: QuizPasteError[];
};

export const QUIZ_PASTE_EXAMPLE = `Which vitamin is essential for blood clotting?
A) Vitamin A
B) Vitamin K
C) Vitamin C
D) Vitamin D
Answer: B

What is the normal adult resting heart rate range?
A) 20 to 40 beats per minute
B) 40 to 60 beats per minute
C) 60 to 100 beats per minute
D) 100 to 140 beats per minute
Answer: C`;

const MAX_QUESTION = 1000;
const MAX_OPTIONS = 6;

const ANSWER_RE =
  /^(?:correct\s+answer|correct|answer|ans)\s*(?:[:\-\u2013\u2014]|is\b)\s*\(?([A-Za-z])(?![A-Za-z0-9])/i;
const OPTION_RE = /^\(?([A-Za-z])[.):]\s*(\S.*)$/;
const BULLET_RE = /^[-*\u2022\u2013\u2014]\s+/;
const NUMBERING_RE = /^(?:(?:question|q)\s*\d+\s*[.:)\-]?|\d+\s*[.)])\s*/i;

function clean(raw: string): string {
  return raw
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/[\u00a0\t]/g, " ")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

type Block = {
  startLine: number;
  questionLines: string[];
  options: string[];
  answer: string | null;
};

export function parseQuizPaste(text: string): QuizPasteResult {
  const questions: ParsedQuestion[] = [];
  const errors: QuizPasteError[] = [];
  let count = 0;
  let block: Block | null = null;

  function finish() {
    if (!block) return;
    const b = block;
    block = null;
    count += 1;
    const n = count;
    const fail = (msg: string) =>
      errors.push({ questionNumber: n, line: b.startLine, message: `Question ${n}: ${msg}` });

    const question = b.questionLines.join(" ").trim();
    if (!question) return fail("missing question text");
    if (question.length > MAX_QUESTION) return fail(`question is longer than ${MAX_QUESTION} characters`);
    if (b.options.length < 2) return fail("needs at least 2 answer options");
    if (b.options.length > MAX_OPTIONS) return fail(`more than ${MAX_OPTIONS} options`);
    if (b.answer === null) return fail("no correct answer marked");
    const idx = b.answer.toUpperCase().charCodeAt(0) - 65;
    if (idx < 0 || idx >= b.options.length) {
      return fail(`answer ${b.answer.toUpperCase()} does not match any option`);
    }
    questions.push({ question, options: b.options, correctIndex: idx });
  }

  const lines = text.split(/\r\n|\r|\n/);
  lines.forEach((rawLine, i) => {
    const line = clean(rawLine);
    if (!line) return;
    const lineNo = i + 1;
    const unbulleted = line.replace(BULLET_RE, "");

    const ans = ANSWER_RE.exec(unbulleted);
    if (ans) {
      if (!block) block = { startLine: lineNo, questionLines: [], options: [], answer: null };
      if (block.answer === null) block.answer = ans[1];
      finish();
      return;
    }

    const opt = OPTION_RE.exec(unbulleted);
    // An option marker only counts once the block has question text ("E. coli ..." can open a question).
    if (opt && block && block.questionLines.length > 0) {
      block.options.push(opt[2].trim());
      return;
    }

    // Plain text: continues the question, or starts a new block.
    if (block && block.options.length > 0) finish();
    if (!block) {
      block = { startLine: lineNo, questionLines: [], options: [], answer: null };
      const stripped = line.replace(NUMBERING_RE, "").trim();
      block.questionLines.push(stripped || line);
    } else {
      block.questionLines.push(line);
    }
  });
  finish();

  return { questions, errors };
}
