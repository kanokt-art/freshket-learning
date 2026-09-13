/**
 * Freshket LMS — export a Google Form's questions as JSON for the quiz importer.
 *
 * WHY THIS EXISTS
 * The LMS can already embed a Google Form, but an embedded form is a black box:
 * it grades itself, so the LMS never sees per-question results, can't enforce a
 * time limit or anti-cheat, and can't show an answer review. Pulling the
 * questions INTO the LMS turns a form into a real assessment. This script is the
 * bridge — Apps Script is the only place that can read a form's answer key.
 *
 * ── HOW TO USE ───────────────────────────────────────────────────────────────
 * 1. Open the Google Form → ⋮ (top right) → Apps Script.
 * 2. Paste this whole file, save.
 * 3. Run `exportQuestions` once and approve the permission prompt.
 * 4. Open View → Logs, copy the JSON that was printed.
 * 5. In the LMS: แบบทดสอบ → สร้างแบบทดสอบ → "นำเข้าจาก Google Form" → paste → ตรวจสอบ.
 *
 * For a form NOT open in front of you, use `exportQuestionsById` instead and
 * put the form id (the long string in its /d/<id>/edit URL) in FORM_ID below.
 *
 * ── WHAT CONVERTS, AND WHAT DOESN'T ──────────────────────────────────────────
 *   Google Form                         → LMS question type
 *   Multiple choice / Dropdown          → multiple_choice
 *   Checkboxes (พร้อมเฉลย)               → multiple_choice  (see the note below)
 *   Short answer / Paragraph            → open_ended
 *   Grid, date, time, file upload, ...  → skipped, and listed under `skipped`
 *
 * Points come from the form when it is a Quiz; anything else defaults to 1.
 *
 * Checkboxes are a lossy conversion: the LMS grades multiple_choice as exactly
 * ONE correct choice, so a checkbox question with two or more correct answers
 * can't be represented faithfully. Rather than silently mark only the first one
 * correct, those are skipped and reported — convert them by hand.
 */

// Only used by exportQuestionsById(). Leave blank when running exportQuestions()
// from inside the form itself.
var FORM_ID = ''

/** Run this from the Apps Script editor opened from the form. */
function exportQuestions() {
  var form = FormApp.getActiveForm()
  if (!form) {
    throw new Error('ไม่พบฟอร์ม — เปิด Apps Script จากในฟอร์มโดยตรง หรือใช้ exportQuestionsById แทน')
  }
  printExport_(form)
}

/** Run this when the script isn't bound to the form. Set FORM_ID first. */
function exportQuestionsById() {
  if (!FORM_ID) throw new Error('ยังไม่ได้ใส่ FORM_ID ที่ด้านบนของไฟล์')
  printExport_(FormApp.openById(FORM_ID))
}

function printExport_(form) {
  var result = buildExport_(form)

  Logger.log('===== คัดลอก JSON ด้านล่างนี้ไปวางในระบบ =====')
  Logger.log(JSON.stringify(result.payload, null, 2))
  Logger.log('===== จบ JSON =====')
  Logger.log('สรุป: นำเข้าได้ ' + result.payload.questions.length + ' ข้อ, ข้าม ' + result.skipped.length + ' ข้อ')

  if (result.skipped.length) {
    Logger.log('ข้อที่ข้าม (ต้องสร้างเองในระบบ):')
    result.skipped.forEach(function (s) { Logger.log('  - ' + s) })
  }
  if (!result.isQuiz) {
    Logger.log('หมายเหตุ: ฟอร์มนี้ไม่ได้เปิดโหมด Quiz จึงไม่มีเฉลย — ทุกข้อจะถูกตั้งเฉลยเป็นตัวเลือกแรกไว้ก่อน กรุณาแก้เฉลยในระบบหลังนำเข้า')
  }
  return result.payload
}

function buildExport_(form) {
  var isQuiz = form.isQuiz()
  var items = form.getItems()
  var questions = []
  var skipped = []
  var order = 0

  for (var i = 0; i < items.length; i++) {
    var item = items[i]
    var type = item.getType()
    var title = str_(item.getTitle())
    var label = 'ข้อ ' + (i + 1) + (title ? ' "' + title + '"' : '')

    // Section headers / images / videos aren't questions — skip quietly.
    if (type === FormApp.ItemType.PAGE_BREAK ||
        type === FormApp.ItemType.SECTION_HEADER ||
        type === FormApp.ItemType.IMAGE ||
        type === FormApp.ItemType.VIDEO) {
      continue
    }

    if (type === FormApp.ItemType.MULTIPLE_CHOICE || type === FormApp.ItemType.LIST) {
      var mc = type === FormApp.ItemType.MULTIPLE_CHOICE
        ? item.asMultipleChoiceItem()
        : item.asListItem()
      var q = choiceQuestion_(mc, title, order, isQuiz)
      if (q) { questions.push(q); order++ }
      else skipped.push(label + ' — ไม่มีตัวเลือก')
      continue
    }

    if (type === FormApp.ItemType.CHECKBOX) {
      var cb = item.asCheckboxItem()
      var correctCount = countCorrect_(cb.getChoices())
      if (correctCount > 1) {
        // Deliberately not auto-converted — see the header note.
        skipped.push(label + ' — Checkbox ที่มีเฉลยมากกว่า 1 ข้อ (ระบบรองรับเฉลยเดียว)')
      } else {
        var qc = choiceQuestion_(cb, title, order, isQuiz)
        if (qc) { questions.push(qc); order++ }
        else skipped.push(label + ' — ไม่มีตัวเลือก')
      }
      continue
    }

    if (type === FormApp.ItemType.TEXT || type === FormApp.ItemType.PARAGRAPH_TEXT) {
      var ti = type === FormApp.ItemType.TEXT ? item.asTextItem() : item.asParagraphTextItem()
      questions.push({
        order: order,
        type: 'open_ended',
        text: title,
        description: str_(ti.getHelpText()) || undefined,
        points: isQuiz ? (ti.getPoints() || 1) : 1,
        sampleAnswer: '',
      })
      order++
      continue
    }

    skipped.push(label + ' — ระบบยังไม่รองรับคำถามชนิดนี้')
  }

  return {
    isQuiz: isQuiz,
    skipped: skipped,
    payload: {
      title: str_(form.getTitle()),
      description: str_(form.getDescription()),
      sourceFormUrl: form.getPublishedUrl(),
      questions: questions,
    },
  }
}

/**
 * Turn a choice-bearing item into an LMS multiple_choice question.
 *
 * A non-quiz form has no answer key at all, so the first choice is marked
 * correct as a placeholder — printExport_ warns about this so nobody publishes
 * a quiz whose every answer is "the first one".
 */
function choiceQuestion_(item, title, order, isQuiz) {
  var choices = item.getChoices()
  if (!choices || !choices.length) return null

  var correctIndex = -1
  if (isQuiz) {
    for (var i = 0; i < choices.length; i++) {
      if (choices[i].isCorrectAnswer()) { correctIndex = i; break }
    }
  }
  if (correctIndex === -1) correctIndex = 0

  return {
    order: order,
    type: 'multiple_choice',
    text: title,
    description: str_(item.getHelpText()) || undefined,
    points: isQuiz ? (item.getPoints() || 1) : 1,
    choices: choices.map(function (c, idx) {
      return { text: str_(c.getValue()), isCorrect: idx === correctIndex }
    }),
  }
}

function countCorrect_(choices) {
  var n = 0
  for (var i = 0; i < choices.length; i++) {
    // isCorrectAnswer() throws on a non-quiz form for some item types; treat
    // an error as "not marked correct" rather than failing the whole export.
    try { if (choices[i].isCorrectAnswer()) n++ } catch (e) { /* not a quiz */ }
  }
  return n
}

function str_(v) { return v === null || v === undefined ? '' : String(v).trim() }
