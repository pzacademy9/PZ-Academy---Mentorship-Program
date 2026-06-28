import type { Metadata } from "next";
import { getPublicSession } from "@/lib/gas";
import FeedbackClient from "./FeedbackClient";
import { Lock, CheckCircle2, AlertCircle } from "lucide-react";

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
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          margin: "0 24px",
          background: "rgba(255, 255, 255, 0.05)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderRadius: 24,
          border: "1px solid rgba(255, 255, 255, 0.12)",
          boxShadow: "0 30px 60px -12px rgba(0, 0, 0, 0.35), 0 0 40px rgba(239, 68, 68, 0.08)",
          padding: "40px 32px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: "50%",
            background: "rgba(239, 68, 68, 0.12)",
            border: "1.5px solid rgba(239, 68, 68, 0.3)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 24px",
            color: "#FCA5A5",
          }}
        >
          <Lock size={28} />
        </div>
        <h1 style={{ ...headingStyle, marginBottom: 10 }}>{title}</h1>
        <p style={subStyle}>{message}</p>
      </div>
    </div>
  );
}

function ClosedState({ name, speaker }: { name: string; speaker?: string }) {
  return (
    <div style={fullscreen}>
      <div
        style={{
          width: "100%",
          maxWidth: 440,
          margin: "0 24px",
          background: "rgba(255, 255, 255, 0.05)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderRadius: 24,
          border: "1px solid rgba(201, 168, 76, 0.25)",
          boxShadow: "0 30px 60px -12px rgba(0, 0, 0, 0.35), 0 0 40px rgba(201, 168, 76, 0.1)",
          padding: "44px 32px",
          textAlign: "center",
        }}
      >
        <div
          style={{
            width: 68,
            height: 68,
            borderRadius: "50%",
            background: "rgba(201, 168, 76, 0.15)",
            border: "1.5px solid rgba(201, 168, 76, 0.4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            margin: "0 auto 24px",
            color: "#C9A84C",
            boxShadow: "0 0 20px rgba(201, 168, 76, 0.2)",
          }}
        >
          <CheckCircle2 size={32} />
        </div>
        <div
          style={{
            display: "inline-block",
            padding: "4px 12px",
            borderRadius: 12,
            background: "rgba(201, 168, 76, 0.12)",
            border: "1px solid rgba(201, 168, 76, 0.3)",
            color: "#C9A84C",
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            marginBottom: 16,
            fontFamily: "var(--font-montserrat)",
          }}
        >
          SESSION CONCLUDED
        </div>
        <h1 style={{ ...headingStyle, marginBottom: 8, fontSize: 22 }}>{name}</h1>
        {speaker && (
          <p style={{ ...subStyle, color: "rgba(255, 255, 255, 0.5)", fontSize: 13, marginBottom: 20 }}>
            Speaker · {speaker}
          </p>
        )}
        <div style={{ height: 1, background: "rgba(255, 255, 255, 0.1)", margin: "20px 0" }} />
        <p style={{ ...subStyle, fontSize: 14, color: "rgba(255, 255, 255, 0.7)" }}>
          Feedback collection for this session is now complete. Thank you for participating!
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
  position: "relative",
  overflow: "hidden",
};
const headingStyle: React.CSSProperties = {
  fontFamily: "var(--font-montserrat)",
  color: "#fff",
  fontSize: 24,
  fontWeight: 800,
  letterSpacing: "-0.01em",
};
const subStyle: React.CSSProperties = {
  fontFamily: "var(--font-poppins)",
  color: "rgba(255,255,255,0.65)",
  fontSize: 14,
  lineHeight: 1.6,
};

