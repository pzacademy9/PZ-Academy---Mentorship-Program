import { getAgentByToken } from "@/lib/data/leads";
import { LeadCaptureForm } from "@/components/leads/LeadCaptureForm";

export default async function LeadCapturePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const agent = await getAgentByToken(token);

  if (!agent) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-white px-6 text-center dark:bg-[#101412]">
        <div>
          <h1 className="font-fredoka text-xl text-pz-ink dark:text-[#e0e3df]">Link not recognized</h1>
          <p className="mt-2 font-body text-sm text-pz-ink/70 dark:text-[#e0e3df]/70">
            This lead-capture link is invalid or has been disabled. Ask your team lead for a fresh link.
          </p>
        </div>
      </main>
    );
  }

  return <LeadCaptureForm token={token} agentName={agent.name} />;
}
