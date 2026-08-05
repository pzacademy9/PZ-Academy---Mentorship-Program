import { type NextRequest, NextResponse } from 'next/server';

export const runtime = 'edge';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ fileId: string }> },
) {
  const { fileId } = await params;
  if (!fileId || !/^[A-Za-z0-9_-]{10,}$/.test(fileId)) {
    return new NextResponse('Not found', { status: 404 });
  }
  try {
    const res = await fetch(
      `https://drive.google.com/thumbnail?id=${fileId}&sz=w1920`,
      { redirect: 'follow', next: { revalidate: 86400 } },
    );
    const ct = res.headers.get('content-type') ?? '';
    if (!res.ok || !ct.startsWith('image/')) {
      return new NextResponse('Not found', { status: 404 });
    }
    return new NextResponse(res.body, {
      headers: {
        'Content-Type': ct,
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
      },
    });
  } catch {
    return new NextResponse('Error', { status: 502 });
  }
}
