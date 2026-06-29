'use client'

import { useState, useMemo, useEffect } from 'react'
import { Header } from '@/components/layout/Header'
import { useAuth } from '@/hooks/useAuth'
import { useAllUsers, useTeams } from '@/hooks/useFirestore'
import { canAccess } from '@/types/user'
import type { UserProfile } from '@/types/user'
import type { ShadowRecord, ShadowSegment, ShadowPersona, ShadowAcknowledgment } from '@/types/shadow'
import { pushNotification } from '@/lib/notifications/push'

// ── Constants ─────────────────────────────────────────────────────────────────

const SEGMENTS: ShadowSegment[] = ['Mini Chain', 'Stand alone', 'Chain']
const PERSONAS: ShadowPersona[] = ['Chef', 'Owner', 'Purchasing', 'Manager']

const SEGMENT_STYLE: Record<ShadowSegment, string> = {
  'Mini Chain':  'bg-blue-100 text-blue-700 border-blue-200',
  'Stand alone': 'bg-amber-100 text-amber-700 border-amber-200',
  'Chain':       'bg-purple-100 text-purple-700 border-purple-200',
}

const PERSONA_STYLE: Record<ShadowPersona, string> = {
  'Chef':       'bg-freshket-100 text-freshket-700 border-freshket-200',
  'Owner':      'bg-sky-100 text-sky-700 border-sky-200',
  'Purchasing': 'bg-indigo-100 text-indigo-700 border-indigo-200',
  'Manager':    'bg-orange-100 text-orange-700 border-orange-200',
}

type EvalKey = 'opening' | 'interestPoint' | 'customerPain' | 'diagnosticApproach' | 'closingNextStep' | 'bestPractice' | 'beyondClassroom'

const EVAL_FIELDS: { key: EvalKey; label: string; placeholder: string }[] = [
  { key: 'opening',            label: 'Opening / Hook',       placeholder: 'วิธีเปิดการสนทนา เทคนิคแนะนำตัว วิธีเริ่มต้น...' },
  { key: 'interestPoint',      label: 'Interest Point',       placeholder: 'จุดที่ลูกค้าสนใจ สิ่งที่ดึงดูดความสนใจ...' },
  { key: 'customerPain',       label: 'Customer Pain',        placeholder: 'ปัญหาหรือความต้องการที่ลูกค้ามี...' },
  { key: 'diagnosticApproach', label: 'Diagnostic Approach',  placeholder: 'วิธีวิเคราะห์ปัญหาและตอบสนองต่อลูกค้า...' },
  { key: 'closingNextStep',    label: 'Closing / Next Step',  placeholder: 'วิธีปิดการขาย ขั้นตอนต่อไป...' },
  { key: 'bestPractice',       label: 'Best Practice',        placeholder: 'แนวปฏิบัติที่ดีที่ได้เรียนรู้จาก Shadow ครั้งนี้...' },
  { key: 'beyondClassroom',    label: 'Beyond Classroom',     placeholder: 'สิ่งที่ได้เรียนรู้นอกห้องเรียน ที่ไม่สามารถสอนได้...' },
]

// ── Demo data ─────────────────────────────────────────────────────────────────

const DEMO_RECORDS: ShadowRecord[] = [
  {
    id: 'sh-01',
    createdAt: new Date('2026-02-11T20:48:27'),
    updatedAt: new Date('2026-02-11T20:48:27'),
    observerUid: 'mock-sale-01',
    observerEmail: 'niracha.s@freshket.co',
    observerName: 'นิรชา สุดใจ',
    mentorName: 'Max',
    mentorPosition: 'Senior Key Account Management',
    storeName: 'Holey Artisan',
    segment: 'Mini Chain',
    persona: 'Chef',
    opening: 'แนะนำ KA ที่จะมาดูแลร้าน และแจ้งว่ามีสินค้าอะไรบ้างของ Freshket ที่ร้านอาจยังไม่รู้จัก เน้นสร้างความไว้วางใจตั้งแต่ต้น',
    interestPoint: '• มี bill VAT ให้กับร้าน\n• มี Credit Term ให้กับร้าน\n• คุณภาพและ Consistency ไม่เกิดปัญหา\n• มี Staff Party Support ให้เหมือนกัน',
    customerPain: 'ลูกค้าต้องการเครดิต/ภาษี VAT ในการสั่งซื้อ และต้องการใบกำกับภาษีสำหรับบันทึกบัญชี ปัจจุบันยังใช้เจ้าอื่นที่ออกเอกสารได้',
    diagnosticApproach: 'ถามเรื่องยอดการสั่งซื้อที่ลดลง เปรียบเทียบกับเจ้าอื่น เพื่อวิเคราะห์ว่าร้านกำลังลด Volume จริงหรือไม่ และมีซัพพลายเออร์ใหม่เข้ามาหรือเปล่า',
    closingNextStep: 'เสนอวันที่ส่งสินค้าที่ตรงกับความต้องการของร้าน\n• Next Step: ส่งใบเสนอราคาใหม่ + ทำ Credit Term ให้ + นัด Follow Up 1 สัปดาห์',
    bestPractice: 'สรุปร้านนี้มี Pain Point หลักเรื่อง VAT กับ Credit Term และวันที่ส่งสินค้า\n\nKey Learning: ควรถามและรับฟังก่อน แล้วค่อย Present ของเรา ไม่ใช่ Push ขายตั้งแต่ต้น',
    beyondClassroom: 'การรู้ข้อมูลลูกค้าล่วงหน้าทำให้เราประเมินได้ว่าสู้ได้ไหม การถามคำถามเปิดช่วยให้ลูกค้าเปิดใจและบอก Pain Point เองโดยไม่ต้องบังคับ',
  },
  {
    id: 'sh-02',
    createdAt: new Date('2026-02-11T21:30:00'),
    updatedAt: new Date('2026-02-11T21:30:00'),
    observerUid: 'mock-sale-01',
    observerEmail: 'niracha.s@freshket.co',
    observerName: 'นิรชา สุดใจ',
    mentorName: 'Max',
    mentorPosition: 'Senior Key Account Management',
    storeName: 'Pastel',
    segment: 'Mini Chain',
    persona: 'Chef',
    opening: '• ถามเรื่องเมนูหน้าร้านและสินค้าที่ขายดีในช่วงนี้\n• สร้าง Rapport โดยพูดถึงนักท่องเที่ยวที่เพิ่มขึ้นแถวร้าน\n• ถามว่าวัตถุดิบที่ต้องการส่วนใหญ่มาจากไหน',
    interestPoint: '• ราคาที่เราสามารถทำถูกกว่าเจ้าอื่นได้ในหลายรายการ\n• สามารถหาวัตถุดิบนำเข้าที่ต้องการ ปริมาณสั่งขั้นต่ำต่ำกว่า\n• ระบบ Track การสั่งซื้อผ่าน App',
    customerPain: 'ปลาหมึกที่สั่งมาไม่สด มีกลิ่น ร้องเรียนมาแล้ว 2 ครั้ง / Consistency ของสินค้าไม่สม่ำเสมอ ทำให้ต้องสต็อกไว้เผื่อ',
    diagnosticApproach: 'ถามลึกเรื่องคุณภาพ: เกิดปัญหากี่ครั้ง สินค้าจากล็อตไหน เพื่อแยกว่าเป็นปัญหา Supplier หรือการจัดเก็บ จากนั้นนำเสนอว่า Freshket มีระบบ QC และสามารถ Remark ได้เลยตั้งแต่ส่ง',
    closingNextStep: 'ทำ Price Comparison ในรายการหลักที่ร้านสั่งบ่อย\n• กลุ่ม Cooking: ขึ้นต้นกับ Freshket\n• กลุ่ม Seafood: ทดสอบสั่ง 1 รอบก่อน\n• Next Step: ส่งตัวอย่างปลาหมึกสดให้ Chef ทดลอง',
    bestPractice: 'เมื่อลูกค้ามี Pain เรื่องคุณภาพ ให้ฟังและ Acknowledge ก่อน จากนั้นค่อยนำเสนอวิธีแก้ของเรา ไม่ควรรีบ Defend Freshket ทันที',
    beyondClassroom: 'NPD: Russet ขาว หายาก ลูกค้าต้องการเยอะ ควรแจ้ง Product Team ให้หา Supplier เพิ่ม เป็นโอกาสทางธุรกิจ',
  },
  {
    id: 'sh-03',
    createdAt: new Date('2026-02-12T10:51:25'),
    updatedAt: new Date('2026-02-12T10:51:25'),
    observerUid: 'mock-sale-02',
    observerEmail: 'chaklid.n@freshket.co',
    observerName: 'จักลิด นันทกิจ',
    mentorName: 'Max',
    mentorPosition: 'Senior Key Account Management',
    storeName: 'Holey Artisan Sukhumvit 31',
    segment: 'Stand alone',
    persona: 'Chef',
    opening: 'แนะนำตัวและบอก Objective ของการมาเยี่ยม เพื่อ Review การสั่งซื้อและนำเสนอสินค้าใหม่ที่ตรงกับเมนูของร้าน',
    interestPoint: '• Product Lost: M-Wrap ไม่มีการสั่งมา 2 เดือน → แจ้งแล้ว ร้านจะสั่งใหม่\n• Slow Movement: Cream Cheese Philadelphia (6 กล่อง/สัปดาห์), Mayo (100kg/สัปดาห์)\n• NPD: Salmon NW, มะยงชิด, ส้มสายน้ำผึ้ง, เมนูการ์ริ\n• สนใจมันคัดไซส์ใหม่ที่เล็กกว่า',
    customerPain: 'ต้องการ VAT และ Credit Term รูปแบบบริษัท / สต็อกขาดบ่อยในช่วง Weekend ที่ Order ล่วงหน้าไม่ได้',
    diagnosticApproach: 'เสนอสินค้าใหม่ทีละตัว ให้ Chef ลองชิมหรือดูตัวอย่างจริง แล้วถามว่าเข้าได้กับเมนูไหน แทนการ Present Catalogue ทั้งหมด',
    closingNextStep: 'ส่งสินค้าทดลอง 3 รายการ (วันศุกร์)\n• Existing Product: มันคัดไซส์ที่เล็กกว่า\n• Next Step: ติดตามผล Feedback ใน 2 สัปดาห์ + เสนอ Credit Term',
    bestPractice: 'การ Focus ที่ Product ที่หายไป (Product Lost) ก่อน ช่วยให้ Recovery Volume ได้เร็ว ไม่ต้อง Sell ใหม่จากศูนย์ ใช้ Data การซื้อก่อนหน้านี้เป็น Talking Point',
    beyondClassroom: 'ในสถานการณ์จริง ลูกค้าที่ติดราคา ไม่ใช่การบอกว่าถูกกว่า แต่คือการให้เขาลองสั่งผ่าน App แล้วเปรียบตัวเลขเอง ลูกค้าจะเชื่อตัวเลขที่เขาเห็นเองมากกว่าที่เราบอก',
  },
  {
    id: 'sh-04',
    createdAt: new Date('2026-03-04T21:15:57'),
    updatedAt: new Date('2026-03-04T21:15:57'),
    observerUid: 'mock-sale-03',
    observerEmail: 'kanokwan.w@freshket.co',
    observerName: 'กนกวรรณ วงศ์สุวรรณ',
    mentorName: 'Job',
    mentorPosition: 'Sales Supervisor',
    storeName: 'Blackhills River',
    segment: 'Mini Chain',
    persona: 'Owner',
    opening: 'เริ่มด้วยการสอบถามเกี่ยวกับวัตถุดิบปัจจุบัน เพื่อหา Pain Point แล้วนำเสนอ Freshket App เป็นเครื่องมือ Digitalize การจัดซื้อ ลดเวลาและขั้นตอนการติดต่อ Supplier หลายเจ้า',
    interestPoint: '• สินค้าคุณภาพดีในราคาที่เหมาะสม\n• มีสินค้าให้เลือกหลากหลายในที่เดียว\n• ลดขั้นตอนการติดต่อ Supplier หลายราย\n• ติดตามสถานะจัดส่ง Real-time และระบบชำระเงินหลากหลาย',
    customerPain: 'ลูกค้าเน้นควบคุมต้นทุน เปรียบเทียบและซื้อกับ Makro เป็นหลักเพราะราคาส่งถูกกว่าอย่างมีนัย ไม่ต้องการรับความเสี่ยงจากการเปลี่ยน Supplier',
    diagnosticApproach: 'ให้ลูกค้าดาวน์โหลด App แล้วดูราคาเปรียบเทียบกับที่สั่งอยู่ แทนการพูดว่าของเราถูกกว่า ให้ตัวเลขพูดเอง / เน้นเรื่องความสะดวกและ Credit Term เป็น Value Added',
    closingNextStep: 'ช่วยลูกค้าดาวน์โหลด App และทดลองสั่งซื้อ 1 Order\n• Next Step: Follow Up หลังรับของ 2 วัน เพื่อ Collect Feedback\n• ตรวจสอบว่ามีรายการไหนราคาถูกกว่า Makro เพื่อ Upsell',
    bestPractice: 'รักษาทักษะการเจรจาโดยยืนยันคุณภาพมากกว่าราคา ให้ลูกค้าเห็น Value ที่มากกว่าเงิน เช่น เวลาที่ประหยัดได้จากการสั่งผ่าน App ครั้งเดียว',
    beyondClassroom: 'การรับมือลูกค้าที่ยังติดราคา ไม่ใช่การบอกว่าของเราถูกกว่า แต่คือการให้เขา "เห็นสินค้า" โดยเสนอให้ลองสั่ง App เพื่อดูตัวเลขด้วยตัวเอง ซึ่งมีประสิทธิภาพมากกว่าการยืนยันฝ่ายเดียว',
  },
  {
    id: 'sh-05',
    createdAt: new Date('2026-03-09T10:21:24'),
    updatedAt: new Date('2026-03-09T10:21:24'),
    observerUid: 'mock-sale-03',
    observerEmail: 'kanokwan.w@freshket.co',
    observerName: 'กนกวรรณ วงศ์สุวรรณ',
    mentorName: 'Fon',
    mentorPosition: 'Senior Sales Representative',
    storeName: 'TUM POP POP (ตำ ป๊อป ป๊อป)',
    segment: 'Mini Chain',
    persona: 'Manager',
    opening: 'เปิดสนทนาโดยแนะนำภาพรวมและวิสัยทัศน์ของ Freshket เพื่อให้ลูกค้าเข้าใจมาตรฐานการจัดการสินค้าเกษตรและระบบ Tech ที่ใช้',
    interestPoint: 'ลูกค้าเปรียบเทียบกับ Supplier ปัจจุบันที่มีปัญหาเรื่องการจัดส่งล่าช้า เริ่มสนใจหลังจากฟังเรื่องระบบ Track Status Real-time',
    customerPain: 'การจัดส่งสินค้าและการบริการหลังการขายของ Supplier เดิมล่าช้า กระทบ Prep Time ของครัว ต้องสั่งสำรองไว้มากขึ้น เพิ่มต้นทุนสต็อก',
    diagnosticApproach: 'ยืนยันความเชื่อมั่นเรื่องระบบ Support 24 ชม. และ Track Status ที่ดีกว่า จากนั้นสนับสนุนให้ดาวน์โหลด App เพื่อเปรียบเทียบราคากับ Supplier ปัจจุบัน',
    closingNextStep: 'ยืนยันระบบ Support และการติดตามสถานะ\n• สนับสนุนให้ดาวน์โหลด App เพื่อเปรียบเทียบราคา\n• Next Step: นัด Follow Up หลัง Test Order ครั้งแรก',
    bestPractice: 'สรุปความคุ้มค่าด้านเวลาและประสิทธิภาพที่ลูกค้าจะได้รับ แทนการเน้นราคา ทำให้ลูกค้าเห็น ROI ที่ชัดเจนกว่า',
    beyondClassroom: 'การปรับตัวเมื่อไม่มีเวลามาก: สรุปความคุ้มค่าสั้น ๆ ใน 2-3 ประโยค แล้วให้ดาวน์โหลด App เพื่อดูด้วยตัวเอง ดีกว่า Present ยาว ๆ แต่ไม่มีเวลาฟัง',
  },
  {
    id: 'sh-06',
    createdAt: new Date('2026-03-17T17:19:15'),
    updatedAt: new Date('2026-03-17T17:19:15'),
    observerUid: 'mock-sale-04',
    observerEmail: 'kanthicha.s@freshket.co',
    observerName: 'กันต์ธิชา สายสุวรรณ',
    mentorName: 'Faii',
    mentorPosition: 'Sales Supervisor',
    storeName: 'Wanda Jin Residences The Ease Sierra Bangkok',
    segment: 'Mini Chain',
    persona: 'Purchasing',
    opening: '1. ถามว่ารู้จัก Freshket ได้อย่างไร — ลูกค้าเคย Search หา Supplier ใหม่ แต่ยังไม่เคยใช้บริการ\n2. อธิบายความแตกต่างระหว่าง Freshket กับ Makro: Fresh vs. Shelf สินค้า, ระบบ Order Online, QC ที่มาตรฐาน',
    interestPoint: 'ลูกค้าสนใจว่าสามารถดูและเลือกสินค้าผ่าน App ได้เลย + เลือกช่วงเวลาจัดส่งเองได้ เพราะ Makro เดิมส่งไม่ตรงเวลา กระทบ Prep',
    customerPain: '1. สั่ง Makro แล้วสินค้าส่งช้า ไม่ตรงเวลาที่ต้องการ\n2. เมื่อต้องการของก่อน สต็อกหมด ต้องออกไปซื้อตามตลาด — ไม่มีใบกำกับภาษี ทำบัญชีลำบาก',
    diagnosticApproach: 'นำเสนอข้อดีที่ตรงกับ Pain: เลือกเวลาส่งได้ + ออกใบกำกับได้ + CS ตอบ 24 ชม. ไม่เกิน 5 นาที แทนการ Pitch Feature ทั้งหมด',
    closingNextStep: 'ช่วยดาวน์โหลด App และ Add สินค้าที่ต้องการ\n• Next Step: ทดลองสั่ง 1 Order สัปดาห์หน้า\n• ให้ Contact KA ที่ดูแลโดยตรงในกรณีมีปัญหา',
    bestPractice: 'CS ดูแลตลอด 24 ชม. ตอบ ≤5 นาที + สินค้ามี Label วันผลิตและหมดอายุชัดเจน ช่วยฝ่าย Purchasing ในการ Manage Stock ได้ดีขึ้น',
    beyondClassroom: 'การนำเสนอโดยใช้ Pain Point ของลูกค้าเป็นตัวนำ แล้วค่อยโยง Feature ของเรา ทำให้ลูกค้ารู้สึกว่าเราเข้าใจเขา ไม่ใช่แค่มาขายของ',
    evaluatorEmail: 'faii.s@freshket.co',
    ratingScore: 4,
    evaluationFeedback: 'การรับฟังและ Diagnose ดี ควรฝึกเรื่องการ Summarize Pain ของลูกค้าให้กระชับก่อน Close',
  },
  {
    id: 'sh-07',
    createdAt: new Date('2026-03-17T19:20:45'),
    updatedAt: new Date('2026-03-17T19:20:45'),
    observerUid: 'mock-sale-04',
    observerEmail: 'kanthicha.s@freshket.co',
    observerName: 'กันต์ธิชา สายสุวรรณ',
    mentorName: 'Job',
    mentorPosition: 'Sales Supervisor',
    storeName: "Jones' Salad HQ",
    segment: 'Chain',
    persona: 'Purchasing',
    opening: 'อธิบาย Freshket คืออะไร:\n• แหล่งรวม Supplier ไว้ที่เดียว ไม่ต้องติดต่อหลายเจ้า\n• ระบบ Order Online พร้อมติดตามสถานะ\n• มีสินค้าที่ Customize ขนาด/น้ำหนักได้ตามต้องการ',
    interestPoint: '• Freshket Customize สินค้าตามที่ลูกค้าต้องการได้: ขนาด น้ำหนัก รูปทรง\n• มี Credit Term\n• มี COA (Certificate of Analysis) สำหรับสินค้าที่ต้องการ',
    customerPain: '• ชื่อสินค้าจาก Supplier หลายเจ้า สับสนในการรวบรวมเอกสาร\n• ซื้อจากตลาดบางรายการ ไม่มีใบกำกับภาษี ทำบัญชีลำบาก\n• ห่วงเรื่องบรรจุภัณฑ์: กล่องพลาสติก, กล่อง 3 ชั้น, น้ำหนักน้ำ',
    diagnosticApproach: 'ตอบในสิ่งที่รู้ก่อน อันไหนไม่แน่ใจ รับข้อมูลไว้แล้ว Follow Up กลับ ไม่ Guess ไม่ Overpromise แต่ไม่ปล่อยให้ลูกค้ารู้สึกว่าไม่ได้รับคำตอบ',
    closingNextStep: 'รับ Requirement เรื่องบรรจุภัณฑ์ไปเช็ค แล้วส่งข้อมูลกลับภายใน 2 วัน\n• Next Step: ส่ง Product Sheet พร้อม COA ในรายการที่ต้องการ',
    bestPractice: 'Freshket มี Supplier หลากหลายสามารถหาสินค้าที่ต้องการได้ + Credit Term ช่วย Cash Flow ลูกค้าได้มาก ควร Lead ด้วย 2 จุดนี้',
    beyondClassroom: 'ในสถานการณ์ที่ไม่รู้คำตอบ การรับเรื่องไว้ Follow Up กลับอย่างน่าเชื่อถือ ดีกว่าการ Guess หรือตอบผิด — ลูกค้า B2B ให้คุณค่ากับความน่าเชื่อถือมากกว่าความรู้ทุกเรื่อง',
    evaluatorEmail: 'job.k@freshket.co',
    ratingScore: 5,
    evaluationFeedback: 'ดีมาก ทักษะการฟังและ Diagnose ชัดเจน การ Acknowledge ก่อน Solve เป็น Professional มาก',
  },
]

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatThaiDate(date: Date): string {
  return date.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })
}

function StarRating({ score, max = 5 }: { score: number; max?: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: max }).map((_, i) => (
        <svg
          key={i}
          className={`size-3.5 ${i < score ? 'text-amber-400' : 'text-gray-200'}`}
          viewBox="0 0 24 24"
          fill="currentColor"
        >
          <path d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" />
        </svg>
      ))}
      <span className="text-xs font-bold text-amber-600 ml-1">{score}/{max}</span>
    </div>
  )
}

const AVATAR_COLORS = [
  'bg-blue-500', 'bg-violet-500', 'bg-amber-500', 'bg-rose-500',
  'bg-cyan-500', 'bg-emerald-500', 'bg-indigo-500', 'bg-orange-500',
  'bg-pink-500', 'bg-teal-500', 'bg-sky-500', 'bg-purple-500',
]

function mentorAvatarColor(name: string): string {
  const hash = name.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0)
  return AVATAR_COLORS[hash % AVATAR_COLORS.length]
}

// ── Detail Panel ──────────────────────────────────────────────────────────────

const DETAIL_LABELS: { key: EvalKey; label: string }[] = [
  { key: 'opening',            label: 'Opening / Hook' },
  { key: 'interestPoint',      label: 'Interest Point' },
  { key: 'customerPain',       label: 'Customer Pain' },
  { key: 'diagnosticApproach', label: 'Diagnostic Approach' },
  { key: 'closingNextStep',    label: 'Closing / Next Step' },
  { key: 'bestPractice',       label: 'Best Practice' },
  { key: 'beyondClassroom',    label: 'Beyond Classroom' },
]

function DetailBlock({ label, value }: { label: string; value: string }) {
  if (!value) return null
  return (
    <div>
      <p className="text-xs font-bold text-gray-400 mb-1.5">{label}</p>
      <div className="bg-gray-50 rounded-xl p-3">
        {value.split('\n').map((line, i) => (
          <p key={i} className="text-sm text-gray-700 leading-relaxed">{line || ' '}</p>
        ))}
      </div>
    </div>
  )
}

// ── VisitDetailModal (center overlay) ────────────────────────────────────────

function VisitDetailModal({
  record,
  ack,
  canReview,
  reviewerName,
  onClose,
  onSaveAck,
}: {
  record: ShadowRecord
  ack?: ShadowAcknowledgment
  canReview: boolean
  reviewerName: string
  onClose: () => void
  onSaveAck: (recordId: string, rating: number, comment: string) => void
}) {
  return (
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden animate-pop-in"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="shrink-0 flex items-start justify-between gap-3 px-6 py-5 border-b border-gray-100">
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-gray-900 leading-snug">{record.storeName}</h2>
            <div className="flex items-center gap-1.5 mt-1 flex-wrap">
              <span className={`inline-flex items-center text-xs font-bold px-2 py-0.5 rounded-full border ${SEGMENT_STYLE[record.segment]}`}>
                {record.segment}
              </span>
              <span className={`inline-flex items-center text-xs font-bold px-2 py-0.5 rounded-full border ${PERSONA_STYLE[record.persona]}`}>
                {record.persona}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="size-8 rounded-xl border border-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors shrink-0"
          >
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Meta bar */}
        <div className="shrink-0 flex items-center gap-4 px-6 py-3 bg-gray-50 border-b border-gray-100 text-xs text-gray-500 flex-wrap">
          <div className="flex items-center gap-1.5">
            <svg className="size-3.5 text-freshket-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
            <span><strong className="text-gray-700">{record.mentorName}</strong> · {record.mentorPosition}</span>
          </div>
          <div className="flex items-center gap-1">
            <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
            </svg>
            {formatThaiDate(record.createdAt)}
          </div>
          <div className="flex items-center gap-1">
            <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
            {record.observerName}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          {DETAIL_LABELS.map(({ key, label }) => (
            <DetailBlock key={key} label={label} value={record[key] as string} />
          ))}

          {/* Acknowledge / Feedback section */}
          {canReview ? (
            <AcknowledgeSection
              ack={ack}
              reviewerName={reviewerName}
              onSave={(rating, comment) => onSaveAck(record.id, rating, comment)}
            />
          ) : ack ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-amber-700">Feedback จาก TL / Manager</p>
                <StarRating score={ack.rating} />
              </div>
              <p className="text-xs text-amber-600">{ack.reviewerName} · {formatThaiDate(ack.reviewedAt)}</p>
              {ack.comment && <p className="text-sm text-amber-800 leading-relaxed">{ack.comment}</p>}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

// ── AcknowledgeSection ────────────────────────────────────────────────────────

function AcknowledgeSection({
  ack,
  reviewerName,
  onSave,
}: {
  ack?: ShadowAcknowledgment
  reviewerName: string
  onSave: (rating: number, comment: string) => void
}) {
  const [editing, setEditing] = useState(!ack)
  const [rating, setRating]   = useState(ack?.rating ?? 0)
  const [comment, setComment] = useState(ack?.comment ?? '')

  if (!editing && ack) {
    return (
      <div className="rounded-2xl bg-freshket-50 p-4 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg className="size-4 text-freshket-500" viewBox="0 0 24 24" fill="currentColor">
              <path fillRule="evenodd" d="M19.916 4.626a.75.75 0 01.208 1.04l-9 13.5a.75.75 0 01-1.154.114l-6-6a.75.75 0 011.06-1.06l5.353 5.353 8.493-12.739a.75.75 0 011.04-.208z" clipRule="evenodd" />
            </svg>
            <p className="text-xs font-bold text-freshket-700">Acknowledged</p>
          </div>
          <div className="flex items-center gap-2">
            <StarRating score={ack.rating} />
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-xs text-freshket-600 font-bold hover:underline ml-2"
            >
              แก้ไข
            </button>
          </div>
        </div>
        <p className="text-xs text-freshket-600">{ack.reviewerName} · {formatThaiDate(ack.reviewedAt)}</p>
        {ack.comment && <p className="text-sm text-freshket-800 leading-relaxed">{ack.comment}</p>}
      </div>
    )
  }

  return (
    <div className="rounded-2xl bg-freshket-50 p-4 space-y-4">
      <p className="text-xs font-bold text-freshket-700">
        {ack ? 'แก้ไข Feedback' : 'Acknowledge & ให้ Feedback'}
      </p>

      {/* Star picker */}
      <div>
        <p className="text-xs text-gray-600 mb-2">Rating <span className="text-rose-400">*</span></p>
        <div className="flex gap-1">
          {[1, 2, 3, 4, 5].map(i => (
            <button
              key={i}
              type="button"
              onClick={() => setRating(i)}
              className="transition-transform hover:scale-110"
            >
              <svg
                className={`size-8 transition-colors ${i <= rating ? 'text-amber-400' : 'text-gray-200 hover:text-amber-200'}`}
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" />
              </svg>
            </button>
          ))}
          {rating > 0 && (
            <span className="text-sm font-bold text-amber-600 self-center ml-1">{rating}/5</span>
          )}
        </div>
      </div>

      {/* Comment */}
      <div>
        <p className="text-xs text-gray-600 mb-1.5">Comment / Feedback</p>
        <textarea
          value={comment}
          onChange={e => setComment(e.target.value)}
          placeholder="สรุปการ Shadow ได้ครบประเด็นมั้ย? จุดที่ดี? สิ่งที่ควรปรับปรุง?"
          className="w-full rounded-xl bg-white px-3 py-2.5 text-sm text-gray-900 leading-relaxed resize-none min-h-[80px] placeholder-gray-400 outline-none focus:border-freshket-400 focus:ring-2 focus:ring-freshket-100 transition-all"
        />
      </div>

      <div className="flex items-center justify-end gap-2">
        {ack && (
          <button
            type="button"
            onClick={() => { setRating(ack.rating); setComment(ack.comment); setEditing(false) }}
            className="px-3 py-1.5 rounded-xl border border-gray-200 text-xs font-normal text-gray-600 hover:bg-gray-50 transition-colors"
          >
            ยกเลิก
          </button>
        )}
        <button
          type="button"
          disabled={rating === 0}
          onClick={() => { if (rating > 0) { onSave(rating, comment); setEditing(false) } }}
          className="px-4 py-1.5 rounded-xl bg-freshket-500 hover:bg-freshket-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold transition-colors shadow-sm"
        >
          {ack ? 'บันทึกการแก้ไข' : 'Acknowledge'}
        </button>
      </div>
    </div>
  )
}

// ── Member Visits Overlay (TL / Manager) ─────────────────────────────────────

function MemberVisitsOverlay({
  member,
  records,
  acknowledgments,
  canReview,
  reviewerName,
  onClose,
  onViewDetail,
  onSaveAck,
}: {
  member: UserProfile
  records: ShadowRecord[]
  acknowledgments: Map<string, ShadowAcknowledgment>
  canReview: boolean
  reviewerName: string
  onClose: () => void
  onViewDetail: (r: ShadowRecord) => void
  onSaveAck: (recordId: string, rating: number, comment: string) => void
}) {
  return (
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full sm:w-[65vw] max-w-[960px] flex flex-col shadow-2xl animate-pop-in overflow-hidden"
        style={{ height: '85vh' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-gray-100 shrink-0">
          <div className="size-10 rounded-full bg-freshket-100 flex items-center justify-center text-sm font-bold text-freshket-700 shrink-0">
            {(member.nickname ?? member.displayName).charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-base font-bold text-gray-900">{member.displayName}</h2>
              {member.nickname && <span className="text-sm text-gray-400">({member.nickname})</span>}
            </div>
            <p className="text-xs text-gray-400 mt-0.5">
              {member.employeeId && <span className="font-mono mr-2">{member.employeeId}</span>}
              {member.position && member.position}
              {' · '}{records.length} Shadow Visit{records.length !== 1 ? 's' : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="size-8 rounded-xl border border-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors shrink-0"
          >
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Visit cards */}
        <div className="p-6 space-y-3 flex-1 overflow-y-auto">
          {records.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div className="size-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-3">
                <svg className="size-7 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              </div>
              <p className="text-sm font-bold text-gray-400">ยังไม่มี Shadow Visit</p>
            </div>
          ) : (
            records.map(r => {
              const ack = acknowledgments.get(r.id)
              return (
                <div
                  key={r.id}
                  className="bg-white rounded-2xl border border-gray-100 hover:border-freshket-200 hover:shadow-[0_8px_24px_rgba(38,41,44,0.08)] hover:-translate-y-0.5 transition-all duration-150 overflow-hidden"
                >
                  {/* Card top */}
                  <button
                    type="button"
                    className="w-full text-left px-5 py-4"
                    onClick={() => onViewDetail(r)}
                  >
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1.5">
                          <span className="text-sm font-bold text-gray-900">{r.storeName}</span>
                          <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${SEGMENT_STYLE[r.segment]}`}>{r.segment}</span>
                          <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full border ${PERSONA_STYLE[r.persona]}`}>{r.persona}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-400">
                          <span>Mentor: <span className="font-normal text-gray-600">{r.mentorName}</span></span>
                          <span>{r.createdAt.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {ack ? (
                          <div className="flex items-center gap-1.5">
                            <div className="flex">
                              {[1,2,3,4,5].map(i => (
                                <svg key={i} className={`size-3.5 ${i <= ack.rating ? 'text-amber-400' : 'text-gray-200'}`} viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" />
                                </svg>
                              ))}
                            </div>
                            <span className="text-xs font-bold text-freshket-600">✓</span>
                          </div>
                        ) : (
                          canReview && (
                            <span className="text-xs text-amber-500 font-normal">รอ Ack</span>
                          )
                        )}
                        <svg className="size-4 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                      </div>
                    </div>
                  </button>

                  {/* Quick acknowledge row */}
                  {canReview && !ack && (
                    <QuickAckRow recordId={r.id} onSave={onSaveAck} />
                  )}
                  {ack && (
                    <div className="px-5 pb-4 pt-0">
                      <div className="rounded-xl bg-freshket-50 border border-freshket-100 px-3 py-2.5 text-xs text-freshket-700 leading-relaxed">
                        <span className="font-bold">{ack.reviewerName}:</span> {ack.comment || '—'}
                      </div>
                    </div>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}

function QuickAckRow({ recordId, onSave }: { recordId: string; onSave: (id: string, rating: number, comment: string) => void }) {
  const [rating, setRating] = useState(0)
  const [comment, setComment] = useState('')
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <div className="px-5 pb-4">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 text-xs font-bold text-freshket-600 hover:text-freshket-700 transition-colors"
        >
          <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Acknowledge
        </button>
      </div>
    )
  }

  return (
    <div className="px-5 pb-4 space-y-2.5 border-t border-gray-100 pt-3">
      <div className="flex items-center gap-1">
        {[1,2,3,4,5].map(i => (
          <button key={i} type="button" onClick={() => setRating(i)} className="transition-transform hover:scale-110">
            <svg className={`size-6 transition-colors ${i <= rating ? 'text-amber-400' : 'text-gray-200 hover:text-amber-200'}`} viewBox="0 0 24 24" fill="currentColor">
              <path d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" />
            </svg>
          </button>
        ))}
        {rating > 0 && <span className="text-xs font-bold text-amber-600 ml-1">{rating}/5</span>}
      </div>
      <textarea
        value={comment}
        onChange={e => setComment(e.target.value)}
        placeholder="Comment / Feedback..."
        rows={2}
        className="w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-900 leading-relaxed resize-none placeholder-gray-400 outline-none focus:border-freshket-400 focus:ring-2 focus:ring-freshket-100 transition-all"
      />
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setOpen(false)} className="px-3 py-1.5 text-xs text-gray-500 hover:text-gray-700">ยกเลิก</button>
        <button
          type="button"
          disabled={rating === 0}
          onClick={() => { if (rating > 0) { onSave(recordId, rating, comment); setOpen(false) } }}
          className="px-4 py-1.5 rounded-xl bg-freshket-500 hover:bg-freshket-600 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold transition-colors"
        >
          บันทึก
        </button>
      </div>
    </div>
  )
}

// ── Sale: My Visits List ──────────────────────────────────────────────────────

function SaleVisitsList({
  records,
  acknowledgments,
  onView,
  hideTitle,
}: {
  records: ShadowRecord[]
  acknowledgments: Map<string, ShadowAcknowledgment>
  onView: (r: ShadowRecord) => void
  hideTitle?: boolean
}) {
  if (records.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 flex flex-col items-center justify-center py-20 text-center">
        <div className="size-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
          <svg className="size-8 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <p className="text-sm font-bold text-gray-500">ยังไม่มี Shadow Visit</p>
        <p className="text-xs text-gray-400 mt-1">กดปุ่ม "บันทึกใหม่" เพื่อเพิ่มรายการแรก</p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      {!hideTitle && <p className="text-sm font-bold text-gray-700">บันทึกของฉัน ({records.length} รายการ)</p>}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden divide-y divide-gray-50">
        {records.map(r => {
          const ack = acknowledgments.get(r.id)
          const initial = r.mentorName.charAt(0).toUpperCase()
          const avatarCls = mentorAvatarColor(r.mentorName)
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => onView(r)}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-gray-50 active:bg-gray-100 transition-colors duration-150 group"
            >
              {/* Mentor avatar */}
              <div className={`size-11 rounded-full flex items-center justify-center shrink-0 text-white text-base font-bold ${avatarCls}`}>
                {initial}
              </div>

              {/* Middle: store + meta + badges */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-gray-900 leading-snug truncate">{r.storeName}</p>
                <p className="text-xs text-gray-400 mt-0.5 truncate">
                  {r.mentorName} · {r.createdAt.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' })}
                </p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${SEGMENT_STYLE[r.segment]}`}>{r.segment}</span>
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${PERSONA_STYLE[r.persona]}`}>{r.persona}</span>
                </div>
              </div>

              {/* Right: ack status + chevron */}
              <div className="shrink-0 flex flex-col items-end gap-1.5">
                {ack ? (
                  <>
                    <div className="flex gap-0.5">
                      {[1,2,3,4,5].map(i => (
                        <svg key={i} className={`size-3 ${i <= ack.rating ? 'text-amber-400' : 'text-gray-200'}`} viewBox="0 0 24 24" fill="currentColor">
                          <path d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" />
                        </svg>
                      ))}
                    </div>
                    <span className="text-xs font-bold text-freshket-600 bg-freshket-100 px-2 py-0.5 rounded-full">✓ Acked</span>
                  </>
                ) : (
                  <span className="text-xs font-normal text-gray-300">รอ Ack</span>
                )}
              </div>

              <svg className="size-4 text-gray-300 group-hover:text-freshket-400 transition-colors shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
              </svg>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// ── Sale: My Visits Grid ──────────────────────────────────────────────────────

function SaleVisitsGrid({
  records,
  acknowledgments,
  onView,
}: {
  records: ShadowRecord[]
  acknowledgments: Map<string, ShadowAcknowledgment>
  onView: (r: ShadowRecord) => void
}) {
  if (records.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-100 flex flex-col items-center justify-center py-20 text-center">
        <div className="size-16 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
          <svg className="size-8 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.964-7.178z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </div>
        <p className="text-sm font-bold text-gray-500">ยังไม่มี Shadow Visit</p>
        <p className="text-xs text-gray-400 mt-1">กดปุ่ม "บันทึกใหม่" เพื่อเพิ่มรายการแรก</p>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-2 gap-3">
      {records.map(r => {
        const ack = acknowledgments.get(r.id)
        const initial = r.mentorName.charAt(0).toUpperCase()
        const avatarCls = mentorAvatarColor(r.mentorName)
        return (
          <button
            key={r.id}
            type="button"
            onClick={() => onView(r)}
            className="bg-white rounded-2xl border border-gray-100 hover:border-freshket-200 hover:shadow-[0_8px_24px_rgba(38,41,44,0.08)] hover:-translate-y-0.5 transition-all duration-150 p-4 text-left group flex flex-col"
          >
            {/* Mentor avatar */}
            <div className={`size-10 rounded-full flex items-center justify-center mb-3 text-white font-bold text-sm ${avatarCls}`}>
              {initial}
            </div>

            {/* Store name */}
            <p className="text-sm font-bold text-gray-900 leading-snug mb-1 line-clamp-2">{r.storeName}</p>

            {/* Badges */}
            <div className="flex flex-wrap gap-1 mb-2">
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${SEGMENT_STYLE[r.segment]}`}>{r.segment}</span>
              <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${PERSONA_STYLE[r.persona]}`}>{r.persona}</span>
            </div>

            {/* Meta */}
            <p className="text-xs text-gray-400 truncate mt-auto">
              {r.mentorName} · {r.createdAt.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' })}
            </p>

            {/* Ack status */}
            {ack ? (
              <div className="mt-2 flex items-center gap-0.5">
                {[1,2,3,4,5].map(i => (
                  <svg key={i} className={`size-3 ${i <= ack.rating ? 'text-amber-400' : 'text-gray-200'}`} viewBox="0 0 24 24" fill="currentColor">
                    <path d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" />
                  </svg>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs font-normal text-gray-300">รอ Ack</p>
            )}
          </button>
        )
      })}
    </div>
  )
}

// ── Form Panel ────────────────────────────────────────────────────────────────

type FormState = {
  mentorName: string
  mentorPosition: string
  storeName: string
  segment: ShadowSegment
  persona: ShadowPersona
  opening: string
  interestPoint: string
  customerPain: string
  diagnosticApproach: string
  closingNextStep: string
  bestPractice: string
  beyondClassroom: string
}

const EMPTY_FORM: FormState = {
  mentorName: '',
  mentorPosition: '',
  storeName: '',
  segment: 'Mini Chain',
  persona: 'Chef',
  opening: '',
  interestPoint: '',
  customerPain: '',
  diagnosticApproach: '',
  closingNextStep: '',
  bestPractice: '',
  beyondClassroom: '',
}

function ShadowFormPanel({
  onClose,
  onSubmit,
  allUsers,
  currentUid,
}: {
  onClose: () => void
  onSubmit: (data: FormState) => void
  allUsers: UserProfile[]
  currentUid: string
}) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({})
  const [mentorSearch, setMentorSearch] = useState('')
  const [mentorOpen, setMentorOpen] = useState(false)
  const [selectedMentorUid, setSelectedMentorUid] = useState<string | null>(null)

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm(prev => ({ ...prev, [key]: value }))
    if (errors[key]) setErrors(prev => ({ ...prev, [key]: undefined }))
  }

  function selectMentor(u: UserProfile) {
    setSelectedMentorUid(u.uid)
    set('mentorName', u.nickname ?? u.displayName)
    set('mentorPosition', u.position ?? '')
    setMentorSearch('')
    setMentorOpen(false)
    setErrors(prev => ({ ...prev, mentorName: undefined }))
  }

  function clearMentor() {
    setSelectedMentorUid(null)
    set('mentorName', '')
    set('mentorPosition', '')
  }

  const mentorList = useMemo(() => {
    const q = mentorSearch.toLowerCase()
    return allUsers
      .filter(u => u.uid !== currentUid)
      .filter(u =>
        !q ||
        u.displayName.toLowerCase().includes(q) ||
        (u.nickname ?? '').toLowerCase().includes(q) ||
        (u.employeeId ?? '').toLowerCase().includes(q) ||
        (u.position ?? '').toLowerCase().includes(q)
      )
      .slice(0, 8)
  }, [allUsers, currentUid, mentorSearch])

  const selectedMentorUser = selectedMentorUid ? allUsers.find(u => u.uid === selectedMentorUid) : null

  function validate(): boolean {
    const e: Partial<Record<keyof FormState, string>> = {}
    if (!form.mentorName.trim()) e.mentorName = 'กรุณาเลือก Mentor'
    if (!form.storeName.trim()) e.storeName = 'กรุณากรอกชื่อร้าน'
    if (!form.bestPractice.trim()) e.bestPractice = 'กรุณากรอก Best Practice'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  function handleSubmit() {
    if (validate()) onSubmit(form)
  }

  const inputCls = (err?: string) =>
    `w-full rounded-xl border px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none transition-all ${
      err
        ? 'border-rose-300 bg-rose-50 focus:ring-2 focus:ring-rose-200'
        : 'border-gray-200 bg-white focus:border-freshket-400 focus:ring-2 focus:ring-freshket-100'
    }`

  const textareaCls = (err?: string) =>
    `w-full rounded-xl border px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none transition-all resize-none min-h-[96px] leading-relaxed ${
      err
        ? 'border-rose-300 bg-rose-50 focus:ring-2 focus:ring-rose-200'
        : 'border-gray-200 bg-white focus:border-freshket-400 focus:ring-2 focus:ring-freshket-100'
    }`

  return (
    <div
      className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-start justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
    <div
      className="bg-white rounded-2xl w-full max-w-2xl my-8 flex flex-col shadow-2xl animate-pop-in"
      onClick={e => e.stopPropagation()}
    >
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between gap-3 px-6 py-5 border-b border-gray-100">
        <div>
          <h2 className="text-base font-bold text-gray-900">บันทึก Shadow Visit ใหม่</h2>
          <p className="text-xs text-gray-500 mt-0.5">บันทึกการสังเกตการณ์จากการ Shadow พี่เลี้ยง</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="size-8 rounded-xl border border-gray-200 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-50 transition-colors shrink-0"
        >
          <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">

        {/* Section 1: Visit info */}
        <div>
          <p className="text-xs font-bold text-gray-400 mb-3">ข้อมูลการเยี่ยมชม</p>
          <div className="space-y-3">

            {/* Mentor picker */}
            <div>
              <label className="block text-xs font-normal text-gray-700 mb-1.5">
                Mentor / พี่เลี้ยง <span className="text-rose-400">*</span>
              </label>
              {selectedMentorUser ? (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-freshket-50">
                  <div className="size-8 rounded-full bg-freshket-500 flex items-center justify-center text-xs font-bold text-white shrink-0">
                    {(selectedMentorUser.nickname ?? selectedMentorUser.displayName).charAt(0)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-freshket-800 leading-tight">
                      {selectedMentorUser.displayName}
                      {selectedMentorUser.nickname && (
                        <span className="text-freshket-600 font-normal ml-1.5">({selectedMentorUser.nickname})</span>
                      )}
                    </p>
                    {selectedMentorUser.position && (
                      <p className="text-xs text-freshket-600 mt-0.5">{selectedMentorUser.position}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {selectedMentorUser.employeeId && (
                      <span className="text-xs font-mono text-freshket-600 bg-freshket-100 px-2 py-0.5 rounded-full">
                        {selectedMentorUser.employeeId}
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={clearMentor}
                      className="size-6 rounded-full flex items-center justify-center text-freshket-400 hover:text-freshket-600 hover:bg-freshket-100 transition-colors"
                    >
                      <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="relative">
                  <div className="relative">
                    <svg className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                    </svg>
                    <input
                      type="text"
                      value={mentorSearch}
                      onChange={e => { setMentorSearch(e.target.value); setMentorOpen(true) }}
                      onFocus={() => setMentorOpen(true)}
                      placeholder="ค้นหาชื่อ / ชื่อเล่น / รหัสพนักงาน..."
                      className={`pl-9 pr-3 py-2.5 ${inputCls(errors.mentorName)}`}
                    />
                  </div>
                  {mentorOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setMentorOpen(false)} />
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-gray-200 shadow-xl z-20 max-h-56 overflow-y-auto">
                        {mentorList.length === 0 ? (
                          <p className="text-xs text-gray-400 px-4 py-3 text-center">ไม่พบพนักงาน</p>
                        ) : (
                          mentorList.map(u => (
                            <button
                              key={u.uid}
                              type="button"
                              onMouseDown={e => { e.preventDefault(); selectMentor(u) }}
                              className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-freshket-50 transition-colors text-left"
                            >
                              <div className="size-8 rounded-full bg-gray-100 flex items-center justify-center text-xs font-bold text-gray-500 shrink-0">
                                {(u.nickname ?? u.displayName).charAt(0)}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-gray-900 leading-tight">
                                  {u.displayName}
                                  {u.nickname && <span className="text-gray-400 font-normal ml-1.5">({u.nickname})</span>}
                                </p>
                                {u.position && <p className="text-xs text-gray-400 truncate">{u.position}</p>}
                              </div>
                              {u.employeeId && (
                                <span className="text-xs font-mono text-gray-400 shrink-0">{u.employeeId}</span>
                              )}
                            </button>
                          ))
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
              {errors.mentorName && <p className="text-xs text-rose-500 mt-1">{errors.mentorName}</p>}
            </div>

            {/* Store name */}
            <div>
              <label className="block text-xs font-normal text-gray-700 mb-1.5">
                ชื่อร้าน <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={form.storeName}
                onChange={e => set('storeName', e.target.value)}
                placeholder="เช่น Holey Artisan, Jones' Salad"
                className={inputCls(errors.storeName)}
              />
              {errors.storeName && <p className="text-xs text-rose-500 mt-1">{errors.storeName}</p>}
            </div>

            {/* Segment pill toggles */}
            <div>
              <label className="block text-xs font-normal text-gray-700 mb-2">ประเภทร้าน (Segment)</label>
              <div className="flex flex-wrap gap-2">
                {SEGMENTS.map(s => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => set('segment', s)}
                    className={`inline-flex items-center px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all duration-150 ${
                      form.segment === s
                        ? SEGMENT_STYLE[s] + ' shadow-sm scale-105'
                        : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300 hover:text-gray-600'
                    }`}
                  >
                    {form.segment === s && (
                      <svg className="size-3 mr-1" viewBox="0 0 24 24" fill="currentColor">
                        <path fillRule="evenodd" d="M19.916 4.626a.75.75 0 01.208 1.04l-9 13.5a.75.75 0 01-1.154.114l-6-6a.75.75 0 011.06-1.06l5.353 5.353 8.493-12.739a.75.75 0 011.04-.208z" clipRule="evenodd" />
                      </svg>
                    )}
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Persona pill toggles */}
            <div>
              <label className="block text-xs font-normal text-gray-700 mb-2">บุคคลที่พบ (Persona)</label>
              <div className="flex flex-wrap gap-2">
                {PERSONAS.map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => set('persona', p)}
                    className={`inline-flex items-center px-3.5 py-1.5 rounded-full text-xs font-bold border transition-all duration-150 ${
                      form.persona === p
                        ? PERSONA_STYLE[p] + ' shadow-sm scale-105'
                        : 'bg-white text-gray-400 border-gray-200 hover:border-gray-300 hover:text-gray-600'
                    }`}
                  >
                    {form.persona === p && (
                      <svg className="size-3 mr-1" viewBox="0 0 24 24" fill="currentColor">
                        <path fillRule="evenodd" d="M19.916 4.626a.75.75 0 01.208 1.04l-9 13.5a.75.75 0 01-1.154.114l-6-6a.75.75 0 011.06-1.06l5.353 5.353 8.493-12.739a.75.75 0 011.04-.208z" clipRule="evenodd" />
                      </svg>
                    )}
                    {p}
                  </button>
                ))}
              </div>
            </div>

          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-gray-100" />

        {/* Section 2: Evaluation */}
        <div>
          <p className="text-xs font-bold text-gray-400 mb-3">บันทึกการประเมิน</p>
          <div className="space-y-4">
            {EVAL_FIELDS.map(({ key, label, placeholder }) => (
              <div key={key}>
                <label className="block text-xs font-normal text-gray-700 mb-1.5">
                  {label}
                  {key === 'bestPractice' && <span className="text-rose-400 ml-0.5">*</span>}
                </label>
                <textarea
                  value={form[key]}
                  onChange={e => set(key, e.target.value)}
                  placeholder={placeholder}
                  className={textareaCls(errors[key])}
                  rows={4}
                />
                {errors[key] && <p className="text-xs text-rose-500 mt-1">{errors[key]}</p>}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="shrink-0 flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 rounded-xl text-sm font-normal text-gray-600 hover:bg-gray-100 transition-colors"
        >
          ยกเลิก
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          className="px-5 py-2 rounded-xl text-sm font-bold bg-freshket-500 hover:bg-freshket-600 text-white transition-colors"
        >
          บันทึก Shadow Visit
        </button>
      </div>
    </div>
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

// Pre-seeded demo acknowledgments
const DEMO_ACKS = new Map<string, ShadowAcknowledgment>([
  ['sh-06', { reviewerUid: 'mock-tl-02', reviewerName: 'ทีมลีด Sale B', rating: 4, comment: 'การรับฟังและ Diagnose ดี ควรฝึกเรื่องการ Summarize Pain ของลูกค้าให้กระชับก่อน Close', reviewedAt: new Date('2026-03-18T09:00:00') }],
  ['sh-07', { reviewerUid: 'mock-tl-02', reviewerName: 'ทีมลีด Sale B', rating: 5, comment: 'ดีมาก ทักษะการฟังและ Diagnose ชัดเจน การ Acknowledge ก่อน Solve เป็น Professional มาก', reviewedAt: new Date('2026-03-18T09:30:00') }],
])

export default function ShadowPage() {
  const { user } = useAuth()
  const { data: allUsers } = useAllUsers()
  const { data: teams }    = useTeams()
  const [records, setRecords] = useState<ShadowRecord[]>(DEMO_RECORDS)
  const [showForm, setShowForm]         = useState(false)
  const [overlayMember, setOverlayMember] = useState<UserProfile | null>(null)
  const [selectedVisit, setSelectedVisit] = useState<ShadowRecord | null>(null)
  const [memberSearch, setMemberSearch] = useState('')
  const [memberSortAsc, setMemberSortAsc] = useState(true)
  const [acknowledgments, setAcknowledgments] = useState<Map<string, ShadowAcknowledgment>>(DEMO_ACKS)
  const [saleView, setSaleView] = useState<'list' | 'grid'>('list')

  const isLead = canAccess(user?.role ?? 'sale', 'team_lead')

  // Compute team members visible to this user
  const teamMembers = useMemo<UserProfile[]>(() => {
    if (!user || !isLead) return []
    if (user.role === 'team_lead') {
      return allUsers.filter(u => u.managerId === user.uid)
    }
    // manager / super_admin: team leads + sale users in managed teams
    const myTeamIds = new Set(teams.filter(t => t.managerId === user.uid).map(t => t.id))
    return allUsers.filter(u =>
      u.managerId === user.uid ||
      (u.teamId !== undefined && myTeamIds.has(u.teamId) && u.role === 'sale')
    )
  }, [user, allUsers, teams, isLead])

  // Filtered + sorted member list for the panel
  const displayedMembers = useMemo<UserProfile[]>(() => {
    const q = memberSearch.toLowerCase()
    const filtered = q
      ? teamMembers.filter(u =>
          (u.employeeId ?? '').toLowerCase().includes(q) ||
          u.displayName.toLowerCase().includes(q) ||
          (u.nickname ?? '').toLowerCase().includes(q)
        )
      : teamMembers
    return [...filtered].sort((a, b) => {
      const ea = a.employeeId ?? ''
      const eb = b.employeeId ?? ''
      return memberSortAsc ? ea.localeCompare(eb) : eb.localeCompare(ea)
    })
  }, [teamMembers, memberSearch, memberSortAsc])

  // Per-member shadow stats
  const memberStats = useMemo(() => {
    const countMap = new Map<string, number>()
    const ratingArr = new Map<string, number[]>()
    for (const r of records) {
      countMap.set(r.observerUid, (countMap.get(r.observerUid) ?? 0) + 1)
      if (typeof r.ratingScore === 'number' && r.ratingScore > 0) {
        const arr = ratingArr.get(r.observerUid) ?? []
        arr.push(r.ratingScore)
        ratingArr.set(r.observerUid, arr)
      }
    }
    const result = new Map<string, { count: number; avgRating: number | null }>()
    countMap.forEach((count, uid) => {
      const ratings = ratingArr.get(uid) ?? []
      const avgRating = ratings.length > 0
        ? Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10
        : null
      result.set(uid, { count, avgRating })
    })
    return result
  }, [records])

  // Team name lookup
  const teamNameMap = useMemo(() => {
    const m = new Map<string, string>()
    teams.forEach(t => m.set(t.id, t.name))
    return m
  }, [teams])

  // My own records (sale view)
  const myRecords = useMemo(() =>
    records
      .filter(r => r.observerUid === user?.uid)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
    [records, user?.uid]
  )

  // Lock body scroll when any overlay/form is open
  useEffect(() => {
    const open = !!(overlayMember || selectedVisit || showForm)
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [overlayMember, selectedVisit, showForm])

  function handleSubmit(data: FormState) {
    const rec: ShadowRecord = {
      id: `sh-${Date.now()}`,
      createdAt: new Date(),
      updatedAt: new Date(),
      observerUid: user?.uid ?? 'demo',
      observerEmail: user?.email ?? 'demo@freshket.co',
      observerName: user?.displayName ?? 'Demo User',
      ...data,
    }
    setRecords(prev => [rec, ...prev])
    setShowForm(false)

    // Notify the team_lead / manager who manages this sale
    if (user?.managerId) {
      pushNotification(user.managerId, {
        type: 'shadow_pending_ack',
        title: `${user.displayName} ส่ง Shadow Visit ใหม่`,
        body: `ร้าน ${data.storeName} · ${data.segment} · รอการ Acknowledge`,
        refId: rec.id,
        refPath: '/shadow',
      })
    } else {
      // Fallback: notify all team_leads / managers visible in allUsers
      allUsers
        .filter(u => canAccess(u.role, 'team_lead'))
        .forEach(lead => {
          pushNotification(lead.uid, {
            type: 'shadow_pending_ack',
            title: `${user?.displayName ?? 'พนักงาน'} ส่ง Shadow Visit ใหม่`,
            body: `ร้าน ${data.storeName} · ${data.segment} · รอการ Acknowledge`,
            refId: rec.id,
            refPath: '/shadow',
          })
        })
    }
  }

  function handleSaveAck(recordId: string, rating: number, comment: string) {
    setAcknowledgments(prev => {
      const next = new Map(prev)
      next.set(recordId, {
        reviewerUid: user?.uid ?? '',
        reviewerName: user?.displayName ?? '',
        rating,
        comment,
        reviewedAt: new Date(),
      })
      return next
    })

    // Notify the sale person whose record was acknowledged
    const rec = records.find(r => r.id === recordId)
    if (rec && rec.observerUid !== user?.uid) {
      pushNotification(rec.observerUid, {
        type: 'shadow_ack_received',
        title: `${user?.displayName ?? 'Mentor'} ประเมิน Shadow Visit ของคุณ`,
        body: `ร้าน ${rec.storeName} · ได้รับ ${rating}/5 ดาว`,
        refId: recordId,
        refPath: '/shadow',
      })
    }
  }

  return (
    <>
      <Header
        title="Shadow Visit"
        subtitle={`บันทึกการ Shadow กับพี่เลี้ยง · ${records.length} รายการ`}
        actions={
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-freshket-500 hover:bg-freshket-600 text-white text-sm font-bold transition-colors shadow-sm"
          >
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            บันทึกใหม่
          </button>
        }
      />

      <div className="flex-1 overflow-auto p-6 space-y-4 animate-float-up">

        {/* ── TL / Manager: member table ─────────────────────────────────── */}
        {isLead && (
          <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
            {/* Table toolbar */}
            <div className="flex items-center gap-3 flex-wrap px-4 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-gray-900">สมาชิกทีม</span>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-freshket-100 text-freshket-700">
                  {teamMembers.length} คน
                </span>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setMemberSortAsc(v => !v)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-xl border border-gray-200 bg-gray-50 hover:bg-gray-100 text-xs font-bold text-gray-600 transition-colors"
                >
                  <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 7.5h18M6 12h12M10.5 16.5h3" />
                  </svg>
                  {memberSortAsc ? '↑' : '↓'}
                </button>
                <div className="relative">
                  <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
                  </svg>
                  <input
                    type="text"
                    value={memberSearch}
                    onChange={e => setMemberSearch(e.target.value)}
                    placeholder="ค้นหา..."
                    className="pl-8 pr-3 py-1.5 rounded-xl border border-gray-200 bg-white text-xs text-gray-900 placeholder-gray-400 outline-none focus:border-freshket-400 focus:ring-2 focus:ring-freshket-100 transition-all w-36"
                  />
                </div>
              </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['พนักงาน', 'รหัส', 'ทีม', 'Visits', '⭐ Rating', '✓ Acked'].map((h, i) => (
                      <th key={i} className={`px-4 py-2.5 text-xs font-bold text-gray-400 whitespace-nowrap ${i === 0 ? 'text-left' : 'text-center'}`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {displayedMembers.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-300">ไม่พบสมาชิก</td>
                    </tr>
                  ) : (
                    displayedMembers.map(u => {
                      const stats = memberStats.get(u.uid)
                      const teamName = u.teamId ? (teamNameMap.get(u.teamId) ?? '') : ''
                      const memberAcked = records.filter(r => r.observerUid === u.uid && acknowledgments.has(r.id)).length
                      return (
                        <tr
                          key={u.uid}
                          onClick={() => setOverlayMember(u)}
                          className="hover:bg-freshket-50/40 cursor-pointer transition-colors group"
                        >
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="size-8 rounded-full bg-freshket-100 flex items-center justify-center text-xs font-bold text-freshket-700 shrink-0 group-hover:bg-freshket-200 transition-colors">
                                {(u.nickname ?? u.displayName).charAt(0)}
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-bold text-gray-900 leading-tight group-hover:text-freshket-700 transition-colors">{u.displayName}</p>
                                {u.nickname && <p className="text-xs text-gray-400">({u.nickname})</p>}
                              </div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-xs font-mono text-gray-500">{u.employeeId ?? '—'}</span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-xs text-gray-500">{teamName || '—'}</span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {stats ? (
                              <span className="text-sm font-bold text-gray-700">{stats.count}</span>
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {stats?.avgRating !== null && stats?.avgRating !== undefined ? (
                              <div className="flex items-center justify-center gap-1">
                                <svg className="size-3.5 text-amber-400" viewBox="0 0 24 24" fill="currentColor">
                                  <path d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z" />
                                </svg>
                                <span className="text-xs font-bold text-amber-600">{stats.avgRating}</span>
                              </div>
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </td>
                          <td className="px-4 py-3 text-center">
                            {memberAcked > 0 ? (
                              <span className="text-xs font-bold text-freshket-600">{memberAcked}</span>
                            ) : (
                              <span className="text-xs text-gray-300">0</span>
                            )}
                          </td>
                        </tr>
                      )
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Sale: my visits (list / grid) ─────────────────────────────── */}
        {!isLead && (
          <div className="space-y-3">
            {/* View toggle */}
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-gray-700">บันทึกของฉัน ({myRecords.length} รายการ)</p>
              <div className="flex items-center gap-1 bg-white rounded-xl border border-gray-200 p-1">
                <button
                  type="button"
                  onClick={() => setSaleView('list')}
                  className={`flex items-center justify-center size-7 rounded-lg transition-all ${
                    saleView === 'list' ? 'bg-freshket-500 text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'
                  }`}
                  title="List view"
                >
                  <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0ZM3.75 12h.007v.008H3.75V12Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Zm-.375 5.25h.007v.008H3.75v-.008Zm.375 0a.375.375 0 1 1-.75 0 .375.375 0 0 1 .75 0Z" />
                  </svg>
                </button>
                <button
                  type="button"
                  onClick={() => setSaleView('grid')}
                  className={`flex items-center justify-center size-7 rounded-lg transition-all ${
                    saleView === 'grid' ? 'bg-freshket-500 text-white shadow-sm' : 'text-gray-400 hover:text-gray-600'
                  }`}
                  title="Grid view"
                >
                  <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Content */}
            {saleView === 'list' ? (
              <SaleVisitsList
                records={myRecords}
                acknowledgments={acknowledgments}
                onView={r => setSelectedVisit(r)}
                hideTitle
              />
            ) : (
              <SaleVisitsGrid
                records={myRecords}
                acknowledgments={acknowledgments}
                onView={r => setSelectedVisit(r)}
              />
            )}
          </div>
        )}

      </div>

      {/* ── Member visits overlay (TL / Manager) ───────────────────────── */}
      {overlayMember && (
        <MemberVisitsOverlay
          member={overlayMember}
          records={records.filter(r => r.observerUid === overlayMember.uid).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())}
          acknowledgments={acknowledgments}
          canReview={isLead}
          reviewerName={user?.displayName ?? ''}
          onClose={() => setOverlayMember(null)}
          onViewDetail={r => setSelectedVisit(r)}
          onSaveAck={handleSaveAck}
        />
      )}

      {/* ── Visit detail modal (Sale / TL / Manager) ───────────────────── */}
      {selectedVisit && (
        <VisitDetailModal
          record={selectedVisit}
          ack={acknowledgments.get(selectedVisit.id)}
          canReview={isLead}
          reviewerName={user?.displayName ?? ''}
          onClose={() => setSelectedVisit(null)}
          onSaveAck={handleSaveAck}
        />
      )}

      {/* ── Form overlay ───────────────────────────────────────────────── */}
      {showForm && (
        <ShadowFormPanel
          onClose={() => setShowForm(false)}
          onSubmit={handleSubmit}
          allUsers={allUsers}
          currentUid={user?.uid ?? ''}
        />
      )}
    </>
  )
}
