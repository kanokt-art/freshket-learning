import { findSlackIdByEmail, type SlackLookup } from '@/lib/notifications/slackDm'

// The Sale Trainer(s) tagged on every completion card in the trainer × team-lead group. They are people,
// not a Slack channel: a mention needs the person's member id (U…), which is looked up from their company
// email — a direct-message channel id (D…) cannot be mentioned. A trainer Slack cannot find is named in
// plain text. Set SLACK_TRAINER_EMAILS (comma-separated company emails) to change who is tagged.

export interface TrainerRef {
  name: string
  slackUserId?: string
}

const DEFAULT_TRAINERS: Array<{ name: string; email: string }> = [
  { name: 'Kanok (Benz) Thongtaem', email: 'kanok.t@freshket.co' },
]

const SLACK_ID = /^[UW][A-Z0-9]{6,}$/

// A member id does not change, so a found one is kept; a miss is only remembered briefly.
const found = new Map<string, string>()
const MISS_TTL_MS = 10 * 60 * 1000
const misses = new Map<string, number>()

/** For tests: forget what was remembered. */
export function resetTrainerLookups(): void {
  found.clear()
  misses.clear()
}

function configured(): Array<{ name: string; email: string }> {
  const raw = process.env.SLACK_TRAINER_EMAILS?.trim()
  if (!raw) return DEFAULT_TRAINERS
  const emails = raw.split(',').map((e) => e.trim().toLowerCase()).filter((e) => /^[^\s@]+@[^\s@]+$/.test(e))
  return emails.map((email) => ({ name: DEFAULT_TRAINERS.find((t) => t.email === email)?.name ?? email, email }))
}

/** The company emails of the trainers who are tagged and told. */
export function trainerEmails(): string[] {
  return configured().map((t) => t.email)
}

export async function saleTrainers(
  lookup: (email: string) => Promise<SlackLookup> = findSlackIdByEmail,
): Promise<TrainerRef[]> {
  try {
    const out: TrainerRef[] = []
    for (const t of configured()) {
      let id = found.get(t.email)
      if (!id) {
        const missedAt = misses.get(t.email)
        if (missedAt === undefined || Date.now() - missedAt >= MISS_TTL_MS) {
          const res = await lookup(t.email)
          if (res.id && SLACK_ID.test(res.id)) { id = res.id; found.set(t.email, id) } else misses.set(t.email, Date.now())
        }
      }
      out.push({ name: t.name, ...(id ? { slackUserId: id } : {}) })
    }
    return out
  } catch {
    return []
  }
}
