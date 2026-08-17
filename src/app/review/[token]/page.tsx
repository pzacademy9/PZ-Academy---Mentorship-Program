import { getShareView } from '@/lib/mentorship/gas';
import type { ShareView } from '@/lib/mentorship/gas';
import { getNativeShareView } from '@/lib/data/feedback-share';
import { coverProxyUrl } from '@/lib/feedback/cover-url';
import ReviewClient from './ReviewClient';
import type { Metadata } from 'next';
import { cache } from 'react';

function rewriteCoverUrls(view: ShareView): ShareView {
  if (view.type === 'session') {
    return { ...view, session: { ...view.session, coverUrl: coverProxyUrl(view.session.coverUrl) } };
  }
  return {
    ...view,
    program:  { ...view.program,  coverUrl: coverProxyUrl(view.program.coverUrl) },
    sessions: view.sessions.map(s => ({ ...s, coverUrl: coverProxyUrl(s.coverUrl) })),
  };
}

// Try native share view first, fall back to GAS
async function resolveView(token: string): Promise<ShareView | null> {
  const native = await getNativeShareView(token);
  if (native) return native;
  return getShareView(token);
}

// Per-request cache so generateMetadata and ReviewPage share one lookup.
const getView = cache(resolveView);

interface Props { params: Promise<{ token: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { token } = await params;
  const view = await getView(token);
  const name = view
    ? view.type === 'session' ? view.session.name : view.program.name
    : 'Instructor Review';
  return { title: `${name} · PZ Academy Feedbacks` };
}

export default async function ReviewPage({ params }: Props) {
  const { token } = await params;
  const view = await getView(token);

  if (!view) {
    return (
      <div style={{
        minHeight:      '100vh',
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        background:     '#0A2214',
        color:          '#fff',
        fontFamily:     'var(--font-poppins)',
      }}>
        <div style={{ textAlign: 'center', padding: '0 24px' }}>
          <p style={{ fontSize: 56, marginBottom: 16 }}>🔒</p>
          <h1 style={{ fontFamily: 'var(--font-montserrat)', fontWeight: 800, fontSize: 22, marginBottom: 8 }}>
            Link not found
          </h1>
          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>
            This share link is invalid or has been revoked.
          </p>
        </div>
      </div>
    );
  }

  return <ReviewClient view={rewriteCoverUrls(view)} token={token} />;
}
