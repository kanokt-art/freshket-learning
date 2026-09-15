/**
 * RETIRED — not deployed anywhere. Kept only as the last copy of this script.
 *
 * The PVP tab carries the same products with both public and private prices,
 * so PvpSync.gs replaced this one and now owns script ID
 * 1_7asUTvU6KRF1BQjKbojxy6P2O527z4DSItJZkJXFs0RRH59yIHPqIVK (this script's
 * former home — pushing this file back there would overwrite the PVP sync).
 * Nothing in the app reads the `products` collection it wrote.
 *
 * Freshket LMS — sync the "Public-price" product sheet into Firestore `products`.
 *
 * Sheet      : https://docs.google.com/spreadsheets/d/1QPkrSSDREZazXBlw0ZiVsu5eCqJ-1ODcfk4U1Zzs3wQ/edit
 * Tab        : Public-price
 * Script ID  : 1_7asUTvU6KRF1BQjKbojxy6P2O527z4DSItJZkJXFs0RRH59yIHPqIVK
 *
 * This is its OWN Apps Script project, bound only to the sheet above — it is
 * NOT pasted into the same project as Code.gs (the HR employee sync). Both
 * scripts define same-named functions (doGet, onOpen, props_, str_, ...), so
 * combining them into one project would have the second one silently
 * override the first's menu/web-app/helpers.
 *
 * Mirrors the structure of Code.gs (the HR employee sync) — same script
 * properties, same batch-write mechanics, same progress/sidebar/status-page
 * pattern — but for products, not people, and with an important difference:
 * a product that disappears from the sheet IS deleted from Firestore (see
 * SAFETY below). That's the opposite of the employee sync, which never deletes.
 *
 * ── SETUP ────────────────────────────────────────────────────────────────────
 * 1. Open this project (script ID above) or Extensions → Apps Script from the
 *    Public-price sheet, paste this file.
 * 2. Project Settings → Script Properties, add (same three as Code.gs; reuse
 *    the same service account if this is bound to the same Firebase project):
 *      FIREBASE_PROJECT_ID   lms-sale-project
 *      FIREBASE_CLIENT_EMAIL firebase-adminsdk-...@lms-sale-project.iam.gserviceaccount.com
 *      FIREBASE_PRIVATE_KEY  -----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
 *    Script Properties are not readable by viewers of the sheet — never paste
 *    the key into a cell or into this file.
 * 3. Run `testConnection` once and approve the OAuth prompt.
 * 4. Run `createDailyTrigger` once to schedule the 02:00 sync.
 *
 * ── HOW TO TELL IT ACTUALLY RAN ──────────────────────────────────────────────
 * Same three checks as the employee sync:
 *   a) The SYNC_LOG tab in this spreadsheet — one row per run.
 *   b) The web app URL (Deploy → New deployment → Web app) — status + a
 *      "Sync เดี๋ยวนี้" button. Opening the URL only DISPLAYS status.
 *   c) Firebase Console → Firestore → products: a synced item has doc id
 *      `fk-{FK ID}` and a fresh `updatedAt`.
 *
 * If you redeploy the web app, use Deploy → Manage deployments → edit the
 * EXISTING deployment, otherwise the /exec URL changes.
 *
 * ── SAFETY ───────────────────────────────────────────────────────────────────
 * - DOES delete: a product whose FK ID is no longer in the sheet is removed
 *   from Firestore. This is intentional (per the product owner) — unlike
 *   employees, a delisted product shouldn't linger in the catalog. If that
 *   ever needs to change, replace the delete in syncProductsToFirestore()
 *   with a status flag instead, the same way employmentStatus works for users.
 * - Never overwrites a field with blank. An empty cell means "not in this
 *   export", so the existing value is kept for THAT row's fields — but a
 *   product missing from the sheet entirely is still deleted (see above).
 * - Rows with no FK ID are skipped (reported as a problem), since FK ID is
 *   the doc-id key — a product with no id can't be synced or safely deleted.
 */

// ── Column layout of the Public-price tab (0-based). Must match the sheet. ────
var COL = {
  no: 0,                 // No.
  grade: 1,              // Grade
  fkId: 2,               // FK ID            → doc id: fk-{FK ID}
  nameThai: 3,            // Product_Name_Thai
  packSize: 4,            // Pack size
  categoryThai: 5,        // Product_Category_Thai
  nameEnglish: 6,          // Product_Name_Englist
  // column 7 (H) is blank in the sheet — intentionally not read
  categoryEnglish: 8,      // Product_Category_Englist
  converter: 9,           // Converter
  isActive: 10,            // is_active
  publicPrice: 11,         // Public Price
  publicPriceExVat: 12,    // Public Price Ex-VAT
  itemIsVat: 13,           // item_is_vat
  vat: 14,                // VAT
  adjustedWeight: 15,      // Adjusted Weight
  remark: 16,             // Remark
  exclusive: 17,          // Exclusive
}

var SHEET_NAME = 'Public-price'
var COLLECTION = 'products'

// ── Entry point (also what the daily trigger calls) ───────────────────────────
var BATCH_SIZE = 500 // Firestore :batchWrite hard cap per call

function syncProductsToFirestore() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME)
  if (!sheet) throw new Error('ไม่พบชีตชื่อ "' + SHEET_NAME + '"')

  var rows = sheet.getDataRange().getValues()
  if (rows.length < 2) {
    Logger.log('ไม่มีข้อมูลให้ sync')
    return
  }

  var token = getAccessToken_()
  var projectId = props_().FIREBASE_PROJECT_ID
  var totalRows = rows.length - 1

  setProgress_({ done: 0, total: totalRows, created: 0, updated: 0, deleted: 0, duplicate: 0, failed: 0, status: 'running' })

  // One list call (paginated) instead of one GET per row.
  var existingIds = listAllProductIds_(projectId, token)

  var seenFkId = {}
  var duplicate = 0, failed = 0
  var problems = []
  var writes = [] // { uid, fields, isNew }
  var seenIdsThisRun = {}

  for (var i = 1; i < rows.length; i++) {
    var r = rows[i]
    var rowNo = i + 1

    var fkId = str_(r[COL.fkId])
    var nameThai = str_(r[COL.nameThai])

    // A row with no name is not a product — blank spacer rows are common.
    if (!fkId && !nameThai) { continue }

    if (!fkId) {
      problems.push('แถว ' + rowNo + ': ' + (nameThai || '(ไม่มีชื่อ)') + ' — ไม่มี FK ID')
      failed++
      continue
    }

    // Duplicates inside the sheet: keep the first, report the rest.
    if (seenFkId[fkId]) {
      problems.push('แถว ' + rowNo + ': ' + nameThai + ' — FK ID ' + fkId + ' ซ้ำกับแถว ' + seenFkId[fkId])
      duplicate++
      continue
    }
    seenFkId[fkId] = rowNo

    var uid = 'fk-' + fkId
    seenIdsThisRun[uid] = true
    var existing = existingIds[uid] || false

    var fields = {}
    putString_(fields, 'fkId', fkId)
    putString_(fields, 'nameThai', nameThai)
    putBool_(fields, 'isActive', parseBool_(r[COL.isActive]))

    putIfPresent_(fields, 'grade', str_(r[COL.grade]))
    putIfPresent_(fields, 'packSize', str_(r[COL.packSize]))
    putIfPresent_(fields, 'categoryThai', str_(r[COL.categoryThai]))
    putIfPresent_(fields, 'nameEnglish', str_(r[COL.nameEnglish]))
    putIfPresent_(fields, 'categoryEnglish', str_(r[COL.categoryEnglish]))
    putIfPresent_(fields, 'converter', str_(r[COL.converter]))
    putIfPresent_(fields, 'remark', str_(r[COL.remark]))
    putIfPresent_(fields, 'exclusive', str_(r[COL.exclusive]))

    var no = parseNumber_(r[COL.no])
    if (no !== null) fields.no = { integerValue: String(no) }
    var price = parseNumber_(r[COL.publicPrice])
    if (price !== null) fields.publicPrice = { doubleValue: price }
    var priceExVat = parseNumber_(r[COL.publicPriceExVat])
    if (priceExVat !== null) fields.publicPriceExVat = { doubleValue: priceExVat }
    var vat = parseNumber_(r[COL.vat])
    if (vat !== null) fields.vat = { doubleValue: vat }
    var weight = parseNumber_(r[COL.adjustedWeight])
    if (weight !== null) fields.adjustedWeight = { doubleValue: weight }

    var itemIsVatRaw = str_(r[COL.itemIsVat])
    if (itemIsVatRaw) fields.itemIsVat = { booleanValue: parseBool_(r[COL.itemIsVat]) }

    if (!existing) {
      fields.createdAt = { timestampValue: new Date().toISOString() }
    }
    fields.updatedAt = { timestampValue: new Date().toISOString() }

    writes.push({ uid: uid, rowNo: rowNo, displayName: nameThai, fields: fields, isNew: !existing })
  }

  // Anything in Firestore but not seen in this sheet read is a delisted
  // product — per the product owner, these are deleted outright (not
  // flagged), unlike the employee sync's "never delete" policy.
  var idsToDelete = []
  for (var existingId in existingIds) {
    if (!seenIdsThisRun[existingId]) idsToDelete.push(existingId)
  }

  var created = 0, updated = 0, deleted = 0
  for (var b = 0; b < writes.length; b += BATCH_SIZE) {
    var batch = writes.slice(b, b + BATCH_SIZE)
    var results = batchWrite_(projectId, token, batch, [])
    for (var j = 0; j < batch.length; j++) {
      if (results[j]) {
        if (batch[j].isNew) created++; else updated++
      } else {
        problems.push('แถว ' + batch[j].rowNo + ': ' + batch[j].displayName + ' — เขียน Firestore ไม่สำเร็จ')
        failed++
      }
    }
    setProgress_({ done: Math.min(b + BATCH_SIZE, writes.length), total: totalRows, created: created, updated: updated, deleted: deleted, duplicate: duplicate, failed: failed, status: 'running' })
  }

  for (var d = 0; d < idsToDelete.length; d += BATCH_SIZE) {
    var delBatch = idsToDelete.slice(d, d + BATCH_SIZE)
    var delResults = batchWrite_(projectId, token, [], delBatch)
    for (var k = 0; k < delBatch.length; k++) {
      if (delResults[k]) {
        deleted++
      } else {
        problems.push('ลบ ' + delBatch[k] + ' ไม่สำเร็จ')
        failed++
      }
    }
  }

  var summary = 'Sync เสร็จ — เพิ่มใหม่ ' + created + ' รายการ, อัปเดต ' + updated + ' รายการ, ลบ ' + deleted + ' รายการ, ซ้ำ ' + duplicate + ' รายการ, ไม่สำเร็จ ' + failed + ' รายการ'
  Logger.log(summary)
  if (problems.length) {
    Logger.log('ปัญหาที่พบ (' + problems.length + '):')
    problems.forEach(function (p) { Logger.log('  - ' + p) })
  }
  setProgress_({ done: totalRows, total: totalRows, created: created, updated: updated, deleted: deleted, duplicate: duplicate, failed: failed, status: 'done' })
  return { created: created, updated: updated, deleted: deleted, duplicate: duplicate, failed: failed, problems: problems }
}

// ── Progress tracking (polled by the status page while a sync runs) ───────────
var PROGRESS_KEY = 'products_sync_progress'

function setProgress_(p) {
  PropertiesService.getScriptProperties().setProperty(PROGRESS_KEY, JSON.stringify(p))
}

function getProgress_() {
  var raw = PropertiesService.getScriptProperties().getProperty(PROGRESS_KEY)
  return raw ? JSON.parse(raw) : null
}

// ── Value parsing ──────────────────────────────────────────────────────────────
function str_(v) { return v === null || v === undefined ? '' : String(v).trim() }

/** Accepts boolean cells, and the common truthy spellings sheets export as text. */
function parseBool_(v) {
  if (typeof v === 'boolean') return v
  var s = str_(v).toLowerCase()
  return s === 'true' || s === 'yes' || s === '1' || s === 'active'
}

/** Empty cell → null (caller skips writing the field), not 0 — a blank price is "unknown", not "free". */
function parseNumber_(v) {
  if (v === null || v === undefined || v === '') return null
  var n = Number(v)
  return isNaN(n) ? null : n
}

// ── Firestore REST helpers ────────────────────────────────────────────────────
function props_() {
  var p = PropertiesService.getScriptProperties()
  var v = {
    FIREBASE_PROJECT_ID: p.getProperty('FIREBASE_PROJECT_ID'),
    FIREBASE_CLIENT_EMAIL: p.getProperty('FIREBASE_CLIENT_EMAIL'),
    FIREBASE_PRIVATE_KEY: p.getProperty('FIREBASE_PRIVATE_KEY'),
  }
  for (var k in v) if (!v[k]) throw new Error('ยังไม่ได้ตั้ง Script Property: ' + k)
  return v
}

/** Service-account JWT → OAuth access token, cached for 55 of its 60 minutes. */
function getAccessToken_() {
  var cache = CacheService.getScriptCache()
  var hit = cache.get('fb_token')
  if (hit) return hit

  var cfg = props_()
  var key = cfg.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
  var now = Math.floor(Date.now() / 1000)

  var header = Utilities.base64EncodeWebSafe(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  var claim = Utilities.base64EncodeWebSafe(JSON.stringify({
    iss: cfg.FIREBASE_CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    exp: now + 3600,
    iat: now,
  }))
  var signature = Utilities.base64EncodeWebSafe(
    Utilities.computeRsaSha256Signature(header + '.' + claim, key))
  var jwt = header + '.' + claim + '.' + signature

  var res = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post',
    payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt },
    muteHttpExceptions: true,
  })
  var body = JSON.parse(res.getContentText())
  if (!body.access_token) throw new Error('ขอ access token ไม่สำเร็จ: ' + res.getContentText())

  cache.put('fb_token', body.access_token, 3300)
  return body.access_token
}

function docUrl_(projectId, uid) {
  return 'https://firestore.googleapis.com/v1/projects/' + projectId +
    '/databases/(default)/documents/' + COLLECTION + '/' + encodeURIComponent(uid)
}

function collectionUrl_(projectId) {
  return 'https://firestore.googleapis.com/v1/projects/' + projectId +
    '/databases/(default)/documents/' + COLLECTION
}

/**
 * Every product doc id currently in Firestore, in as few requests as
 * pagination allows (1,000 docs/page — the Firestore max). Used both to tell
 * create from update, and to find which ids are no longer in the sheet.
 */
function listAllProductIds_(projectId, token) {
  var out = {}
  var pageToken = ''
  do {
    var url = collectionUrl_(projectId) + '?pageSize=1000&mask.fieldPaths=fkId'
      + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '')
    var res = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true,
    })
    if (res.getResponseCode() !== 200) {
      throw new Error('อ่านรายการสินค้าเดิมจาก Firestore ไม่สำเร็จ: ' + res.getContentText())
    }
    var body = JSON.parse(res.getContentText())
    ;(body.documents || []).forEach(function (doc) {
      var uid = doc.name.split('/').pop()
      out[uid] = true
    })
    pageToken = body.nextPageToken || ''
  } while (pageToken)
  return out
}

/**
 * Writes up to BATCH_SIZE upserts AND up to BATCH_SIZE deletes in ONE
 * Firestore :batchWrite call. Pass an empty array for whichever side isn't
 * needed. Returns one boolean per input (upserts first, then deletes, same
 * order as passed in) — batchWrite reports per-write status, it doesn't fail
 * the whole call if one write is bad.
 */
function batchWrite_(projectId, token, upsertBatch, deleteUids) {
  var writes = upsertBatch.map(function (w) {
    return {
      update: { name: docUrl_(projectId, w.uid).replace('https://firestore.googleapis.com/v1/', ''), fields: w.fields },
      updateMask: { fieldPaths: Object.keys(w.fields) },
    }
  }).concat(deleteUids.map(function (uid) {
    return { delete: docUrl_(projectId, uid).replace('https://firestore.googleapis.com/v1/', '') }
  }))

  if (!writes.length) return []

  var res = UrlFetchApp.fetch(
    'https://firestore.googleapis.com/v1/projects/' + projectId + '/databases/(default)/documents:batchWrite',
    {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify({ writes: writes }),
      muteHttpExceptions: true,
    })

  if (res.getResponseCode() !== 200) {
    Logger.log('Firestore batchWrite ' + res.getResponseCode() + ': ' + res.getContentText())
    return writes.map(function () { return false })
  }

  var body = JSON.parse(res.getContentText())
  var statuses = body.status || []
  return writes.map(function (_, i) {
    // An empty status object ({}) means OK — Firestore only populates it on error.
    return !(statuses[i] && statuses[i].code)
  })
}

function putString_(fields, key, value) {
  fields[key] = value === null ? { nullValue: null } : { stringValue: String(value) }
}

function putBool_(fields, key, value) {
  fields[key] = { booleanValue: !!value }
}

/** Only writes when there is a value — a blank cell must not erase what's stored. */
function putIfPresent_(fields, key, value) {
  var s = str_(value)
  if (s) fields[key] = { stringValue: s }
}

// ── One-off utilities ─────────────────────────────────────────────────────────

/** Run once after setting the Script Properties. Writes nothing. */
function testConnection() {
  var token = getAccessToken_()
  var projectId = props_().FIREBASE_PROJECT_ID
  var res = UrlFetchApp.fetch(
    'https://firestore.googleapis.com/v1/projects/' + projectId +
      '/databases/(default)/documents/' + COLLECTION + '?pageSize=1',
    { method: 'get', headers: { Authorization: 'Bearer ' + token }, muteHttpExceptions: true })
  Logger.log('HTTP ' + res.getResponseCode())
  Logger.log(res.getContentText().slice(0, 400))
  if (res.getResponseCode() === 200) Logger.log('เชื่อมต่อ Firestore สำเร็จ')
}

/** Reads the sheet and reports what WOULD change. Writes nothing. */
function dryRun() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME)
  var rows = sheet.getDataRange().getValues()
  Logger.log('พบ ' + (rows.length - 1) + ' แถว')
  Logger.log('หัวคอลัมน์: ' + rows[0].join(' | '))
  for (var i = 1; i < Math.min(rows.length, 6); i++) {
    var r = rows[i]
    var fkId = str_(r[COL.fkId])
    Logger.log('  uid=fk-' + fkId +
      ' | ' + str_(r[COL.nameThai]) +
      ' | active=' + parseBool_(r[COL.isActive]) +
      ' | price=' + parseNumber_(r[COL.publicPrice]))
  }
}

// ── Sync log + status page ────────────────────────────────────────────────────

var LOG_SHEET = 'SYNC_LOG'

function logSheet_() {
  var lock = LockService.getScriptLock()
  lock.waitLock(30000)
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet()
    var sh = ss.getSheetByName(LOG_SHEET)
    if (!sh) {
      sh = ss.insertSheet(LOG_SHEET)
      sh.appendRow(['เวลา', 'ผลลัพธ์', 'เพิ่มใหม่', 'อัปเดต', 'ลบ', 'ข้าม', 'ปัญหา', 'รายละเอียด'])
      sh.setFrozenRows(1)
    }
    return sh
  } finally {
    lock.releaseLock()
  }
}

function writeLog_(result, errorMessage) {
  var sh = logSheet_()
  sh.appendRow([
    new Date(),
    errorMessage ? 'ล้มเหลว' : 'สำเร็จ',
    result ? result.created : 0,
    result ? result.updated : 0,
    result ? result.deleted : 0,
    result ? result.duplicate + result.failed : 0,
    result && result.problems ? result.problems.length : 0,
    errorMessage || (result && result.problems.length ? result.problems.slice(0, 5).join(' | ') : ''),
  ])
  var max = 500
  if (sh.getLastRow() > max + 1) sh.deleteRows(2, sh.getLastRow() - max - 1)
}

/** What the daily trigger actually calls. Wraps the sync so a failure is still recorded. */
function scheduledProductsSync() {
  try {
    var result = syncProductsToFirestore()
    writeLog_(result, null)
    return result
  } catch (e) {
    setProgress_({ done: 0, total: 0, status: 'error', message: String(e && e.message ? e.message : e) })
    writeLog_(null, String(e && e.message ? e.message : e))
    throw e
  }
}

/**
 * Fires scheduledProductsSync in its OWN execution via a one-time trigger, so
 * the doGet request that kicks it off can return immediately instead of
 * blocking for the whole sync.
 */
function startSyncAsync_() {
  ScriptApp.newTrigger('scheduledProductsSync').timeBased().after(1).create()
}

/** Status page served at the /exec URL. */
function doGet(e) {
  if (e && e.parameter && e.parameter.status === '1') {
    return ContentService.createTextOutput(JSON.stringify(getProgress_() || { status: 'idle' }))
      .setMimeType(ContentService.MimeType.JSON)
  }

  if (e && e.parameter && e.parameter.run === '1') {
    var current = getProgress_()
    if (!current || current.status !== 'running') {
      setProgress_({ done: 0, total: 0, status: 'running' })
      startSyncAsync_()
    }
    return HtmlService.createHtmlOutput(buildStatusHtml_(true))
      .setTitle('Freshket LMS — สถานะ Sync สินค้า')
  }

  return HtmlService.createHtmlOutput(buildStatusHtml_(false))
    .setTitle('Freshket LMS — สถานะ Sync สินค้า')
}

function buildStatusHtml_(justStarted) {
  var sh = logSheet_()
  var last = sh.getLastRow()
  var rows = last > 1 ? sh.getRange(2, 1, Math.min(last - 1, 20), 8).getValues() : []
  rows.reverse()

  var triggers = ScriptApp.getProjectTriggers().filter(function (t) {
    return t.getHandlerFunction() === 'scheduledProductsSync' ||
           t.getHandlerFunction() === 'syncProductsToFirestore'
  })

  var html = '<html><head><meta charset="utf-8"><title>Freshket LMS — สถานะ Sync สินค้า</title>'
    + '<style>body{font-family:system-ui,sans-serif;margin:24px;color:#0f2019}'
    + 'h1{font-size:20px}table{border-collapse:collapse;width:100%;font-size:13px;margin-top:12px}'
    + 'th,td{border-bottom:1px solid #e2e8f0;padding:8px;text-align:left}'
    + 'th{background:#f8fafc}.ok{color:#00804c;font-weight:600}.bad{color:#b42318;font-weight:600}'
    + '.pill{display:inline-block;padding:4px 10px;border-radius:999px;background:#e8fbf3;color:#00804c;font-size:12px}'
    + '.warn{background:#fdf2e5;color:#b25c08}'
    + 'a.btn{display:inline-block;margin-top:14px;padding:8px 16px;background:#00ce7c;color:#fff;'
    + 'border-radius:10px;text-decoration:none;font-weight:600;font-size:13px}'
    + '#progressWrap{display:none;margin-top:16px;padding:16px;background:#fff;border:1px solid #e2e8f0;border-radius:12px}'
    + '#progressLabel{font-size:13px;font-weight:600;margin-bottom:8px}'
    + '#progressBar{height:8px;background:#f1f5f9;border-radius:999px;overflow:hidden}'
    + '#progressFill{height:100%;width:0%;background:#00ce7c;border-radius:999px;transition:width 300ms}'
    + '</style></head><body>'

  html += '<h1>Freshket LMS — สถานะ Sync สินค้า</h1>'
  html += triggers.length
    ? '<span class="pill">ตั้ง trigger รายวันแล้ว (' + triggers.length + ')</span>'
    : '<span class="pill warn">ยังไม่ได้ตั้ง trigger — รัน createDailyTrigger ก่อน</span>'

  html += '<div id="progressWrap"><div id="progressLabel">กำลัง sync…</div>'
    + '<div id="progressBar"><div id="progressFill"></div></div></div>'

  if (!rows.length) {
    html += '<p>ยังไม่เคย sync</p>'
  } else {
    var latest = rows[0]
    html += '<p>ล่าสุด: <b>' + Utilities.formatDate(new Date(latest[0]),
      Session.getScriptTimeZone(), 'dd/MM/yyyy HH:mm') + '</b> — '
      + (latest[1] === 'สำเร็จ' ? '<span class="ok">สำเร็จ</span>' : '<span class="bad">ล้มเหลว</span>')
      + ' (เพิ่ม ' + latest[2] + ', อัปเดต ' + latest[3] + ', ลบ ' + latest[4] + ')</p>'

    html += '<table><tr><th>เวลา</th><th>ผล</th><th>เพิ่ม</th><th>อัปเดต</th><th>ลบ</th><th>ข้าม</th><th>ปัญหา</th><th>รายละเอียด</th></tr>'
    rows.forEach(function (r) {
      html += '<tr><td>' + Utilities.formatDate(new Date(r[0]), Session.getScriptTimeZone(), 'dd/MM/yy HH:mm') + '</td>'
        + '<td class="' + (r[1] === 'สำเร็จ' ? 'ok' : 'bad') + '">' + r[1] + '</td>'
        + '<td>' + r[2] + '</td><td>' + r[3] + '</td><td>' + r[4] + '</td><td>' + r[5] + '</td><td>' + r[6] + '</td>'
        + '<td>' + String(r[7] || '').replace(/</g, '&lt;') + '</td></tr>'
    })
    html += '</table>'
  }

  html += '<a class="btn" href="?run=1" id="syncBtn">Sync เดี๋ยวนี้</a>'

  html += '<script>'
    + 'function poll(){'
    + 'fetch("?status=1").then(function(r){return r.json();}).then(function(p){'
    + 'if(!p||p.status!=="running"){if(p&&p.status==="done")location.reload();return;}'
    + 'document.getElementById("syncBtn").style.display="none";'
    + 'var wrap=document.getElementById("progressWrap");wrap.style.display="block";'
    + 'var pct=p.total?Math.round(p.done/p.total*100):0;'
    + 'document.getElementById("progressFill").style.width=pct+"%";'
    + 'document.getElementById("progressLabel").textContent="กำลัง sync… "+p.done+"/"+p.total+" ("+pct+"%)";'
    + 'setTimeout(poll,2000);'
    + '}).catch(function(){setTimeout(poll,2000);});'
    + '}'
    + (justStarted ? 'poll();' : 'fetch("?status=1").then(function(r){return r.json();}).then(function(p){if(p&&p.status==="running")poll();});')
    + '</script>'

  html += '</body></html>'
  return html
}

/** Run once. Safe to re-run — clears any previous trigger for this function. */
function createDailyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    var fn = t.getHandlerFunction()
    if (fn === 'scheduledProductsSync' || fn === 'syncProductsToFirestore') ScriptApp.deleteTrigger(t)
  })
  ScriptApp.newTrigger('scheduledProductsSync')
    .timeBased()
    .atHour(2)          // 02:00 in the script's timezone — set that under Project Settings
    .everyDays(1)
    .create()
  Logger.log('ตั้ง trigger รายวัน 02:00 เรียบร้อย (เรียก scheduledProductsSync)')
}

// ── In-sheet sidebar ───────────────────────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('FKT-LMS Products Sync')
    .addItem('เปิดหน้า Sync', 'showSyncSidebar')
    .addToUi()
}

function showSyncSidebar() {
  var html = HtmlService.createHtmlOutput(buildSidebarHtml_())
    .setTitle('Sync สินค้า → Firestore')
  SpreadsheetApp.getUi().showSidebar(html)
}

/** Same status/run contract as doGet, callable from the sidebar via google.script.run. */
function sidebarStatus() {
  return getProgress_() || { status: 'idle' }
}

function sidebarStartSync() {
  var current = getProgress_()
  if (current && current.status === 'running') return
  setProgress_({ done: 0, total: 0, created: 0, updated: 0, deleted: 0, duplicate: 0, failed: 0, status: 'running' })
  startSyncAsync_()
}

function buildSidebarHtml_() {
  return '<style>'
    + 'body{font-family:"Noto Sans Thai",system-ui,sans-serif;margin:0;padding:16px;color:#0f2019;font-size:13px}'
    + 'h2{font-size:14px;margin:0 0 12px}'
    + 'button{width:100%;padding:10px;background:#00ce7c;color:#fff;border:none;border-radius:10px;'
    + 'font-weight:700;font-size:13px;cursor:pointer}'
    + 'button:disabled{opacity:.6;cursor:not-allowed}'
    + '#progressWrap{display:none;margin-top:16px}'
    + '#progressLabel{font-size:12px;font-weight:600;margin-bottom:6px;color:#475569}'
    + '#progressBar{height:8px;background:#f1f5f9;border-radius:999px;overflow:hidden}'
    + '#progressFill{height:100%;width:0%;background:#00ce7c;border-radius:999px;transition:width 300ms}'
    + '#resultCard{display:none;margin-top:16px;padding:14px;background:#fff;border:1px solid #f1f5f9;border-radius:12px}'
    + '.row{display:flex;justify-content:space-between;align-items:center;padding:6px 0;font-size:12px}'
    + '.row+.row{border-top:1px solid #f8fafc}'
    + '.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:8px}'
    + '.ok{background:#00ce7c}.warn{background:#f59e0b}.bad{background:#f43f5e}'
    + '.val{font-weight:700}'
    + '#errBox{display:none;margin-top:12px;padding:10px;background:#fef2f2;color:#b42318;border-radius:8px;font-size:12px}'
    + '</style>'
    + '<h2>Sync สินค้า → Firestore</h2>'
    + '<button id="btn">Sync to Firestore</button>'
    + '<div id="progressWrap"><div id="progressLabel">กำลัง sync…</div>'
    + '<div id="progressBar"><div id="progressFill"></div></div></div>'
    + '<div id="resultCard">'
    + '<div class="row"><span><span class="dot ok"></span>สำเร็จ</span><span class="val" id="rCreated">0</span></div>'
    + '<div class="row"><span><span class="dot warn"></span>ซ้ำ</span><span class="val" id="rDup">0</span></div>'
    + '<div class="row"><span><span class="dot bad"></span>ไม่สำเร็จ</span><span class="val" id="rFailed">0</span></div>'
    + '<div class="row"><span><span class="dot" style="background:#94a3b8"></span>ลบ (ไม่พบในชีต)</span><span class="val" id="rDeleted">0</span></div>'
    + '</div>'
    + '<div id="errBox"></div>'
    + '<script>'
    + 'var btn=document.getElementById("btn");'
    + 'var wrap=document.getElementById("progressWrap");'
    + 'var card=document.getElementById("resultCard");'
    + 'var errBox=document.getElementById("errBox");'
    + 'function render(p){'
    + 'if(!p||p.status==="idle")return;'
    + 'if(p.status==="error"){'
    + 'btn.disabled=false;wrap.style.display="none";'
    + 'errBox.style.display="block";errBox.textContent="เกิดข้อผิดพลาด: "+(p.message||"");'
    + 'return;'
    + '}'
    + 'errBox.style.display="none";'
    + 'btn.disabled=true;wrap.style.display="block";'
    + 'var pct=p.total?Math.round(p.done/p.total*100):0;'
    + 'document.getElementById("progressFill").style.width=pct+"%";'
    + 'document.getElementById("progressLabel").textContent="กำลัง sync… "+p.done+"/"+p.total+" ("+pct+"%)";'
    + 'document.getElementById("rCreated").textContent=(p.created||0)+(p.updated?" (+"+p.updated+" อัปเดต)":"");'
    + 'document.getElementById("rDup").textContent=p.duplicate||0;'
    + 'document.getElementById("rFailed").textContent=p.failed||0;'
    + 'document.getElementById("rDeleted").textContent=p.deleted||0;'
    + 'if(p.status==="done"){'
    + 'btn.disabled=false;card.style.display="block";'
    + '}else{'
    + 'setTimeout(poll,2000);'
    + '}'
    + '}'
    + 'function poll(){google.script.run.withSuccessHandler(render).withFailureHandler(function(e){'
    + 'errBox.style.display="block";errBox.textContent="เกิดข้อผิดพลาด: "+e.message;'
    + 'btn.disabled=false;'
    + '}).sidebarStatus();}'
    + 'function start(){'
    + 'btn.disabled=true;card.style.display="none";errBox.style.display="none";'
    + 'google.script.run.withSuccessHandler(function(){setTimeout(poll,1000);})'
    + '.withFailureHandler(function(e){errBox.style.display="block";errBox.textContent="เกิดข้อผิดพลาด: "+e.message;btn.disabled=false;})'
    + '.sidebarStartSync();'
    + '}'
    + 'btn.addEventListener("click",start);'
    + 'poll();'
    + '</script>'
}
