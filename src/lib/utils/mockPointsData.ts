import type { PointEvent, UserPoints } from '@/types/points'

function pe(
  id: string,
  userId: string,
  points: number,
  type: PointEvent['type'],
  description: string,
  daysAgo: number,
  sourceId?: string,
  sourceName?: string,
): PointEvent {
  const d = new Date()
  d.setDate(d.getDate() - daysAgo)
  return { id, userId, points, type, description, createdAt: d, createdBy: 'system', sourceId, sourceName }
}

export const MOCK_POINT_EVENTS: PointEvent[] = [
  // ─── สมชาย — Gold tier (1,820 pts) ──────────────────────────────────────────
  pe('pe-01',  'mock-sale-01', 75,  'course_complete',     'สำเร็จหลักสูตร Product Knowledge',              45, 'course-01', 'Product Knowledge'),
  pe('pe-02',  'mock-sale-01', 25,  'mandatory_bonus',     'โบนัสหลักสูตรบังคับ: Product Knowledge',         45),
  pe('pe-03',  'mock-sale-01', 25,  'score_bonus',         'โบนัสคะแนนสูง 95% (×1.5)',                       45),
  pe('pe-04',  'mock-sale-01', 30,  'speed_bonus',         'โบนัสส่งก่อนกำหนด ≥7 วัน',                     45),
  pe('pe-05',  'mock-sale-01', 10,  'first_attempt_bonus', 'โบนัสผ่านรอบแรก: Product Knowledge',            45),
  pe('pe-06',  'mock-sale-01', 90,  'course_complete',     'สำเร็จหลักสูตร Sales Skill Mastery',             35, 'course-02', 'Sales Skill Mastery'),
  pe('pe-07',  'mock-sale-01', 25,  'mandatory_bonus',     'โบนัสหลักสูตรบังคับ: Sales Skill',              35),
  pe('pe-08',  'mock-sale-01', 18,  'score_bonus',         'โบนัสคะแนนสูง 88% (×1.3)',                       35),
  pe('pe-09',  'mock-sale-01', 10,  'duration_bonus',      'โบนัสหลักสูตรยาว ≥60 นาที',                    35),
  pe('pe-10',  'mock-sale-01', 10,  'first_attempt_bonus', 'โบนัสผ่านรอบแรก: Sales Skill',                  35),
  pe('pe-11',  'mock-sale-01', 60,  'course_complete',     'สำเร็จหลักสูตร CRM System Usage',                30, 'course-03', 'CRM System Usage'),
  pe('pe-12',  'mock-sale-01', 25,  'mandatory_bonus',     'โบนัสหลักสูตรบังคับ: CRM',                      30),
  pe('pe-13',  'mock-sale-01', 10,  'first_attempt_bonus', 'โบนัสผ่านรอบแรก: CRM',                          30),
  pe('pe-14',  'mock-sale-01', 120, 'challenge_complete',  'Challenge: Sales Sprint Q2 — คะแนน 92%',         20, 'course-02', 'Sales Sprint Q2'),
  pe('pe-15',  'mock-sale-01', 200, 'challenge_rank_bonus','อันดับ #1 Challenge: Sales Sprint Q2',            20),
  pe('pe-20',  'mock-sale-01', 15,  'key_takeaway',        'ส่ง Key Takeaway: Sales Skill',                   8),
  pe('pe-21',  'mock-sale-01', 50,  'admin_adjust',        'โบนัสพิเศษ: Best Performer เดือน พ.ค.',           5),
  pe('pe-22',  'mock-sale-01', 15,  'speed_bonus',         'โบนัสส่งก่อนกำหนด 4 วัน: CRM',                 30),

  // ─── ปริยา — Silver tier (890 pts) ───────────────────────────────────────────
  pe('pe-30',  'mock-sale-02', 75,  'course_complete',     'สำเร็จหลักสูตร Product Knowledge',              40, 'course-01', 'Product Knowledge'),
  pe('pe-31',  'mock-sale-02', 25,  'mandatory_bonus',     'โบนัสหลักสูตรบังคับ: Product Knowledge',         40),
  pe('pe-32',  'mock-sale-02', 22,  'score_bonus',         'โบนัสคะแนนสูง 90% (×1.5)',                       40),
  pe('pe-33',  'mock-sale-02', 30,  'speed_bonus',         'โบนัสส่งก่อนกำหนด ≥7 วัน',                     40),
  pe('pe-34',  'mock-sale-02', 10,  'first_attempt_bonus', 'โบนัสผ่านรอบแรก: Product Knowledge',            40),
  pe('pe-35',  'mock-sale-02', 15,  'key_takeaway',        'ส่ง Key Takeaway: Product Knowledge',            38),
  pe('pe-36',  'mock-sale-02', 78,  'course_complete',     'สำเร็จหลักสูตร Sales Skill Mastery',             25, 'course-02', 'Sales Skill Mastery'),
  pe('pe-37',  'mock-sale-02', 25,  'mandatory_bonus',     'โบนัสหลักสูตรบังคับ: Sales Skill',              25),
  pe('pe-38',  'mock-sale-02', 10,  'duration_bonus',      'โบนัสหลักสูตรยาว ≥60 นาที',                    25),
  pe('pe-39',  'mock-sale-02', 15,  'speed_bonus',         'โบนัสส่งก่อนกำหนด 4 วัน: Sales Skill',         25),
  pe('pe-40',  'mock-sale-02', 10,  'first_attempt_bonus', 'โบนัสผ่านรอบแรก: Sales Skill',                  25),
  pe('pe-41',  'mock-sale-02', 96,  'challenge_complete',  'Challenge: Sales Sprint Q2 — คะแนน 88%',         20, 'course-02', 'Sales Sprint Q2'),
  pe('pe-42',  'mock-sale-02', 150, 'challenge_rank_bonus','อันดับ #2 Challenge: Sales Sprint Q2',            20),
  pe('pe-46',  'mock-sale-02', 15,  'key_takeaway',        'ส่ง Key Takeaway: Sales Skill',                  10),

  // ─── ธนกร — Bronze tier (305 pts) ────────────────────────────────────────────
  pe('pe-50',  'mock-sale-03', 30,  'course_complete',     'สำเร็จหลักสูตร Product Knowledge (ลอง 2)',       30, 'course-01', 'Product Knowledge'),
  pe('pe-51',  'mock-sale-03', 25,  'mandatory_bonus',     'โบนัสหลักสูตรบังคับ: Product Knowledge',         30),
  pe('pe-52',  'mock-sale-03', 50,  'course_complete',     'สำเร็จหลักสูตร CRM System Usage',                20, 'course-03', 'CRM System'),
  pe('pe-53',  'mock-sale-03', 25,  'mandatory_bonus',     'โบนัสหลักสูตรบังคับ: CRM',                      20),
  pe('pe-54',  'mock-sale-03', 10,  'first_attempt_bonus', 'โบนัสผ่านรอบแรก: CRM',                          20),
  pe('pe-57',  'mock-sale-03', 75,  'course_complete',     'สำเร็จหลักสูตร Product Knowledge (ลอง 1, ไม่ผ่าน)',32, 'course-01', 'Product Knowledge'),

  // ─── อรัญญา — Bronze (New Joiner, 100 pts) ───────────────────────────────────
  pe('pe-60',  'mock-sale-04', 30,  'course_complete',     'สำเร็จหลักสูตร Product Knowledge',              10, 'course-01', 'Product Knowledge'),
  pe('pe-61',  'mock-sale-04', 25,  'mandatory_bonus',     'โบนัสหลักสูตรบังคับ: Product Knowledge',         10),
  pe('pe-62',  'mock-sale-04', 15,  'speed_bonus',         'โบนัสส่งก่อนกำหนด 3 วัน',                      10),
  pe('pe-63',  'mock-sale-04', 10,  'first_attempt_bonus', 'โบนัสผ่านรอบแรก: Product Knowledge',            10),
  pe('pe-64',  'mock-sale-04', 40,  'course_complete',     'สำเร็จหลักสูตร Compliance & Ethics',              8, 'course-05', 'Compliance'),
  pe('pe-65',  'mock-sale-04', -20, 'admin_adjust',        'ปรับแก้คะแนน: ตรวจพบข้อผิดพลาดการนำเข้า',         3),

  // ─── ประสิทธิ์ (Team Lead) — Gold (2,150 pts) ────────────────────────────────
  pe('pe-70',  'mock-tl-01', 75,  'course_complete',     'สำเร็จหลักสูตร Product Knowledge',                60, 'course-01'),
  pe('pe-71',  'mock-tl-01', 25,  'mandatory_bonus',     'โบนัสหลักสูตรบังคับ: Product Knowledge',           60),
  pe('pe-72',  'mock-tl-01', 25,  'score_bonus',         'โบนัสคะแนนสูง 96% (×1.5)',                         60),
  pe('pe-73',  'mock-tl-01', 30,  'speed_bonus',         'โบนัสส่งก่อนกำหนด ≥7 วัน: Product',              60),
  pe('pe-74',  'mock-tl-01', 10,  'first_attempt_bonus', 'โบนัสผ่านรอบแรก: Product Knowledge',              60),
  pe('pe-75',  'mock-tl-01', 90,  'course_complete',     'สำเร็จหลักสูตร Sales Skill Mastery',               55, 'course-02'),
  pe('pe-76',  'mock-tl-01', 25,  'mandatory_bonus',     'โบนัสหลักสูตรบังคับ: Sales Skill',                55),
  pe('pe-77',  'mock-tl-01', 18,  'score_bonus',         'โบนัสคะแนนสูง 94% (×1.3)',                         55),
  pe('pe-78',  'mock-tl-01', 10,  'duration_bonus',      'โบนัสหลักสูตรยาว: Sales Skill',                   55),
  pe('pe-79',  'mock-tl-01', 10,  'first_attempt_bonus', 'โบนัสผ่านรอบแรก: Sales Skill',                    55),
  pe('pe-80',  'mock-tl-01', 60,  'course_complete',     'สำเร็จหลักสูตร CRM System',                        30, 'course-03'),
  pe('pe-81',  'mock-tl-01', 25,  'mandatory_bonus',     'โบนัสหลักสูตรบังคับ: CRM',                        30),
  pe('pe-82',  'mock-tl-01', 30,  'speed_bonus',         'โบนัสส่งก่อนกำหนด ≥7 วัน: CRM',                  30),
  pe('pe-83',  'mock-tl-01', 10,  'first_attempt_bonus', 'โบนัสผ่านรอบแรก: CRM',                            30),
  pe('pe-84',  'mock-tl-01', 144, 'challenge_complete',  'Challenge: Sales Sprint Q2 — คะแนน 96%',           20, 'course-02'),
  pe('pe-85',  'mock-tl-01', 100, 'challenge_rank_bonus','อันดับ #3 Challenge: Sales Sprint Q2',              20),
  pe('pe-86',  'mock-tl-01', 80,  'course_complete',     'สำเร็จหลักสูตร Leadership Fundamentals',           40, 'course-06'),
  pe('pe-87',  'mock-tl-01', 20,  'duration_bonus',      'โบนัสหลักสูตรยาว 120 นาที: Leadership',           40),
  pe('pe-88',  'mock-tl-01', 10,  'first_attempt_bonus', 'โบนัสผ่านรอบแรก: Leadership',                     40),
  pe('pe-93',  'mock-tl-01', 15,  'key_takeaway',        'ส่ง Key Takeaway: Leadership',                     35),
  pe('pe-94',  'mock-tl-01', 40,  'course_complete',     'สำเร็จหลักสูตร Compliance & Ethics',               45, 'course-05'),
  pe('pe-95',  'mock-tl-01', 25,  'mandatory_bonus',     'โบนัสหลักสูตรบังคับ: Compliance',                 45),
  pe('pe-96',  'mock-tl-01', 10,  'first_attempt_bonus', 'โบนัสผ่านรอบแรก: Compliance',                     45),
  pe('pe-97',  'mock-tl-01', 100, 'admin_adjust',        'โบนัสพิเศษ: Team of the Month เม.ย.',               7),
]

export const MOCK_USER_POINTS: UserPoints[] = [
  { userId: 'mock-sale-01', totalPoints: 1_680, lastUpdated: new Date() },
  { userId: 'mock-sale-02', totalPoints: 780,   lastUpdated: new Date() },
  { userId: 'mock-sale-03', totalPoints: 215,   lastUpdated: new Date() },
  { userId: 'mock-sale-04', totalPoints: 100,   lastUpdated: new Date() },
  { userId: 'mock-sale-05', totalPoints: 640,   lastUpdated: new Date() },
  { userId: 'mock-sale-06', totalPoints: 1_210, lastUpdated: new Date() },
  { userId: 'mock-sale-07', totalPoints: 180,   lastUpdated: new Date() },
  { userId: 'mock-sale-08', totalPoints: 60,    lastUpdated: new Date() },
  { userId: 'mock-tl-01',   totalPoints: 2_010, lastUpdated: new Date() },
  { userId: 'mock-tl-02',   totalPoints: 1_050, lastUpdated: new Date() },
  { userId: 'mock-tl-03',   totalPoints: 780,   lastUpdated: new Date() },
  { userId: 'mock-tl-04',   totalPoints: 430,   lastUpdated: new Date() },
  { userId: 'mock-mgr-01',  totalPoints: 3_200, lastUpdated: new Date() },
  { userId: 'mock-mgr-02',  totalPoints: 2_850, lastUpdated: new Date() },
]
