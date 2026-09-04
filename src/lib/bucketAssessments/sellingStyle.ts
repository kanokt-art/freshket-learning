import type { BucketAssessmentDefinition } from '@/types/bucketAssessment'

// "สไตล์การขายของคุณ" — the second bucket assessment, and deliberately a
// different SHAPE from MBTI: one dimension with five buckets instead of four
// dimensions with two. Nothing in the scorer, the take page or the result card
// changed to support it, which is the point of the generic definition — a new
// questionnaire is a data file, not a feature.
//
// Use this as the template when adding another one:
//   1. one dimension, N buckets (or several dimensions, as MBTI does)
//   2. each option feeds one bucket via `weights`
//   3. one outcome per winning bucket, matched by `whenBucketIds: [bucketId]`
//   4. register it in lib/bucketAssessments/index.ts

export const SELLING_STYLE_DEFINITION: BucketAssessmentDefinition = {
  id: 'selling_style',
  title: 'สไตล์การขายของคุณ',
  description:
    'แบบประเมิน 12 ข้อ เพื่อดูว่าคุณถนัดขายแบบไหนที่สุด ไม่มีคำตอบถูกผิด '
    + 'และไม่มีสไตล์ไหนดีกว่ากัน — ผลลัพธ์ใช้เพื่อเข้าใจจุดแข็งของตัวเองและทีม',
  estimatedMinutes: 3,

  dimensions: [
    {
      id: 'style',
      label: 'สไตล์การขาย',
      tieBreak: 'relationship',
      buckets: [
        { id: 'relationship', label: 'นักสร้างความสัมพันธ์', blurb: 'ชนะด้วยความไว้วางใจระยะยาว' },
        { id: 'consultant',   label: 'ที่ปรึกษา',            blurb: 'ชนะด้วยการเข้าใจปัญหาลูกค้าลึก' },
        { id: 'closer',       label: 'นักปิดการขาย',         blurb: 'ชนะด้วยจังหวะและความมั่นใจ' },
        { id: 'analyst',      label: 'นักวิเคราะห์',         blurb: 'ชนะด้วยข้อมูลและตัวเลข' },
        { id: 'hunter',       label: 'นักล่าโอกาส',          blurb: 'ชนะด้วยการเปิดลูกค้าใหม่ไม่หยุด' },
      ],
    },
  ],

  questions: [
    {
      id: 'ss1', order: 1, dimensionId: 'style',
      text: 'สิ่งที่ทำให้คุณภูมิใจที่สุดในงานขายคือ',
      options: [
        { id: 'ss1a', text: 'ลูกค้าเก่ากลับมาสั่งซ้ำเพราะไว้ใจเรา', weights: [{ bucketId: 'relationship' }] },
        { id: 'ss1b', text: 'ช่วยลูกค้าแก้ปัญหาที่เขาเองยังไม่รู้ว่ามี', weights: [{ bucketId: 'consultant' }] },
        { id: 'ss1c', text: 'ปิดดีลที่คนอื่นคิดว่าปิดไม่ได้', weights: [{ bucketId: 'closer' }] },
        { id: 'ss1d', text: 'เสนอตัวเลขที่ทำให้ลูกค้าตัดสินใจได้ทันที', weights: [{ bucketId: 'analyst' }] },
        { id: 'ss1e', text: 'เปิดลูกค้ารายใหม่ได้มากกว่าเป้า', weights: [{ bucketId: 'hunter' }] },
      ],
    },
    {
      id: 'ss2', order: 2, dimensionId: 'style',
      text: 'ก่อนเข้าพบลูกค้าใหม่ คุณเตรียมตัวอย่างไร',
      options: [
        { id: 'ss2a', text: 'หาข้อมูลว่าใครเป็นคนตัดสินใจ และเขาเป็นคนแบบไหน', weights: [{ bucketId: 'relationship' }] },
        { id: 'ss2b', text: 'เตรียมคำถามเพื่อขุดปัญหาหน้างานของเขา', weights: [{ bucketId: 'consultant' }] },
        { id: 'ss2c', text: 'เตรียมข้อเสนอและแผนรับมือการต่อรอง', weights: [{ bucketId: 'closer' }] },
        { id: 'ss2d', text: 'เตรียมตัวเลขเปรียบเทียบต้นทุนและผลลัพธ์', weights: [{ bucketId: 'analyst' }] },
        { id: 'ss2e', text: 'ไม่เตรียมมาก เข้าไปคุยก่อนแล้วค่อยปรับหน้างาน', weights: [{ bucketId: 'hunter' }] },
      ],
    },
    {
      id: 'ss3', order: 3, dimensionId: 'style',
      text: 'ลูกค้าบอกว่า "ขอคิดดูก่อน" คุณทำอย่างไร',
      options: [
        { id: 'ss3a', text: 'ให้เวลาเขา แล้วรักษาการติดต่ออย่างสม่ำเสมอ', weights: [{ bucketId: 'relationship' }] },
        { id: 'ss3b', text: 'ถามต่อว่าอะไรคือสิ่งที่ยังไม่ชัดสำหรับเขา', weights: [{ bucketId: 'consultant' }] },
        { id: 'ss3c', text: 'เสนอเงื่อนไขพิเศษถ้าตัดสินใจภายในสัปดาห์นี้', weights: [{ bucketId: 'closer' }] },
        { id: 'ss3d', text: 'ส่งข้อมูลเปรียบเทียบให้เขาใช้ประกอบการตัดสินใจ', weights: [{ bucketId: 'analyst' }] },
        { id: 'ss3e', text: 'ไม่เสียเวลามาก ไปหาลูกค้ารายอื่นต่อ', weights: [{ bucketId: 'hunter' }] },
      ],
    },
    {
      id: 'ss4', order: 4, dimensionId: 'style',
      text: 'คุณวัดว่าวันนี้ทำงานได้ดีจากอะไร',
      options: [
        { id: 'ss4a', text: 'ได้คุยกับลูกค้าเก่าและเขายังพอใจอยู่', weights: [{ bucketId: 'relationship' }] },
        { id: 'ss4b', text: 'เข้าใจธุรกิจของลูกค้ามากขึ้นกว่าเมื่อวาน', weights: [{ bucketId: 'consultant' }] },
        { id: 'ss4c', text: 'มีดีลขยับเข้าใกล้การปิดมากขึ้น', weights: [{ bucketId: 'closer' }] },
        { id: 'ss4d', text: 'ตัวเลขในระบบอัปเดตครบและแม่นยำ', weights: [{ bucketId: 'analyst' }] },
        { id: 'ss4e', text: 'จำนวนลูกค้าใหม่ที่ได้ติดต่อ', weights: [{ bucketId: 'hunter' }] },
      ],
    },
    {
      id: 'ss5', order: 5, dimensionId: 'style',
      text: 'เวลาลูกค้าขอลดราคา ปฏิกิริยาแรกของคุณคือ',
      options: [
        { id: 'ss5a', text: 'คุยตรงๆ ว่าทำได้แค่ไหน เพื่อรักษาความสัมพันธ์ระยะยาว', weights: [{ bucketId: 'relationship' }] },
        { id: 'ss5b', text: 'ถามว่าทำไมราคาถึงเป็นประเด็นสำหรับเขา', weights: [{ bucketId: 'consultant' }] },
        { id: 'ss5c', text: 'ต่อรองกลับด้วยเงื่อนไขอื่นเพื่อปิดให้ได้', weights: [{ bucketId: 'closer' }] },
        { id: 'ss5d', text: 'แสดงให้เห็นว่าราคานี้คุ้มค่าอย่างไรด้วยตัวเลข', weights: [{ bucketId: 'analyst' }] },
        { id: 'ss5e', text: 'ถ้าลดไม่ได้ก็ไปเสนอลูกค้ารายอื่นแทน', weights: [{ bucketId: 'hunter' }] },
      ],
    },
    {
      id: 'ss6', order: 6, dimensionId: 'style',
      text: 'งานส่วนไหนที่คุณอยากเลี่ยงที่สุด',
      options: [
        { id: 'ss6a', text: 'ต้องกดดันลูกค้าให้รีบตัดสินใจ', weights: [{ bucketId: 'relationship' }] },
        { id: 'ss6b', text: 'ต้องขายโดยไม่รู้บริบทของลูกค้าเลย', weights: [{ bucketId: 'consultant' }] },
        { id: 'ss6c', text: 'ต้องรอลูกค้าตัดสินใจนานๆ', weights: [{ bucketId: 'closer' }] },
        { id: 'ss6d', text: 'ต้องตัดสินใจโดยไม่มีข้อมูลรองรับ', weights: [{ bucketId: 'analyst' }] },
        { id: 'ss6e', text: 'ต้องดูแลลูกค้าเดิมซ้ำๆ ทุกวัน', weights: [{ bucketId: 'hunter' }] },
      ],
    },
    {
      id: 'ss7', order: 7, dimensionId: 'style',
      text: 'เพื่อนร่วมทีมมักขอความช่วยเหลือจากคุณเรื่อง',
      options: [
        { id: 'ss7a', text: 'วิธีรับมือลูกค้าที่กำลังไม่พอใจ', weights: [{ bucketId: 'relationship' }] },
        { id: 'ss7b', text: 'วิธีตั้งคำถามให้ลูกค้าเปิดใจ', weights: [{ bucketId: 'consultant' }] },
        { id: 'ss7c', text: 'วิธีปิดดีลที่ค้างอยู่นาน', weights: [{ bucketId: 'closer' }] },
        { id: 'ss7d', text: 'การทำข้อมูลเปรียบเทียบและใบเสนอราคา', weights: [{ bucketId: 'analyst' }] },
        { id: 'ss7e', text: 'การหาลูกค้าใหม่และเปิดการติดต่อ', weights: [{ bucketId: 'hunter' }] },
      ],
    },
    {
      id: 'ss8', order: 8, dimensionId: 'style',
      text: 'ถ้าต้องเลือกพัฒนาตัวเองด้านเดียว คุณเลือก',
      options: [
        { id: 'ss8a', text: 'ทักษะการดูแลลูกค้าระยะยาว', weights: [{ bucketId: 'relationship' }] },
        { id: 'ss8b', text: 'ความรู้เชิงลึกเรื่องธุรกิจร้านอาหาร', weights: [{ bucketId: 'consultant' }] },
        { id: 'ss8c', text: 'เทคนิคการเจรจาและปิดการขาย', weights: [{ bucketId: 'closer' }] },
        { id: 'ss8d', text: 'การใช้ข้อมูลและเครื่องมือวิเคราะห์', weights: [{ bucketId: 'analyst' }] },
        { id: 'ss8e', text: 'การหาโอกาสและเปิดตลาดใหม่', weights: [{ bucketId: 'hunter' }] },
      ],
    },
    {
      id: 'ss9', order: 9, dimensionId: 'style',
      text: 'ลูกค้าจะจำคุณได้ในฐานะ',
      options: [
        { id: 'ss9a', text: 'คนที่ติดต่อได้เสมอและไว้ใจได้', weights: [{ bucketId: 'relationship' }] },
        { id: 'ss9b', text: 'คนที่เข้าใจร้านของเขาจริงๆ', weights: [{ bucketId: 'consultant' }] },
        { id: 'ss9c', text: 'คนที่ทำให้ทุกอย่างจบเร็ว', weights: [{ bucketId: 'closer' }] },
        { id: 'ss9d', text: 'คนที่มีข้อมูลครบและไม่เคยพลาด', weights: [{ bucketId: 'analyst' }] },
        { id: 'ss9e', text: 'คนที่เข้ามาเสนอสิ่งใหม่ๆ อยู่เรื่อยๆ', weights: [{ bucketId: 'hunter' }] },
      ],
    },
    {
      id: 'ss10', order: 10, dimensionId: 'style',
      text: 'เมื่อเจอลูกค้าที่ยังไม่รู้ว่าตัวเองต้องการอะไร คุณ',
      options: [
        { id: 'ss10a', text: 'ค่อยๆ สร้างความคุ้นเคยก่อนแล้วค่อยเสนอ', weights: [{ bucketId: 'relationship' }] },
        { id: 'ss10b', text: 'ชวนคุยจนเห็นภาพปัญหาที่แท้จริงร่วมกัน', weights: [{ bucketId: 'consultant' }] },
        { id: 'ss10c', text: 'เสนอตัวเลือกที่ดีที่สุดไปเลยเพื่อให้เขาตัดสินใจ', weights: [{ bucketId: 'closer' }] },
        { id: 'ss10d', text: 'ให้ข้อมูลเปรียบเทียบเพื่อให้เขาเลือกเอง', weights: [{ bucketId: 'analyst' }] },
        { id: 'ss10e', text: 'ลองเสนอหลายๆ แบบเร็วๆ ดูว่าอันไหนโดน', weights: [{ bucketId: 'hunter' }] },
      ],
    },
    {
      id: 'ss11', order: 11, dimensionId: 'style',
      text: 'สิ่งที่ทำให้คุณเสียพลังงานมากที่สุดคือ',
      options: [
        { id: 'ss11a', text: 'ความสัมพันธ์กับลูกค้าที่เริ่มห่างเหิน', weights: [{ bucketId: 'relationship' }] },
        { id: 'ss11b', text: 'การขายของที่ตัวเองไม่เชื่อว่าช่วยลูกค้าได้', weights: [{ bucketId: 'consultant' }] },
        { id: 'ss11c', text: 'ดีลที่ไม่ขยับไปไหนสักที', weights: [{ bucketId: 'closer' }] },
        { id: 'ss11d', text: 'ข้อมูลที่ไม่ตรงกันระหว่างระบบกับหน้างาน', weights: [{ bucketId: 'analyst' }] },
        { id: 'ss11e', text: 'การทำงานเดิมซ้ำๆ โดยไม่มีอะไรใหม่', weights: [{ bucketId: 'hunter' }] },
      ],
    },
    {
      id: 'ss12', order: 12, dimensionId: 'style',
      text: 'ถ้าได้เป็นหัวหน้าทีมขาย คุณจะเน้นเรื่องใดก่อน',
      options: [
        { id: 'ss12a', text: 'ทำให้ทีมดูแลลูกค้าเดิมได้ดีขึ้น', weights: [{ bucketId: 'relationship' }] },
        { id: 'ss12b', text: 'ทำให้ทีมเข้าใจธุรกิจลูกค้ามากขึ้น', weights: [{ bucketId: 'consultant' }] },
        { id: 'ss12c', text: 'ทำให้ทีมปิดดีลได้เร็วขึ้น', weights: [{ bucketId: 'closer' }] },
        { id: 'ss12d', text: 'ทำให้ทีมใช้ข้อมูลในการตัดสินใจมากขึ้น', weights: [{ bucketId: 'analyst' }] },
        { id: 'ss12e', text: 'ทำให้ทีมเปิดลูกค้าใหม่ได้มากขึ้น', weights: [{ bucketId: 'hunter' }] },
      ],
    },
  ],

  outcomes: [
    {
      whenBucketIds: ['relationship'],
      code: 'RELATIONSHIP', title: 'นักสร้างความสัมพันธ์',
      description:
        'คุณขายด้วยความไว้วางใจ ลูกค้าซื้อจากคุณเพราะเชื่อใจคุณ ไม่ใช่เพราะข้อเสนอดีที่สุด '
        + 'จุดแข็งของคุณคือความสม่ำเสมอและการดูแลที่ลูกค้ารู้สึกได้',
      detail:
        'เหมาะกับการดูแลลูกค้าประจำและงานที่ต้องรักษายอดซื้อซ้ำ '
        + 'สิ่งที่ควรระวังคือการเกรงใจจนไม่กล้าเสนอขายเพิ่ม หรือปล่อยให้ดีลยืดเยื้อเกินไป',
    },
    {
      whenBucketIds: ['consultant'],
      code: 'CONSULTANT', title: 'ที่ปรึกษา',
      description:
        'คุณขายด้วยความเข้าใจ ลูกค้าซื้อเพราะคุณทำให้เขาเห็นปัญหาของตัวเองชัดขึ้น '
        + 'จุดแข็งของคุณคือการตั้งคำถามและฟัง',
      detail:
        'เหมาะกับดีลที่ซับซ้อนหรือลูกค้ารายใหญ่ที่ต้องออกแบบข้อเสนอเฉพาะ '
        + 'สิ่งที่ควรระวังคือใช้เวลากับการวิเคราะห์นานจนคู่แข่งเสนอไปก่อน',
    },
    {
      whenBucketIds: ['closer'],
      code: 'CLOSER', title: 'นักปิดการขาย',
      description:
        'คุณขายด้วยจังหวะและความมั่นใจ อ่านออกว่าเมื่อไรควรผลักดันให้ตัดสินใจ '
        + 'จุดแข็งของคุณคือไม่ปล่อยให้โอกาสหลุดมือ',
      detail:
        'เหมาะกับงานที่ต้องทำยอดตามรอบและดีลที่ต้องการการตัดสินใจเร็ว '
        + 'สิ่งที่ควรระวังคือการเร่งลูกค้าจนเสียความสัมพันธ์ระยะยาว',
    },
    {
      whenBucketIds: ['analyst'],
      code: 'ANALYST', title: 'นักวิเคราะห์',
      description:
        'คุณขายด้วยข้อมูล ลูกค้าเชื่อคุณเพราะตัวเลขและเหตุผลที่หนักแน่น '
        + 'จุดแข็งของคุณคือความแม่นยำและความน่าเชื่อถือ',
      detail:
        'เหมาะกับการเสนอราคาเชิงเปรียบเทียบและลูกค้าที่ตัดสินใจด้วยตัวเลข '
        + 'สิ่งที่ควรระวังคือการให้ข้อมูลมากเกินจนลูกค้าตัดสินใจไม่ลง',
    },
    {
      whenBucketIds: ['hunter'],
      code: 'HUNTER', title: 'นักล่าโอกาส',
      description:
        'คุณขายด้วยพลังงานและปริมาณ ไม่กลัวการถูกปฏิเสธและเปิดลูกค้าใหม่ได้เร็ว '
        + 'จุดแข็งของคุณคือการสร้างโอกาสใหม่ให้ทีมเสมอ',
      detail:
        'เหมาะกับการขยายตลาดและเปิดพื้นที่ใหม่ '
        + 'สิ่งที่ควรระวังคือการทิ้งลูกค้าเดิมไว้ข้างหลังจนยอดซื้อซ้ำหาย',
    },
  ],
}
