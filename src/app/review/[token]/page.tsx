import { getShareView } from '@/lib/gas';
import ReviewClient from './ReviewClient';
import type { Metadata } from 'next';
import { cache } from 'react';

// Per-request cache so generateMetadata and ReviewPage share one GAS call.
const getView = cache(getShareView);

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

  return <ReviewClient view={view} token={token} />;
}
