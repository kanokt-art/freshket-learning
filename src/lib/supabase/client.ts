import { createClient, SupabaseClient } from '@supabase/supabase-js'

export const COURSE_IMAGES_BUCKET = 'course-images'

export function getCourseImageUrl(path: string): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  return `${url}/storage/v1/object/public/${COURSE_IMAGES_BUCKET}/${path}`
}

let _client: SupabaseClient | null = null

function getClient(): SupabaseClient {
  if (!_client) {
    _client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )
  }
  return _client
}

// Lazy proxy — createClient is NOT called at module load time
// so Next.js build won't throw when Supabase env vars are absent
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getClient() as any)[prop]
  },
})
