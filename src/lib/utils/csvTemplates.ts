// Downloadable CSV templates for every import screen.
//
// Admins were expected to produce an upload file from a description — a line
// of help text naming the columns, or, for the two positional formats, a
// numbered list of sixteen or thirty-six of them. Getting one cell out of
// order fails at parse time with an error about row 2, which is the wrong
// place to find out. A template moves that feedback to before the work:
// download, fill in, upload.
//
// WHY THESE DEFINITIONS LIVE TOGETHER
//
// Each template is the other half of a parser, and the two drift apart
// silently — nothing fails when a template stops matching, the admin's file
// just stops importing. Keeping them in one module, each one naming the
// parser it feeds, is what makes the pair reviewable in a single place.
// tests/unit/csvTemplates.test.ts closes the loop by running the generated
// templates back through the real parsers.
//
// POSITIONAL vs NAMED
//
// Two of the four parsers read columns by POSITION and discard the header row
// entirely (employees, roleplay). For those the header text in the template is
// documentation only — the column ORDER is the contract, and a filler column
// must stay in place even though nothing reads it. The other two resolve
// columns by NAME (resolveColumn: exact → prefix → substring), so their header
// spelling matters and their order does not.

export interface CsvTemplate {
  /** File name offered to the browser. */
  filename: string
  /** Shown on the download control. */
  label: string
  /** Header row. For positional formats this is documentation; order is the contract. */
  headers: string[]
  /**
   * One or two example rows, using data that is obviously fake. Real-looking
   * names and emails get left in the file and imported by accident.
   */
  sampleRows: string[][]
}

/**
 * Employee master data — /users → "นำเข้า CSV".
 *
 * POSITIONAL, 16 columns, parsed by parseCsvToProfiles in
 * src/app/(dashboard)/users/page.tsx. Columns 0, 3, 7, 11 and 13 are read by
 * nobody but must still be present so the ones after them land on the right
 * index. This mirrors the HR export's own layout, so a file exported from HR
 * can be uploaded unchanged.
 */
export const EMPLOYEE_TEMPLATE: CsvTemplate = {
  filename: 'freshket-employees-template.csv',
  label: 'ดาวน์โหลดเทมเพลต CSV',
  headers: [
    'ems',                    // 0  unused
    'Status',                 // 1  employmentStatus — only "Active" counts as active
    'Emp.ID',                 // 2  employeeId — also the uid seed (csv-{empId})
    'Title',                  // 3  unused
    'Name-Surname (TH)',      // 4  displayName
    'Name-Surname (Eng)',     // 5  displayNameEN
    'Nick name',              // 6  nickname
    'Tel.',                   // 7  unused
    'Department',             // 8  department — drives Phase 1 access
    'Rank',                   // 9  rank
    'Position',               // 10 position
    'Location',               // 11 unused
    'Start Date',             // 12 startDate
    'Last Date',              // 13 unused
    'Line Manager',           // 14 lineManager
    'Company Email',          // 15 email — @freshket.co
  ],
  sampleRows: [
    ['', 'Active', 'EMP001', 'นาย', 'ตัวอย่าง ทดสอบ', 'Example Test', 'ตัวอย่าง', '',
     'Sales Management', 'Staff', 'Sales Executive', '', '01/01/2026', '', 'ชื่อหัวหน้า', 'example@freshket.co'],
    ['', 'Active', 'EMP002', 'นางสาว', 'ทดสอบ ระบบ', 'Test System', 'ทดสอบ', '',
     'Key Account Management', 'Supervisor', 'Key Account Executive', '', '15/02/2026', '', 'ชื่อหัวหน้า', 'test@freshket.co'],
  ],
}

/**
 * Pre/Post assessment scores — the ImportAssessmentModal on /users.
 *
 * NAMED columns, parsed by parseAssessmentCSV. Shaped like the Google-Forms
 * export it is normally fed, because that is what admins have on hand; the
 * parser ignores every other column the export carries.
 *
 * `Score` is written as a fraction because that is what a Forms quiz exports,
 * and the parser accepts it. The format note on the modal still applies to a
 * real export: a spreadsheet will turn 6/10 into a date unless the column is
 * set to plain text first.
 *
 * `Type` must contain the ASCII marker "Pre Test" or "Post Test" — that
 * substring is the whole detection rule, so surrounding Thai text is fine.
 */
export const ASSESSMENT_SCORE_TEMPLATE: CsvTemplate = {
  filename: 'freshket-assessment-scores-template.csv',
  label: 'ดาวน์โหลดเทมเพลต CSV',
  headers: ['Timestamp', 'Email Address', 'Score', 'Type'],
  sampleRows: [
    ['01/01/2026 09:00:00', 'example@freshket.co', '6/10', 'แบบทดสอบก่อนเรียน (Pre Test)'],
    ['01/01/2026 16:00:00', 'example@freshket.co', '9/10', 'แบบทดสอบหลังเรียน (Post Test)'],
  ],
}

/**
 * Per-course results — CourseResultsImport (the admin picks the course in the
 * UI, so the file carries no course id).
 *
 * NAMED columns, parsed by parseCourseScoreText. Email and type are required:
 * type is `pre` (before the course) or `post` (after), one row per sitting, so a
 * person normally has two rows. Score, status and completedAt may be blank. Score
 * takes a plain 0–100 or an N/M fraction. Status must be one of the four
 * TrainingStatus values, and blank means completed — but only a `post` row sets
 * the course status; a `pre` row never finishes a course.
 *
 * Uploading the file again replaces the stored values with the file's.
 */
export const COURSE_RESULT_TEMPLATE: CsvTemplate = {
  filename: 'freshket-course-results-template.csv',
  label: 'ดาวน์โหลดเทมเพลต CSV',
  headers: ['employeeEmail', 'type', 'score', 'status', 'completedAt'],
  sampleRows: [
    ['example@freshket.co', 'pre', '60', '', '01/01/2026'],
    ['example@freshket.co', 'post', '85', 'completed', '01/20/2026'],
    ['test@freshket.co', 'post', '', 'in_progress', ''],
  ],
}

/**
 * Roleplay assessment results — RoleplayResultsImport.
 *
 * POSITIONAL, 36 columns, parsed by parseRoleplayText against RP_SCORE_COLS
 * and RP_NOTE_COLS. The 25 ratings and 5 section notes are interleaved at
 * fixed indices, so this is the format where hand-building a file is most
 * likely to go wrong and a template earns the most.
 *
 * Two things the header row does NOT control, and that the parser checks or
 * assumes instead:
 *   · the guard requires ≥35 columns with "email" in col 1 and "name" in col 2
 *   · the subject is matched from Name (col 2), while Email (col 1) is the
 *     ASSESSOR — they are different people, and swapping them silently
 *     attributes every score to the wrong person
 *
 * A Name containing "test" or "round" is treated as the trainer's own trial
 * run and skipped, which is why the sample rows below use neither word.
 */
export const ROLEPLAY_TEMPLATE: CsvTemplate = {
  filename: 'freshket-roleplay-template.csv',
  label: 'ดาวน์โหลดเทมเพลต CSV',
  headers: [
    'Timestamp',                      // 0  takenAt
    'Email Address',                  // 1  assessor (NOT the person being scored)
    'Name',                           // 2  subject — matched by nickname/name
    'Section',                        // 3  unused
    'Team',                           // 4  team
    'ครั้งที่สอบ',                      // 5  round — 1 = pre, 2+ = post
    'เตรียมข้อมูลลูกค้า / ธุรกิจ',        // 6
    'วาง Key to Win และเป้าหมาย',      // 7
    'ทักทายสุภาพ / ปกป้องแบรนด์',      // 8
    'แนะนำตัว / บริษัท',               // 9
    'ลูกค้าเข้าใจ Freshket',            // 10
    'หมายเหตุ Greeting',              // 11 note
    'Check',                          // 12
    'Order',                          // 13
    'Receive',                        // 14
    'Pay',                            // 15
    'Billing',                        // 16
    'เจาะข้อมูลสินค้า / ต้องการค้าขายเพิ่ม', // 17
    'Active Listening',               // 18
    'Pain Point',                     // 19
    'Insight Capture',                // 20
    'หมายเหตุ Discovery',             // 21 note
    'เสนอสินค้าตรง Pain',              // 22
    'ปรับให้เหมาะสมบริบท',             // 23
    'ใช้ความรู้สึกลูกค้า',               // 24
    'หมายเหตุ Solution',              // 25 note
    'เดินหน้าวันนี้',                    // 26
    'ขอ Commitment ตรงๆ',            // 27
    'ติดการขายมืออาชีพ',               // 28
    'หมายเหตุ Closing',               // 29 note
    'อธิบายการใช้งานระบบ / ลงทะเบียน',  // 30
    'สื่อสารผ่าน LINE OA',             // 31
    'มีผลติดตาม',                      // 32
    'ใช้ Pain หลังขาย',                // 33
    'ลูกค้าจำได้',                      // 34
    'หมายเหตุ Follow Up',             // 35 note
  ],
  sampleRows: [
    [
      '01/01/2026 10:00:00', 'assessor@freshket.co', 'ชื่อเล่นผู้ถูกประเมิน', '', 'Sales A', 'ครั้งที่ 1',
      '8', '7',                          // preparation
      '9', '8', '7', 'ทักทายได้ดี',        // greeting + note
      '8', '7', '8', '7', '6', '7', '8', '7', '6', 'ถามได้ครบ',  // discovery + note
      '8', '7', '8', 'เสนอตรงจุด',        // solution + note
      '7', '8', '7', 'ปิดการขายดี',        // closing + note
      '8', '7',                          // tools
      '7', '8', '7', 'ติดตามสม่ำเสมอ',     // follow up + note
    ],
  ],
}

/**
 * Serialize a template to CSV text.
 *
 * Quoting follows RFC 4180 and is applied only where it is needed — a cell
 * containing a comma, a quote, or a newline. Thai text needs none of it, so
 * most cells stay bare and the file is readable in a plain editor.
 */
export function toCsvText(template: CsvTemplate): string {
  const escape = (cell: string): string =>
    /[",\n\r]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell

  return [template.headers, ...template.sampleRows]
    .map((row) => row.map(escape).join(','))
    .join('\r\n')
}

/**
 * Trigger a download of the template in the browser.
 *
 * The BOM is load-bearing, not decoration: Excel on Windows reads a BOM-less
 * UTF-8 CSV as the system ANSI codepage, which turns every Thai column header
 * into mojibake the moment the admin opens the file. It costs three bytes and
 * the parsers strip it (`replace(/^﻿/, '')`), so it is safe to always
 * include.
 *
 * CRLF for the same reason — it is what Excel expects.
 */
export function downloadCsvTemplate(template: CsvTemplate): void {
  const blob = new Blob(['﻿' + toCsvText(template)], {
    type: 'text/csv;charset=utf-8;',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = template.filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  // Revoking immediately can cancel the download in some browsers; a tick is
  // enough for the click to have been handed off.
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
