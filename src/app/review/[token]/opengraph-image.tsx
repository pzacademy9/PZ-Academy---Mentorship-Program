import { ImageResponse } from 'next/og';
import { fetchShareCardData } from '@/lib/share-card-data';

export const alt         = 'PZ Academy Session Feedback';
export const size        = { width: 1200, height: 630 };
export const contentType = 'image/png';

const BRAND_GREEN = '#0F3D22';
const BRAND_LIME  = '#7ED957';
const GOLD        = '#C9A84C';

async function fetchCoverBase64(url: string): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? '';
    if (!ct.startsWith('image/')) return null;
    const buf   = await res.arrayBuffer();
    const bytes = new Uint8Array(buf);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return `data:${ct};base64,${btoa(binary)}`;
  } catch {
    return null;
  }
}

function StarPath({ filled, size }: { filled: boolean; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ display: 'block' }}>
      <path
        d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"
        fill={filled ? GOLD : 'rgba(201,168,76,0.22)'}
      />
    </svg>
  );
}

interface Props { params: Promise<{ token: string }> }

export default async function OGImage({ params }: Props) {
  const { token } = await params;
  const data       = await fetchShareCardData(token);

  const title        = data?.title    ?? 'Instructor Feedback';
  const avg          = data?.avg      ?? null;
  const count        = data?.count    ?? 0;
  const coverDataUrl = data?.coverUrl ? await fetchCoverBase64(data.coverUrl) : null;

  return new ImageResponse(
    (
      <div style={{
        width: 1200, height: 630,
        position: 'relative',
        display: 'flex', flexDirection: 'column',
        fontFamily: 'sans-serif',
        background: BRAND_GREEN,
        overflow: 'hidden',
      }}>

        {/* Full-bleed cover */}
        {coverDataUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coverDataUrl}
            width={1200}
            height={630}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' }}
            alt=""
          />
        )}

        {/* Gradient overlay — dark from left for text readability */}
        <div style={{
          position: 'absolute',
          top: 0, left: 0, right: 0, bottom: 0,
          background: coverDataUrl
            ? 'linear-gradient(to right, rgba(3,10,7,0.97) 0%, rgba(10,34,20,0.85) 45%, rgba(10,34,20,0.35) 100%)'
            : 'linear-gradient(135deg, #0a2f18 0%, #030a07 100%)',
        }} />

        {/* Top accent bar */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 8, background: BRAND_LIME }} />

        {/* Left content */}
        <div style={{
          position: 'absolute',
          top: 56, left: 72, bottom: 56,
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
          maxWidth: 680,
        }}>
          <div style={{ color: BRAND_LIME, fontSize: 18, fontWeight: 700, letterSpacing: '0.12em', marginBottom: 24, textTransform: 'uppercase' }}>
            PZ ACADEMY · FEEDBACK
          </div>
          <div style={{ color: '#ffffff', fontSize: 50, fontWeight: 800, lineHeight: 1.2, marginBottom: 32 }}>
            {title}
          </div>
          {avg != null ? (
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ color: GOLD, fontSize: 76, fontWeight: 800, lineHeight: 1, marginRight: 22 }}>{avg.toFixed(1)}</span>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', marginBottom: 10 }}>
                  {[1, 2, 3, 4, 5].map((i, idx) => (
                    <div key={i} style={{ display: 'flex', marginRight: idx < 4 ? 6 : 0 }}>
                      <StarPath filled={i <= Math.round(avg)} size={38} />
                    </div>
                  ))}
                </div>
                <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 20 }}>
                  {count} {count === 1 ? 'feedback' : 'feedbacks'}
                </span>
              </div>
            </div>
          ) : (
            <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 24 }}>
              {count} {count === 1 ? 'feedback' : 'feedbacks'}
            </div>
          )}
        </div>

        {/* Bottom-right watermark */}
        <div style={{ position: 'absolute', bottom: 28, right: 56 }}>
          <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 16 }}>pz-academy.pharmacozyme.com</span>
        </div>
      </div>
    ),
    { ...size },
  );
}
