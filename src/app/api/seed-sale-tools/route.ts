import { NextResponse } from 'next/server'
import { Timestamp } from 'firebase-admin/firestore'
import { getAdminFirestore } from '@/lib/firebase/admin'

const SALE_TOOLS = [
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
    createdBy: 'system',
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
    createdBy: 'system',
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
    createdBy: 'system',
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
    createdBy: 'system',
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
    createdBy: 'system',
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
    createdBy: 'system',
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
    createdBy: 'system',
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
    createdBy: 'system',
  },
]

export async function POST() {
  try {
    const db = getAdminFirestore()
    const now = Timestamp.now()

    const results: { id: string; title: string; status: 'added' | 'skipped' }[] = []

    for (const tool of SALE_TOOLS) {
      const ref = db.collection('resources').doc(tool.id)
      const snap = await ref.get()

      if (snap.exists) {
        results.push({ id: tool.id, title: tool.title, status: 'skipped' })
        continue
      }

      await ref.set({ ...tool, createdAt: now, updatedAt: now })
      results.push({ id: tool.id, title: tool.title, status: 'added' })
    }

    const added   = results.filter(r => r.status === 'added').length
    const skipped = results.filter(r => r.status === 'skipped').length

    return NextResponse.json({ success: true, added, skipped, results })
  } catch (e) {
    console.error('[seed-sale-tools]', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}
