import { NextRequest, NextResponse } from 'next/server'
import { getStore } from '@/lib/server/store'
import { requireManager } from '@/lib/server/auth'
import { computeAutoTeamMappings } from '@/lib/users/autoMapTeam'
import { syncCoursesForMoves } from '@/lib/server/teamMoves'
import type { Team, UserProfile } from '@/types/user'

// POST /api/users/auto-map-teams
//
// Puts people who have no team into their line manager's team: the HR file's "Line Manager" column
// ("Pataranuch (Tao)") is matched to a team's own lead (see lib/users/autoMapTeam.ts). The HR import
// calls this after every upload, so a new joiner lands in the right team without anyone pressing
// anything. Additive only, as the rule is: a person who already has a team is never moved, and a person
// whose line manager leads no team yet is left alone, in their department's pool.
//
// Reads from the database rather than trusting what the browser has, because it runs a few seconds
// after an import, when the browser's copy of the employee list is already out of date.

const WRITE_CONCURRENCY = 8

export async function POST(req: NextRequest) {
  try {
    const gate = await requireManager(req)
    if (!gate.ok) return gate.response

    const store = getStore()
    const [userDocs, teamDocs] = await Promise.all([store.query('users'), store.query('teams')])
    const users = userDocs.map((d) => ({ ...d, uid: (d.uid as string | undefined) ?? d.id })) as unknown as UserProfile[]
    const teams = teamDocs as unknown as Team[]

    const targets = computeAutoTeamMappings(users, teams)
    for (let i = 0; i < targets.length; i += WRITE_CONCURRENCY) {
      await Promise.all(targets.slice(i, i + WRITE_CONCURRENCY).map((t) => store.update('users', t.uid, { teamId: t.teamId })))
    }

    // Courses aimed at a team follow the move, as they do for a move made by hand.
    let courseSync: { coursesUpdated: number; totalAdded: number } | { failed: true } | undefined
    if (targets.length > 0) {
      try {
        const moved = new Set(targets.map((t) => t.uid))
        courseSync = await syncCoursesForMoves(store, targets, userDocs.filter((d) => moved.has(d.id)))
      } catch (e) {
        console.error('course sync after auto-map failed', e)
        courseSync = { failed: true }
      }
    }

    return NextResponse.json({ mapped: targets.length, courseSync })
  } catch (e) {
    console.error('POST /api/users/auto-map-teams', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
