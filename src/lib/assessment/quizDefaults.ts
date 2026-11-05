import type { Assessment } from '@/types/assessment'
import { normalizeRevealMode, type RevealMode } from '@/lib/assessment/reveal'

// The settings a new quiz starts with: the ones the admin used last time (kept in this browser), else these.
// An existing quiz always opens with its own values, never with the remembered ones.

export const DEFAULT_TIME_LIMIT_MINUTES = 15
const MAX_MINUTES = 600
const KEY = 'fk_quiz_defaults'

export interface QuizSettings {
  passingScore: number
  /** Minutes; 0 means no limit. */
  timeLimitMinutes: number
  allowRetakeOnFail: boolean
  revealMode: RevealMode
}

export const FACTORY_SETTINGS: QuizSettings = {
  passingScore: 70,
  timeLimitMinutes: DEFAULT_TIME_LIMIT_MINUTES,
  allowRetakeOnFail: true,
  revealMode: 'all',
}

/** A whole number of minutes between 0 (no limit) and ten hours. */
export function clampMinutes(v: number): number {
  if (!Number.isFinite(v)) return 0
  return Math.min(MAX_MINUTES, Math.max(0, Math.round(v)))
}

/** What was remembered, made safe: anything missing or malformed falls back to the factory value. */
export function readQuizDefaults(raw: unknown): QuizSettings {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const score = Number(o.passingScore)
  return {
    passingScore: Number.isFinite(score) && score >= 0 && score <= 100 ? Math.round(score) : FACTORY_SETTINGS.passingScore,
    timeLimitMinutes: o.timeLimitMinutes === undefined ? FACTORY_SETTINGS.timeLimitMinutes : clampMinutes(Number(o.timeLimitMinutes)),
    allowRetakeOnFail: o.allowRetakeOnFail === false ? false : true,
    revealMode: normalizeRevealMode(o.revealMode),
  }
}

export function loadQuizDefaults(): QuizSettings {
  try {
    const raw = localStorage.getItem(KEY)
    return readQuizDefaults(raw ? JSON.parse(raw) : null)
  } catch {
    return { ...FACTORY_SETTINGS }
  }
}

export function saveQuizDefaults(s: QuizSettings): void {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* storage blocked — the next quiz starts from the defaults */ }
}

/** The settings the editor opens with: the quiz's own, or (for a new one) the remembered ones. */
export function startingSettings(
  initial: Pick<Assessment, 'passingScore' | 'timeLimitMinutes' | 'allowRetakeOnFail' | 'revealMode'> | null,
  remembered: QuizSettings | null,
): QuizSettings {
  if (!initial) return remembered ?? { ...FACTORY_SETTINGS }
  return {
    passingScore: typeof initial.passingScore === 'number' ? initial.passingScore : FACTORY_SETTINGS.passingScore,
    // An older quiz with no limit stored stays untimed rather than quietly gaining 15 minutes.
    timeLimitMinutes: clampMinutes(Number(initial.timeLimitMinutes ?? 0)),
    allowRetakeOnFail: initial.allowRetakeOnFail !== false,
    revealMode: normalizeRevealMode(initial.revealMode),
  }
}
