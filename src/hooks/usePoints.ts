'use client'

import { useState, useEffect, useMemo } from 'react'
import { getDemoMode } from '@/lib/demo/demoMode'
import { MOCK_POINT_EVENTS, MOCK_USER_POINTS } from '@/lib/utils/mockPointsData'
import type { PointEvent, UserPoints, LeaderboardEntry } from '@/types/points'
import { getTier } from '@/lib/utils/pointsCalc'

const DEMO = getDemoMode()

// ── useMyPoints — cumulative total for current user ───────────────────────────
export function useMyPoints(userId?: string) {
  const [data, setData]     = useState<UserPoints | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) { setLoading(false); return }

    if (DEMO) {
      const found = MOCK_USER_POINTS.find(p => p.userId === userId) ?? null
      setData(found)
      setLoading(false)
      return
    }

    // Live Firestore read
    let unsub: (() => void) | undefined
    ;(async () => {
      const { getClientFirestore } = await import('@/lib/firebase/client')
      const { doc, onSnapshot } = await import('firebase/firestore')
      const db = getClientFirestore()
      unsub = onSnapshot(doc(db, 'userPoints', userId), snap => {
        if (snap.exists()) {
          const d = snap.data()
          setData({ userId, totalPoints: d.totalPoints ?? 0, lastUpdated: d.lastUpdated?.toDate() ?? new Date() })
        } else {
          setData({ userId, totalPoints: 0, lastUpdated: new Date() })
        }
        setLoading(false)
      })
    })()

    return () => unsub?.()
  }, [userId])

  return { data, loading }
}

// ── usePointsLedger — transaction history for a user ─────────────────────────
export function usePointsLedger(userId?: string) {
  const [events, setEvents]   = useState<PointEvent[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!userId) { setLoading(false); return }

    if (DEMO) {
      const filtered = MOCK_POINT_EVENTS.filter(e => e.userId === userId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      setEvents(filtered)
      setLoading(false)
      return
    }

    let unsub: (() => void) | undefined
    ;(async () => {
      const { getClientFirestore } = await import('@/lib/firebase/client')
      const { collection, query, where, orderBy, onSnapshot } = await import('firebase/firestore')
      const db = getClientFirestore()
      const q = query(
        collection(db, 'pointsLedger'),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
      )
      unsub = onSnapshot(q, snap => {
        setEvents(snap.docs.map(d => {
          const data = d.data()
          return {
            id: d.id,
            userId: data.userId,
            points: data.points,
            type: data.type,
            sourceId: data.sourceId,
            sourceName: data.sourceName,
            description: data.description,
            createdAt: data.createdAt?.toDate() ?? new Date(),
            createdBy: data.createdBy,
            metadata: data.metadata,
          } as PointEvent
        }))
        setLoading(false)
      })
    })()

    return () => unsub?.()
  }, [userId])

  return { events, loading }
}

// ── useLeaderboard — ranked list of all users ─────────────────────────────────
export function useLeaderboard(teamId?: string) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (DEMO) {
      const { MOCK_USERS } = require('@/lib/utils/mockData') as { MOCK_USERS: Array<{ uid: string; displayName: string; nickname?: string; photoURL?: string | null; teamId?: string }> }
      const { MOCK_TEAMS }  = require('@/lib/utils/mockData') as { MOCK_TEAMS: Array<{ id: string; name: string }> }

      const teamMap: Record<string, string> = {}
      MOCK_TEAMS.forEach((t: { id: string; name: string }) => { teamMap[t.id] = t.name })

      let pts = [...MOCK_USER_POINTS]
      if (teamId) {
        const membersInTeam = new Set(
          MOCK_USERS.filter((u: { teamId?: string }) => u.teamId === teamId).map((u: { uid: string }) => u.uid)
        )
        pts = pts.filter(p => membersInTeam.has(p.userId))
      }

      pts.sort((a, b) => b.totalPoints - a.totalPoints)

      const ranked: LeaderboardEntry[] = pts.map((p, idx) => {
        const u = MOCK_USERS.find((u: { uid: string }) => u.uid === p.userId)
        return {
          userId: p.userId,
          displayName: u?.displayName ?? p.userId,
          nickname: u?.nickname,
          photoURL: u?.photoURL ?? null,
          teamId: (u as { teamId?: string })?.teamId,
          teamName: (u as { teamId?: string })?.teamId ? teamMap[(u as { teamId?: string }).teamId!] : undefined,
          totalPoints: p.totalPoints,
          tier: getTier(p.totalPoints),
          rank: idx + 1,
        }
      })

      setEntries(ranked)
      setLoading(false)
      return
    }

    // Live mode: read all userPoints and join with user profiles
    let unsub: (() => void) | undefined
    ;(async () => {
      const { getClientFirestore } = await import('@/lib/firebase/client')
      const { collection, query, orderBy, onSnapshot, where } = await import('firebase/firestore')
      const db = getClientFirestore()

      const constraints = [orderBy('totalPoints', 'desc')]
      const q = query(collection(db, 'userPoints'), ...constraints)
      unsub = onSnapshot(q, snap => {
        const list: LeaderboardEntry[] = snap.docs.map((d, idx) => {
          const data = d.data()
          return {
            userId: d.id,
            displayName: data.displayName ?? d.id,
            nickname: data.nickname,
            photoURL: data.photoURL ?? null,
            teamId: data.teamId,
            teamName: data.teamName,
            totalPoints: data.totalPoints ?? 0,
            tier: getTier(data.totalPoints ?? 0),
            rank: idx + 1,
          }
        })
        setEntries(teamId ? list.filter(e => e.teamId === teamId) : list)
        setLoading(false)
      })
    })()

    return () => unsub?.()
  }, [teamId])

  return { entries, loading }
}

// ── useAllUserPoints — for admin view (map of userId → totalPoints) ────────────
export function useAllUserPoints(): Record<string, number> {
  const [map, setMap] = useState<Record<string, number>>({})

  useEffect(() => {
    if (DEMO) {
      const m: Record<string, number> = {}
      MOCK_USER_POINTS.forEach(p => { m[p.userId] = p.totalPoints })
      setMap(m)
      return
    }

    let unsub: (() => void) | undefined
    ;(async () => {
      const { getClientFirestore } = await import('@/lib/firebase/client')
      const { collection, onSnapshot } = await import('firebase/firestore')
      const db = getClientFirestore()
      unsub = onSnapshot(collection(db, 'userPoints'), snap => {
        const m: Record<string, number> = {}
        snap.docs.forEach(d => { m[d.id] = d.data().totalPoints ?? 0 })
        setMap(m)
      })
    })()

    return () => unsub?.()
  }, [])

  return map
}

// ── pointsThisMonth — helper used in the points page ─────────────────────────
export function usePointsThisMonth(events: PointEvent[]): number {
  return useMemo(() => {
    const now = new Date()
    return events
      .filter(e => {
        const d = e.createdAt
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() && e.points > 0
      })
      .reduce((sum, e) => sum + e.points, 0)
  }, [events])
}
