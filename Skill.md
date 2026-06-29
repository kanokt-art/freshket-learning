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

**Design system ของ project นี้** → ดูที่ `CLAUDE.md` section "Design Tokens" และ "Component Patterns"

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
