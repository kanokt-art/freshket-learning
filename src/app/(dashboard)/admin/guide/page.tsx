'use client'

import { useAuth } from '@/hooks/useAuth'
import { Header } from '@/components/layout/Header'

// Admin manual — how the things an admin does here actually behave. Static text, written
// from what the system does today; update it in the same change when a behaviour changes.

const SECTIONS: Array<{ id: string; title: string }> = [
  { id: 'course', title: 'สร้างและแก้หลักสูตร' },
  { id: 'cover', title: 'ภาพปก' },
  { id: 'video', title: 'บทเรียนวิดีโอ' },
  { id: 'learners', title: 'ผู้เรียนของหลักสูตร' },
  { id: 'publish', title: 'เผยแพร่และประกาศ' },
  { id: 'people', title: 'พนักงานและ Slack' },
  { id: 'team', title: 'โครงสร้างทีม' },
  { id: 'slack', title: 'Slack แจ้งอะไรบ้าง' },
  { id: 'faq', title: 'ปัญหาที่พบบ่อย' },
]

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-6 bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
      <h2 className="text-base font-bold text-gray-900 mb-3">{title}</h2>
      <div className="space-y-3 text-sm text-gray-700 leading-relaxed">{children}</div>
    </section>
  )
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl bg-freshket-50 border border-freshket-200 px-3.5 py-2.5 text-sm text-freshket-700">{children}</p>
  )
}

function Warn({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl bg-amber-50 border border-amber-200 px-3.5 py-2.5 text-sm text-amber-700">{children}</p>
  )
}

function Steps({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="space-y-1.5 list-decimal pl-5 marker:text-gray-400 marker:font-bold">
      {items.map((it, i) => <li key={i}>{it}</li>)}
    </ol>
  )
}

export default function AdminGuidePage() {
  const { user } = useAuth()

  if (user?.role !== 'super_admin') {
    return (
      <div className="flex flex-col h-full items-center justify-center bg-slate-50">
        <p className="text-sm font-bold text-gray-900 mb-1">ไม่มีสิทธิ์เข้าถึง</p>
        <p className="text-xs text-gray-400">หน้านี้สำหรับ Super Admin เท่านั้น</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full bg-slate-50">
      <Header title="คู่มือ Admin" subtitle="วิธีใช้งานส่วนจัดการของ Freshket Sale Tracking" />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 grid grid-cols-1 lg:grid-cols-[13rem_minmax(0,1fr)] gap-6">

          {/* Contents */}
          <nav className="lg:sticky lg:top-6 self-start bg-white rounded-2xl border border-gray-100 shadow-sm p-3" aria-label="สารบัญ">
            <p className="text-xs font-bold text-gray-400 px-2 pb-2">สารบัญ</p>
            <ul className="flex flex-wrap lg:flex-col gap-1">
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="block px-2.5 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-gray-50 hover:text-gray-900 transition-colors">
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="space-y-5 min-w-0">

            <Section id="course" title="สร้างและแก้หลักสูตร">
              <p>ไปที่ <b>Course Management</b> แล้วกดสร้างหลักสูตรใหม่ หน้าต่างสร้างมีแท็บ: รายละเอียด, บทเรียน, แบบทดสอบ, ผู้เรียน (และสรุปผลเมื่อเป็นคอร์สที่บันทึกแล้ว)</p>
              <Steps items={[
                'กรอกชื่อ คำอธิบาย หมวดหมู่ และเลือกภาพปก',
                'แท็บ "บทเรียน": เพิ่มหัวข้อ แล้วเพิ่มบทเรียนในหัวข้อ ลากที่จับด้านซ้ายเพื่อสลับลำดับ',
                'แท็บ "ผู้เรียน": เลือกว่าใครต้องเรียน (ดูหัวข้อ "ผู้เรียนของหลักสูตร")',
                'กดบันทึก จะถามว่าเผยแพร่หรือบันทึกเป็นร่าง',
              ]} />
              <p><b>ชื่อบทเรียนและหัวข้อ:</b> ถ้าไม่ตั้งชื่อ ระบบเรียงเลขให้อัตโนมัติตามลำดับ (บทเรียน #1, #2 … หัวข้อ #1, #2 …) สลับลำดับแล้วเลขเปลี่ยนตาม ถ้าพิมพ์ชื่อเอง จะแสดงตามที่พิมพ์ ลบชื่อออกแล้วกลับเป็นเลขอัตโนมัติ</p>
              <p><b>การจบการเรียน:</b> ผู้เรียนมีแท็บ "จบการเรียน" ใต้รายการบทเรียน ล็อกไว้จนกว่าจะผ่านครบทุกบท แล้วกดปุ่มจบการเรียนได้ คอร์สที่มีข้อสอบ post-test ผลผ่านหรือไม่ผ่านตัดสินโดยระบบตรวจข้อสอบ ไม่ใช่ปุ่มนี้</p>
            </Section>

            <Section id="cover" title="ภาพปก">
              <p>ขนาดที่แนะนำ: <b>1200 × 400 px</b> (อัตราส่วน 3:1) ขั้นต่ำ 900 × 300 px ไฟล์ JPG, PNG หรือ WEBP ไม่เกิน 5 MB</p>
              <ul className="list-disc pl-5 space-y-1 marker:text-gray-300">
                <li><b>Gallery:</b> เลือกสีพื้นหรือรูปที่เตรียมไว้</li>
                <li><b>Upload:</b> เลือกไฟล์ แล้วลากกรอบ 3:1 เพื่อเลือกส่วนที่จะใช้ ลากที่มุมเพื่อย่อหรือขยาย กด "Crop &amp; อัปโหลด"</li>
                <li><b>ปรับตำแหน่ง:</b> หลังอัปโหลดแล้ว กด "ปรับตำแหน่ง" เพื่อเลื่อนกรอบใหม่ได้ ระบบจะตัดและอัปโหลดภาพใหม่ให้</li>
                <li><b>AI:</b> พิมพ์หัวข้อ ให้ AI แนะนำคำค้น แล้วเลือกรูปตัวอย่าง</li>
              </ul>
              <Note>รูปจะถูกใช้เมื่อกด "ยืนยันเปลี่ยนรูป" เท่านั้น กดยกเลิกจะไม่เปลี่ยนอะไร</Note>
              <p>ภาพปกของ Tool ใช้อัตราส่วน 2:1 (แนะนำ 1200 × 600 px) ตัวอัปโหลดแสดงขนาดที่ถูกต้องให้เองตามประเภท</p>
            </Section>

            <Section id="video" title="บทเรียนวิดีโอ">
              <p>วิดีโอมี 2 แบบ ระบบปฏิบัติต่างกัน</p>
              <ul className="list-disc pl-5 space-y-1 marker:text-gray-300">
                <li><b>YouTube:</b> เล่นด้วย player ของระบบ กรอข้ามไม่ได้ ต้องดูต่อเนื่องถึง 95% จึงนับว่าผ่าน มีแถบ % ใต้วิดีโอและ "บทเรียน #N · X%" ในรายการ ถ้าปิดหน้าไปก่อน กลับมาดูต่อจากจุดเดิมได้ (จำในเบราว์เซอร์เครื่องนั้น)</li>
                <li><b>Google Drive หรือลิงก์อื่น:</b> ระบบนับความคืบหน้าไม่ได้ จึงนับว่าผ่านทันทีที่ผู้เรียนเปิดบทนั้น และไม่มีเลข %</li>
              </ul>
              <p><b>วิธีตั้ง YouTube:</b> อัปโหลดที่ YouTube Studio ตั้งการเปิดเผยเป็น <b>ไม่เป็นสาธารณะ (Unlisted)</b> เปิด "อนุญาตให้ฝัง" แล้ววางลิงก์ในบทเรียน เลือกรูปแบบวิดีโอเป็น YouTube ลิงก์รับรูปแบบ <code className="text-xs bg-gray-100 rounded px-1">youtube.com/watch?v=…</code>, <code className="text-xs bg-gray-100 rounded px-1">youtu.be/…</code> และ <code className="text-xs bg-gray-100 rounded px-1">youtube.com/embed/…</code></p>
              <Warn>Unlisted ไม่ใช่ private: ใครมีลิงก์ก็ดูได้ อย่าใช้กับเนื้อหาที่เป็นความลับของบริษัท ใช้ Drive แทน อัปโหลดเกิน 15 นาทีต้องยืนยันตัวตนช่อง YouTube (youtube.com/verify) หรือแบ่งวิดีโอเป็นหลายบท</Warn>
            </Section>

            <Section id="learners" title="ผู้เรียนของหลักสูตร">
              <p>แท็บ "ผู้เรียน" ใช้ 2 วิธีเลือกคน:</p>
              <ul className="list-disc pl-5 space-y-1 marker:text-gray-300">
                <li><b>มอบหมายรายบุคคล:</b> เลือกชื่อทีละคนหรือหลายคน</li>
                <li><b>มอบหมายตามเงื่อนไข:</b> เลือกแผนกหรือทีม คนที่อยู่ในเงื่อนไขกลายเป็นผู้เรียนอัตโนมัติ รวมคนที่เข้าใหม่ภายหลัง</li>
              </ul>
              <p><b>ตัวเลข "ทั้งหมด":</b> นับเฉพาะผู้เรียนที่ยังทำงานอยู่ตรงกับในตาราง ถ้ามีคนที่ลาออกหรือหาไม่เจอในระบบ ยังค้างอยู่ในรายชื่อเบื้องหลัง จะมีบรรทัด "+N คนที่ลาออก/ไม่พบ" กด "ล้าง" เพื่อเอาออกจากรายชื่อ การล้างนี้ไม่ลบประวัติการเรียนของใคร</p>
              <p><b>ลบผู้เรียน:</b> กดถังขยะที่แถว หรือติ๊กหลายคนแล้วกดลบ (ต้องกด "บันทึก" หลักสูตรเพื่อให้ผลถาวร)</p>
              <Warn>ลบผู้เรียนที่ <b>เริ่มเรียนแล้ว</b> ได้ ระบบถามยืนยันก่อน และเมื่อบันทึก ประวัติการเรียนของคนนั้นในคอร์สนี้ (ความคืบหน้า คะแนน สถานะ) จะถูกลบถาวร กู้คืนไม่ได้ ถ้ายังไม่บันทึกหรือกดยกเลิก จะไม่มีอะไรถูกลบ</Warn>
              <p>ผู้ที่ลาออกแล้วจะไม่ได้รับการแจ้งเตือนหลักสูตรใหม่ (ตัดออกจากผู้รับ)</p>
            </Section>

            <Section id="publish" title="เผยแพร่และประกาศ">
              <p>เมื่อเผยแพร่หลักสูตร หรือ Mandatory Reading ระบบจะถามก่อนว่า <b>ประกาศลง Slack ด้วยไหม</b> พร้อมบอกว่าจะเกิดอะไร</p>
              <ul className="list-disc pl-5 space-y-1 marker:text-gray-300">
                <li><b>หลักสูตรใหม่:</b> โพสต์ที่ช่องหลักสูตร แท็ก @channel ทั้งช่อง</li>
                <li><b>เพิ่มคนเข้าหลักสูตรที่เปิดแล้ว:</b> โพสต์ที่ช่องหลักสูตร ไม่แท็ก @channel</li>
                <li><b>Mandatory Reading:</b> โพสต์ลง Slack และส่ง DM ถึงคนในแผนกที่เลือก (ไม่เลือกแผนก = ทุกแผนก)</li>
              </ul>
              <p><b>ป้ายสัปดาห์ (เช่น Week 44 / Oct 2026)</b> ของ Mandatory คำนวณจาก "วันที่" ของรายการ ถ้าป้ายไม่ตรงกับหัวข้อ ให้เปิดแก้ไขแล้วเปลี่ยนวันที่ ป้ายจะเปลี่ยนตาม และรายการจะย้ายไปอยู่เดือนใหม่ในหน้าคลัง หัวข้อแก้แยกได้ ไม่เปลี่ยนตามวันที่ ช่อง "แผนกที่เกี่ยวข้อง" แสดงเฉพาะแผนกที่เปิดใช้ระบบ</p>
              <p><b>Mandatory ใหม่จำค่าจากครั้งก่อน:</b> แผนกที่เลือก ติ๊ก "แสดงผลทั้งหมด" ของแต่ละแผนก และสวิตช์ "Publish ทันที" จะถูกจำไว้ ครั้งหน้าที่สร้างรายการใหม่ ฟอร์มเริ่มจากค่าเหล่านี้ เปลี่ยนในรายการนั้นได้โดยไม่กระทบรายการอื่น (ติ๊ก "แสดงผลทั้งหมด" ที่จำไว้ จะให้แผนกนั้นเห็นของเก่าทุกฉบับ ตรวจก่อนบันทึก)</p>
              <p>กด "ไม่ประกาศ" จะข้ามเฉพาะ Slack หลักสูตรยังเผยแพร่ และแจ้งเตือนในแอป (กระดิ่ง) ยังส่งตามปกติ การประกาศย้อนหลังต้องยกเลิกเผยแพร่แล้วเผยแพร่ใหม่</p>
            </Section>

            <Section id="people" title="พนักงานและ Slack">
              <p>หน้า <b>Employees</b> แสดงเฉพาะพนักงานที่ยังทำงานอยู่ ในแผนกที่เปิดใช้ระบบแล้ว (Sales Management, Key Account Management, Portfolio Management, Commercial, People Experience) คนแผนกอื่นถูกซ่อนจากรายชื่อ แต่ข้อมูลไม่ถูกลบ ถ้าจะเปิดแผนกเพิ่ม ต้องเพิ่มชื่อแผนกในโค้ด (<code className="text-xs bg-gray-100 rounded px-1">PHASE1_DEPARTMENTS</code>) บอกทีมพัฒนา</p>
              <p><b>Slack ID:</b> คอลัมน์ Slack ในตารางแสดง ID ของแต่ละคน "-" แปลว่ายังไม่มี ใช้ตัวกรอง "ยังไม่มี Slack" ดูรายชื่อที่ต้องเติม</p>
              <Steps items={[
                'คลิกแถวของคนนั้น เปิดแผงรายละเอียด แถว Slack',
                'กด "ค้นหาจากอีเมล" ระบบหาให้จากอีเมลบริษัทและบันทึกทันที',
                'ถ้าไม่เจอ (อีเมลใน Slack ไม่ตรง) ให้วางลิงก์โปรไฟล์ Slack ของเขา (ใน Slack: คลิกชื่อ → ⋮ → Copy link) แล้วกดบันทึก',
              ]} />
              <Note>ระบบหา Slack ID จากอีเมลให้เองอัตโนมัติตอนจะส่ง DM ถึงใครที่ยังไม่มี ID ปุ่มนี้ไว้เติมล่วงหน้าหรือตรวจสอบ</Note>
            </Section>

            <Section id="team" title="โครงสร้างทีม">
              <p>เมนู Employees → โครงสร้างทีม จัดทีม ผู้จัดการ และหัวหน้าทีม กด + Assign (Manager), + Set (Team Lead) หรือ Add member หน้าต่างเลือกแสดงชื่อเต็มโดยไม่ตัด</p>
              <ul className="list-disc pl-5 space-y-1 marker:text-gray-300">
                <li><b>เลือก Manager และ Team Lead:</b> เสนอพนักงานกลุ่มเดียวกัน คือคนที่ยังทำงานอยู่ ในแผนกที่เปิดใช้ระบบ (รวม Commercial) และ <b>ระดับ Supervisor ขึ้นไป</b> (Supervisor, Assistant Manager, Manager และสูงกว่า)</li>
                <li><b>ระดับดูจากข้อมูล HR (rank ตำแหน่ง)</b> ไม่ใช่จากบทบาทในแอป คนระดับ Staff ที่ถูกตั้งบทบาท team lead ไว้จะไม่ถูกเสนอ ส่วนคนระดับ Manager ที่บทบาทยังเป็น sale จะถูกเสนอ</li>
                <li><b>เป็นได้ทุกทีม ไม่มีโควต้า:</b> คนเดียวเป็น Manager หรือ Team Lead ของกี่ทีมก็ได้</li>
                <li><b>Add member:</b> เสนอเฉพาะคนในแผนกที่เปิดใช้ระบบ</li>
              </ul>
              <p><b>เมนู Team และสมาชิก:</b> เมนู Team ขึ้นตามบทบาท (Team Lead และ Manager) แต่สมาชิกขึ้นตามทีม ถ้ายังไม่ได้ถูกกำหนดเป็น Manager/Team Lead ของทีมใด (หรือไม่ได้อยู่ทีมใด) จะเห็นเมนู Team แต่ไม่เห็นสมาชิก และมีข้อความบอกให้ติดต่อ Admin</p>
              <Note>การเป็น Manager ของทีมไม่ได้เปลี่ยนบทบาทในระบบของคนนั้น คนในแผนก Commercial ที่บทบาทยังเป็น sale จะไม่เห็นเมนู Team จนกว่า super admin จะเปลี่ยนบทบาทให้</Note>
            </Section>

            <Section id="slack" title="Slack แจ้งอะไรบ้าง">
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[32rem]">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 border-b border-gray-100">
                      <th className="py-2 pr-3 font-bold">เหตุการณ์</th>
                      <th className="py-2 pr-3 font-bold">ไปที่</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    <tr><td className="py-2 pr-3">user ทำแบบทดสอบเสร็จ</td><td className="py-2 pr-3">กลุ่ม trainer × team lead</td></tr>
                    <tr><td className="py-2 pr-3">user ส่ง Shadow Visit</td><td className="py-2 pr-3">กลุ่ม trainer × team lead</td></tr>
                    <tr><td className="py-2 pr-3">Shadow Visit ถูกประเมิน</td><td className="py-2 pr-3">กลุ่ม trainer × team lead และ DM ถึง user</td></tr>
                    <tr><td className="py-2 pr-3">user ทำแบบทดสอบผ่าน</td><td className="py-2 pr-3">DM ถึง user</td></tr>
                    <tr><td className="py-2 pr-3">หลักสูตรใหม่ / เพิ่มผู้เรียน</td><td className="py-2 pr-3">ช่องหลักสูตร (ถามยืนยันก่อน)</td></tr>
                    <tr><td className="py-2 pr-3">Mandatory Reading ใหม่</td><td className="py-2 pr-3">โพสต์ Slack และ DM ถึงกลุ่มเป้าหมาย (ถามยืนยันก่อน)</td></tr>
                  </tbody>
                </table>
              </div>
              <p>team lead และ manager ไม่ได้รับ DM รายคน ทุกอย่างของ lead เข้ากลุ่ม trainer × team lead DM ส่งได้เฉพาะคนที่มี Slack ID (หรือหาจากอีเมลเจอ)</p>
            </Section>

            <Section id="faq" title="ปัญหาที่พบบ่อย">
              <div className="space-y-3">
                <div>
                  <p className="font-bold text-gray-900">กด "ค้นหาจากอีเมล" แล้วบอกว่าไม่มีสิทธิ์</p>
                  <p>แอป Slack ยังไม่มีสิทธิ์อ่านอีเมล (users:read.email) เพิ่มสิทธิ์ใน Slack แล้ว Reinstall แอป</p>
                </div>
                <div>
                  <p className="font-bold text-gray-900">Slack ไม่ขึ้นข้อความในช่อง</p>
                  <p>เช็คว่าบอทถูกเชิญเข้าช่องแล้ว (พิมพ์ <code className="text-xs bg-gray-100 rounded px-1">/invite @Freshket Sale Tracking</code> ในช่อง) ถ้ายังไม่ขึ้น แจ้งทีมพัฒนาให้ดู Log ใน Vercel</p>
                </div>
                <div>
                  <p className="font-bold text-gray-900">ผู้เรียนจบหลักสูตรไม่ได้</p>
                  <p>เปิดแท็บ "จบการเรียน" ดูว่าบทไหนยัง "ยังไม่ผ่าน" วิดีโอ YouTube ต้องดูถึง 95% บทวิดีโอ Drive ต้องเปิดบทนั้น และถ้ามีแบบทดสอบต้องทำให้ครบ</p>
                </div>
                <div>
                  <p className="font-bold text-gray-900">ตัวเลขผู้เรียนไม่ตรงกับในตาราง</p>
                  <p>ตัวเลขนับเฉพาะคนที่ยังทำงานอยู่ ถ้ามีบรรทัด "+N คนที่ลาออก/ไม่พบ" ใต้ตัวเลข คือคนที่ค้างอยู่เบื้องหลัง กด "ล้าง" ได้</p>
                </div>
              </div>
            </Section>

          </div>
        </div>
      </div>
    </div>
  )
}
