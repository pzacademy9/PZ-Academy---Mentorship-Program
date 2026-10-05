// Plain-words copy for Help & Safety and the Welcome Tour. Numbers come from the
// live settings so the page never disagrees with what the server enforces.
import type { SafetySettings } from "@/lib/crm/send-limits";

export type FaqItem = { id: string; question: string; answer: string[] };

const hh = (h: number) => `${String(h).padStart(2, "0")}:00`;

export const HONEST_NOTE =
  "WhatsApp does not publish its limits. The limits in this app are our cautious guesses, and your admin can change them. They lower the risk to your number but cannot remove it. A personal number carries the same risk as a company number.";

export const ADMIN_HONEST_NOTE = HONEST_NOTE.replace("your admin can change them", "you can change them");

export function helpFaq(s: SafetySettings): FaqItem[] {
  return [
    {
      id: "wait",
      question: "Why do I have to wait between messages?",
      answer: [
        `After each message the next one unlocks after a random gap of ${s.spacing_min_s} to ${s.spacing_max_s} seconds.`,
        "The pauses slow you down so you stay inside the limits and lower the chance of WhatsApp limiting your number. They cannot promise that it will not happen.",
      ],
    },
    {
      id: "daily",
      question: "What is the daily limit?",
      answer: [
        `Each WhatsApp number can start up to ${s.daily_cap} new chats a day and ${s.hourly_cap} in any hour. You get a warning when the hour is nearly used up.`,
        "Messages to people who already replied to you do not count.",
        `A new number, or one coming back from a pause, starts at ${s.warmup_start} a day and goes up by ${s.warmup_step} each day.`,
        "If several people share one number, they share its limit.",
      ],
    },
    {
      id: "break",
      question: "What does the break mean?",
      answer: [`After ${s.burst_size} messages in a row the app pauses for ${s.burst_break_min} minutes. Use the break to write your notes.`],
    },
    {
      id: "quiet",
      question: "Why can't I send at night?",
      answer: [`No messages between ${hh(s.quiet_start_hour)} and ${hh(s.quiet_end_hour)}. People are more likely to block or report a message that arrives late.`],
    },
    {
      id: "warns",
      question: "What if WhatsApp warns me?",
      answer: [
        "Stop messaging straight away.",
        `Tap "My WhatsApp warns or restricts me" at the top of the screen. It pauses that number for ${s.freeze_hours} hours and tells your admin.`,
        "Your personal number can be restricted too, so the same rules apply when you send from it.",
      ],
    },
    {
      id: "outside",
      question: "Can I message people straight from my phone?",
      answer: [
        "Please do not message new people outside the app. The app can only count messages sent through it, so messages sent outside it use up your number's limit without anyone seeing.",
      ],
    },
    {
      id: "who",
      question: "Who do I ask?",
      answer: ["Ask your admin about moving contacts, your WhatsApp number, or anything that looks wrong."],
    },
  ];
}

export const GOLDEN_RULES: readonly { title: string; body: string }[] = [
  { title: "Check the name before you send", body: "Read the message in WhatsApp before you press send." },
  { title: "Tap what happened straight away", body: "Replied, Interested, Bought or Not interested. It keeps your list right." },
  { title: "Never work around the timer", body: "Do not message new people from your phone while the app is counting down." },
];

export const TOUR_STEPS: readonly { title: string; body: string }[] = [
  {
    title: "Start with your Today list",
    body: "Every morning the people due a message are waiting here, with people who already replied at the top. Start from the top.",
  },
  {
    title: "Send a message",
    body: "Tap Message on WhatsApp. WhatsApp opens with the message filled in. Check it and press send. The app then waits a little before the next one unlocks.",
  },
  {
    title: "Tap what happened",
    body: "When they answer, tap Replied, Interested, Bought or Not interested. No forms to fill.",
  },
  {
    title: "We bring them back",
    body: "Replied comes back tomorrow and Interested in 2 days. When you message someone you choose when they come back if you hear nothing: 8 hours, 1 day (the usual), 2 days or 3 days. Bought and Not interested leave your list.",
  },
];
