import { requireAdminPage } from "@/lib/auth/require-admin";
import { getQuestionBank } from "@/lib/data/feedback-question-bank";
import { QuestionBankEditor } from "./QuestionBankEditor";

export const metadata = { title: "Question Bank — PZ Academy" };

export default async function AdminQuestionBankPage() {
  await requireAdminPage();

  const questions = await getQuestionBank();

  return <QuestionBankEditor initialQuestions={questions} />;
}
