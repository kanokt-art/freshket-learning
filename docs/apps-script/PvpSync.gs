/**
 * Freshket LMS — "สะกิด" webhook for the PVP price sheet.
 *
 * Sheet     : https://docs.google.com/spreadsheets/d/1QPkrSSDREZazXBlw0ZiVsu5eCqJ-1ODcfk4U1Zzs3wQ/edit
 * Tab       : PVP
 *
 * Unlike ProductsSync.gs (which reads the sheet AND writes Firestore itself,
 * entirely inside Apps Script), this script does neither. It only PINGS the
 * Next.js backend (POST /api/sheets/pvp-sync) to say "the sheet changed, go
 * pull it" — no row data is ever attached to the ping. The backend then reads
 * the PVP tab itself via the Sheets API (service account) and writes
 * Firestore `pvpPrices`.
 *
 * Why: Apps Script has a 6-minute execution ceiling and pushing large payloads
 * through Google's infra is unnecessary work. A ping finishes in under a
 * second regardless of sheet size; the backend does the real work on its own
 * infra, at its own pace, and can retry/log independently of the sheet.
 *
 * ── SETUP ────────────────────────────────────────────────────────────────────
 * 1. Extensions → Apps Script (on this spreadsheet), paste this file.
 * 2. Share the spreadsheet (Viewer) with the Firebase service account email
 *    (FIREBASE_CLIENT_EMAIL in the app's .env.local) — the backend reads the
 *    sheet using that identity, not this script.
 * 3. Project Settings → Script Properties, add:
 *      SYNC_WEBHOOK_URL   https://<your-app-domain>/api/sheets/pvp-sync
 *      SYNC_SECRET        (same value as SHEETS_SYNC_SECRET in .env.local)
 * 4. Run `testPing` once to confirm the webhook responds.
 * 5. Run `createTriggers` once to wire up onEdit + a daily safety-net sync.
 *
 * ── HOW TO TELL IT ACTUALLY RAN ──────────────────────────────────────────────
 * - This script only logs the ping (Apps Script → Executions log). The actual
 *   sync result (created/updated/deleted/problems) is logged on the backend
 *   side, not here — this script doesn't see it beyond a bare success/failure.
 * - Firebase Console → Firestore → pvpPrices: a synced SKU has a fresh
 *   `updatedAt`.
 */

function props_() {
  var p = PropertiesService.getScriptProperties()
  var v = {
    SYNC_WEBHOOK_URL: p.getProperty('SYNC_WEBHOOK_URL'),
    SYNC_SECRET: p.getProperty('SYNC_SECRET'),
  }
  for (var k in v) if (!v[k]) throw new Error('ยังไม่ได้ตั้ง Script Property: ' + k)
  return v
}

/** Fires the webhook. No sheet data is sent — just a signed "go sync" ping. */
function pingSync_() {
  var cfg = props_()
  var res = UrlFetchApp.fetch(cfg.SYNC_WEBHOOK_URL, {
    method: 'post',
    headers: { 'x-sync-secret': cfg.SYNC_SECRET },
    muteHttpExceptions: true,
  })
  var code = res.getResponseCode()
  Logger.log('PVP sync webhook → HTTP ' + code + ': ' + res.getContentText())
  if (code !== 200) throw new Error('Webhook ตอบกลับ HTTP ' + code + ': ' + res.getContentText())
}

/** Bound to an onEdit trigger — only pings when a cell in the PVP tab changes. */
function onPvpSheetEdit(e) {
  var sheet = e && e.range ? e.range.getSheet() : null
  if (!sheet || sheet.getName() !== 'PVP') return
  pingSync_()
}

/** Safety-net daily sync, in case an edit-trigger ping ever gets missed. */
function scheduledPing() {
  pingSync_()
}

/** Run once after setting Script Properties. */
function testPing() {
  pingSync_()
}

/**
 * Run once. Wires an onEdit trigger (installable, since simple triggers can't
 * call UrlFetchApp) plus a daily 02:30 safety-net trigger. Safe to re-run —
 * clears any previous triggers for these functions first.
 */
function createTriggers() {
  var ss = SpreadsheetApp.getActiveSpreadsheet()
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var fn = t.getHandlerFunction()
    if (fn === 'onPvpSheetEdit' || fn === 'scheduledPing') ScriptApp.deleteTrigger(t)
  })

  ScriptApp.newTrigger('onPvpSheetEdit').forSpreadsheet(ss).onEdit().create()
  ScriptApp.newTrigger('scheduledPing').timeBased().atHour(2).nearMinute(30).everyDays(1).create()

  Logger.log('ตั้ง trigger เรียบร้อย: onEdit (แท็บ PVP) + daily 02:30 safety-net')
}
