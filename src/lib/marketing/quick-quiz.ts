export type QuizQuestion = {
  q: string;
  options: string[];
  /** Index into options. */
  answer: number;
  /** One short line shown after answering. */
  why: string;
};

/** The home page "Quick quiz". Short, exam-style, checked facts only. */
export const QUICK_QUIZ: QuizQuestion[] = [
  {
    q: "What is the antidote for a paracetamol (acetaminophen) overdose?",
    options: ["Naloxone", "Flumazenil", "N-acetylcysteine", "Atropine"],
    answer: 2,
    why: "N-acetylcysteine refills glutathione, which the liver needs to clear paracetamol's toxic by-product (NAPQI).",
  },
  {
    q: "Warfarin works by blocking the recycling of which vitamin?",
    options: ["Vitamin B12", "Vitamin K", "Vitamin D", "Vitamin C"],
    answer: 1,
    why: "Without recycled vitamin K the liver makes fewer working clotting factors (II, VII, IX and X).",
  },
  {
    q: "A child weighs 20 kg. The dose is 15 mg/kg. How much should they get?",
    options: ["150 mg", "200 mg", "300 mg", "350 mg"],
    answer: 2,
    why: "20 kg × 15 mg/kg = 300 mg. Weight-based dosing like this is taught step by step in our courses.",
  },
  {
    q: "Which of these drugs is an ACE inhibitor?",
    options: ["Losartan", "Lisinopril", "Amlodipine", "Metoprolol"],
    answer: 1,
    why: "Drugs ending in “-pril” are ACE inhibitors. “-sartan” drugs block the angiotensin receptor instead.",
  },
];
