import type { UserProfile, Team, Department } from '@/types/user'
import type { Course, Resource } from '@/types/course'
import type { TrainingRecord } from '@/types/tracking'
import type { Assessment } from '@/types/assessment'
import type { PointEvent, UserPoints } from '@/types/points'

type MockUser = Omit<UserProfile, 'createdAt' | 'updatedAt'>

// ─── Departments ──────────────────────────────────────────────────────────────
export const MOCK_DEPARTMENTS: Department[] = [
  { id: 'dept-sale', name: 'Sale',        managerId: 'mock-mgr-01' },
  { id: 'dept-ka',   name: 'Key Account', managerId: 'mock-mgr-02' },
]

// ─── Teams ────────────────────────────────────────────────────────────────────
export const MOCK_TEAMS: Team[] = [
  { id: 'team-sale-a', name: 'ทีม Sale A', departmentId: 'dept-sale', managerId: 'mock-mgr-01', teamLeadId: 'mock-tl-01' },
  { id: 'team-sale-b', name: 'ทีม Sale B', departmentId: 'dept-sale', managerId: 'mock-mgr-01', teamLeadId: 'mock-tl-02' },
  { id: 'team-ka-a',   name: 'ทีม KA A',   departmentId: 'dept-ka',   managerId: 'mock-mgr-02', teamLeadId: 'mock-tl-03' },
  { id: 'team-ka-b',   name: 'ทีม KA B',   departmentId: 'dept-ka',   managerId: 'mock-mgr-02', teamLeadId: 'mock-tl-04' },
]

// ─── Users ────────────────────────────────────────────────────────────────────
export const MOCK_USERS: MockUser[] = [
  // Super Admin
  {
    uid: 'mock-admin-01',
    email: 'kanok.t@freshket.co',
    displayName: 'กนก ทองดี',
    photoURL: null,
    role: 'super_admin',
    nickname: 'นก',
    employeeId: 'FK-001',
    department: 'People & Engagement',
    position: 'HR Manager',
    startDate: new Date('2022-01-01'),
  },

  // Managers
  {
    uid: 'mock-mgr-01',
    email: 'wanchai.s@freshket.co',
    displayName: 'วันชัย สมใจ',
    photoURL: null,
    role: 'manager',
    nickname: 'ชัย',
    employeeId: 'FK-002',
    department: 'Sale',
    position: 'Sales Manager',
    startDate: new Date('2022-06-01'),
  },
  {
    uid: 'mock-mgr-02',
    email: 'nattaporn.k@freshket.co',
    displayName: 'ณัฐพร กาญจนา',
    photoURL: null,
    role: 'manager',
    nickname: 'พร',
    employeeId: 'FK-003',
    department: 'Key Account',
    position: 'Key Account Manager',
    startDate: new Date('2022-09-15'),
  },

  // Team Leads — Sale
  {
    uid: 'mock-tl-01',
    email: 'prasit.w@freshket.co',
    displayName: 'ประสิทธิ์ วงศ์ใหม่',
    photoURL: null,
    role: 'team_lead',
    teamId: 'team-sale-a',
    managerId: 'mock-mgr-01',
    nickname: 'ติ',
    employeeId: 'FK-010',
    department: 'Sale',
    position: 'Team Lead',
    startDate: new Date('2023-01-10'),
  },
  {
    uid: 'mock-tl-02',
    email: 'siriporn.m@freshket.co',
    displayName: 'ศิริพร มั่นคง',
    photoURL: null,
    role: 'team_lead',
    teamId: 'team-sale-b',
    managerId: 'mock-mgr-01',
    nickname: 'พร',
    employeeId: 'FK-011',
    department: 'Sale',
    position: 'Team Lead',
    startDate: new Date('2023-03-01'),
  },

  // Team Leads — Key Account
  {
    uid: 'mock-tl-03',
    email: 'sutthi.l@freshket.co',
    displayName: 'สุทธิชัย ลือชา',
    photoURL: null,
    role: 'team_lead',
    teamId: 'team-ka-a',
    managerId: 'mock-mgr-02',
    nickname: 'ชัย',
    employeeId: 'FK-012',
    department: 'Key Account',
    position: 'Team Lead',
    startDate: new Date('2023-05-01'),
  },
  {
    uid: 'mock-tl-04',
    email: 'apichat.k@freshket.co',
    displayName: 'อภิชาติ แก้วใส',
    photoURL: null,
    role: 'team_lead',
    teamId: 'team-ka-b',
    managerId: 'mock-mgr-02',
    nickname: 'ชาติ',
    employeeId: 'FK-013',
    department: 'Key Account',
    position: 'Team Lead',
    startDate: new Date('2023-07-15'),
  },

  // Sales — Team Sale A
  {
    uid: 'mock-sale-01',
    email: 'somchai.j@freshket.co',
    displayName: 'สมชาย จันทร์ดี',
    photoURL: null,
    role: 'sale',
    teamId: 'team-sale-a',
    managerId: 'mock-tl-01',
    nickname: 'ชาย',
    employeeId: 'FK-020',
    department: 'Sale',
    position: 'Sale Executive',
    startDate: new Date('2024-01-15'),
  },
  {
    uid: 'mock-sale-02',
    email: 'priya.a@freshket.co',
    displayName: 'ปริยา อ่อนหวาน',
    photoURL: null,
    role: 'sale',
    teamId: 'team-sale-a',
    managerId: 'mock-tl-01',
    nickname: 'ยา',
    employeeId: 'FK-021',
    department: 'Sale',
    position: 'Sale Executive',
    startDate: new Date('2024-02-01'),
  },

  // Sales — Team Sale B
  {
    uid: 'mock-sale-03',
    email: 'thanakorn.p@freshket.co',
    displayName: 'ธนกร เพชรงาม',
    photoURL: null,
    role: 'sale',
    teamId: 'team-sale-b',
    managerId: 'mock-tl-02',
    nickname: 'กร',
    employeeId: 'FK-022',
    department: 'Sale',
    position: 'Sale Executive',
    startDate: new Date('2024-03-10'),
  },
  {
    uid: 'mock-sale-04',
    email: 'arunya.c@freshket.co',
    displayName: 'อรัญญา ชัยวัฒน์',
    photoURL: null,
    role: 'sale',
    teamId: 'team-sale-b',
    managerId: 'mock-tl-02',
    nickname: 'ญา',
    employeeId: 'FK-023',
    department: 'Sale',
    position: 'Sale Executive',
    startDate: new Date('2026-05-01'),
  },

  // Sales — Team KA A
  {
    uid: 'mock-sale-05',
    email: 'noppadon.r@freshket.co',
    displayName: 'นพดล รุ่งเรือง',
    photoURL: null,
    role: 'sale',
    teamId: 'team-ka-a',
    managerId: 'mock-tl-03',
    nickname: 'ดล',
    employeeId: 'FK-030',
    department: 'Key Account',
    position: 'Key Account Executive',
    startDate: new Date('2023-08-15'),
  },
  {
    uid: 'mock-sale-06',
    email: 'kanya.s@freshket.co',
    displayName: 'กัญญา สุขสวัสดิ์',
    photoURL: null,
    role: 'sale',
    teamId: 'team-ka-a',
    managerId: 'mock-tl-03',
    nickname: 'ญา',
    employeeId: 'FK-031',
    department: 'Key Account',
    position: 'Key Account Executive',
    startDate: new Date('2024-05-20'),
  },

  // Sales — Team KA B
  {
    uid: 'mock-sale-07',
    email: 'phakpoom.t@freshket.co',
    displayName: 'ภาคภูมิ ตั้งใจ',
    photoURL: null,
    role: 'sale',
    teamId: 'team-ka-b',
    managerId: 'mock-tl-04',
    nickname: 'ภาค',
    employeeId: 'FK-032',
    department: 'Key Account',
    position: 'Key Account Executive',
    startDate: new Date('2024-07-01'),
  },
  {
    uid: 'mock-sale-08',
    email: 'malee.n@freshket.co',
    displayName: 'มาลี นามไทย',
    photoURL: null,
    role: 'sale',
    teamId: 'team-ka-b',
    managerId: 'mock-tl-04',
    nickname: 'ลี',
    employeeId: 'FK-033',
    department: 'Key Account',
    position: 'Key Account Executive',
    startDate: new Date('2025-09-15'),
  },
]

// ─── Courses ──────────────────────────────────────────────────────────────────
export const MOCK_COURSES: Omit<Course, 'createdAt' | 'updatedAt'>[] = [
  {
    id: 'course-01',
    title: 'Freshket Product Knowledge',
    description: 'ความรู้เกี่ยวกับสินค้าและบริการของ Freshket ทั้งหมด',
    category: 'product',
    durationMinutes: 60,
    thumbnailUrl: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=600&q=75',
    isRequired: true,
    targetRoles: ['sale', 'team_lead', 'manager'],
    slideUrl: 'https://docs.google.com/presentation/d/example-01',
    formUrl: 'https://forms.gle/example-01',
    isPublished: true,
    hasPreAssessment: true,
    preAssessmentId: 'assess-01',
    hasPostAssessment: true,
    postAssessmentId: 'assess-02',
    assessmentType: 'self' as const,
    createdBy: 'mock-admin-01',
  },
  {
    id: 'course-02',
    title: 'Sales Technique & Closing',
    description: 'เทคนิคการขายและการปิดการขายอย่างมืออาชีพ',
    category: 'sales_skill',
    durationMinutes: 90,
    thumbnailUrl: 'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=600&q=75',
    isRequired: true,
    targetRoles: ['sale', 'team_lead'],
    slideUrl: 'https://docs.google.com/presentation/d/example-02',
    formUrl: 'https://forms.gle/example-02',
    isPublished: true,
    hasPreAssessment: false,
    hasPostAssessment: true,
    postAssessmentId: 'assess-02',
    assessmentType: 'self' as const,
    createdBy: 'mock-admin-01',
  },
  {
    id: 'course-03',
    title: 'CRM System Usage',
    description: 'การใช้งานระบบ CRM สำหรับติดตามลูกค้า',
    category: 'sales_skill',
    durationMinutes: 45,
    thumbnailUrl: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=600&q=75',
    isRequired: true,
    targetRoles: ['sale', 'team_lead', 'manager'],
    slideUrl: 'https://docs.google.com/presentation/d/example-03',
    formUrl: '',
    isPublished: true,
    createdBy: 'mock-admin-01',
  },
  {
    id: 'course-04',
    title: 'Customer Service Excellence',
    description: 'มาตรฐานการบริการลูกค้าระดับพรีเมียม',
    category: 'sales_skill',
    durationMinutes: 60,
    thumbnailUrl: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=600&q=75',
    isRequired: false,
    targetRoles: ['sale'],
    slideUrl: '',
    formUrl: '',
    isPublished: false,
    createdBy: 'mock-admin-01',
  },
  {
    id: 'course-05',
    title: 'Compliance & Business Ethics',
    description: 'จรรยาบรรณและข้อกำหนดด้านการปฏิบัติตามกฎระเบียบ',
    category: 'compliance',
    durationMinutes: 30,
    thumbnailUrl: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=600&q=75',
    isRequired: true,
    targetRoles: ['sale', 'team_lead', 'manager', 'super_admin'],
    slideUrl: 'https://docs.google.com/presentation/d/example-05',
    formUrl: 'https://forms.gle/example-05',
    isPublished: true,
    createdBy: 'mock-admin-01',
  },
  {
    id: 'course-06',
    title: 'Team Leadership Fundamentals',
    description: 'ทักษะการเป็นผู้นำทีมและการโค้ชลูกทีม',
    category: 'leadership',
    durationMinutes: 120,
    thumbnailUrl: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=600&q=75',
    isRequired: false,
    targetRoles: ['team_lead', 'manager'],
    slideUrl: '',
    formUrl: '',
    isPublished: false,
    createdBy: 'mock-admin-01',
  },
]

// ─── Assessments ─────────────────────────────────────────────────────────────
export const MOCK_ASSESSMENTS: Omit<Assessment, 'createdAt' | 'updatedAt'>[] = [
  {
    id: 'assess-01',
    title: 'ทดสอบก่อนเรียน: Product Knowledge',
    description: 'วัดระดับความรู้เบื้องต้นก่อนเรียนหลักสูตร Product Knowledge',
    isPublished: true,
    passingScore: 70,
    createdBy: 'mock-admin-01',
    questions: [
      {
        id: 'q-01-1', order: 1, type: 'multiple_choice', points: 10,
        text: 'Freshket เชี่ยวชาญในสินค้าประเภทใดเป็นหลัก?',
        choices: [
          { id: 'c1', text: 'สินค้าแห้ง (Dry Goods)', isCorrect: false },
          { id: 'c2', text: 'ผักและผลไม้สด (Fresh Produce)', isCorrect: true },
          { id: 'c3', text: 'เครื่องดื่ม', isCorrect: false },
          { id: 'c4', text: 'สินค้าแช่แข็ง', isCorrect: false },
        ],
      },
      {
        id: 'q-01-2', order: 2, type: 'open_ended', points: 20,
        text: 'อธิบายข้อดีของสินค้า Fresh Produce จาก Freshket เมื่อเทียบกับคู่แข่ง',
        sampleAnswer: 'สินค้าสดใหม่ส่งตรงจากฟาร์ม, ระบบ Cold Chain ควบคุมอุณหภูมิ, ส่งตรงเวลา',
      },
      {
        id: 'q-01-3', order: 3, type: 'drag_drop', points: 30,
        text: 'จับคู่ประเภทสินค้ากับกลุ่มลูกค้าที่เหมาะสม',
        dragPairs: [
          { id: 'dp1', left: 'ผักใบเขียว', right: 'ร้านอาหารทั่วไป' },
          { id: 'dp2', left: 'ผลไม้พรีเมียม', right: 'โรงแรม 5 ดาว' },
          { id: 'dp3', left: 'เครื่องเทศสด', right: 'ครัวอาหารไทย' },
        ],
      },
    ],
  },
  {
    id: 'assess-02',
    title: 'ทดสอบหลังเรียน: Sales Skill',
    description: 'ทดสอบทักษะการขายหลังจากเรียนหลักสูตร Sales Skill',
    isPublished: true,
    passingScore: 75,
    createdBy: 'mock-admin-01',
    questions: [
      {
        id: 'q-02-1', order: 1, type: 'multiple_choice', points: 10,
        text: 'เมื่อลูกค้าบอกว่า "ราคาแพงเกินไป" ควรตอบสนองอย่างไร?',
        choices: [
          { id: 'c1', text: 'ลดราคาทันที', isCorrect: false },
          { id: 'c2', text: 'ถามเพิ่มเติมเพื่อเข้าใจ Pain Point', isCorrect: true },
          { id: 'c3', text: 'ยืนยันว่าสินค้าดีที่สุด', isCorrect: false },
          { id: 'c4', text: 'เปรียบเทียบราคากับคู่แข่งทันที', isCorrect: false },
        ],
      },
      {
        id: 'q-02-2', order: 2, type: 'drag_drop', points: 20,
        text: 'จับคู่ขั้นตอนการขายกับลำดับที่ถูกต้อง',
        dragPairs: [
          { id: 'dp1', left: 'Prospecting', right: 'ขั้นที่ 1' },
          { id: 'dp2', left: 'Needs Analysis', right: 'ขั้นที่ 2' },
          { id: 'dp3', left: 'Presentation', right: 'ขั้นที่ 3' },
          { id: 'dp4', left: 'Closing', right: 'ขั้นที่ 4' },
        ],
      },
      {
        id: 'q-02-3', order: 3, type: 'open_ended', points: 30,
        text: 'เขียน Sales Pitch สำหรับลูกค้าร้านอาหาร ในเวลา 30 วินาที',
        sampleAnswer: 'Freshket คือพาร์ทเนอร์วัตถุดิบสดที่ส่งตรงทุกเช้า ราคายุติธรรม คุณภาพคงที่ ไม่ต้องออกไปซื้อเอง',
      },
    ],
  },
  {
    id: 'assess-03',
    title: 'ทดสอบ Onboarding',
    description: 'แบบทดสอบสำหรับพนักงานใหม่เพื่อประเมินความเข้าใจหลังจบ Onboarding',
    isPublished: false,
    passingScore: 60,
    createdBy: 'mock-admin-01',
    questions: [
      {
        id: 'q-03-1', order: 1, type: 'multiple_choice', points: 10,
        text: 'Freshket ก่อตั้งขึ้นเพื่อแก้ปัญหาใด?',
        choices: [
          { id: 'c1', text: 'Logistics ของสินค้าแห้ง', isCorrect: false },
          { id: 'c2', text: 'Supply chain ของวัตถุดิบสดสำหรับร้านอาหาร', isCorrect: true },
          { id: 'c3', text: 'ระบบ ERP สำหรับโรงงาน', isCorrect: false },
          { id: 'c4', text: 'ระบบจัดการคลังสินค้า', isCorrect: false },
        ],
      },
    ],
  },
]

// ─── Course Image Catalog ─────────────────────────────────────────────────────
// Curated Unsplash images for course header selection (no API key needed)
export const COURSE_IMAGE_CATALOG: { url: string; label: string; category: string }[] = [
  // From mock courses
  { url: 'https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1200&h=400&q=80', label: 'Fresh Produce', category: 'Product' },
  { url: 'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=1200&h=400&q=80', label: 'Sales Meeting', category: 'Sales' },
  { url: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=1200&h=400&q=80', label: 'CRM / Data', category: 'System' },
  { url: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?auto=format&fit=crop&w=1200&h=400&q=80', label: 'Customer Service', category: 'Service' },
  { url: 'https://images.unsplash.com/photo-1589829545856-d10d557cf95f?auto=format&fit=crop&w=1200&h=400&q=80', label: 'Compliance', category: 'Compliance' },
  { url: 'https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=1200&h=400&q=80', label: 'Leadership', category: 'Leadership' },
  // Additional curated images
  { url: 'https://images.unsplash.com/photo-1521791136064-7986c2920216?auto=format&fit=crop&w=1200&h=400&q=80', label: 'Handshake / Deal', category: 'Sales' },
  { url: 'https://images.unsplash.com/photo-1543286386-713bdd548da4?auto=format&fit=crop&w=1200&h=400&q=80', label: 'Market Data', category: 'Sales' },
  { url: 'https://images.unsplash.com/photo-1488459716781-31db52582fe9?auto=format&fit=crop&w=1200&h=400&q=80', label: 'Fresh Vegetables', category: 'Product' },
  { url: 'https://images.unsplash.com/photo-1498837167922-ddd27525d352?auto=format&fit=crop&w=1200&h=400&q=80', label: 'Healthy Food', category: 'Product' },
  { url: 'https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=1200&h=400&q=80', label: 'Team Workshop', category: 'Leadership' },
  { url: 'https://images.unsplash.com/photo-1600880292089-90a7e086ee0c?auto=format&fit=crop&w=1200&h=400&q=80', label: 'Business Talk', category: 'Sales' },
  { url: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?auto=format&fit=crop&w=1200&h=400&q=80', label: 'Paperwork / Doc', category: 'Compliance' },
  { url: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=1200&h=400&q=80', label: 'Laptop Training', category: 'System' },
  { url: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=1200&h=400&q=80', label: 'Onboarding', category: 'Onboarding' },
  { url: 'https://images.unsplash.com/photo-1551836022-deb4988cc6c0?auto=format&fit=crop&w=1200&h=400&q=80', label: 'Coaching', category: 'Leadership' },
]

// ─── Resources ────────────────────────────────────────────────────────────────
export const MOCK_RESOURCES: Omit<Resource, 'createdAt' | 'updatedAt'>[] = [

  // ── Sale Tools (Freshket) ─────────────────────────────────────────────────────

  {
    id: 'res-sa-01',
    title: 'Sale Deck (English)',
    description: 'Presentation deck สำหรับ pitch ลูกค้าภาษาอังกฤษ ครอบคลุมทุกขั้นตอนการขาย',
    type: 'link',
    url: 'https://docs.google.com/presentation/d/1Vxd1UmhvnzMi4RaIZw50qTx2M58V9lt4/edit?slide=id.g206b6a35b6a_0_5#slide=id.g206b6a35b6a_0_5',
    imageUrl: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=600&q=75',
    category: 'Presentation',
    tags: ['slide', 'deck', 'english', 'pitch'],
    isPublic: true,
    isPublished: true,
    targetRoles: ['sale', 'team_lead', 'manager', 'super_admin'],
    createdBy: 'mock-admin-01',
  },
  {
    id: 'res-sa-02',
    title: 'Sale Deck (ภาษาไทย)',
    description: 'Presentation deck สำหรับ pitch ลูกค้าภาษาไทย ใช้สำหรับนำเสนอในประเทศ',
    type: 'link',
    url: 'https://docs.google.com/presentation/d/15i6_rCgyRgdsCVrTWYiyuZ3RUFm-Ackv/edit?rtpof=true&sd=true',
    imageUrl: 'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=600&q=75',
    category: 'Presentation',
    tags: ['slide', 'deck', 'thai', 'pitch'],
    isPublic: true,
    isPublished: true,
    targetRoles: ['sale', 'team_lead', 'manager', 'super_admin'],
    createdBy: 'mock-admin-01',
  },
  {
    id: 'res-sa-03',
    title: 'ตัวอย่างสินค้า Freshket',
    description: 'Google Drive รวมรูปภาพและไฟล์ตัวอย่างสินค้าสำหรับประกอบการนำเสนอลูกค้า',
    type: 'link',
    url: 'https://drive.google.com/drive/folders/1qfLY2FtwTs_8VnpMeqolgLW6vT-HRS7H',
    imageUrl: 'https://images.unsplash.com/photo-1488459716781-31db52582fe9?auto=format&fit=crop&w=600&q=75',
    category: 'Product',
    tags: ['product', 'example', 'photo', 'drive'],
    isPublic: true,
    isPublished: true,
    targetRoles: ['sale', 'team_lead', 'manager', 'super_admin'],
    createdBy: 'mock-admin-01',
  },
  {
    id: 'res-sa-04',
    title: 'Mapping Product AI',
    description: 'เครื่องมือ AI สำหรับ mapping สินค้า เปรียบเทียบราคา และวิเคราะห์คู่แข่ง',
    type: 'link',
    url: 'https://mapping-ai-bice.vercel.app/dashboard',
    imageUrl: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=600&q=75',
    category: 'Product',
    tags: ['mapping', 'AI', 'price', 'competitive'],
    isPublic: true,
    isPublished: true,
    targetRoles: ['sale', 'team_lead', 'manager', 'super_admin'],
    createdBy: 'mock-admin-01',
  },
  {
    id: 'res-sa-05',
    title: 'Service Area Map',
    description: 'แผนที่พื้นที่ให้บริการของ Freshket บน Google Maps สำหรับวางแผนเยี่ยมลูกค้า',
    type: 'link',
    url: 'https://www.google.com/maps/d/u/0/viewer?mid=1eYZ7hvHKLw7Kb0jWwSUZPzP_m-3sV2w&ll=13.898219270378311%2C100.77710892140075&z=11',
    imageUrl: 'https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&w=600&q=75',
    category: 'Field',
    tags: ['map', 'service area', 'location', 'route'],
    isPublic: true,
    isPublished: true,
    targetRoles: ['sale', 'team_lead', 'manager', 'super_admin'],
    createdBy: 'mock-admin-01',
  },
  {
    id: 'res-sa-06',
    title: 'Internal Portal',
    description: 'Freshket Internal Portal เข้าถึงข้อมูลพนักงาน เอกสาร และเครื่องมือภายในองค์กร',
    type: 'link',
    url: 'https://portal.freshket.co/',
    imageUrl: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=600&q=75',
    category: 'Operations',
    tags: ['portal', 'internal', 'HR', 'document'],
    isPublic: true,
    isPublished: true,
    targetRoles: ['sale', 'team_lead', 'manager', 'super_admin'],
    createdBy: 'mock-admin-01',
  },
  {
    id: 'res-sa-07',
    title: 'AppSheet — PVP & Product Request',
    description: 'แอปสำหรับกรอก PVP (Pre-Visit Planning) และขอสินค้าใหม่ผ่าน AppSheet',
    type: 'link',
    url: 'https://www.appsheet.com/start/2293f65d-d06e-4b0f-b96d-8d6f10316f63?platform=desktop',
    imageUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=600&q=75',
    category: 'Operations',
    tags: ['appsheet', 'PVP', 'product request', 'form'],
    isPublic: true,
    isPublished: true,
    targetRoles: ['sale', 'team_lead', 'manager', 'super_admin'],
    createdBy: 'mock-admin-01',
  },
  {
    id: 'res-sa-08',
    title: 'Sales Dashboard — Datastudio',
    description: 'Dashboard รายงาน KPI ยอดขาย และ performance ทีม Sales แบบ real-time',
    type: 'link',
    url: 'https://datastudio.google.com/u/0/reporting/eaa8df46-cb41-4fd7-ab57-13e01dd2601c/page/p_7na5yd6y6c?pli=1',
    imageUrl: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=600&q=75',
    category: 'Report',
    tags: ['dashboard', 'KPI', 'report', 'datastudio', 'analytics'],
    isPublic: true,
    isPublished: true,
    targetRoles: ['sale', 'team_lead', 'manager', 'super_admin'],
    createdBy: 'mock-admin-01',
  },
]

// ─── Training Records ─────────────────────────────────────────────────────────
// Generates realistic training records per user

type MockRecord = Omit<TrainingRecord, 'id'>

function record(
  userId: string,
  courseId: string,
  courseTitle: string,
  status: TrainingRecord['status'],
  score?: number,
  daysAgo?: number,
): MockRecord {
  const completedAt = status === 'completed' && daysAgo !== undefined
    ? new Date(Date.now() - daysAgo * 86_400_000)
    : undefined
  return {
    userId,
    courseId,
    courseTitle,
    status,
    score,
    completedAt,
    dueDate: new Date(Date.now() + 14 * 86_400_000),
    attemptCount: status === 'failed' ? 2 : 1,
    source: 'csv_import',
    importBatchId: 'mock-batch-001',
  }
}

const C = MOCK_COURSES

export const MOCK_TRAINING_RECORDS: MockRecord[] = [
  // สมชาย — star performer
  record('mock-sale-01', C[0].id, C[0].title, 'completed', 95, 30),
  record('mock-sale-01', C[1].id, C[1].title, 'completed', 88, 20),
  record('mock-sale-01', C[2].id, C[2].title, 'completed', 92, 15),
  record('mock-sale-01', C[3].id, C[3].title, 'completed', 85, 10),
  record('mock-sale-01', C[4].id, C[4].title, 'completed', 100, 5),

  // ปริยา — good progress
  record('mock-sale-02', C[0].id, C[0].title, 'completed', 78, 25),
  record('mock-sale-02', C[1].id, C[1].title, 'completed', 82, 18),
  record('mock-sale-02', C[2].id, C[2].title, 'in_progress'),
  record('mock-sale-02', C[4].id, C[4].title, 'not_started'),

  // ธนกร — struggling
  record('mock-sale-03', C[0].id, C[0].title, 'completed', 65, 40),
  record('mock-sale-03', C[1].id, C[1].title, 'failed', 45),
  record('mock-sale-03', C[2].id, C[2].title, 'not_started'),
  record('mock-sale-03', C[4].id, C[4].title, 'completed', 70, 35),

  // อรัญญา — new joiner
  record('mock-sale-04', C[0].id, C[0].title, 'in_progress'),
  record('mock-sale-04', C[1].id, C[1].title, 'not_started'),
  record('mock-sale-04', C[4].id, C[4].title, 'not_started'),

  // นพดล — strong
  record('mock-sale-05', C[0].id, C[0].title, 'completed', 90, 20),
  record('mock-sale-05', C[1].id, C[1].title, 'completed', 87, 15),
  record('mock-sale-05', C[2].id, C[2].title, 'completed', 93, 10),
  record('mock-sale-05', C[4].id, C[4].title, 'completed', 100, 8),

  // กัญญา — on track
  record('mock-sale-06', C[0].id, C[0].title, 'completed', 75, 22),
  record('mock-sale-06', C[1].id, C[1].title, 'in_progress'),
  record('mock-sale-06', C[4].id, C[4].title, 'completed', 80, 30),

  // ภาคภูมิ — at risk
  record('mock-sale-07', C[0].id, C[0].title, 'failed', 52),
  record('mock-sale-07', C[1].id, C[1].title, 'not_started'),
  record('mock-sale-07', C[4].id, C[4].title, 'in_progress'),

  // มาลี — just started
  record('mock-sale-08', C[0].id, C[0].title, 'in_progress'),
  record('mock-sale-08', C[4].id, C[4].title, 'not_started'),

  // Team Lead records
  record('mock-tl-01', C[0].id, C[0].title, 'completed', 96, 60),
  record('mock-tl-01', C[1].id, C[1].title, 'completed', 94, 55),
  record('mock-tl-01', C[2].id, C[2].title, 'completed', 98, 50),
  record('mock-tl-01', C[4].id, C[4].title, 'completed', 100, 45),
  record('mock-tl-01', C[5].id, C[5].title, 'completed', 91, 40),

  record('mock-tl-02', C[0].id, C[0].title, 'completed', 88, 55),
  record('mock-tl-02', C[2].id, C[2].title, 'completed', 85, 48),
  record('mock-tl-02', C[4].id, C[4].title, 'completed', 100, 44),
  record('mock-tl-02', C[5].id, C[5].title, 'in_progress'),
]
