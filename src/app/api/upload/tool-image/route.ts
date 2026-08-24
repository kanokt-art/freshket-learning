import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { COURSE_IMAGES_BUCKET, getCourseImageUrl } from '@/lib/supabase/client'
import { requireSuperAdmin } from '@/lib/firebase/requireSuperAdmin'

// Tool cover images share the course-images bucket (under a tools/ prefix) —
// same storage project, no need for a second bucket. Otherwise identical to
// /api/upload/course-image.
const ALLOWED_TYPES: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png':  'png',
  'image/webp': 'webp',
}
const MAX_BYTES = 5 * 1024 * 1024 // 5 MB — a tool card header never needs more

export async function POST(req: NextRequest) {
  try {
    // This route holds the Supabase SERVICE-ROLE key, which bypasses storage
    // policies — must stay super_admin-gated (mirrors course-image).
    const gate = await requireSuperAdmin(req)
    if (!gate.ok) return gate.response

    const formData = await req.formData()
    const file = formData.get('file') as File
    const toolId = formData.get('toolId') as string

    if (!file || !toolId) {
      return NextResponse.json({ error: 'file and toolId are required' }, { status: 400 })
    }

    // `toolId` is interpolated into the storage path, so it must not be able to
    // contain `/` or `..` — otherwise it escapes the tool's own prefix and can
    // overwrite unrelated objects in the bucket.
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(toolId)) {
      return NextResponse.json({ error: 'Invalid toolId' }, { status: 400 })
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
    const path = `tools/${toolId}/header.${ext}`
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
