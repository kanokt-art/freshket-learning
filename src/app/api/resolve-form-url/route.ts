import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/firebase/requireStaff'

// forms.gle/xxxx is a redirect Google itself serves, and the redirect target
// (docs.google.com/forms/d/e/.../viewform) is what actually embeds in an
// iframe. A browser can't resolve that redirect itself — the target host
// doesn't send CORS headers for a cross-origin fetch — so this route does it
// server-side, where CORS doesn't apply, and hands back only the resolved URL.
//
// Restricted to the forms.gle host (not a general URL-follow proxy) to avoid
// this becoming an open SSRF endpoint that fetches arbitrary caller-supplied
// URLs from the server.
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const gate = await requireStaff(req, typeof body.idToken === 'string' ? body.idToken : undefined)
  if (!gate.ok) return gate.response

  const url = typeof body.url === 'string' ? body.url.trim() : ''
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
  }
  if (parsed.hostname !== 'forms.gle') {
    return NextResponse.json({ error: 'Only forms.gle links are supported' }, { status: 400 })
  }

  try {
    const res = await fetch(parsed.toString(), { method: 'GET', redirect: 'follow' })
    // fetch() follows redirects transparently — res.url is the final landing page.
    if (!res.url.includes('docs.google.com/forms')) {
      return NextResponse.json({ error: 'Link did not resolve to a Google Form' }, { status: 422 })
    }
    return NextResponse.json({ resolvedUrl: res.url })
  } catch (e) {
    console.error('POST /api/resolve-form-url', e)
    return NextResponse.json({ error: 'Could not reach forms.gle' }, { status: 502 })
  }
}
