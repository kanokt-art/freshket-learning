# Skills — Freshket Sale Tracking

Skills ที่ใช้ใน project นี้ Claude จะเรียกโดยอัตโนมัติเมื่อ prompt เกี่ยวข้องกับเรื่องนั้นๆ

---

## วิธีติดตั้ง Skills

```bash
# Anthropics official skills (frontend-design)
npx skills add https://github.com/anthropics/skills --skill frontend-design

# 9arm community pack (debug-mantra, post-mortem, scrutinize, management-talk, qwen-agent)
npx skills add https://github.com/thananon/9arm-skills

# Ponytail over-engineering audit pack
npx skills add https://github.com/DietrichGebert/ponytail.git

# Matt Pocock — Skills For Real Engineers (ติดตั้งแล้วใน .claude/skills/ ชุด curated)
npx skills@latest add mattpocock/skills
```

---

## Available Skills

### 1. `frontend-design`

**Source**: `https://github.com/anthropics/skills` — `skills/frontend-design`

**เรียกใช้เมื่อ**:
- ออกแบบหรือสร้าง UI component ใหม่
- แก้ layout, spacing, color, typography
- เพิ่ม animation หรือ transition
- ทำ responsive design
- ต้องการ review ว่า design specific หรือ generic เกินไป

**หลักการ**: ออกแบบจาก subject matter ของ project — ห้ามใช้ AI default (cream/serif, dark neon, broadsheet layout) โดยไม่มีเหตุผล ทำ 2 passes: token system ก่อน แล้วค่อย critique ก่อน code

**Design system ของ project นี้** → ดูที่ `CLAUDE.md` section "Design Tokens" และ "Component Patterns" **และ** `fkt-design-system` (ด้านล่าง) สำหรับ component spec ระดับละเอียด

---

### 1.5 `fkt-design-system` (Freshket DS 2026 — external reference)

**Source (local, ไม่ใช่ GitHub)**: `C:\Users\freshket.co\OneDrive\เดสก์ท็อป_Macbook\VS-code-project\AI Hub Skill\skill-fkt-code-with-ai\fkt-design-system`
ไฟล์หลัก: `RULES.md` (constraint layer, อ่านก่อนเสมอ) · `tokens.json` + `dist/tokens.css` / `dist/tailwind-preset.cjs` (source of truth ของสี/type/spacing) · `guidelines/01–25-*.md` (component spec ละเอียด — โหลดเฉพาะไฟล์ที่ต้องใช้ ไม่อ่านทั้งหมดพร้อมกัน)

**เรียกใช้เมื่อ**:
- สร้างหรือแก้ component ใหม่ (modal, button, input, table, badge, dropdown ฯลฯ) แล้วต้องการ spec ละเอียด (size, spacing, state, a11y)
- ต้องการเช็คว่า UI ที่ทำตรงกับ DS 2026 rules หรือไม่ ("ปรับให้ตรงกับ design skill", "apply design system")
- ปรับ typography scale / font weight

**Tier ของ project นี้**: **Tier A — Product** (dashboard/form/table ภายในบริษัท) → กฎเข้ม ตาม `RULES.md`

**กฎหลักที่บังคับใช้ (Tier A)**:
| Rule | ใน project นี้ |
|---|---|
| Font weight | **400 (ปกติ) หรือ 700 (`font-bold`) เท่านั้น** — ห้าม `font-medium`/`font-semibold` |
| Font family | Noto Sans Thai เท่านั้น (ตรงกับ CLAUDE.md อยู่แล้ว) |
| Icon stroke-width | **1** (spec อ้างอิง Lucide แต่ project นี้ใช้ inline SVG ตาม CLAUDE.md — วาด path ให้เทียบเท่า Lucide icon ที่ระบุ ที่ `strokeWidth={1}`, ไม่ใช้ patch จริงจาก lucide-react) |
| Type scale | Body2 (14px = `text-sm`) สำหรับ description/label ทั่วไป · Caption1 (12px = `text-xs`) สำหรับ timestamp/meta เท่านั้น — **ห้ามใช้ `text-xs` เป็น default ของ description** |
| Heading ในหน้า product | H5 18px (drawer/modal title) · H6 16px (section title) — ทั้งคู่ Bold 700 |
| No uppercase | Sentence case เท่านั้น |
| Modal | bg white, border `neutral-100` (≈ `border-gray-100`), radius 24px (`rounded-2xl` ตรงอยู่แล้ว), shadow-xl, backdrop `rgba(22,23,25,.45)`, size S=400px/M=560px/L=720px ตามเนื้อหา |
| Color | ใช้ token ของ project (`freshket-*`, `gray-*`) ต่อไป — **ไม่ต้อง rename เป็น `dark-green-*`/`neutral-*`** เพราะ `freshket-500 (#00ce7c)` ตรงกับ `green-fresh.600` ใน `tokens.json` อยู่แล้ว พาเลตต์เข้ากันได้ 1:1 |
| No gradient, no shadow บน primary button, 1 primary CTA ต่อหน้าจอ | ตรงกับ convention เดิมของ project อยู่แล้ว |

**หลักการ**: โหลด `RULES.md` ก่อนเสมอ → โหลดเฉพาะ `guidelines/` ไฟล์ที่ตรงกับ component ที่กำลังทำ → apply กฎข้างบนกับ Tailwind class ที่มีอยู่ (ไม่ต้อง migrate ไป CSS variable ใหม่ทั้งระบบ)

---

### 2. `debug-mantra`

**Source**: `https://github.com/thananon/9arm-skills` — `skills/engineering/debug-mantra`

**เรียกใช้เมื่อ**:
- มี bug ที่ reproduce ไม่ได้หรือ flaky
- ต้องการ debug อย่างเป็นระบบ
- ติดปัญหาแล้วไม่รู้จะเริ่มจากตรงไหน

**หลักการ** (4 ขั้น เรียงตามลำดับเสมอ):
1. Reproducibility — สร้าง repro ที่ reliable ก่อนทำอะไรทั้งนั้น
2. Know the fail path — debugger → source trace → in-code instrumentation
3. Falsify hypothesis — หา 3–5 candidate, disprove ก่อน confirm
4. Cross-reference breadcrumbs — ทุก run คือหลักฐาน, hypothesis ใหม่ต้องอธิบาย run เก่าทั้งหมดได้

---

### 3. `post-mortem`

**Source**: `https://github.com/thananon/9arm-skills` — `skills/engineering/post-mortem`

**เรียกใช้เมื่อ**:
- fix bug เสร็จแล้วต้องการ document root cause
- ทำ post-mortem หลัง incident
- เขียน engineering record ของ bug fix

**หลักการ**: ต้องมี 4 inputs ครบก่อน draft: repro, root cause, fix, validation — ไม่ draft ถ้า input ขาด ใช้ blameless analysis เสมอ

---

### 4. `scrutinize`

**Source**: `https://github.com/thananon/9arm-skills` — `skills/engineering/scrutinize`

**เรียกใช้เมื่อ**:
- review plan, PR, หรือ code change จาก perspective ภายนอก
- ต้องการ challenge ว่า approach นี้จำเป็นไหม หรือมีวิธีที่ simpler กว่า
- ต้องการ trace actual execution path ไม่ใช่แค่ diff

**หลักการ** (4 ขั้น):
1. Intent assessment — goal คืออะไร, จำเป็นไหม, มี lighter alternative ไหม
2. Code path tracing — trace จริงผ่าน code รวม context ที่ไม่ได้เปลี่ยน
3. Verification — verify claim ทุกข้อ, probe edge cases
4. Report — เรียง severity, cite `file:line`, จบด้วย verdict: ship / fix-then-ship / rework / reject

---

### 5. `management-talk`

**Source**: `https://github.com/thananon/9arm-skills` — `skills/productivity/management-talk`

**เรียกใช้เมื่อ**:
- ต้องการเขียน/เขียนใหม่ update สำหรับ manager, VP, director, PM
- ขอ executive summary, leadership update, status update
- "make this less technical" / "ทำให้ไม่ technical"
- ต้องการ Slack post, email, standup note, meeting talking-points จากงาน engineering

**Channel formats**:
- **JIRA/Report** → bolded sections: Status, Impact, What broke, Why now, Owner, Next steps
- **Slack** → TL;DR bold บรรทัดแรก + 2–4 bullets, ≤80 words
- **Standup** → 1–3 lines: `<state> <thing>. <owner>. <next>.`
- **Email** → Subject = TL;DR noun phrase, body = JIRA format as paragraphs
- **Meeting** → bullet fragments เรียงตาม speaking order

---

### 6. `ponytail-review`

**Source**: `https://github.com/DietrichGebert/ponytail` — `skills/ponytail-review`

**เรียกใช้เมื่อ**:
- review diff สำหรับ over-engineering
- "อะไรลบได้บ้าง", "เยอะเกินไปไหม", "simplify review"
- ต้องการหา abstraction ที่ไม่จำเป็น, dead code, reinvented stdlib

**Output format**: `L<line>: <tag> <description>. <replacement>.`
Tags: `delete:` | `stdlib:` | `native:` | `yagni:` | `shrink:`
จบด้วย: `net: -<N> lines possible.` หรือ "Lean already. Ship."

**ไม่ครอบคลุม**: correctness bugs, security, performance — ใช้ `/code-review` สำหรับสิ่งเหล่านั้น

---

### 7. `ponytail-audit`

**Source**: `https://github.com/DietrichGebert/ponytail` — `skills/ponytail-audit`

**เรียกใช้เมื่อ**:
- "audit codebase ทั้งหมด", "find bloat", "อะไรในทั้ง repo ที่ลบได้"
- ต้องการ ranked list ของสิ่งที่ควรลบหรือ simplify ทั้ง project

**หลักการ**: scan ทั้ง repo (ไม่ใช่แค่ diff) → ranked findings → จบด้วยประมาณการ lines removed + dependency reductions read-only เท่านั้น ไม่แก้ code

---

### 8. `ponytail-debt`

**Source**: `https://github.com/DietrichGebert/ponytail` — `skills/ponytail-debt`

**เรียกใช้เมื่อ**:
- ต้องการ compile deferred shortcuts / tech debt เป็น actionable ledger
- "tech debt ใน project มีอะไรบ้าง"

---

### 9. `ponytail-help`

**Source**: `https://github.com/DietrichGebert/ponytail` — `skills/ponytail-help`

**เรียกใช้เมื่อ**:
- ต้องการ quick reference ว่า ponytail skills มีอะไรบ้างและใช้ยังไง

---

### 10. `apply-design`

**Source**: `.claude/skills/apply-design/SKILL.md` (project skill)

**เรียกใช้เมื่อ**:
- `/apply-design` — apply DS 2026 spec ทั้ง card, badge, shadow ให้ webapp นี้
- ต้องการ enforce DS-#068 (border rgba), DS-#042 (no badge border), DS-#124 (hover rule)
- "แก้ card ให้ตรง design", "fix badge ให้ไม่มี border", "apply design system"

**หลักการ**: อ่าน `design.md` ก่อนทุกครั้ง → apply CSS variables → fix globals.css → scan components → fix clickable cards ให้มี hover shadow+lift → ไม่แตะ logic หรือ data

---

## Matt Pocock — Skills For Real Engineers

**Source**: `https://github.com/mattpocock/skills` — ติดตั้งจริงแล้วใน `.claude/skills/` (ชุด curated 13 ตัว)

**Auto-trigger** = Claude เรียกเองเมื่อ prompt ตรงเงื่อนไข · **User-invoked** = ต้องพิมพ์ `/<ชื่อ>` เอง (skill ตั้ง `disable-model-invocation: true`)

**ไม่ได้ติดตั้ง**: `code-review` (ชื่อชนกับ built-in `/code-review` ที่ใช้อยู่), issue-tracker flow (`triage`, `to-tickets`, `to-spec`, `wayfinder`, `setup-matt-pocock-skills`) เพราะต้องผูกกับ GitHub Issues/Linear ก่อน, `ask-matt` (router ที่ชี้ไป skill ที่เราไม่ได้ลง), misc + in-progress packs

### 11. `diagnosing-bugs` — auto-trigger

**เรียกใช้เมื่อ**: "debug", "diagnose", "พัง", "error", "throw", "test fail", "ช้าผิดปกติ" — bug ยาก หรือ performance regression

**หลักการ**: Phase 1 สร้าง feedback loop ที่ reproduce ได้ก่อน → Phase 2 หา fail path → Phase 3 falsify hypothesis → Phase 4 fix + ยืนยัน
**ต่างจาก `debug-mantra` ยังไง**: เนื้อหาทับกันมาก — `diagnosing-bugs` เป็นตัวที่ติดตั้งจริงและมี HITL loop script ให้ ส่วน `debug-mantra` เป็น mantra 4 ข้อสั้นๆ ใช้ตัวไหนก็ได้ ไม่ต้องรันทั้งคู่

### 12. `tdd` — auto-trigger

**เรียกใช้เมื่อ**: อยากทำ feature/bugfix แบบ test-first, พูดถึง "red-green-refactor", "เขียน test ก่อน", integration test
**หลักการ**: red → green loop + นิยามว่า test ที่ดีคืออะไร, วางไว้ตรงไหน, anti-pattern อะไรห้ามทำ (ดู `tests.md`, `mocking.md`)

### 13. `codebase-design` — auto-trigger

**เรียกใช้เมื่อ**: ออกแบบ/ปรับ interface ของ module, หา seam, ทำให้ code testable หรือ AI-navigable
**หลักการ**: deep module — behaviour เยอะหลัง interface เล็ก (ดู `DEEPENING.md`, `DESIGN-IT-TWICE.md`)

### 14. `domain-modeling` — auto-trigger

**เรียกใช้เมื่อ**: อยากล็อกศัพท์ใน domain (ubiquitous language), เขียน ADR, บันทึก architectural decision
**Output**: `CONTEXT.md` (glossary) + ADR files

### 15. `prototype` — auto-trigger

**เรียกใช้เมื่อ**: อยากลองว่า state model / logic / UI shape เวิร์กไหม ก่อนลงมือจริง — code แบบทิ้งได้

### 16. `research` — auto-trigger

**เรียกใช้เมื่อ**: ขอให้ค้นเรื่องใดเรื่องหนึ่งจาก primary source (official docs, source code, spec) แล้วสรุปเป็นไฟล์ Markdown
**หลักการ**: spin background agent → อ้าง source ทุก claim → ห้ามอ้าง blog สรุปต่อ

### 17. `resolving-merge-conflicts` — auto-trigger

**เรียกใช้เมื่อ**: ติด merge/rebase conflict อยู่
**หลักการ**: หา intent เดิมของแต่ละฝั่งจาก commit/PR ก่อน แล้วค่อย resolve — ห้าม `--abort`, ห้ามคิด behaviour ใหม่เอง

### 18. `grilling` — auto-trigger

**เรียกใช้เมื่อ**: อยากให้ challenge แผน/ไอเดีย/decision, "grill me", "ซักให้หน่อย", "แผนนี้มีรูรั่วตรงไหน"
**หลักการ**: ถามทีละข้อ (ห้ามยิงรวด) + แนบคำตอบที่แนะนำทุกข้อ + ห้ามลงมือทำจนกว่าจะ confirm ว่าเข้าใจตรงกัน

### 19. `/grill-me` — user-invoked

Shortcut เรียก `grilling` แบบตรงๆ

### 20. `/implement` — user-invoked

ลงมือ implement ตาม spec/ticket ที่คุยกันไว้ — ใช้ `tdd` ตรง seam ที่ตกลงกัน, typecheck ระหว่างทาง, รัน test ครบตอนจบ

### 21. `/handoff` — user-invoked

ย่อบทสนทนาปัจจุบันเป็น handoff doc (เซฟลง temp dir ไม่ใช่ repo) ให้ agent session ใหม่มารับงานต่อ

### 22. `/teach` — user-invoked

โหมดสอน — เก็บ state การเรียนรู้ข้ามหลาย session (mission / learning record / glossary / resources)

### 23. `/writing-great-skills` — user-invoked

Reference สำหรับตอนเขียนหรือแก้ skill เอง (เช่นเวลาจะเพิ่ม skill ใหม่ในไฟล์นี้)

---

## Design Rules ที่บังคับกับทุก Skill

เมื่อ skill ใดทำงาน UI ต้องปฏิบัติตาม CLAUDE.md เสมอ:

| Rule | Value |
|---|---|
| Icons | SVG inline เท่านั้น (ห้าม lucide/heroicons เว้นแต่ติดตั้งอยู่แล้ว) |
| Font | `'Noto Sans Thai', 'Inter', sans-serif` |
| Primary color | `freshket-500` = `#00ce7c` |
| Background | `white` หรือ `slate-50` เท่านั้น (ห้าม gradient เป็น bg หลัก) |
| Minimum text size | `text-xs` (12px) |
| Card radius | `rounded-2xl` |
| Badge style | Pastel pill — `bg-freshket-100 text-freshket-700 border border-freshket-200` |
