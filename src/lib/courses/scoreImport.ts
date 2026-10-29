// What a per-course score import does to each person's training record.
//
// The file has one row per sitting: a person usually appears twice, once with
// type=pre (before the course) and once with type=post (after). Both belong on ONE
// record per person per course, in separate columns, so the before/after gain can
// be read off it. This module is the pure part of that — grouping the rows and
// working out what to write — so it is tested without a database or a file.
//
// UPLOADING THE SAME FILE AGAIN: the new file wins. Every value the file carries
// replaces what was stored. A value the file does NOT carry (a blank score, or a
// person with only a pre row when a post score is already on file) is left as it is,
// because absence is not a correction.

export type ScoreType = 'pre' | 'post'

export interface ScoreRow {
  email: string
  type: ScoreType
  score?: number
  status: string
  completedAt?: string
}

export interface ExistingRecord {
  preTestScore?: number | null
  postTestScore?: number | null
  score?: number | null
  status?: string
  startedAt?: unknown
  completedAt?: unknown
}

export interface PersonScores {
  email: string
  pre?: ScoreRow
  post?: ScoreRow
}

/**
 * One entry per person, in the order they first appear. If the same person has two
 * rows of the same type in the file, the LAST one wins — a corrected row further
 * down is the one meant.
 */
export function groupByPerson(rows: ScoreRow[]): PersonScores[] {
  const byEmail = new Map<string, PersonScores>()
  for (const r of rows) {
    const p = byEmail.get(r.email) ?? { email: r.email }
    p[r.type] = r
    byEmail.set(r.email, p)
  }
  return Array.from(byEmail.values())
}

/**
 * The fields to MERGE into the person's training record.
 *
 *  · A pre row sets the before-score. It never says the course is finished, so its
 *    `status` column is ignored; a person who has only a pre row and no record yet
 *    starts as "in progress".
 *  · A post row sets the after-score, the course `score` (what the reports use), the
 *    status, and the completion date. With no date in the file, a re-upload keeps the
 *    date already stored instead of moving it to today.
 *  · A score that is blank in the file is not written.
 */
export function recordPatch(p: PersonScores, existing: ExistingRecord | null, now: Date): Record<string, unknown> {
  const patch: Record<string, unknown> = {}

  if (p.pre) {
    if (p.pre.score != null) patch.preTestScore = p.pre.score
    if (p.pre.completedAt && !existing?.startedAt) patch.startedAt = new Date(p.pre.completedAt)
  }

  if (p.post) {
    if (p.post.score != null) {
      patch.postTestScore = p.post.score
      patch.score = p.post.score
    }
    patch.status = p.post.status
    if (p.post.status === 'completed') {
      patch.completedAt = p.post.completedAt ? new Date(p.post.completedAt) : (existing?.completedAt ?? now)
    } else {
      patch.completedAt = null
    }
  } else if (!existing) {
    patch.status = 'in_progress'
  }

  return patch
}

/** What the preview shows for one person: the file's values against what is stored. */
export interface ScoreDiff {
  existing: { pre: number | null; post: number | null; status: string }
  next: { pre: number | null; post: number | null; status: string }
}

export function diffOf(p: PersonScores, existing: ExistingRecord | null): ScoreDiff {
  const pre = existing?.preTestScore ?? null
  const post = existing?.postTestScore ?? null
  const status = existing?.status ?? 'not_started'
  return {
    existing: { pre, post, status },
    next: {
      pre: p.pre?.score ?? pre,
      post: p.post?.score ?? post,
      status: p.post ? p.post.status : (existing ? status : 'in_progress'),
    },
  }
}
