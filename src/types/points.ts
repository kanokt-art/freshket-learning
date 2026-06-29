export type PointEventType =
  | 'course_complete'
  | 'score_bonus'
  | 'speed_bonus'
  | 'first_attempt_bonus'
  | 'mandatory_bonus'
  | 'duration_bonus'
  | 'key_takeaway'
  | 'challenge_complete'
  | 'challenge_rank_bonus'
  | 'admin_adjust'

export interface PointEvent {
  id: string
  userId: string
  points: number          // positive = earn, negative = deduct
  type: PointEventType
  sourceId?: string       // courseId, shadowRecordId, roleplayId
  sourceName?: string     // human-readable source name
  description: string
  createdAt: Date
  createdBy: string       // 'system' or admin uid
  metadata?: Record<string, unknown>
}

export interface UserPoints {
  userId: string
  totalPoints: number
  lastUpdated: Date
}

export type PointTier = 'bronze' | 'silver' | 'gold' | 'platinum'

export const POINT_TIERS: Record<PointTier, {
  label: string
  labelTh: string
  min: number
  max: number
  color: string
  bg: string
  border: string
  icon: string
}> = {
  bronze: {
    label: 'Bronze', labelTh: 'บรอนซ์',
    min: 0, max: 499,
    color: 'text-amber-700', bg: 'bg-amber-50', border: 'border-amber-200',
    icon: '🥉',
  },
  silver: {
    label: 'Silver', labelTh: 'ซิลเวอร์',
    min: 500, max: 1499,
    color: 'text-slate-600', bg: 'bg-slate-100', border: 'border-slate-300',
    icon: '🥈',
  },
  gold: {
    label: 'Gold', labelTh: 'โกลด์',
    min: 1500, max: 2999,
    color: 'text-yellow-700', bg: 'bg-yellow-50', border: 'border-yellow-300',
    icon: '🥇',
  },
  platinum: {
    label: 'Platinum', labelTh: 'แพลตินัม',
    min: 3000, max: Infinity,
    color: 'text-freshket-700', bg: 'bg-freshket-100', border: 'border-freshket-200',
    icon: '💎',
  },
}

export const POINT_EVENT_LABELS: Record<PointEventType, string> = {
  course_complete:      'สำเร็จหลักสูตร',
  score_bonus:          'โบนัสคะแนนสูง',
  speed_bonus:          'โบนัสความเร็ว',
  first_attempt_bonus:  'โบนัสผ่านรอบแรก',
  mandatory_bonus:      'โบนัสหลักสูตรบังคับ',
  duration_bonus:       'โบนัสหลักสูตรยาว',
  key_takeaway:         'ส่ง Key Takeaway',
  challenge_complete:   'สำเร็จ Challenge',
  challenge_rank_bonus: 'โบนัสอันดับ Challenge',
  admin_adjust:         'ปรับคะแนนโดย Admin',
}

export const POINT_EVENT_COLORS: Record<PointEventType, string> = {
  course_complete:      'text-freshket-600 bg-freshket-50',
  score_bonus:          'text-yellow-600 bg-yellow-50',
  speed_bonus:          'text-blue-600 bg-blue-50',
  first_attempt_bonus:  'text-purple-600 bg-purple-50',
  mandatory_bonus:      'text-rose-600 bg-rose-50',
  duration_bonus:       'text-indigo-600 bg-indigo-50',
  key_takeaway:         'text-teal-600 bg-teal-50',
  challenge_complete:   'text-freshket-600 bg-freshket-50',
  challenge_rank_bonus: 'text-yellow-600 bg-yellow-50',
  admin_adjust:         'text-gray-600 bg-gray-100',
}

export interface LeaderboardEntry {
  userId: string
  displayName: string
  nickname?: string
  photoURL?: string | null
  teamName?: string
  teamId?: string
  totalPoints: number
  tier: PointTier
  rank: number
}
