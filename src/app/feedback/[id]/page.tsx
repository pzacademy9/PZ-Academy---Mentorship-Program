import type { Metadata } from "next";
import { getPublicSession } from "@/lib/gas";
import FeedbackClient from "./FeedbackClient";

export const metadata: Metadata = {
  title: "Share Your Feedback · PZ Academy",
};

interface Props {
  params: { id: string };
}

export default async function FeedbackPage({ params }: Props) {
  const session = await getPublicSession(params.id);

  if (!session) {
    return <ErrorState title="Link not found" message="This feedback link is not valid or has expired." />;
  }

  if (session.status.toLowerCase() === "closed") {
    return (
      <ClosedState name={session.name} speaker={session.speaker} />
    );
  }

  return <FeedbackClient session={session} />;
}

function ErrorState({ title, message }: { title: string; message: string }) {
  return (
    <div style={fullscreen}>
      <div style={{ textAlign: "center", maxWidth: 360, padding: "0 24px" }}>
        <div style={{ fontSize: 56, marginBottom: 20 }}>🔒</div>
        <h1 style={{ ...headingStyle, marginBottom: 10 }}>{title}</h1>
        <p style={subStyle}>{message}</p>
      </div>
    </div>
  );
}

function ClosedState({ name, speaker }: { name: string; speaker?: string }) {
  return (
    <div style={fullscreen}>
      <div style={{ textAlign: "center", maxWidth: 400, padding: "0 24px" }}>
        <div
          style={{
            width: 72,
            height: 72,
            borderRadius: "50%",
            background: "rgba(201,168,76,0.15)",
            border: "2px solid rgba(201,168,76,0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 20px",
            fontSize: 32,
          }}
        >
          ✓
        </div>
        <h1 style={{ ...headingStyle, marginBottom: 8 }}>Session Closed</h1>
        <p style={{ ...subStyle, marginBottom: 6 }}>{name}</p>
        {speaker && <p style={{ ...subStyle, color: "rgba(255,255,255,0.4)" }}>Speaker · {speaker}</p>}
        <p style={{ ...subStyle, marginTop: 20 }}>
          Feedback is no longer being collected for this session. Thank you.
        </p>
      </div>
    </div>
  );
}

const fullscreen: React.CSSProperties = {
  background: "#1A4D2E",
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
const headingStyle: React.CSSProperties = {
  fontFamily: "var(--font-montserrat)",
  color: "#fff",
  fontSize: 24,
  fontWeight: 800,
};
const subStyle: React.CSSProperties = {
  fontFamily: "var(--font-poppins)",
  color: "rgba(255,255,255,0.6)",
  fontSize: 15,
  lineHeight: 1.6,
};
