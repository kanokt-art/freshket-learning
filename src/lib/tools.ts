// Model + seed data for Tools (the /tools page). Tools live in the Firestore
// `tools` collection so what a super_admin publishes actually reaches everyone
// — they used to be a localStorage-only list, i.e. private to the admin's own
// browser.
//
// Visibility has two independent gates:
//   1. the `sale_tools` module must be on for the user's department (appConfig/moduleAccess)
//   2. the tool itself must be published AND target the user's department (below)

export interface SaleTool {
  id: string
  title: string
  description: string
  category: string
  url: string
  imageUrl: string
  isPublished: boolean
  /** Departments allowed to see this tool. Empty = every department. */
  departments: string[]
  createdAt?: Date
}

// A tool is visible to a learner when it's published and either targets every
// department (empty list) or names theirs.
export function isToolVisibleTo(tool: SaleTool, department?: string | null): boolean {
  if (!tool.isPublished) return false
  if (!tool.departments || tool.departments.length === 0) return true
  return !!department && tool.departments.includes(department)
}

// Shown when the Firestore `tools` collection is still empty. A super_admin can
// write them in for real from the page (นำเข้า Tool เริ่มต้น).
export const SEED_TOOLS: SaleTool[] = [
  {
    id: 'res-sa-01',
    title: 'Sale Deck (English)',
    description: 'Presentation deck สำหรับ pitch ลูกค้าภาษาอังกฤษ ครอบคลุมทุกขั้นตอนการขาย',
    category: 'Presentation',
    url: 'https://docs.google.com/presentation/d/1Vxd1UmhvnzMi4RaIZw50qTx2M58V9lt4/edit?slide=id.g206b6a35b6a_0_5#slide=id.g206b6a35b6a_0_5',
    imageUrl: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?auto=format&fit=crop&w=600&q=75',
    isPublished: true,
    departments: [],
  },
  {
    id: 'res-sa-02',
    title: 'Sale Deck (ภาษาไทย)',
    description: 'Presentation deck สำหรับ pitch ลูกค้าภาษาไทย ใช้สำหรับนำเสนอในประเทศ',
    category: 'Presentation',
    url: 'https://docs.google.com/presentation/d/15i6_rCgyRgdsCVrTWYiyuZ3RUFm-Ackv/edit?rtpof=true&sd=true',
    imageUrl: 'https://images.unsplash.com/photo-1552664730-d307ca884978?auto=format&fit=crop&w=600&q=75',
    isPublished: true,
    departments: [],
  },
  {
    id: 'res-sa-03',
    title: 'ตัวอย่างสินค้า Freshket',
    description: 'Google Drive รวมรูปภาพและไฟล์ตัวอย่างสินค้าสำหรับประกอบการนำเสนอลูกค้า',
    category: 'Product',
    url: 'https://drive.google.com/drive/folders/1qfLY2FtwTs_8VnpMeqolgLW6vT-HRS7H',
    imageUrl: 'https://images.unsplash.com/photo-1488459716781-31db52582fe9?auto=format&fit=crop&w=600&q=75',
    isPublished: true,
    departments: [],
  },
  {
    id: 'res-sa-04',
    title: 'Mapping Product AI',
    description: 'เครื่องมือ AI สำหรับ mapping สินค้า เปรียบเทียบราคา และวิเคราะห์คู่แข่ง',
    category: 'Product',
    url: 'https://mapping-ai-bice.vercel.app/dashboard',
    imageUrl: 'https://images.unsplash.com/photo-1460925895917-afdab827c52f?auto=format&fit=crop&w=600&q=75',
    isPublished: true,
    departments: [],
  },
  {
    id: 'res-sa-05',
    title: 'Service Area Map',
    description: 'แผนที่พื้นที่ให้บริการของ Freshket บน Google Maps สำหรับวางแผนเยี่ยมลูกค้า',
    category: 'Field',
    url: 'https://www.google.com/maps/d/u/0/viewer?mid=1eYZ7hvHKLw7Kb0jWwSUZPzP_m-3sV2w&ll=13.898219270378311%2C100.77710892140075&z=11',
    imageUrl: 'https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&w=600&q=75',
    isPublished: true,
    departments: [],
  },
  {
    id: 'res-sa-06',
    title: 'Internal Portal',
    description: 'Freshket Internal Portal เข้าถึงข้อมูลพนักงาน เอกสาร และเครื่องมือภายในองค์กร',
    category: 'Operations',
    url: 'https://portal.freshket.co/',
    imageUrl: 'https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=600&q=75',
    isPublished: true,
    departments: [],
  },
  {
    id: 'res-sa-07',
    title: 'AppSheet — PVP & Product Request',
    description: 'แอปสำหรับกรอก PVP (Pre-Visit Planning) และขอสินค้าใหม่ผ่าน AppSheet',
    category: 'Operations',
    url: 'https://www.appsheet.com/start/2293f65d-d06e-4b0f-b96d-8d6f10316f63?platform=desktop',
    imageUrl: 'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?auto=format&fit=crop&w=600&q=75',
    isPublished: true,
    departments: [],
  },
  {
    id: 'res-sa-08',
    title: 'Sales Dashboard — Datastudio',
    description: 'Dashboard รายงาน KPI ยอดขาย และ performance ทีม Sales แบบ real-time',
    category: 'Report',
    url: 'https://datastudio.google.com/u/0/reporting/eaa8df46-cb41-4fd7-ab57-13e01dd2601c/page/p_7na5yd6y6c?pli=1',
    imageUrl: 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?auto=format&fit=crop&w=600&q=75',
    isPublished: true,
    departments: [],
  },
]
