import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { COURSE_IMAGES_BUCKET, getCourseImageUrl } from '@/lib/supabase/client'
import { requireSuperAdmin } from '@/lib/firebase/requireSuperAdmin'

// Only real image types may be stored — `file.type` is attacker-controlled, so it
// is checked against a whitelist rather than passed through to `contentType`.
// Without this, the bucket could be used to serve HTML/JS from the company domain.
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
}
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB — a 3:1 course header never needs more

export async function POST(req: NextRequest) {
  try {
    // This route holds the Supabase SERVICE-ROLE key, which bypasses storage
    // policies. It was previously unauthenticated: any anonymous caller could
    // upload arbitrary content to the company bucket and overwrite any object.
    const gate = await requireSuperAdmin(req)
    if (!gate.ok) return gate.response

    const formData = await req.formData()
    const file = formData.get('file') as File
    const courseId = formData.get('courseId') as string

    if (!file || !courseId) {
      return NextResponse.json({ error: 'file and courseId are required' }, { status: 400 })
    }

    // `courseId` is interpolated into the storage path, so it must not be able to
    // contain `/` or `..` — otherwise it escapes the course's own prefix and can
    // overwrite unrelated objects in the bucket.
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(courseId)) {
      return NextResponse.json({ error: 'Invalid courseId' }, { status: 400 })
    }

    const ext = ALLOWED_TYPES[file.type]
    if (!ext) {
      return NextResponse.json(
        { error: 'Unsupported image type — use JPEG, PNG, or WebP' },
        { status: 415 },
      )
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json({ error: 'Image exceeds the 5 MB limit' }, { status: 413 })
    }

    // Extension is derived from the validated MIME type, never from file.name.
    const path = `${courseId}/header.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const supabase = getSupabaseAdmin()
    const { error } = await supabase.storage
      .from(COURSE_IMAGES_BUCKET)
      .upload(path, buffer, {
        contentType: file.type,
        upsert: true,
      })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ url: getCourseImageUrl(path) })
  } catch (err) {
    console.error('Upload error:', err)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
