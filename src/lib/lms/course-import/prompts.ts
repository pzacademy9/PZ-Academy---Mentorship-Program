// The instructions staff paste into an AI chat so it writes the course file.
// Numbers come from COURSE_IMPORT_LIMITS and the quiz layout from
// QUIZ_PASTE_EXAMPLE, so the prompt cannot drift from the checker.
import { QUIZ_PASTE_EXAMPLE } from "@/lib/lms/quiz-paste";
import { COURSE_DETAIL_FIELDS, COURSE_IMPORT_FORMAT_ID, COURSE_IMPORT_LIMITS } from "./format";

const FENCE = "```";

export function masterPrompt(): string {
  const L = COURSE_IMPORT_LIMITS;
  const n = (v: number) => v.toLocaleString("en-US");
  const max = (key: string) => n(COURSE_DETAIL_FIELDS.find((f) => f.key === key)!.max);

  return `You are helping me turn my course material into one text file that I will upload to my course platform. I will attach some or all of these: course information files, a list of YouTube links with the lecture name or day beside each one, a quiz file (Word or PDF, with the correct answers marked), and links to notes on Google Drive.

Your job is to put everything together into ONE file in the exact layout below, and give me the whole file in a single code block.

THE LAYOUT

The first line is the format line. Then the course title and the type (course, workshop or webinar). A course is split into modules, and each module holds sessions. A workshop or webinar has sessions only, with no modules. For a workshop or webinar, leave out the ## Module lines and use ### Session lines only.

Each line that holds a value starts with a key and a colon. Headings start with ## (module) or ### (session). Here is a complete small example:

${FENCE}
format: ${COURSE_IMPORT_FORMAT_ID}
title: Practical Pharmacology - Batch 2
type: course
tagline: Learn how medicines work and how to use them safely
description: A practical course on how common medicines work, how they are given, and how to avoid mistakes. Each day has a recorded lecture, notes and a short quiz.
level: Beginner
duration: 1 Month
timings: 6:30 PM - 7:30 PM (UAE Time), live sessions
mentor_name: Dr Example Name
mentor_title: Clinical Pharmacist
mentor_bio: Dr Example Name has worked as a clinical pharmacist and teaches medicine safety.

## Module: Foundations of Pharmacology
notes: Module 1 slides | https://drive.google.com/example-module-notes

### Session: Day 1: Introduction
video: https://youtu.be/AAAAAAAAAAA
video2: https://youtu.be/BBBBBBBBBBB
notes: Day 1 handout | https://drive.google.com/example-day-1
quiz:
${QUIZ_PASTE_EXAMPLE}

### Session: Day 2: Dosage Forms
video: https://youtu.be/CCCCCCCCCCC
quiz:
Which route of administration avoids first-pass metabolism?
A) Oral
B) Sublingual
C) Rectal swallowed
D) Enteric coated
Answer: B

## Unassigned notes
notes: Extra reading | https://drive.google.com/example-extra
${FENCE}

What each line means:
- format: always exactly ${COURSE_IMPORT_FORMAT_ID}, on the very first line.
- title: the course name.
- type: course, workshop or webinar.
- tagline, description, level, duration, timings, mentor_name, mentor_title, mentor_bio: the course details. They go in the top part of the file, before the first ## line, and every one of them is optional. Write description and mentor_bio as ONE paragraph on a single line, and never start a line inside them with a word followed by a colon. Do not put any other text in the top part.
- ## Module: starts a module (courses only).
- ### Session: starts a session (a lecture or a day).
- video: the main video link for the session. video2: an optional second video link.
- notes: a notes link, written as the label, then a space, a vertical bar, a space, then the link. Notes placed under a module belong to the module; notes placed under a session belong to that session.
- quiz: on its own line, followed by the questions for that session. The quiz continues until the next heading, so always put quiz: LAST in each session, after the video, video2 and notes lines. Write every question exactly like this, with a blank line between questions:

${QUIZ_PASTE_EXAMPLE}

THE COURSE DETAILS

Fill the course details from the course information files (the database files). If the files do not say, leave that line out completely. Never invent a detail.
- tagline: one short line about the course (at most ${max("tagline")} characters).
- description: one plain paragraph about the course on a single line, taken from the files, with no hype added (at most ${max("description")} characters).
- level: for example Beginner or Intermediate, only if the files say so (at most ${max("level")} characters).
- duration: short text such as "1 Month" or "4 Days", only from the files (at most ${max("duration")} characters).
- timings: short text such as "6:30 PM - 7:30 PM (UAE Time), live sessions", only from the files (at most ${max("timings")} characters).
- mentor_name, mentor_title (the designation) and mentor_bio: only from the instructor section of the files. Never invent a mentor, a qualification or a biography (names and designation at most ${max("mentor_name")} characters, bio at most ${max("mentor_bio")} characters).

THE RULES

1. Take the course title, the module names, the session names and their order from the course information files.
2. Match each video link, notes link and quiz question to its session by the lecture name or the day. Do not match by position alone.
3. Never invent a video link. Never invent a quiz question. If a session has no link, leave the video: line empty. If a session has no quiz in my files, leave it without questions.
4. If you cannot tell which session a notes link belongs to, put it under "## Unassigned notes" at the end of the file, as notes: lines. Do not guess.
5. If something is unclear (two sessions that could match, a link with no name, a quiz that does not say which day it is for), ask me before you guess.
6. In the quiz, write only the question, the options and the answer line. Leave out explanations.
7. Keep to these limits: at most ${n(L.maxModules)} modules, ${n(L.maxSessions)} sessions in total, ${n(L.maxQuestionsPerSession)} quiz questions in one session, ${n(L.maxQuestionsPerCourse)} quiz questions in the whole course, and ${n(L.maxNotesPerSession)} notes links per session. Keep titles under ${n(L.maxTitle)} characters and note labels under ${n(L.maxLabel)} characters.
8. Give me the whole file in one code block, starting with the format line, with nothing else inside the block.

Start by asking me to attach my files, and ask me anything you need to know before you begin.`;
}
