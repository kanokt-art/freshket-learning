import type { BucketAssessmentDefinition } from '@/types/bucketAssessment'

// MBTI, expressed as a bucket assessment: four dimensions, two buckets each,
// one point per answer. This is data only — scoring, the take page and the
// result card are all generic (see lib/bucketAssessments/scoreBuckets.ts).
//
// Ties break toward I/N/F/P. An even question count per dimension makes a tie
// genuinely reachable, and a four-letter code cannot express "neither", so the
// tie-break is fixed and documented rather than arbitrary.

export const MBTI_DEFINITION: BucketAssessmentDefinition = {
  id: 'mbti',
  title: 'MBTI — แบบประเมินบุคลิกภาพ',
  description:
    'แบบประเมินบุคลิกภาพ 16 แบบ จำนวน 30 ข้อ ไม่มีคำตอบถูกผิด '
    + 'เลือกข้อที่ตรงกับตัวคุณมากกว่า ผลลัพธ์จะบอกจุดแข็งของคุณในการทำงานและการดูแลลูกค้า',
  estimatedMinutes: 5,

  dimensions: [
    {
      id: 'EI', label: 'การรับพลังงาน', tieBreak: 'I',
      buckets: [
        { id: 'E', label: 'E', blurb: 'Extraversion — ชอบพลังงานจากการอยู่กับผู้คน' },
        { id: 'I', label: 'I', blurb: 'Introversion — ชอบพลังงานจากการอยู่กับตัวเอง' },
      ],
    },
    {
      id: 'SN', label: 'การรับข้อมูล', tieBreak: 'N',
      buckets: [
        { id: 'S', label: 'S', blurb: 'Sensing — ให้น้ำหนักกับข้อเท็จจริงและรายละเอียด' },
        { id: 'N', label: 'N', blurb: 'Intuition — ให้น้ำหนักกับภาพรวมและความเป็นไปได้' },
      ],
    },
    {
      id: 'TF', label: 'การตัดสินใจ', tieBreak: 'F',
      buckets: [
        { id: 'T', label: 'T', blurb: 'Thinking — ตัดสินใจด้วยเหตุผลและหลักการ' },
        { id: 'F', label: 'F', blurb: 'Feeling — ตัดสินใจด้วยคุณค่าและผลกระทบต่อคน' },
      ],
    },
    {
      id: 'JP', label: 'การใช้ชีวิต', tieBreak: 'P',
      buckets: [
        { id: 'J', label: 'J', blurb: 'Judging — ชอบวางแผนและมีข้อสรุป' },
        { id: 'P', label: 'P', blurb: 'Perceiving — ชอบยืดหยุ่นและเปิดทางเลือกไว้' },
      ],
    },
  ],

  questions: [
    {
      id: 'ei1', order: 1, dimensionId: 'EI',
      options: [
        { id: 'ei1a', text: 'หลังคุยกับลูกค้าหลายรายทั้งวัน ฉันยังรู้สึกมีพลังอยู่', weights: [{ bucketId: 'E' }] },
        { id: 'ei1b', text: 'หลังคุยกับลูกค้าหลายรายทั้งวัน ฉันอยากมีเวลาเงียบๆ คนเดียว', weights: [{ bucketId: 'I' }] },
      ],
    },
    {
      id: 'ei2', order: 2, dimensionId: 'EI',
      options: [
        { id: 'ei2a', text: 'ในที่ประชุม ฉันมักพูดความคิดออกมาเลยแล้วค่อยเรียบเรียง', weights: [{ bucketId: 'E' }] },
        { id: 'ei2b', text: 'ในที่ประชุม ฉันมักคิดให้จบก่อนแล้วค่อยพูด', weights: [{ bucketId: 'I' }] },
      ],
    },
    {
      id: 'ei3', order: 3, dimensionId: 'EI',
      options: [
        { id: 'ei3a', text: 'ฉันชอบโทรหาลูกค้าเพื่อคุยมากกว่าส่งข้อความ', weights: [{ bucketId: 'E' }] },
        { id: 'ei3b', text: 'ฉันชอบส่งข้อความหาลูกค้ามากกว่าโทรคุย', weights: [{ bucketId: 'I' }] },
      ],
    },
    {
      id: 'ei4', order: 4, dimensionId: 'EI',
      options: [
        { id: 'ei4a', text: 'ในงานเลี้ยงบริษัท ฉันมักเดินทักทายคนใหม่ๆ', weights: [{ bucketId: 'E' }] },
        { id: 'ei4b', text: 'ในงานเลี้ยงบริษัท ฉันมักอยู่กับคนที่รู้จักอยู่แล้ว', weights: [{ bucketId: 'I' }] },
      ],
    },
    {
      id: 'ei5', order: 5, dimensionId: 'EI',
      options: [
        { id: 'ei5a', text: 'เวลาเจอปัญหางาน ฉันอยากหาคนคุยเพื่อช่วยคิด', weights: [{ bucketId: 'E' }] },
        { id: 'ei5b', text: 'เวลาเจอปัญหางาน ฉันอยากนั่งคิดคนเดียวก่อน', weights: [{ bucketId: 'I' }] },
      ],
    },
    {
      id: 'ei6', order: 6, dimensionId: 'EI',
      options: [
        { id: 'ei6a', text: 'ฉันสนุกกับการออกไปพบลูกค้านอกสถานที่บ่อยๆ', weights: [{ bucketId: 'E' }] },
        { id: 'ei6b', text: 'ฉันทำงานได้ดีที่สุดเมื่อมีเวลาอยู่กับงานของตัวเอง', weights: [{ bucketId: 'I' }] },
      ],
    },
    {
      id: 'ei7', order: 7, dimensionId: 'EI',
      options: [
        { id: 'ei7a', text: 'คนรอบตัวมักบอกว่าฉันเป็นคนเข้าถึงง่าย คุยสนุก', weights: [{ bucketId: 'E' }] },
        { id: 'ei7b', text: 'คนรอบตัวมักบอกว่าฉันเป็นคนสุขุม เงียบๆ', weights: [{ bucketId: 'I' }] },
      ],
    },
    {
      id: 'ei8', order: 8, dimensionId: 'EI',
      options: [
        { id: 'ei8a', text: 'ฉันชอบทำงานในทีมที่คุยกันตลอดเวลา', weights: [{ bucketId: 'E' }] },
        { id: 'ei8b', text: 'ฉันชอบทำงานที่แต่ละคนมีพื้นที่ของตัวเอง', weights: [{ bucketId: 'I' }] },
      ],
    },
    {
      id: 'sn1', order: 9, dimensionId: 'SN',
      options: [
        { id: 'sn1a', text: 'เวลานำเสนอ ฉันเน้นตัวเลขและข้อมูลจริงที่จับต้องได้', weights: [{ bucketId: 'S' }] },
        { id: 'sn1b', text: 'เวลานำเสนอ ฉันเน้นภาพรวมและโอกาสที่จะเกิดขึ้น', weights: [{ bucketId: 'N' }] },
      ],
    },
    {
      id: 'sn2', order: 10, dimensionId: 'SN',
      options: [
        { id: 'sn2a', text: 'ฉันเชื่อวิธีที่พิสูจน์แล้วว่าใช้ได้จริง', weights: [{ bucketId: 'S' }] },
        { id: 'sn2b', text: 'ฉันชอบลองวิธีใหม่ที่ยังไม่มีใครทำ', weights: [{ bucketId: 'N' }] },
      ],
    },
    {
      id: 'sn3', order: 11, dimensionId: 'SN',
      options: [
        { id: 'sn3a', text: 'ฉันจำรายละเอียดของออร์เดอร์และเงื่อนไขได้แม่น', weights: [{ bucketId: 'S' }] },
        { id: 'sn3b', text: 'ฉันจำภาพรวมของดีลได้ดี แต่รายละเอียดต้องกลับไปดู', weights: [{ bucketId: 'N' }] },
      ],
    },
    {
      id: 'sn4', order: 12, dimensionId: 'SN',
      options: [
        { id: 'sn4a', text: 'เวลาเรียนเรื่องใหม่ ฉันอยากรู้ว่าต้องทำอะไรทีละขั้น', weights: [{ bucketId: 'S' }] },
        { id: 'sn4b', text: 'เวลาเรียนเรื่องใหม่ ฉันอยากเข้าใจว่าทำไมถึงต้องทำแบบนั้น', weights: [{ bucketId: 'N' }] },
      ],
    },
    {
      id: 'sn5', order: 13, dimensionId: 'SN',
      options: [
        { id: 'sn5a', text: 'ฉันโฟกัสกับสิ่งที่ต้องทำให้เสร็จในสัปดาห์นี้', weights: [{ bucketId: 'S' }] },
        { id: 'sn5b', text: 'ฉันมักคิดไปถึงว่าอีกหกเดือนข้างหน้าจะเป็นอย่างไร', weights: [{ bucketId: 'N' }] },
      ],
    },
    {
      id: 'sn6', order: 14, dimensionId: 'SN',
      options: [
        { id: 'sn6a', text: 'ฉันไว้ใจประสบการณ์ที่เคยเจอมามากกว่าการคาดเดา', weights: [{ bucketId: 'S' }] },
        { id: 'sn6b', text: 'ฉันไว้ใจสัญชาตญาณของตัวเองแม้ยังไม่มีข้อมูลครบ', weights: [{ bucketId: 'N' }] },
      ],
    },
    {
      id: 'sn7', order: 15, dimensionId: 'SN',
      options: [
        { id: 'sn7a', text: 'คำอธิบายที่ดีคือคำอธิบายที่ชัดเจนและตรงไปตรงมา', weights: [{ bucketId: 'S' }] },
        { id: 'sn7b', text: 'คำอธิบายที่ดีคือคำอธิบายที่ทำให้เห็นภาพและเชื่อมโยงได้', weights: [{ bucketId: 'N' }] },
      ],
    },
    {
      id: 'sn8', order: 16, dimensionId: 'SN',
      options: [
        { id: 'sn8a', text: 'ฉันสังเกตเห็นสิ่งที่เปลี่ยนไปในหน้างานได้เร็ว', weights: [{ bucketId: 'S' }] },
        { id: 'sn8b', text: 'ฉันมองเห็นรูปแบบหรือแนวโน้มที่ซ่อนอยู่ได้เร็ว', weights: [{ bucketId: 'N' }] },
      ],
    },
    {
      id: 'tf1', order: 17, dimensionId: 'TF',
      options: [
        { id: 'tf1a', text: 'เวลาตัดสินใจ ฉันดูที่เหตุผลและข้อมูลเป็นหลัก', weights: [{ bucketId: 'T' }] },
        { id: 'tf1b', text: 'เวลาตัดสินใจ ฉันดูที่ผลกระทบต่อคนที่เกี่ยวข้องเป็นหลัก', weights: [{ bucketId: 'F' }] },
      ],
    },
    {
      id: 'tf2', order: 18, dimensionId: 'TF',
      options: [
        { id: 'tf2a', text: 'การให้ฟีดแบ็กที่ดีคือการบอกตรงๆ ว่าอะไรผิด', weights: [{ bucketId: 'T' }] },
        { id: 'tf2b', text: 'การให้ฟีดแบ็กที่ดีคือการบอกโดยรักษาความรู้สึกของอีกฝ่าย', weights: [{ bucketId: 'F' }] },
      ],
    },
    {
      id: 'tf3', order: 19, dimensionId: 'TF',
      options: [
        { id: 'tf3a', text: 'เมื่อลูกค้าขอส่วนลดเกินกรอบ ฉันยึดนโยบายเป็นหลัก', weights: [{ bucketId: 'T' }] },
        { id: 'tf3b', text: 'เมื่อลูกค้าขอส่วนลดเกินกรอบ ฉันพยายามหาทางช่วยเท่าที่ทำได้', weights: [{ bucketId: 'F' }] },
      ],
    },
    {
      id: 'tf4', order: 20, dimensionId: 'TF',
      options: [
        { id: 'tf4a', text: 'ฉันมักถูกมองว่าเป็นคนตรงไปตรงมา', weights: [{ bucketId: 'T' }] },
        { id: 'tf4b', text: 'ฉันมักถูกมองว่าเป็นคนใจดี เห็นใจคนอื่น', weights: [{ bucketId: 'F' }] },
      ],
    },
    {
      id: 'tf5', order: 21, dimensionId: 'TF',
      options: [
        { id: 'tf5a', text: 'ในการถกเถียง ฉันสนใจว่าอะไรถูกต้องที่สุด', weights: [{ bucketId: 'T' }] },
        { id: 'tf5b', text: 'ในการถกเถียง ฉันสนใจว่าทุกคนจะยังรู้สึกดีต่อกัน', weights: [{ bucketId: 'F' }] },
      ],
    },
    {
      id: 'tf6', order: 22, dimensionId: 'TF',
      options: [
        { id: 'tf6a', text: 'ฉันประเมินงานของทีมจากผลลัพธ์ที่วัดได้', weights: [{ bucketId: 'T' }] },
        { id: 'tf6b', text: 'ฉันประเมินงานของทีมโดยดูความพยายามและบริบทด้วย', weights: [{ bucketId: 'F' }] },
      ],
    },
    {
      id: 'tf7', order: 23, dimensionId: 'TF',
      options: [
        { id: 'tf7a', text: 'ฉันรู้สึกอึดอัดเวลาต้องตัดสินใจโดยใช้ความรู้สึก', weights: [{ bucketId: 'T' }] },
        { id: 'tf7b', text: 'ฉันรู้สึกอึดอัดเวลาต้องตัดสินใจโดยไม่สนใจความรู้สึกคน', weights: [{ bucketId: 'F' }] },
      ],
    },
    {
      id: 'jp1', order: 24, dimensionId: 'JP',
      options: [
        { id: 'jp1a', text: 'ฉันวางแผนการเข้าพบลูกค้าล่วงหน้าเสมอ', weights: [{ bucketId: 'J' }] },
        { id: 'jp1b', text: 'ฉันปรับแผนการเข้าพบลูกค้าตามสถานการณ์หน้างาน', weights: [{ bucketId: 'P' }] },
      ],
    },
    {
      id: 'jp2', order: 25, dimensionId: 'JP',
      options: [
        { id: 'jp2a', text: 'ฉันรู้สึกสบายใจเมื่อทุกอย่างมีข้อสรุปแล้ว', weights: [{ bucketId: 'J' }] },
        { id: 'jp2b', text: 'ฉันรู้สึกสบายใจเมื่อยังเปิดทางเลือกไว้ได้', weights: [{ bucketId: 'P' }] },
      ],
    },
    {
      id: 'jp3', order: 26, dimensionId: 'JP',
      options: [
        { id: 'jp3a', text: 'ฉันมักทำงานเสร็จก่อนกำหนด', weights: [{ bucketId: 'J' }] },
        { id: 'jp3b', text: 'ฉันมักทำงานได้ดีเมื่อใกล้ถึงกำหนดส่ง', weights: [{ bucketId: 'P' }] },
      ],
    },
    {
      id: 'jp4', order: 27, dimensionId: 'JP',
      options: [
        { id: 'jp4a', text: 'ฉันชอบให้ตารางงานแต่ละวันชัดเจนตั้งแต่เช้า', weights: [{ bucketId: 'J' }] },
        { id: 'jp4b', text: 'ฉันชอบให้ตารางงานยืดหยุ่นได้ระหว่างวัน', weights: [{ bucketId: 'P' }] },
      ],
    },
    {
      id: 'jp5', order: 28, dimensionId: 'JP',
      options: [
        { id: 'jp5a', text: 'โต๊ะทำงานและไฟล์งานของฉันเป็นระเบียบ', weights: [{ bucketId: 'J' }] },
        { id: 'jp5b', text: 'โต๊ะทำงานและไฟล์งานของฉันดูยุ่งแต่ฉันหาเจอ', weights: [{ bucketId: 'P' }] },
      ],
    },
    {
      id: 'jp6', order: 29, dimensionId: 'JP',
      options: [
        { id: 'jp6a', text: 'การเปลี่ยนแผนกะทันหันทำให้ฉันหงุดหงิด', weights: [{ bucketId: 'J' }] },
        { id: 'jp6b', text: 'การเปลี่ยนแผนกะทันหันทำให้ฉันรู้สึกท้าทาย', weights: [{ bucketId: 'P' }] },
      ],
    },
    {
      id: 'jp7', order: 30, dimensionId: 'JP',
      options: [
        { id: 'jp7a', text: 'ฉันชอบปิดงานให้จบทีละอย่าง', weights: [{ bucketId: 'J' }] },
        { id: 'jp7b', text: 'ฉันชอบทำหลายอย่างไปพร้อมกัน', weights: [{ bucketId: 'P' }] },
      ],
    },
  ],

  outcomes: [
    {
      whenBucketIds: ['I', 'S', 'T', 'J'],
      code: 'ISTJ', title: 'นักตรวจสอบ',
      description: 'จริงจัง เชื่อถือได้ ทำตามข้อตกลงอย่างเคร่งครัด และให้ความสำคัญกับข้อเท็จจริง',
      detail: 'ดูแลรายละเอียดออร์เดอร์และเงื่อนไขลูกค้าได้แม่นยำ เหมาะกับงานที่ต้องความถูกต้องสูง',
    },
    {
      whenBucketIds: ['I', 'S', 'F', 'J'],
      code: 'ISFJ', title: 'ผู้ปกป้อง',
      description: 'ใส่ใจคนรอบข้าง จดจำรายละเอียดเล็กน้อยได้ดี และทำงานอย่างสม่ำเสมอ',
      detail: 'สร้างความสัมพันธ์ระยะยาวกับลูกค้าประจำได้ดี ลูกค้ารู้สึกได้ถึงความใส่ใจ',
    },
    {
      whenBucketIds: ['I', 'N', 'F', 'J'],
      code: 'INFJ', title: 'ผู้ชี้แนะ',
      description: 'มองภาพระยะยาว เข้าใจแรงจูงใจของคน และทำงานตามคุณค่าที่ตัวเองเชื่อ',
      detail: 'อ่านความต้องการที่ลูกค้าไม่ได้พูดออกมาได้ เหมาะกับการวางแผนดูแลลูกค้ารายสำคัญ',
    },
    {
      whenBucketIds: ['I', 'N', 'T', 'J'],
      code: 'INTJ', title: 'นักวางกลยุทธ์',
      description: 'คิดเป็นระบบ วางแผนล่วงหน้า และมองหาวิธีที่มีประสิทธิภาพที่สุดเสมอ',
      detail: 'วางแผนการเข้าถึงลูกค้าอย่างมีขั้นตอน มองเห็นโอกาสที่คนอื่นมองข้าม',
    },
    {
      whenBucketIds: ['I', 'S', 'T', 'P'],
      code: 'ISTP', title: 'นักแก้ปัญหา',
      description: 'ลงมือทำมากกว่าพูด แก้ปัญหาเฉพาะหน้าได้ดี และปรับตัวเร็ว',
      detail: 'รับมือปัญหาหน้างานอย่างของขาดหรือส่งของไม่ทันได้อย่างใจเย็น',
    },
    {
      whenBucketIds: ['I', 'S', 'F', 'P'],
      code: 'ISFP', title: 'นักสร้างสรรค์',
      description: 'อ่อนโยน ยืดหยุ่น ใส่ใจความรู้สึกคน และทำงานตามจังหวะของตัวเอง',
      detail: 'คุยกับลูกค้าด้วยท่าทีสบายๆ ไม่กดดัน ทำให้ลูกค้ารู้สึกผ่อนคลาย',
    },
    {
      whenBucketIds: ['I', 'N', 'F', 'P'],
      code: 'INFP', title: 'นักอุดมคติ',
      description: 'ยึดมั่นในคุณค่า มองหาความหมายในสิ่งที่ทำ และเข้าใจคนได้ลึก',
      detail: 'สื่อสารเรื่องคุณค่าของสินค้าได้จริงใจ เหมาะกับการเล่าเรื่องแบรนด์',
    },
    {
      whenBucketIds: ['I', 'N', 'T', 'P'],
      code: 'INTP', title: 'นักวิเคราะห์',
      description: 'ชอบตั้งคำถาม วิเคราะห์เหตุผลเบื้องหลัง และหาทางที่สมเหตุสมผลที่สุด',
      detail: 'เจาะลึกโครงสร้างราคาและเงื่อนไขได้ดี ตอบคำถามเชิงเทคนิคของลูกค้าได้ชัด',
    },
    {
      whenBucketIds: ['E', 'S', 'T', 'P'],
      code: 'ESTP', title: 'นักลงมือ',
      description: 'กระฉับกระเฉง กล้าตัดสินใจ และทำงานได้ดีภายใต้ความกดดัน',
      detail: 'ปิดการขายเร็ว รับมือการต่อรองเฉพาะหน้าได้อย่างมั่นใจ',
    },
    {
      whenBucketIds: ['E', 'S', 'F', 'P'],
      code: 'ESFP', title: 'ผู้สร้างบรรยากาศ',
      description: 'เข้ากับคนง่าย มีพลังงานสูง และทำให้บรรยากาศรอบตัวผ่อนคลาย',
      detail: 'สร้างความสัมพันธ์กับลูกค้าใหม่ได้เร็ว เหมาะกับงานที่ต้องพบลูกค้าบ่อย',
    },
    {
      whenBucketIds: ['E', 'N', 'F', 'P'],
      code: 'ENFP', title: 'นักจุดประกาย',
      description: 'มองเห็นความเป็นไปได้ กระตือรือร้น และสร้างแรงบันดาลใจให้คนรอบข้าง',
      detail: 'เปิดลูกค้าใหม่และนำเสนอไอเดียได้น่าสนใจ ทำให้ลูกค้าเห็นภาพโอกาสร่วมกัน',
    },
    {
      whenBucketIds: ['E', 'N', 'T', 'P'],
      code: 'ENTP', title: 'นักโต้แย้ง',
      description: 'ชอบความท้าทาย คิดนอกกรอบ และหามุมใหม่ให้กับปัญหาเดิม',
      detail: 'พลิกข้อโต้แย้งของลูกค้าให้เป็นโอกาส เหมาะกับดีลที่ต้องออกแบบข้อเสนอใหม่',
    },
    {
      whenBucketIds: ['E', 'S', 'T', 'J'],
      code: 'ESTJ', title: 'ผู้บริหารจัดการ',
      description: 'เด็ดขาด เป็นระบบ และผลักดันให้งานเดินตามแผนที่วางไว้',
      detail: 'บริหารพอร์ตลูกค้าและติดตามเป้าได้เข้มแข็ง เหมาะกับบทบาทนำทีม',
    },
    {
      whenBucketIds: ['E', 'S', 'F', 'J'],
      code: 'ESFJ', title: 'ผู้ดูแล',
      description: 'ใส่ใจความรู้สึกทีมและลูกค้า ประสานงานเก่ง และรักษาความสัมพันธ์ได้ดี',
      detail: 'ดูแลลูกค้าหลังการขายได้อบอุ่น ทำให้ลูกค้ากลับมาซื้อซ้ำ',
    },
    {
      whenBucketIds: ['E', 'N', 'F', 'J'],
      code: 'ENFJ', title: 'ผู้นำที่เข้าใจคน',
      description: 'สื่อสารเก่ง เข้าใจคน และพาทีมหรือลูกค้าไปสู่เป้าหมายร่วมกัน',
      detail: 'นำการประชุมกับลูกค้าและโค้ชทีมได้ดี สร้างความไว้วางใจได้เร็ว',
    },
    {
      whenBucketIds: ['E', 'N', 'T', 'J'],
      code: 'ENTJ', title: 'ผู้บัญชาการ',
      description: 'มุ่งเป้า วางกลยุทธ์เป็น และขับเคลื่อนงานใหญ่ให้สำเร็จ',
      detail: 'วางแผนขยายพอร์ตและเจรจาดีลใหญ่ได้ เหมาะกับงานที่ต้องตัดสินใจเร็ว',
    },
  ],
}
