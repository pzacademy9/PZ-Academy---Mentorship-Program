// The instructions staff paste into an AI chat so it writes the course file.
// Numbers come from COURSE_IMPORT_LIMITS and the quiz layout from
// QUIZ_PASTE_EXAMPLE, so the prompt cannot drift from the checker.
import { QUIZ_PASTE_EXAMPLE } from "@/lib/lms/quiz-paste";
import { PAGE_LIMITS } from "@/lib/marketing/page-limits";
import { TOPIC_MAX } from "@/lib/marketing/topics";
import { SECTION_KEYS, SECTION_LABEL, SECTION_TITLE_MAX } from "@/lib/marketing/course-sections";
import { COURSE_DETAIL_FIELDS, COURSE_IMPORT_FORMAT_ID, COURSE_IMPORT_LIMITS, PAGE_LIST_HEADINGS } from "./format";

const FENCE = "```";

const max = (key: string) => COURSE_DETAIL_FIELDS.find((f) => f.key === key)!.max.toLocaleString("en-US");

export function masterPrompt(): string {
  const L = COURSE_IMPORT_LIMITS;

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
price: 9000
topic: Pharmacology
preview_video: https://youtu.be/DDDDDDDDDDD

${PAGE_LISTS_EXAMPLE}

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
- tagline, description, level, duration, timings, mentor_name, mentor_title, mentor_bio, price, topic, webinar_date, preview_video: the course details. They go in the top part of the file, before the first ## line, and every one of them is optional. Write description and mentor_bio as ONE paragraph on a single line, and never start a line inside them with a word followed by a colon. Do not put any other text in the top part.
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

${pagePartsHelp()}

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

const n = (v: number) => v.toLocaleString("en-US");

/** The page lists as they look in a file (shared by every prompt and the example file). */
const PAGE_LISTS_EXAMPLE = `${PAGE_LIST_HEADINGS.learn}
- Work out doses for children and adults step by step
- Spot common medicine mistakes before they happen

${PAGE_LIST_HEADINGS.includes}
- 8 live classes
- Notes for every class
- Certificate on completion

${PAGE_LIST_HEADINGS.faqs}
Q: Do I need any experience?
A: No. The course starts from the basics.
Q: Are the classes recorded?
A: Yes. You can watch every class again in the portal.

${PAGE_LIST_HEADINGS.sections}
about | show
learn | show | Skills you will build
curriculum | show
teacher | show
certificate | show
faq | show`;

/** The part of every prompt that explains the public page lines. Numbers come from the shared limit tables. */
function pagePartsHelp(): string {
  const sectionNames = SECTION_KEYS.map((k) => `${k} (${SECTION_LABEL[k]})`).join(", ");
  return `THE PUBLIC PAGE PARTS

These fill the course's page on the website. Every one is optional: leave out anything my files do not say.
- price: the course fee in Pakistani rupees, a whole number only, for example 9000. Write Free for a free course. At most ${n(PAGE_LIMITS.maxPricePkr)}.
- topic: one short subject name, for example Pharmacology or Clinical Pharmacy (at most ${TOPIC_MAX} characters). Use the same spelling for courses of the same subject.
- webinar_date: only for a webinar. The date and start time in Pakistan time, written exactly like 2026-11-10 19:00.
- preview_video: one YouTube or Vimeo link anyone may watch, starting with https://. Never one of the paid lecture videos unless I say it is free to show.
- ${PAGE_LIST_HEADINGS.learn}: one skill per line, each line starting with "- " (at most ${n(PAGE_LIMITS.maxLines)} lines, ${n(PAGE_LIMITS.maxLine)} characters each).
- ${PAGE_LIST_HEADINGS.includes}: what the student gets, one item per line starting with "- ", for example "- 8 live classes" (same limits).
- ${PAGE_LIST_HEADINGS.faqs}: each question on a line starting with "Q: " and its answer on the next line starting with "A: " (at most ${n(PAGE_LIMITS.maxFaqs)} questions; a question at most ${n(PAGE_LIMITS.maxQuestion)} characters, an answer at most ${n(PAGE_LIMITS.maxAnswer)}).
- ${PAGE_LIST_HEADINGS.sections}: the order of the sections on the page, one per line, written as name | show or hide | heading. The heading is optional (at most ${SECTION_TITLE_MAX} characters); leave it out to use the normal one. The names are: ${sectionNames}. Only add this list if I ask to change the order, hide a section or change a heading.

Never invent a number, a price, a date, a student review, a rating, a result or a teacher's name. If my files do not say it, leave it out.`;
}

/**
 * "Page only": turns a WhatsApp post, poster text or brochure into the page
 * parts of a course file, for "Import page from a file" in the course editor.
 */
export function pagePrompt(): string {
  return `You are helping me fill in the page of one course on my academy's website. I will paste a WhatsApp post, the text of a poster, or a brochure about the course.

Turn it into ONE text file in the exact layout below, and give me the whole file in a single code block.

${FENCE}
format: ${COURSE_IMPORT_FORMAT_ID}
tagline: One short line about the course
description: One plain paragraph about the course, on a single line.
level: Beginner
duration: 4 Weeks
timings: Saturdays 7 PM - 8 PM (Pakistan time)
mentor_name: Dr Example Name
mentor_title: Clinical Pharmacist
price: 9000
topic: Pharmacology

${PAGE_LISTS_EXAMPLE}
${FENCE}

THE COURSE DETAILS

tagline (at most ${max("tagline")} characters), description (at most ${max("description")}), level, duration, timings, mentor_name, mentor_title and mentor_bio describe the course. Write description and mentor_bio as ONE paragraph on a single line, and never start a line inside them with a word followed by a colon. Leave out any line my text does not support.

${pagePartsHelp()}

THE RULES

1. The first line is always format: ${COURSE_IMPORT_FORMAT_ID}. Do not add title, type, modules, sessions or quizzes: this file is for the page only.
2. Use plain, clear words. Keep the meaning of my text; do not add hype or promises.
3. If something is unclear, ask me before you guess.
4. Give me the whole file in one code block, with nothing else inside the block.

Start by asking me to paste my text.`;
}

/**
 * "Improve my page": rewrites a page file downloaded from the course editor
 * to be clearer and shorter, without inventing anything.
 */
export function improvePrompt(): string {
  return `I will attach a text file with the page of one course on my academy's website. It starts with the line format: ${COURSE_IMPORT_FORMAT_ID}.

Please improve the wording so it is clearer and shorter, and easy to read on a phone. Then give me the whole improved file in one code block, in exactly the same layout.

WHAT TO DO
1. Keep every key, heading and line layout exactly as it is. Change only the words after the keys and in the lists.
2. Shorter sentences, plain words, no hype, no exclamation marks.
3. Keep the same facts. Never invent or change a number, a price, a date, a duration, a student review, a rating, a result, a qualification or a teacher's name.
4. Never add or change links.
5. You may merge repeated lines in a list, or reorder lines so the most useful come first. Do not add new claims.
6. Keep to the limits below.

${pagePartsHelp()}

When you are done, list in a few short lines (outside the code block) what you changed.

Start by asking me to attach the file.`;
}

/** A ready example file for staff to download and copy from. */
export function exampleFile(): string {
  return `format: ${COURSE_IMPORT_FORMAT_ID}
title: Example Course (replace this)
type: course
tagline: One short line about the course
description: One plain paragraph about the course, on a single line.
level: Beginner
duration: 4 Weeks
timings: Saturdays 7 PM - 8 PM (Pakistan time)
mentor_name: Dr Example Name
mentor_title: Clinical Pharmacist
mentor_bio: One short paragraph about the teacher, on a single line.
price: 9000
topic: Pharmacology
preview_video: https://youtu.be/DDDDDDDDDDD

${PAGE_LISTS_EXAMPLE}

## Module: Module 1 (replace this)
notes: Module 1 slides | https://drive.google.com/example-module-notes

### Session: Day 1 (replace this)
video: https://youtu.be/AAAAAAAAAAA
notes: Day 1 handout | https://drive.google.com/example-day-1
quiz:
${QUIZ_PASTE_EXAMPLE}
`;
}
