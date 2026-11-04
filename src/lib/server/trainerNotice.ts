import { trainerEmails } from './saleTrainers'
import type { Store } from './store'
import type { NotifType } from '@/types/notification'

// What a team lead or manager says about a learner reaches the Sale Trainer too, in their own in-app
// notifications (the bell and the sidebar), with a link to the learner's page where the whole comment is
// read. The Slack group card tags them as well; this is the part they can open and read. The trainers are
// the people configured in saleTrainers.ts, found by company email.

type Doc = Record<string, unknown>

type TrainerStore = Pick<Store, 'findUsers' | 'set'>

/** Person ids of the configured trainers (the HR-imported profile wins when an email has several). */
export async function trainerPersonIds(store: Pick<Store, 'findUsers'>): Promise<string[]> {
  const ids: string[] = []
  for (const email of trainerEmails()) {
    const rows = await store.findUsers({ email })
    const pick = rows.find((r) => r.id.startsWith('csv-')) ?? rows[0]
    if (pick && !ids.includes(pick.id)) ids.push(pick.id)
  }
  return ids
}

export interface TrainerNotice {
  /** The person who gave the feedback: a trainer who is also the giver is not told about their own. */
  exceptUid: string
  type: NotifType
  /** Makes the notice's id: one per trainer and event, so a replay overwrites instead of stacking. */
  key: string
  title: string
  body: string
  refId: string
  refPath: string
}

/** Best effort: telling the trainer must never fail the action that triggered it. */
export async function notifyTrainers(store: TrainerStore, n: TrainerNotice): Promise<number> {
  try {
    const ids = (await trainerPersonIds(store)).filter((id) => id !== n.exceptUid)
    const now = new Date()
    await Promise.all(ids.map((uid) =>
      store.set(`notifications/${uid}/items`, `${n.type}_${n.key}_${uid}`, {
        type: n.type, title: n.title, body: n.body, refId: n.refId, refPath: n.refPath,
        read: false, createdAt: now, createdByUid: n.exceptUid,
      } as Doc, { merge: false }),
    ))
    return ids.length
  } catch (e) {
    console.error('trainer notice failed', e)
    return 0
  }
}
