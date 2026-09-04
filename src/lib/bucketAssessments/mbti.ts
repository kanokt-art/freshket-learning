import type { BucketAssessmentDefinition } from '@/types/bucketAssessment'
import { makeLikertOptions } from './likert'

// MBTI, expressed as a bucket assessment: four dimensions, two poles each.
// Every question is a single statement rated on a 7-point Likert scale
// ("เห็นด้วย" … "ไม่เห็นด้วย") rather than a forced choice between two
// statements — position 1 agrees with the statement (scoring toward the
// dimension's first pole), position 7 disagrees (scoring toward the second),
// position 4 is a true neutral that scores nothing. See
// lib/bucketAssessments/likert.ts for how the 7 options and their weights are
// built, and scoreBuckets.ts for how a neutral answer still counts as
// "answered" without moving either pole.
//
// Ties break toward I/N/F/P. An even question count per dimension makes a tie
// genuinely reachable, and a four-letter code cannot express "neither", so the
// tie-break is fixed and documented rather than arbitrary.

function likertQuestion(id: string, order: number, dimensionId: string, text: string, agreePole: string, otherPole: string) {
  return { id, order, dimensionId, text, likert: true as const, options: makeLikertOptions(id, agreePole, otherPole) }
}

export const MBTI_DEFINITION: BucketAssessmentDefinition = {
  id: 'mbti',
  title: 'MBTI — แบบประเมินบุคลิกภาพ',
  description:
    'แบบประเมินบุคลิกภาพ 16 แบบ จำนวน 30 ข้อ ไม่มีคำตอบถูกผิด '
    + 'ให้คะแนนความเห็นด้วยกับแต่ละข้อความ ผลลัพธ์จะบอกจุดแข็งของคุณในการทำงานและการดูแลลูกค้า',
  estimatedMinutes: 6,

  dimensions: [
    {
      id: 'EI', label: 'การแสดงออกของพลังงาน (Extraversion vs. Introversion)', tieBreak: 'I',
      buckets: [
        { id: 'E', label: 'E', blurb: 'Extraversion — ได้รับพลังงานจากโลกภายนอก เช่น การเข้าสังคม พบปะผู้คน' },
        { id: 'I', label: 'I', blurb: 'Introversion — ได้รับพลังงานจากโลกภายใน เช่น การใช้เวลาอยู่คนเดียว คิดทบทวน' },
      ],
    },
    {
      id: 'SN', label: 'การรับรู้ข้อมูล (Sensing vs. Intuition)', tieBreak: 'N',
      buckets: [
        { id: 'S', label: 'S', blurb: 'Sensing — รับรู้ผ่านประสาทสัมผัสทั้งห้า มองเห็น จับต้อง ได้ยิน' },
        { id: 'N', label: 'N', blurb: 'Intuition — มองหาความเป็นไปได้ แนวโน้ม หรือภาพรวมมากกว่า' },
      ],
    },
    {
      id: 'TF', label: 'การตัดสินใจ (Thinking vs. Feeling)', tieBreak: 'F',
      buckets: [
        { id: 'T', label: 'T', blurb: 'Thinking — ให้น้ำหนักกับตรรกะ เหตุผล และความเป็นจริงในการตัดสินใจ' },
        { id: 'F', label: 'F', blurb: 'Feeling — ให้ความสำคัญกับความรู้สึก คุณค่า และผลกระทบต่อผู้อื่นมากกว่า' },
      ],
    },
    {
      id: 'JP', label: 'การใช้ชีวิต (Judging vs. Perceiving)', tieBreak: 'P',
      buckets: [
        { id: 'J', label: 'J', blurb: 'Judging — ชอบวางแผน จัดระเบียบ และตัดสินใจที่ชัดเจน' },
        { id: 'P', label: 'P', blurb: 'Perceiving — ชอบยืดหยุ่น เปิดกว้าง และปรับตัวไปตามสถานการณ์มากกว่า' },
      ],
    },
  ],

  questions: [
    // ── EI: การแสดงออกของพลังงาน (8 ข้อ) ────────────────────────────────────────
    likertQuestion('ei1', 1, 'EI', 'หลังคุยกับลูกค้าหลายรายทั้งวัน ฉันยังรู้สึกมีพลังอยู่', 'E', 'I'),
    likertQuestion('ei2', 2, 'EI', 'ในที่ประชุม ฉันมักพูดความคิดออกมาเลยแล้วค่อยเรียบเรียง', 'E', 'I'),
    likertQuestion('ei3', 3, 'EI', 'ฉันชอบโทรหาลูกค้าเพื่อคุยมากกว่าส่งข้อความ', 'E', 'I'),
    likertQuestion('ei4', 4, 'EI', 'ในงานเลี้ยงบริษัท ฉันมักเดินทักทายคนใหม่ๆ', 'E', 'I'),
    likertQuestion('ei5', 5, 'EI', 'เวลาเจอปัญหางาน ฉันอยากหาคนคุยเพื่อช่วยคิด', 'E', 'I'),
    likertQuestion('ei6', 6, 'EI', 'ฉันสนุกกับการออกไปพบลูกค้านอกสถานที่บ่อยๆ', 'E', 'I'),
    likertQuestion('ei7', 7, 'EI', 'คนรอบตัวมักบอกว่าฉันเป็นคนเข้าถึงง่าย คุยสนุก', 'E', 'I'),
    likertQuestion('ei8', 8, 'EI', 'ฉันชอบทำงานในทีมที่คุยกันตลอดเวลา', 'E', 'I'),

    // ── SN: การรับรู้ข้อมูล (8 ข้อ) ───────────────────────────────────────────────
    likertQuestion('sn1', 9, 'SN', 'เวลานำเสนอ ฉันเน้นตัวเลขและข้อมูลจริงที่จับต้องได้', 'S', 'N'),
    likertQuestion('sn2', 10, 'SN', 'ฉันเชื่อวิธีที่พิสูจน์แล้วว่าใช้ได้จริง มากกว่าลองวิธีใหม่ที่ยังไม่มีใครทำ', 'S', 'N'),
    likertQuestion('sn3', 11, 'SN', 'ฉันจำรายละเอียดของออร์เดอร์และเงื่อนไขได้แม่น', 'S', 'N'),
    likertQuestion('sn4', 12, 'SN', 'เวลาเรียนเรื่องใหม่ ฉันอยากรู้ว่าต้องทำอะไรทีละขั้น มากกว่าอยากรู้ว่าทำไมถึงต้องทำแบบนั้น', 'S', 'N'),
    likertQuestion('sn5', 13, 'SN', 'ฉันโฟกัสกับสิ่งที่ต้องทำให้เสร็จในสัปดาห์นี้ มากกว่าคิดถึงอีกหกเดือนข้างหน้า', 'S', 'N'),
    likertQuestion('sn6', 14, 'SN', 'ฉันไว้ใจประสบการณ์ที่เคยเจอมามากกว่าการคาดเดา', 'S', 'N'),
    likertQuestion('sn7', 15, 'SN', 'คำอธิบายที่ดีคือคำอธิบายที่ชัดเจนและตรงไปตรงมา มากกว่าที่ทำให้เห็นภาพและเชื่อมโยงได้', 'S', 'N'),
    likertQuestion('sn8', 16, 'SN', 'ฉันสังเกตเห็นสิ่งที่เปลี่ยนไปในหน้างานได้เร็ว มากกว่าเห็นรูปแบบหรือแนวโน้มที่ซ่อนอยู่', 'S', 'N'),

    // ── TF: การตัดสินใจ (7 ข้อ) ──────────────────────────────────────────────────
    likertQuestion('tf1', 17, 'TF', 'เวลาตัดสินใจ ฉันดูที่เหตุผลและข้อมูลเป็นหลัก', 'T', 'F'),
    likertQuestion('tf2', 18, 'TF', 'การให้ฟีดแบ็กที่ดีคือการบอกตรงๆ ว่าอะไรผิด มากกว่าการรักษาความรู้สึกของอีกฝ่าย', 'T', 'F'),
    likertQuestion('tf3', 19, 'TF', 'เมื่อลูกค้าขอส่วนลดเกินกรอบ ฉันยึดนโยบายเป็นหลักมากกว่าพยายามหาทางช่วย', 'T', 'F'),
    likertQuestion('tf4', 20, 'TF', 'ฉันมักถูกมองว่าเป็นคนตรงไปตรงมา มากกว่าเป็นคนใจดีเห็นใจคนอื่น', 'T', 'F'),
    likertQuestion('tf5', 21, 'TF', 'ในการถกเถียง ฉันสนใจว่าอะไรถูกต้องที่สุด มากกว่าทุกคนจะยังรู้สึกดีต่อกันไหม', 'T', 'F'),
    likertQuestion('tf6', 22, 'TF', 'ฉันประเมินงานของทีมจากผลลัพธ์ที่วัดได้ มากกว่าความพยายามและบริบท', 'T', 'F'),
    likertQuestion('tf7', 23, 'TF', 'ฉันรู้สึกอึดอัดเวลาต้องตัดสินใจโดยใช้ความรู้สึกล้วนๆ', 'T', 'F'),

    // ── JP: การใช้ชีวิต (7 ข้อ) ──────────────────────────────────────────────────
    likertQuestion('jp1', 24, 'JP', 'ฉันวางแผนการเข้าพบลูกค้าล่วงหน้าเสมอ มากกว่าปรับแผนตามสถานการณ์หน้างาน', 'J', 'P'),
    likertQuestion('jp2', 25, 'JP', 'ฉันรู้สึกสบายใจเมื่อทุกอย่างมีข้อสรุปแล้ว มากกว่าตอนที่ยังเปิดทางเลือกไว้ได้', 'J', 'P'),
    likertQuestion('jp3', 26, 'JP', 'ฉันมักทำงานเสร็จก่อนกำหนด มากกว่าทำได้ดีตอนใกล้ถึงกำหนดส่ง', 'J', 'P'),
    likertQuestion('jp4', 27, 'JP', 'ฉันชอบให้ตารางงานแต่ละวันชัดเจนตั้งแต่เช้า มากกว่ายืดหยุ่นได้ระหว่างวัน', 'J', 'P'),
    likertQuestion('jp5', 28, 'JP', 'โต๊ะทำงานและไฟล์งานของฉันเป็นระเบียบ', 'J', 'P'),
    likertQuestion('jp6', 29, 'JP', 'การเปลี่ยนแผนกะทันหันทำให้ฉันหงุดหงิด มากกว่ารู้สึกท้าทาย', 'J', 'P'),
    likertQuestion('jp7', 30, 'JP', 'ฉันชอบปิดงานให้จบทีละอย่าง มากกว่าทำหลายอย่างไปพร้อมกัน', 'J', 'P'),
  ],

  outcomes: [
    {
      whenBucketIds: ['I', 'S', 'T', 'J'],
      code: 'ISTJ', title: 'ผู้ตรวจการ (The Inspector)',
      description: 'จริงจัง มีความรับผิดชอบสูง ชอบความเป็นระเบียบ',
      detail: 'ดูแลรายละเอียดออร์เดอร์และเงื่อนไขลูกค้าได้แม่นยำ เหมาะกับงานที่ต้องความถูกต้องสูง',
    },
    {
      whenBucketIds: ['I', 'S', 'F', 'J'],
      code: 'ISFJ', title: 'ผู้พิทักษ์ (The Defender)',
      description: 'อบอุ่น ใจดี ชอบช่วยเหลือผู้อื่นอย่างเงียบ ๆ',
      detail: 'สร้างความสัมพันธ์ระยะยาวกับลูกค้าประจำได้ดี ลูกค้ารู้สึกได้ถึงความใส่ใจ',
    },
    {
      whenBucketIds: ['I', 'N', 'F', 'J'],
      code: 'INFJ', title: 'ผู้แนะนำ (The Advocate)',
      description: 'มีแรงบันดาลใจสูง มองเห็นความเป็นไปได้ของผู้คน',
      detail: 'อ่านความต้องการที่ลูกค้าไม่ได้พูดออกมาได้ เหมาะกับการวางแผนดูแลลูกค้ารายสำคัญ',
    },
    {
      whenBucketIds: ['I', 'N', 'T', 'J'],
      code: 'INTJ', title: 'สถาปนิก (The Architect)',
      description: 'มีความคิดสร้างสรรค์ ชอบวางแผนและแก้ปัญหา',
      detail: 'วางแผนการเข้าถึงลูกค้าอย่างมีขั้นตอน มองเห็นโอกาสที่คนอื่นมองข้าม',
    },
    {
      whenBucketIds: ['I', 'S', 'T', 'P'],
      code: 'ISTP', title: 'ช่างฝีมือ (The Craftsman)',
      description: 'ชอบลงมือทำ แก้ปัญหาเฉพาะหน้าเก่ง',
      detail: 'รับมือปัญหาหน้างานอย่างของขาดหรือส่งของไม่ทันได้อย่างใจเย็น',
    },
    {
      whenBucketIds: ['I', 'S', 'F', 'P'],
      code: 'ISFP', title: 'นักผจญภัย (The Adventurer)',
      description: 'รักอิสระ มีศิลปะในหัวใจ ชอบความท้าทาย',
      detail: 'คุยกับลูกค้าด้วยท่าทีสบายๆ ไม่กดดัน ทำให้ลูกค้ารู้สึกผ่อนคลาย',
    },
    {
      whenBucketIds: ['I', 'N', 'F', 'P'],
      code: 'INFP', title: 'นักไกล่เกลี่ย (The Mediator)',
      description: 'มีอุดมการณ์สูง มองโลกในแง่ดี ชอบช่วยเหลือ',
      detail: 'สื่อสารเรื่องคุณค่าของสินค้าได้จริงใจ เหมาะกับการเล่าเรื่องแบรนด์',
    },
    {
      whenBucketIds: ['I', 'N', 'T', 'P'],
      code: 'INTP', title: 'นักตรรกะ (The Logician)',
      description: 'ชอบคิดวิเคราะห์ ตั้งคำถาม และแสวงหาความรู้',
      detail: 'เจาะลึกโครงสร้างราคาและเงื่อนไขได้ดี ตอบคำถามเชิงเทคนิคของลูกค้าได้ชัด',
    },
    {
      whenBucketIds: ['E', 'S', 'T', 'P'],
      code: 'ESTP', title: 'ผู้ประกอบการ (The Entrepreneur)',
      description: 'คล่องแคล่ว ชอบความตื่นเต้น แก้ปัญหาเก่ง',
      detail: 'ปิดการขายเร็ว รับมือการต่อรองเฉพาะหน้าได้อย่างมั่นใจ',
    },
    {
      whenBucketIds: ['E', 'S', 'F', 'P'],
      code: 'ESFP', title: 'ผู้มอบความบันเทิง (The Entertainer)',
      description: 'สนุกสนาน เข้ากับคนง่าย ชอบเป็นจุดสนใจ',
      detail: 'สร้างความสัมพันธ์กับลูกค้าใหม่ได้เร็ว เหมาะกับงานที่ต้องพบลูกค้าบ่อย',
    },
    {
      whenBucketIds: ['E', 'N', 'F', 'P'],
      code: 'ENFP', title: 'นักรณรงค์ (The Campaigner)',
      description: 'มีพลังเหลือล้น สร้างแรงบันดาลใจให้ผู้อื่น',
      detail: 'เปิดลูกค้าใหม่และนำเสนอไอเดียได้น่าสนใจ ทำให้ลูกค้าเห็นภาพโอกาสร่วมกัน',
    },
    {
      whenBucketIds: ['E', 'N', 'T', 'P'],
      code: 'ENTP', title: 'นักโต้วาที (The Debater)',
      description: 'ฉลาด มีไหวพริบ ชอบท้าทายความคิด',
      detail: 'พลิกข้อโต้แย้งของลูกค้าให้เป็นโอกาส เหมาะกับดีลที่ต้องออกแบบข้อเสนอใหม่',
    },
    {
      whenBucketIds: ['E', 'S', 'T', 'J'],
      code: 'ESTJ', title: 'ผู้บริหาร (The Executive)',
      description: 'มีความเป็นผู้นำ ชอบจัดการและควบคุม',
      detail: 'บริหารพอร์ตลูกค้าและติดตามเป้าได้เข้มแข็ง เหมาะกับบทบาทนำทีม',
    },
    {
      whenBucketIds: ['E', 'S', 'F', 'J'],
      code: 'ESFJ', title: 'ผู้ให้คำปรึกษา (The Consul)',
      description: 'เอาใจใส่ผู้อื่น ชอบช่วยเหลือและสร้างความสามัคคี',
      detail: 'ดูแลลูกค้าหลังการขายได้อบอุ่น ทำให้ลูกค้ากลับมาซื้อซ้ำ',
    },
    {
      whenBucketIds: ['E', 'N', 'F', 'J'],
      code: 'ENFJ', title: 'ตัวเอก (The Protagonist)',
      description: 'มีเสน่ห์ดึงดูด สร้างแรงบันดาลใจและนำผู้อื่น',
      detail: 'นำการประชุมกับลูกค้าและโค้ชทีมได้ดี สร้างความไว้วางใจได้เร็ว',
    },
    {
      whenBucketIds: ['E', 'N', 'T', 'J'],
      code: 'ENTJ', title: 'ผู้บัญชาการ (The Commander)',
      description: 'มีวิสัยทัศน์ ชอบวางแผนและสั่งการ',
      detail: 'วางแผนขยายพอร์ตและเจรจาดีลใหญ่ได้ เหมาะกับงานที่ต้องตัดสินใจเร็ว',
    },
  ],
}
