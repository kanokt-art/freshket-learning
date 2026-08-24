// Google Calendar integration — reads the signed-in user's own "primary"
// calendar for today's events, shown on the /sale dashboard.
//
// This is an INCREMENTAL OAuth consent, not part of the base Google sign-in:
// bundling the calendar scope into every login would force every existing
// session to re-consent on their next silent auth-state restore (Firebase
// doesn't re-prompt scopes on session restore — only on an interactive
// signIn/reauthenticate call), so instead the user clicks "เชื่อมต่อ Google
// Calendar" once, which runs a normal Google popup requesting the additional
// scope for their already-signed-in account.
//
// The OAuth ACCESS token this returns (not to be confused with the app's own
// Firebase ID token) is short-lived (~1 hour) and Firebase does not refresh it
// automatically — there is no server-side refresh-token flow here, only a
// client-side token kept in sessionStorage for this tab's lifetime. When it
// expires, isCalendarConnected() returns false and the UI re-shows the
// connect button; clicking it again is a fast, low-friction re-consent (the
// browser already remembers the grant) rather than a full re-login.
//
// Prerequisite this code cannot set up by itself: the "Google Calendar API"
// must be enabled in the Google Cloud project behind this Firebase project
// (console.cloud.google.com → APIs & Services → Library). Every request below
// will fail with a 403 until that's turned on — that's a one-time step for
// whoever administers the Workspace/Firebase project, not something any
// client code can do.

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.events.readonly'
const STORAGE_KEY = 'fk_google_calendar_token_v1'

interface StoredToken {
  accessToken: string
  expiresAt: number // epoch ms
}

export interface CalendarEvent {
  id: string
  title: string
  start: Date
  end: Date
  isAllDay: boolean
  location?: string
  htmlLink?: string
  tag?: string      // short badge (e.g. a course/class code) — mockup-only for now
  note?: string      // secondary line under the time (e.g. "Recording") — mockup-only
}

function readStoredToken(): StoredToken | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as StoredToken
    if (!parsed.accessToken || Date.now() >= parsed.expiresAt) return null
    return parsed
  } catch {
    return null
  }
}

export function isCalendarConnected(): boolean {
  return readStoredToken() !== null
}

// For callers that need the raw token (e.g. to refetch a different day) —
// keeps the sessionStorage key/shape as an implementation detail of this file.
export function getStoredAccessToken(): string | null {
  return readStoredToken()?.accessToken ?? null
}

export function disconnectCalendar(): void {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(STORAGE_KEY)
}

// Runs the incremental-consent popup for the calendar scope on the ALREADY
// signed-in Firebase user. Throws on failure (popup closed, network error,
// etc.) — callers should catch and show a friendly retry state.
export async function connectGoogleCalendar(): Promise<string> {
  const fb = await import('@/lib/firebase/client')
  const provider = new fb.GoogleAuthProvider()
  provider.addScope(CALENDAR_SCOPE)
  provider.setCustomParameters({ hd: 'freshket.co' })
  const result = await fb.signInWithPopup(fb.getClientAuth(), provider)
  const credential = fb.GoogleAuthProvider.credentialFromResult(result)
  const accessToken = credential?.accessToken
  if (!accessToken) throw new Error('ไม่ได้รับสิทธิ์เข้าถึง Google Calendar')

  // Google doesn't return the token's exact lifetime here; OAuth access
  // tokens from this flow are conventionally ~1 hour — expire a little early
  // (55 min) so a near-expiry token doesn't get used for a fetch that then
  // fails mid-way.
  const expiresAt = Date.now() + 55 * 60 * 1000
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ accessToken, expiresAt }))
  return accessToken
}

function toCalendarEvent(raw: {
  id: string
  summary?: string
  htmlLink?: string
  location?: string
  start?: { dateTime?: string; date?: string }
  end?: { dateTime?: string; date?: string }
}): CalendarEvent | null {
  const startRaw = raw.start?.dateTime ?? raw.start?.date
  const endRaw = raw.end?.dateTime ?? raw.end?.date
  if (!startRaw || !endRaw) return null
  return {
    id: raw.id,
    title: raw.summary || '(ไม่มีชื่อกิจกรรม)',
    start: new Date(startRaw),
    end: new Date(endRaw),
    isAllDay: !raw.start?.dateTime, // date-only field means an all-day event
    location: raw.location,
    htmlLink: raw.htmlLink,
  }
}

// Fetches events on the user's primary calendar between `from` and `to`
// (defaults to the whole of today, local time), ordered by start time.
// `maxResults` is raised by callers requesting a month/year range instead of
// a single day, since the default of 20 would silently truncate those.
export async function fetchCalendarEvents(accessToken: string, from?: Date, to?: Date, maxResults = 20): Promise<CalendarEvent[]> {
  const timeMin = from ?? new Date(new Date().setHours(0, 0, 0, 0))
  const timeMax = to ?? new Date(new Date().setHours(23, 59, 59, 999))

  const params = new URLSearchParams({
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: String(maxResults),
  })
  const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (res.status === 401) {
    // Token expired server-side even though our local clock thought it was
    // still valid — drop it so the UI falls back to the connect button.
    disconnectCalendar()
    throw new Error('เซสชัน Google Calendar หมดอายุ กรุณาเชื่อมต่อใหม่')
  }
  if (!res.ok) throw new Error(`Google Calendar API error ${res.status}`)

  const data = await res.json()
  const items = Array.isArray(data.items) ? data.items : []
  return items
    .map(toCalendarEvent)
    .filter((e: CalendarEvent | null): e is CalendarEvent => e !== null)
}
