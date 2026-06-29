import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase/server'
import { COURSE_IMAGES_BUCKET, getCourseImageUrl } from '@/lib/supabase/client'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    const courseId = formData.get('courseId') as string

    if (!file || !courseId) {
      return NextResponse.json({ error: 'file and courseId are required' }, { status: 400 })
    }

    const ext = file.name.split('.').pop()
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
