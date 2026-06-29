import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export const COURSE_IMAGES_BUCKET = 'course-images'

export function getCourseImageUrl(path: string): string {
  return `${supabaseUrl}/storage/v1/object/public/${COURSE_IMAGES_BUCKET}/${path}`
}
