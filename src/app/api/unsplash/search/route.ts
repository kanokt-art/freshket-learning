import { NextRequest, NextResponse } from 'next/server'

// Picsum seed URL — deterministic per keyword, no API key needed
function picsumFallback(query: string) {
  const seed = query.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
  return `https://picsum.photos/seed/${seed}/1200/400`
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const query = searchParams.get('q')?.trim()

  if (!query) {
    return NextResponse.json({ error: 'Missing q' }, { status: 400 })
  }

  const accessKey = process.env.UNSPLASH_ACCESS_KEY

  // No API key → return Picsum fallback (still a real photo, seeded by keyword)
  if (!accessKey) {
    return NextResponse.json({ url: picsumFallback(query), source: 'picsum' })
  }

  try {
    const res = await fetch(
      `https://api.unsplash.com/search/photos?query=${encodeURIComponent(query)}&per_page=3&orientation=landscape&content_filter=high`,
      {
        headers: { Authorization: `Client-ID ${accessKey}` },
        next: { revalidate: 3600 },
      },
    )

    if (!res.ok) throw new Error(`Unsplash ${res.status}`)

    const data = await res.json()
    const photo = data.results?.[0]

    if (!photo) {
      return NextResponse.json({ url: picsumFallback(query), source: 'picsum' })
    }

    // Use raw URL with cropped dimensions for consistent 3:1 ratio
    const url = `${photo.urls.raw}&w=1200&h=400&fit=crop&auto=format&q=80`
    return NextResponse.json({
      url,
      source: 'unsplash',
      credit: photo.user.name,
    })
  } catch (e) {
    console.error('Unsplash search:', e)
    return NextResponse.json({ url: picsumFallback(query), source: 'picsum' })
  }
}
