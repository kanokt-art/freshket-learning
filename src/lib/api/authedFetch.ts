import { getClientAuth } from '@/lib/firebase/client'

// fetch() wrapper that attaches the signed-in user's Firebase ID token as a
// Bearer header, for API routes gated by requireSuperAdmin(). Returns the same
// Response as fetch. If no user is signed in the header is omitted and the
// server will answer 401.
export async function authedFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  const token = await getClientAuth().currentUser?.getIdToken()
  const headers = new Headers(init.headers)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return fetch(input, { ...init, headers })
}

// XHR-based upload for callers that want a REAL byte-transfer progress
// percentage (e.g. a CSV upload progress bar) — fetch() has no upload-progress
// event, only XMLHttpRequest does. Same auth behavior as authedFetch: attaches
// the signed-in user's ID token as a Bearer header. Resolves with the parsed
// JSON body; rejects with an Error (message from the JSON `error` field when
// present) on a non-2xx status or network failure.
//
// `onUploadDone` fires from `xhr.upload.onload` — separately from `onProgress`
// — because browsers don't reliably fire `progress` events for small bodies
// (a typical CSV finishes in one network tick): a caller that infers "upload
// finished" only from a progress event reaching 100% can get stuck waiting
// for a tick that never comes. `xhr.upload.onload` always fires once the
// request body has actually finished sending, regardless of how many (if any)
// progress ticks preceded it.
export async function authedUpload<T = unknown>(
  url: string,
  formData: FormData,
  onProgress?: (pct: number) => void,
  onUploadDone?: () => void,
): Promise<T> {
  const token = await getClientAuth().currentUser?.getIdToken()
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`)
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.upload.onload = () => onUploadDone?.()
    xhr.onload = () => {
      let json: unknown = null
      try { json = JSON.parse(xhr.responseText) } catch { /* non-JSON body */ }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(json as T)
      } else {
        const message = (json as { error?: string } | null)?.error ?? `HTTP ${xhr.status}`
        reject(new Error(message))
      }
    }
    xhr.onerror = () => reject(new Error('เครือข่ายขัดข้อง — กรุณาลองใหม่'))
    xhr.send(formData)
  })
}
