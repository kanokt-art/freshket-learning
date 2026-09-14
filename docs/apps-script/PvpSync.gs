/**
 * Freshket LMS — chunked sync driver for the PVP price sheet.
 *
 * Sheet     : https://docs.google.com/spreadsheets/d/1QPkrSSDREZazXBlw0ZiVsu5eCqJ-1ODcfk4U1Zzs3wQ/edit
 * Tab       : PVP  (~25,000 rows)
 *
 * Unlike ProductsSync.gs (which reads the sheet AND writes Firestore itself,
 * entirely inside Apps Script), this script does neither. It drives the
 * Next.js backend (POST /api/sheets/pvp-sync) through a paginated sync —
 * no row data is ever attached to a request, only offset/limit — and the
 * backend reads the PVP tab itself via the Sheets API (service account) and
 * writes Firestore `pvpPrices`.
 *
 * Why chunked, not one ping: at ~25k rows, a single request that reads the
 * whole sheet and writes it all to Firestore does not finish inside Vercel's
 * 60s Hobby-plan function ceiling (confirmed: FUNCTION_INVOCATION_TIMEOUT).
 * So the backend syncs one bounded slice of rows per call and reports
 * whether more remain; this script loops calls until the sheet is exhausted,
 * then makes one ?finalize=1 call to delete SKUs no chunk saw.
 *
 * Why debounced, not synced on every keystroke: onEdit fires per cell edit,
 * and a full ~9-chunk sync of 25k rows is too expensive to run on every one.
 * onEdit only marks the sheet dirty (a script property); a 5-minute
 * time-based trigger does the actual sync, and only if dirty.
 *
 * Note on quota: Firestore is on the free tier (20k writes/day) and the
 * sheet has ~25k rows, so the backend only writes rows whose values
 * actually changed since the last sync. A routine sync of a mostly-static
 * sheet therefore reports a large "unchanged" count and very few writes.
 * A first-time (or post-wipe) full load still exceeds one day's quota and
 * will need to run across two days, or the project moved to Blaze.
 *
 * ── SETUP ────────────────────────────────────────────────────────────────────
 * 1. Extensions → Apps Script (on this spreadsheet), paste this file.
 * 2. Share the spreadsheet (Viewer) with the Firebase service account email
 *    (FIREBASE_CLIENT_EMAIL in the app's .env.local) — the backend reads the
 *    sheet using that identity, not this script.
 * 3. Project Settings → Script Properties, add:
 *      SYNC_WEBHOOK_URL   https://<your-app-domain>/api/sheets/pvp-sync
 *      SYNC_SECRET        (same value as SHEETS_SYNC_SECRET in .env.local)
 * 4. Run `testSyncNow` once to confirm a full sync completes end-to-end.
 * 5. Run `createTriggers` once to wire up onEdit (marks dirty) + the
 *    5-minute drain trigger + a daily safety-net sync.
 *
 * ── HOW TO TELL IT ACTUALLY RAN ──────────────────────────────────────────────
 * - Apps Script → Executions log shows each chunk's HTTP status and counts.
 * - Firebase Console → Firestore → pvpPrices: a synced SKU has a fresh
 *   `updatedAt`.
 * - Firestore `pvpSyncRuns` should be EMPTY between syncs — a leftover doc
 *   there means a previous run's finalize step never completed (see
 *   `resumeStuckRun` below to recover without re-syncing from offset 0).
 */

var CHUNK_SIZE = 3000     // rows per backend call — keeps each request well under 60s
var DIRTY_KEY = 'pvp_dirty'
var RUN_KEY = 'pvp_active_run' // { runId, nextOffset } while a sync is in progress

function props_() {
  var p = PropertiesService.getScriptProperties()
  var v = {
    SYNC_WEBHOOK_URL: p.getProperty('SYNC_WEBHOOK_URL'),
    SYNC_SECRET: p.getProperty('SYNC_SECRET'),
  }
  for (var k in v) if (!v[k]) throw new Error('ยังไม่ได้ตั้ง Script Property: ' + k)
  return v
}

function callSync_(query) {
  var cfg = props_()
  var res = UrlFetchApp.fetch(cfg.SYNC_WEBHOOK_URL + '?' + query, {
    method: 'post',
    headers: { 'x-sync-secret': cfg.SYNC_SECRET },
    muteHttpExceptions: true,
  })
  var code = res.getResponseCode()
  var text = res.getContentText()
  if (code !== 200) throw new Error('Webhook ตอบกลับ HTTP ' + code + ': ' + text)
  return JSON.parse(text)
}

/**
 * Runs one full sync: loops chunk calls from offset 0 (or resumes an
 * in-progress run — see RUN_KEY) until the backend reports done, then
 * finalizes (deletes SKUs no chunk saw). Safe to call from a trigger that
 * fires every few minutes — if the PREVIOUS invocation already finished
 * (no dirty flag / no active run), this is a fast no-op.
 */
function runFullSync_() {
  var props = PropertiesService.getScriptProperties()
  var resuming = JSON.parse(props.getProperty(RUN_KEY) || 'null')

  var runId = resuming ? resuming.runId : null
  var offset = resuming ? resuming.nextOffset : 0
  var totals = { written: 0, unchanged: 0, skipped: 0, problems: [] }

  while (true) {
    var query = 'offset=' + offset + '&limit=' + CHUNK_SIZE + (runId ? '&runId=' + runId : '')
    var result = callSync_(query)
    runId = result.runId
    totals.written += result.written
    totals.unchanged += result.unchanged || 0
    totals.skipped += result.skipped
    totals.problems = totals.problems.concat(result.problems || [])

    Logger.log('PVP sync chunk offset=' + offset + ' → ' + result.written + ' written, ' +
      (result.unchanged || 0) + ' unchanged, ' + result.skipped + ' skipped')

    // Firestore's daily free-tier write quota ran out. The rows that landed
    // are saved; park the run here (keeping RUN_KEY and the dirty flag) so a
    // later tick — after the quota resets at midnight Pacific — resumes from
    // this same offset instead of restarting or skipping rows.
    if (result.quotaExhausted) {
      props.setProperty(RUN_KEY, JSON.stringify({ runId: runId, nextOffset: result.nextOffset }))
      Logger.log('PVP sync หยุดชั่วคราว — Firestore quota หมดแล้ววันนี้ ' +
        '(เขียนไปแล้ว ' + totals.written + ' รายการ). จะ sync ต่อเองหลังโควตารีเซ็ต')
      return totals
    }

    if (result.done) break
    offset = result.nextOffset
    // Persist progress BEFORE the next call — if this execution gets killed
    // mid-sync (Apps Script's own 6-minute ceiling on a long sheet), the next
    // trigger tick resumes from here instead of restarting at offset 0.
    props.setProperty(RUN_KEY, JSON.stringify({ runId: runId, nextOffset: offset }))
  }

  var finalizeResult = callSync_('finalize=1&runId=' + runId)
  props.deleteProperty(RUN_KEY)
  props.deleteProperty(DIRTY_KEY)

  Logger.log('PVP sync เสร็จสมบูรณ์ — เขียน ' + totals.written +
    ' รายการ, ไม่เปลี่ยนแปลง ' + totals.unchanged +
    ', ลบ ' + finalizeResult.deleted + ', ข้าม ' + totals.skipped)
  if (totals.problems.length) {
    Logger.log('ปัญหาที่พบ (' + totals.problems.length + '):')
    totals.problems.slice(0, 20).forEach(function (p) { Logger.log('  - ' + p) })
  }
  return totals
}

/** Bound to an onEdit trigger — just flags dirty, does NOT sync inline. */
function onPvpSheetEdit(e) {
  var sheet = e && e.range ? e.range.getSheet() : null
  if (!sheet || sheet.getName() !== 'PVP') return
  PropertiesService.getScriptProperties().setProperty(DIRTY_KEY, '1')
}

/**
 * Fires every 5 minutes (see createTriggers). Only does work if the sheet
 * was edited since the last sync, OR a previous sync is mid-run and needs
 * resuming — otherwise this is a no-op tick.
 */
function drainIfDirty() {
  var props = PropertiesService.getScriptProperties()
  var dirty = props.getProperty(DIRTY_KEY) === '1'
  var resuming = props.getProperty(RUN_KEY) !== null
  if (!dirty && !resuming) return
  runFullSync_()
}

/** Safety-net: forces a full sync once a day regardless of the dirty flag. */
function scheduledFullSync() {
  runFullSync_()
}

/** Run once after setting Script Properties, to confirm everything works end-to-end. */
function testSyncNow() {
  runFullSync_()
}

/**
 * If a previous run's Apps Script execution died mid-sync in a way that
 * somehow left RUN_KEY set but drainIfDirty isn't picking it up (e.g. you
 * changed CHUNK_SIZE or SYNC_WEBHOOK_URL mid-run), call this to resume
 * manually. Safe to re-run.
 */
function resumeStuckRun() {
  runFullSync_()
}

/**
 * Run once. Wires: onEdit (marks dirty only), a 5-minute drain trigger
 * (does the real sync, only if dirty/resuming), and a daily 02:30
 * safety-net full sync. Safe to re-run — clears any previous triggers for
 * these functions first.
 */
function createTriggers() {
  var ss = SpreadsheetApp.getActiveSpreadsheet()
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var fn = t.getHandlerFunction()
    if (fn === 'onPvpSheetEdit' || fn === 'drainIfDirty' || fn === 'scheduledFullSync') {
      ScriptApp.deleteTrigger(t)
    }
  })

  ScriptApp.newTrigger('onPvpSheetEdit').forSpreadsheet(ss).onEdit().create()
  ScriptApp.newTrigger('drainIfDirty').timeBased().everyMinutes(5).create()
  ScriptApp.newTrigger('scheduledFullSync').timeBased().atHour(2).nearMinute(30).everyDays(1).create()

  Logger.log('ตั้ง trigger เรียบร้อย: onEdit (flag dirty) + drain ทุก 5 นาที + daily 02:30 safety-net')
}
