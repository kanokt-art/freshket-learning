import type { CourseCategory } from '@/types/course'
import type { PointTier } from '@/types/points'
import { POINT_TIERS } from '@/types/points'

export const CATEGORY_BASE_POINTS: Record<CourseCategory, number> = {
  product:     50,
  sales_skill: 60,
  compliance:  40,
  onboarding:  30,
  leadership:  80,
}

// ── Score multiplier applied to base points ───────────────────────────────────
export function getScoreMultiplier(score?: number): number {
  if (score === undefined) return 1.0
  if (score >= 90) return 1.5
  if (score >= 80) return 1.3
  if (score >= 70) return 1.1
  if (score >= 60) return 1.0
  return 0.5
}

// ── Bonus for long courses ────────────────────────────────────────────────────
export function getDurationBonus(durationMinutes: number): number {
  if (durationMinutes >= 120) return 20
  if (durationMinutes >= 60) return 10
  return 0
}

// ── Bonus for completing before deadline ─────────────────────────────────────
export function getSpeedBonus(completedAt: Date, dueDate?: Date): number {
  if (!dueDate) return 0
  const daysBeforeDue = Math.floor(
    (dueDate.getTime() - completedAt.getTime()) / (1000 * 60 * 60 * 24),
  )
  if (daysBeforeDue >= 7) return 30
  if (daysBeforeDue >= 3) return 15
  return 0
}

// ── Challenge rank bonus ──────────────────────────────────────────────────────
export function getChallengeRankBonus(rank: number, totalParticipants: number): number {
  if (rank === 1) return 200
  if (rank === 2) return 150
  if (rank === 3) return 100
  if (rank <= Math.ceil(totalParticipants * 0.25)) return 50
  return 0
}

// ── Tier from cumulative points ───────────────────────────────────────────────
export function getTier(totalPoints: number): PointTier {
  if (totalPoints >= 3000) return 'platinum'
  if (totalPoints >= 1500) return 'gold'
  if (totalPoints >= 500)  return 'silver'
  return 'bronze'
}

// ── Progress percentage within current tier ───────────────────────────────────
export function getTierProgress(totalPoints: number): number {
  const tier = getTier(totalPoints)
  const { min, max } = POINT_TIERS[tier]
  if (max === Infinity) return 100
  return Math.min(100, Math.round(((totalPoints - min) / (max - min)) * 100))
}

// ── Points remaining to next tier ────────────────────────────────────────────
export function getPointsToNextTier(totalPoints: number): number | null {
  const tier = getTier(totalPoints)
  const { max } = POINT_TIERS[tier]
  if (max === Infinity) return null
  return max - totalPoints + 1
}

// ── Full breakdown for one course completion ──────────────────────────────────
export interface CoursePointBreakdown {
  base: number
  scoreMult: number
  afterScoreMult: number
  durationBonus: number
  mandatoryBonus: number
  speedBonus: number
  firstAttemptBonus: number
  challengeMultiplier: number
  total: number
}

export function calcCoursePoints(opts: {
  category: CourseCategory
  durationMinutes: number
  isRequired: boolean
  score?: number
  completedAt?: Date
  dueDate?: Date
  attemptCount?: number
  challengeMultiplier?: number
}): CoursePointBreakdown {
  const base = CATEGORY_BASE_POINTS[opts.category]
  const mult = getScoreMultiplier(opts.score)
  const cm = opts.challengeMultiplier ?? 1
  const afterScoreMult = Math.round(base * cm * mult)
  const durationBonus = getDurationBonus(opts.durationMinutes)
  const mandatoryBonus = opts.isRequired ? 25 : 0
  const speedBonus =
    opts.completedAt && opts.dueDate ? getSpeedBonus(opts.completedAt, opts.dueDate) : 0
  const firstAttemptBonus = (opts.attemptCount ?? 1) <= 1 ? 10 : 0
  const total = afterScoreMult + durationBonus + mandatoryBonus + speedBonus + firstAttemptBonus

  return {
    base,
    scoreMult: mult,
    afterScoreMult,
    durationBonus,
    mandatoryBonus,
    speedBonus,
    firstAttemptBonus,
    challengeMultiplier: cm,
    total,
  }
}

// ── Human-readable breakdown string (for ledger description) ─────────────────
export function calcBreakdownLabel(bd: CoursePointBreakdown): string {
  const parts: string[] = [`Base ${bd.base} pts`]
  if (bd.challengeMultiplier > 1) parts.push(`×${bd.challengeMultiplier} Challenge`)
  if (bd.scoreMult !== 1) parts.push(`×${bd.scoreMult} Score`)
  if (bd.durationBonus) parts.push(`+${bd.durationBonus} Duration`)
  if (bd.mandatoryBonus) parts.push(`+${bd.mandatoryBonus} Mandatory`)
  if (bd.speedBonus) parts.push(`+${bd.speedBonus} Speed`)
  if (bd.firstAttemptBonus) parts.push(`+${bd.firstAttemptBonus} First-try`)
  return parts.join(' · ')
}
