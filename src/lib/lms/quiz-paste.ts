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
  /^(?:correct\s+answer|correct\s+option|right\s+answer|correct|answer|ans)\s*(?:[:\-\u2013\u2014]|\bis\b)\s*(?:option\s+)?\(?([A-Za-z])(?=$|[).:]|\s+\))/i;
const OPTION_RE = /^\(?([A-Za-z])[.):]\s*(\S.*)$/;
const EXPLAIN_RE = /^(?:explanation|rationale|reason)\s*[:\-\u2013\u2014]/i;
const BULLET_RE = /^[-*\u2022\u2013\u2014]\s+/;
// Numbering only counts when followed by whitespace or end, so "2.5 mg" and "0.9% saline" stay intact.
const NUMBERING_RE = /^(?:(?:question|q)\s*\d+\s*[.:)-]?|\d+\s*[.)]|q\s*[:.])(?=\s|$)\s*/i;

function clean(raw: string): string {
  return raw
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E]/g, '"')
    .replace(/[\u00a0\t]/g, " ")
    .replace(/\*\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

type Line =
  | { kind: "blank" }
  | { kind: "answer"; letter: string }
  | { kind: "option"; letter: string; text: string }
  | { kind: "explain" }
  | { kind: "plain" };

function classify(line: string): Line {
  if (!line) return { kind: "blank" };
  const u = line.replace(BULLET_RE, "");
  const ans = ANSWER_RE.exec(u);
  if (ans) return { kind: "answer", letter: ans[1] };
  const opt = OPTION_RE.exec(u);
  if (opt) return { kind: "option", letter: opt[1], text: opt[2].trim() };
  if (EXPLAIN_RE.test(u)) return { kind: "explain" };
  return { kind: "plain" };
}

type Block = {
  startLine: number;
  questionLines: string[];
  options: string[];
  answer: string | null;
  orderError: string | null;
};

export function parseQuizPaste(text: string): QuizPasteResult {
  const questions: ParsedQuestion[] = [];
  const errors: QuizPasteError[] = [];
  let count = 0;
  let block: Block | null = null;
  let skipping = false;

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
    if (b.orderError) return fail(b.orderError);
    if (b.options.length < 2) return fail("needs at least 2 answer options");
    if (b.options.length > MAX_OPTIONS) return fail(`more than ${MAX_OPTIONS} options`);
    if (b.answer === null) return fail("no correct answer marked");
    const idx = b.answer.toUpperCase().charCodeAt(0) - 65;
    if (idx < 0 || idx >= b.options.length) {
      return fail(`answer ${b.answer.toUpperCase()} does not match any option`);
    }
    questions.push({ question, options: b.options, correctIndex: idx });
  }

  const cleaned = text.split(/\r\n|[\r\n\u2028\u2029\u000b]/).map(clean);
  const kinds = cleaned.map(classify);

  // Is the plain line at index i a wrapped continuation of the current option?
  function continuesOption(i: number, optionCount: number): boolean {
    let crossedBlank = false;
    for (let j = i; j < kinds.length; j++) {
      const k = kinds[j];
      if (k.kind === "blank") {
        crossedBlank = true;
        continue;
      }
      if (k.kind === "plain") continue;
      if (k.kind === "answer") return true;
      if (k.kind === "option") return k.letter.toUpperCase().charCodeAt(0) - 65 === optionCount;
      return false;
    }
    return !crossedBlank;
  }

  cleaned.forEach((line, i) => {
    const k = kinds[i];
    const lineNo = i + 1;
    if (k.kind === "blank") {
      skipping = false;
      return;
    }
    if (skipping) return;
    if (!block && k.kind === "explain") {
      skipping = true;
      return;
    }

    if (k.kind === "answer") {
      if (!block) block = { startLine: lineNo, questionLines: [], options: [], answer: null, orderError: null };
      if (block.answer === null) block.answer = k.letter;
      finish();
      return;
    }

    // An option marker only counts once the block has question text ("E. coli ..." can open a question).
    if (k.kind === "option" && block && block.questionLines.length > 0) {
      const found = k.letter.toUpperCase();
      const expected = String.fromCharCode(65 + block.options.length);
      if (found !== expected && !block.orderError) {
        const prev = block.options.length ? ` after ${String.fromCharCode(64 + block.options.length)}` : " first";
        block.orderError = `options must be A, B, C in order (found ${found}${prev})`;
      }
      block.options.push(k.text);
      return;
    }

    // Plain text (or a stray marker/explanation line): wrap of an option, question text, or a new block.
    if (block && block.options.length > 0 && block.answer === null && continuesOption(i, block.options.length)) {
      block.options[block.options.length - 1] += " " + line.replace(BULLET_RE, "");
      return;
    }
    if (block && block.options.length > 0) finish();
    if (!block) {
      block = { startLine: lineNo, questionLines: [], options: [], answer: null, orderError: null };
      const stripped = line.replace(NUMBERING_RE, "").trim();
      block.questionLines.push(stripped || line);
    } else {
      block.questionLines.push(line);
    }
  });
  finish();

  return { questions, errors };
}
