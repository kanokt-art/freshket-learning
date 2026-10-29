/**
 * Freshket — คะแนนแบบทดสอบ (Google Form) → ระบบ Sale Tracking
 *
 * อ่านแท็บ assessment_* ของชีต HR (แต่ละแท็บ = Google Form ของหลักสูตรหนึ่ง) แล้วส่งขึ้น
 * POST /api/sheets/course-scores-sync ทีละหลักสูตร ระบบจะ
 *   - จับอีเมลกับพนักงาน แล้วเก็บคะแนนก่อนเรียน (Pre) และหลังเรียน (Post) ไว้ใน record เดียวต่อคน
 *   - ใช้ค่าจากชีตเป็นหลักเสมอ: ส่งซ้ำกี่รอบผลก็เหมือนเดิม และถ้าแก้คะแนนในชีต รอบหน้าจะอัปเดตตาม
 *   - ช่องที่ชีตไม่มี (เช่นยังไม่มีแถวหลังเรียน) จะคงค่าเดิมไว้
 *
 * ── SETUP (ทำครั้งเดียว) ───────────────────────────────────────────────
 * 1. Project Settings → Script Properties → เพิ่ม
 *      SYNC_SECRET = ค่าเดียวกับ SHEETS_SYNC_SECRET บน Vercel
 * 2. รัน checkSetup()  — ตรวจว่าเห็นแท็บอะไรบ้าง แต่ละแท็บ map กับหลักสูตรไหน และมีหัวคอลัมน์ครบไหม
 * 3. รัน syncNow()     — ส่งทุกแท็บที่ map แล้ว (ครั้งแรก Google จะขอสิทธิ์)
 * 4. รัน setupTriggers() — sync ทุกเที่ยงคืน + ทุกครั้งที่มีคนส่งฟอร์ม
 *
 * แท็บที่ยังไม่อยู่ใน COURSE_BY_TAB จะถูกข้ามและรายงานให้เห็น ไม่เดา
 *
 * แท็บ "Shadow" (บันทึก visit ของ sale จาก Google Form) ส่งไป /api/sheets/shadow-sync เป็นบันทึก Shadow Visit
 * โดยไม่ผ่านคอร์ส: ส่งซ้ำได้ ไม่เกิดบันทึกซ้ำ ยึดค่าจากชีต และไม่แจ้งเตือนใคร
 */

var SPREADSHEET_ID = '1n0cn6ig1STi04nA4zX4doeF1Ro7P2qQu2aRKptQEcbo' // ชีต HR ที่มีแท็บ assessment_*
var SYNC_URL = 'https://freshket-learning.vercel.app/api/sheets/course-scores-sync'
var SHADOW_URL = 'https://freshket-learning.vercel.app/api/sheets/shadow-sync'
var SHADOW_TAB = 'shadow'   // ชื่อแท็บ ไม่สนตัวพิมพ์

// หัวคอลัมน์ของฟอร์ม Shadow (ไม่สนตัวพิมพ์) → ฟิลด์ที่ส่งไประบบ  (Slack Status ไม่ส่ง)
var SHADOW_COLUMNS = {
  'timestamp': 'timestamp',
  'observer email': 'observerEmail',
  'mentor fullname': 'mentorFullname',
  'mentor name': 'mentorName',
  'mentor position': 'mentorPosition',
  'mentor email': 'mentorEmail',
  'store name': 'storeName',
  'segment': 'segment',
  'persona': 'persona',
  'opening/hook': 'opening',
  'interest point': 'interestPoint',
  'customer pain': 'customerPain',
  'diagnostic approach': 'diagnosticApproach',
  'closing/next step': 'closingNextStep',
}

// ชื่อแท็บ (ตัดคำว่า assessment_ ออก, ไม่สนตัวพิมพ์) → รหัสหลักสูตรในระบบ
// ใส่เฉพาะที่แน่ใจ แท็บที่ไม่อยู่ในนี้จะไม่ถูกส่ง
var COURSE_BY_TAB = {
  'competitive landscape & restaurant 101': 'xqlKFVgE4Mc17r8yRjOg', // Restaurant 101 & Competitive Landscape
  'product knowledge': 'AdHE2d6380OvVpYHX0ES',                      // Product Knowledge & Product to sell
  // 'visit iyr': '???',   // ยังไม่ระบุหลักสูตร
  // 'shadow': '???',      // ยังไม่ระบุ — Shadow เป็นแบบฟอร์มอีกชนิดหนึ่ง
}

var EMAIL_HEADERS = ['email address', 'email', 'อีเมล', 'company email']
var SCORE_HEADERS = ['score', 'คะแนน']
var TYPE_HEADERS = ['type', 'ประเภท']
var TIME_HEADERS = ['timestamp', 'เวลา']

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Course Scores Sync')
    .addItem('ตรวจการตั้งค่า', 'checkSetup')
    .addItem('Sync now', 'syncNow')
    .addSeparator()
    .addItem('ตั้ง trigger (เที่ยงคืน + เมื่อส่งฟอร์ม)', 'setupTriggers')
    .addItem('ลบ trigger', 'removeTriggers')
    .addToUi()
}

function secret_() {
  var v = PropertiesService.getScriptProperties().getProperty('SYNC_SECRET')
  if (!v) throw new Error('ยังไม่ได้ตั้ง Script Property: SYNC_SECRET')
  return v
}

function spreadsheet_() {
  return SpreadsheetApp.openById(SPREADSHEET_ID)
}

function isAssessmentTab_(name) {
  return String(name).trim().toLowerCase().indexOf('assess') !== -1
}

/** "assessment_Product Knowledge" → "product knowledge" */
function tabKey_(name) {
  return String(name).replace(/assess?ment[_ \-]*/i, '').trim().toLowerCase()
}

function findCol_(headers, names) {
  for (var i = 0; i < headers.length; i++) {
    if (names.indexOf(String(headers[i]).trim().toLowerCase()) !== -1) return i
  }
  return -1
}

/** อ่านหนึ่งแท็บ → { rows, problem } โดย rows = [{email,type,score,timestamp}] */
function readTab_(sheet) {
  var lastRow = sheet.getLastRow()
  var lastCol = sheet.getLastColumn()
  if (lastRow < 2 || lastCol < 1) return { rows: [], problem: null }

  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0]
  var ci = findCol_(headers, EMAIL_HEADERS)
  var cs = findCol_(headers, SCORE_HEADERS)
  var ct = findCol_(headers, TYPE_HEADERS)
  var cd = findCol_(headers, TIME_HEADERS)
  var missing = []
  if (ci < 0) missing.push('Email')
  if (cs < 0) missing.push('Score')
  if (ct < 0) missing.push('Type')
  if (missing.length) return { rows: [], problem: 'ไม่พบคอลัมน์ ' + missing.join(', ') }

  var n = lastRow - 1
  // getDisplayValues สำหรับคะแนน: "6/10" ไม่ถูก Sheets แปลงเป็นวันที่; getValues สำหรับเวลา
  var shown = sheet.getRange(2, 1, n, lastCol).getDisplayValues()
  var values = cd >= 0 ? sheet.getRange(2, 1, n, lastCol).getValues() : null
  var rows = []
  for (var r = 0; r < n; r++) {
    var email = String(shown[r][ci]).trim().toLowerCase()
    if (!email || email.indexOf('#ref!') !== -1) continue
    var ts = values && values[r][cd] instanceof Date ? values[r][cd].toISOString() : ''
    rows.push({ email: email, type: String(shown[r][ct]).trim(), score: String(shown[r][cs]).trim(), timestamp: ts })
  }
  return { rows: rows, problem: null }
}

function post_(courseId, rows) {
  var res = UrlFetchApp.fetch(SYNC_URL, {
    method: 'post',
    contentType: 'application/json',
    headers: { 'x-sync-secret': secret_() },
    payload: JSON.stringify({ courseId: courseId, rows: rows }),
    muteHttpExceptions: true,
  })
  var code = res.getResponseCode()
  var text = res.getContentText()
  var json = null
  try { json = JSON.parse(text) } catch (e) { /* ไม่ใช่ JSON */ }
  if (code < 200 || code >= 300) throw new Error('HTTP ' + code + ': ' + ((json && json.error) || text.slice(0, 150)))
  return json
}

/** sync ทุกแท็บที่ map แล้ว (หรือเฉพาะ tabName ที่ระบุ) คืนรายงานเป็นบรรทัด */
function runSync_(onlyTab) {
  var lines = []
  var failed = 0
  spreadsheet_().getSheets().forEach(function (sheet) {
    var name = sheet.getName()
    if (!isAssessmentTab_(name)) return
    var key = tabKey_(name)
    if (onlyTab && key !== onlyTab) return

    var courseId = COURSE_BY_TAB[key]
    if (!courseId) { lines.push('ข้าม "' + name + '" — ยังไม่ได้ map กับหลักสูตร'); return }

    var read = readTab_(sheet)
    if (read.problem) { failed++; lines.push('ผิดพลาด "' + name + '" — ' + read.problem); return }
    if (!read.rows.length) { lines.push('"' + name + '" — ยังไม่มีข้อมูล'); return }

    try {
      var out = post_(courseId, read.rows)
      var line = '"' + name + '" → ' + out.course + ': ' + out.people + ' คน, บันทึก ' + out.written + ' (ใหม่ ' + out.created + ')'
      if (out.unmatched && out.unmatched.length) line += ', ไม่พบอีเมล ' + out.unmatched.length + ' (' + out.unmatched.slice(0, 5).join(', ') + ')'
      if (out.errorCount) { line += ', แถวที่ใช้ไม่ได้ ' + out.errorCount; failed++ }
      lines.push(line)
    } catch (e) {
      failed++
      lines.push('ผิดพลาด "' + name + '" — ' + e.message)
    }
  })
  if (!onlyTab) {
    var sh = syncShadow_()
    lines.push(sh.line)
    failed += sh.failed
  }
  PropertiesService.getScriptProperties().setProperty('LAST_SYNC', JSON.stringify({ at: new Date().toISOString(), ok: failed === 0, lines: lines }))
  Logger.log(lines.join('\n'))
  return { lines: lines, failed: failed }
}

function isShadowTab_(name) {
  return String(name).trim().toLowerCase() === SHADOW_TAB
}

/** อ่านแท็บ Shadow → { rows, problem } โดยจับคู่จากหัวคอลัมน์ ไม่ใช่ตำแหน่ง */
function readShadow_(sheet) {
  var lastRow = sheet.getLastRow()
  var lastCol = sheet.getLastColumn()
  if (lastRow < 2 || lastCol < 1) return { rows: [], problem: null }

  var headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0].map(function (h) { return String(h).trim().toLowerCase() })
  var field = {}
  headers.forEach(function (h, i) { if (SHADOW_COLUMNS[h] && field[SHADOW_COLUMNS[h]] === undefined) field[SHADOW_COLUMNS[h]] = i })
  var need = ['timestamp', 'observerEmail']
  var missing = need.filter(function (f) { return field[f] === undefined })
  if (missing.length) return { rows: [], problem: 'ไม่พบคอลัมน์ ' + missing.join(', ') }

  var n = lastRow - 1
  var shown = sheet.getRange(2, 1, n, lastCol).getDisplayValues()
  var values = sheet.getRange(2, 1, n, lastCol).getValues()
  var rows = []
  for (var r = 0; r < n; r++) {
    var email = String(shown[r][field.observerEmail]).trim()
    if (!email || email.indexOf('#ref!') !== -1) continue
    var row = {}
    Object.keys(field).forEach(function (f) { row[f] = String(shown[r][field[f]]).trim() })
    var ts = values[r][field.timestamp]
    row.timestamp = ts instanceof Date ? ts.toISOString() : ''
    rows.push(row)
  }
  return { rows: rows, problem: null }
}

function syncShadow_() {
  var sheet = null
  spreadsheet_().getSheets().forEach(function (s) { if (isShadowTab_(s.getName())) sheet = s })
  if (!sheet) return { line: 'ไม่พบแท็บ "Shadow"', failed: 0 }

  var read = readShadow_(sheet)
  if (read.problem) return { line: 'ผิดพลาด "Shadow" — ' + read.problem, failed: 1 }
  if (!read.rows.length) return { line: '"Shadow" — ยังไม่มีข้อมูล', failed: 0 }

  try {
    var res = UrlFetchApp.fetch(SHADOW_URL, {
      method: 'post', contentType: 'application/json', headers: { 'x-sync-secret': secret_() },
      payload: JSON.stringify({ rows: read.rows }), muteHttpExceptions: true,
    })
    var code = res.getResponseCode()
    var json = null
    try { json = JSON.parse(res.getContentText()) } catch (e) { /* ไม่ใช่ JSON */ }
    if (code < 200 || code >= 300) return { line: 'ผิดพลาด "Shadow" — HTTP ' + code + ': ' + ((json && json.error) || res.getContentText().slice(0, 120)), failed: 1 }
    var line = '"Shadow" → ' + json.written + ' visit (ใหม่ ' + json.created + ')'
    var failed = 0
    if (json.unmatched && json.unmatched.length) line += ', ไม่พบอีเมลผู้สังเกต ' + json.unmatched.length + ' (' + json.unmatched.slice(0, 5).join(', ') + ')'
    if (json.unknownChoices && json.unknownChoices.length) line += ', ค่า Segment/Persona ที่ระบบไม่มีในรายการ: ' + json.unknownChoices.slice(0, 5).join(', ')
    if (json.errorCount) { line += ', แถวที่ใช้ไม่ได้ ' + json.errorCount; failed = 1 }
    return { line: line, failed: failed }
  } catch (e) {
    return { line: 'ผิดพลาด "Shadow" — ' + e.message, failed: 1 }
  }
}

function syncNow() {
  var out = runSync_(null)
  try { SpreadsheetApp.getUi().alert((out.failed ? 'เสร็จ แต่มีปัญหา\n\n' : 'Sync เสร็จ\n\n') + out.lines.join('\n')) } catch (e) { /* จาก trigger ไม่มี UI */ }
  if (out.failed) throw new Error(out.lines.join(' | ')) // ให้ Executions ขึ้นเป็นรันที่ล้มเหลว
}

/** ทำงานเมื่อมีคนส่งฟอร์ม: ส่งเฉพาะแท็บที่เพิ่งมีแถวใหม่ (ทั้งแท็บ — ส่งซ้ำได้ ผลไม่เปลี่ยน) */
function onFormSubmit(e) {
  var name = e && e.range ? e.range.getSheet().getName() : null
  if (!name) return
  if (isShadowTab_(name)) {
    var sh = syncShadow_()
    Logger.log(sh.line)
    if (sh.failed) throw new Error(sh.line)
    return
  }
  if (!isAssessmentTab_(name)) return
  var out = runSync_(tabKey_(name))
  if (out.failed) throw new Error(out.lines.join(' | '))
}

/** ตรวจก่อนใช้จริง: เห็นแท็บอะไร map กับหลักสูตรไหน หัวคอลัมน์ครบไหม และต่อระบบได้ไหม */
function checkSetup() {
  var lines = []
  lines.push(PropertiesService.getScriptProperties().getProperty('SYNC_SECRET') ? 'มี SYNC_SECRET' : 'ไม่มี SYNC_SECRET — ตั้งใน Script Properties')
  spreadsheet_().getSheets().forEach(function (sheet) {
    var name = sheet.getName()
    if (!isAssessmentTab_(name)) return
    var read = readTab_(sheet)
    var course = COURSE_BY_TAB[tabKey_(name)]
    lines.push('"' + name + '": ' + (course ? 'map → ' + course : 'ยังไม่ map (จะถูกข้าม)') +
      (read.problem ? ' · ' + read.problem : ' · ' + read.rows.length + ' แถว'))
  })
  spreadsheet_().getSheets().forEach(function (sheet) {
    if (!isShadowTab_(sheet.getName())) return
    var read = readShadow_(sheet)
    lines.push('"' + sheet.getName() + '": ส่งเป็น Shadow Visit' + (read.problem ? ' · ' + read.problem : ' · ' + read.rows.length + ' แถว'))
  })
  var t = ScriptApp.getProjectTriggers().map(function (x) { return x.getHandlerFunction() })
  lines.push('trigger: ' + (t.length ? t.join(', ') : 'ยังไม่ได้ตั้ง'))
  Logger.log(lines.join('\n'))
  try { SpreadsheetApp.getUi().alert(lines.join('\n')) } catch (e) { /* ไม่มี UI */ }
  return lines
}

/** (สคริปต์นี้แทนสคริปต์เดิมที่เขียน Firestore + ชีต Training-Record ทั้งหมด) ตั้ง trigger: ทุกเที่ยงคืน (ช่วง 00:00–01:00) + เมื่อส่งฟอร์ม รันซ้ำได้ ไม่ซ้อน */
function setupTriggers() {
  removeTriggers()
  ScriptApp.newTrigger('syncNow').timeBased().atHour(0).nearMinute(0).everyDays(1).create()
  ScriptApp.newTrigger('onFormSubmit').forSpreadsheet(SPREADSHEET_ID).onFormSubmit().create()
  Logger.log('ตั้ง trigger แล้ว: เที่ยงคืน + onFormSubmit')
}

function removeTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var f = t.getHandlerFunction()
    // onAssessmentSubmit คือ trigger ของสคริปต์เดิม (เขียนลง Firestore) ซึ่งเลิกใช้แล้ว — ลบทิ้งไม่ให้ error ค้าง
    if (f === 'syncNow' || f === 'onFormSubmit' || f === 'onAssessmentSubmit') ScriptApp.deleteTrigger(t)
  })
}
