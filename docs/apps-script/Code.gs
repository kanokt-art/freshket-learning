/**
 * Freshket LMS — sync the HR employee sheet into Firestore `users`.
 *
 * Sheet : https://docs.google.com/spreadsheets/d/1KTqh-7i9Qn9BiiDtrvuko16-RCDZjZ43-GI22_8lb0Y/edit
 * Tab   : DB
 *
 * Mirrors the app's own CSV importer exactly (see parseCsvToProfiles in
 * src/app/(dashboard)/users/page.tsx) so a sheet sync and a manual CSV upload
 * produce identical documents — same uid, same fields, same role mapping.
 *
 * ── SETUP ────────────────────────────────────────────────────────────────────
 * 1. Extensions → Apps Script, paste this file.
 * 2. Project Settings → Script Properties, add:
 *      FIREBASE_PROJECT_ID   lms-sale-project
 *      FIREBASE_CLIENT_EMAIL firebase-adminsdk-...@lms-sale-project.iam.gserviceaccount.com
 *      FIREBASE_PRIVATE_KEY  -----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n
 *    (from the service-account JSON. Keep \n escaped exactly as in the JSON.)
 *    Script Properties are not readable by viewers of the sheet — never paste the
 *    key into a cell or into this file.
 * 3. Run `testConnection` once and approve the OAuth prompt.
 * 4. Run `createDailyTrigger` once to schedule the 02:00 sync.
 *
 * ── HOW TO TELL IT ACTUALLY RAN ──────────────────────────────────────────────
 * Three independent checks, cheapest first:
 *   a) The SYNC_LOG tab in this spreadsheet — one row per run, with counts and
 *      any problems. Written on success AND on failure.
 *   b) The web app URL (Deploy → New deployment → Web app), which renders that
 *      log plus whether a trigger is installed, and has a "Sync เดี๋ยวนี้" button.
 *      Opening the URL only DISPLAYS status — it does not itself push data.
 *   c) Firebase Console → Firestore → users: a synced person has
 *      uid `csv-{Emp.ID}` and a fresh `updatedAt`.
 *
 * If you redeploy the web app, use Deploy → Manage deployments → edit the
 * EXISTING deployment, otherwise the /exec URL changes.
 *
 * ── SAFETY ───────────────────────────────────────────────────────────────────
 * - Never deletes. A person removed from the sheet keeps their document and
 *   their training history; use the Status column to mark leavers.
 * - Never overwrites a field with blank. An empty cell means "not in this
 *   export", so the existing value is kept.
 * - Never changes `role`, `teamId` or `visibleTeamIds` on someone who already
 *   exists — those are set inside the app, and the sheet must not undo them.
 *   `role` is only derived from Rank when creating a NEW person.
 */

// ── Column layout of the DB tab (0-based). Must match the app's importer. ─────
var COL = {
  no: 0,            // No
  status: 1,        // Status          → employmentStatus (only "Active" is active)
  empId: 2,         // Emp.ID          → employeeId, and the uid: csv-{Emp.ID}
  title: 3,         // Title           (not imported)
  nameTH: 4,        // Name-Surname (TH)  → displayName
  nameEN: 5,        // Name-Surname (Eng) → displayNameEN
  nickname: 6,      // Nick name       → nickname
  tel: 7,           // Tel.            (not imported — PII, not needed by the LMS)
  department: 8,    // Department      → department
  rank: 9,          // Rank            → rank, and role for NEW users
  position: 10,     // Position        → position
  location: 11,     // Location        (not imported)
  startDate: 12,    // Start Date      → startDate
  lastDate: 13,     // Last Date       (not imported)
  lineManager: 14,  // Line Manager    → lineManager
  email: 15,        // Company Email   → email
}

var SHEET_NAME = 'DB'
var COLLECTION = 'users'

// ── Entry point (also what the daily trigger calls) ───────────────────────────
//
// Writes go through Firestore's :batchWrite endpoint, up to BATCH_SIZE per HTTP
// call, instead of one GET+PATCH pair per row. At ~1,600 rows that's the
// difference between ~3,200 sequential requests (15-20 min, blows past the
// 6-minute execution limit) and ~4 requests (a few seconds). "Does this uid
// already exist" is answered once up front via listAllUids_ instead of a GET
// per row, since that's the only reason the old code fetched each doc first.
var BATCH_SIZE = 500 // Firestore :batchWrite hard cap per call

function syncEmployeesToFirestore() {
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

  setProgress_({ done: 0, total: totalRows, created: 0, updated: 0, duplicate: 0, failed: 0, resignedSkipped: 0, status: 'running' })

  // One list call (paginated) instead of one GET per row — this is the whole
  // reason the old version was O(N) HTTP round-trips instead of O(N/500).
  var existingUsers = listAllUsers_(projectId, token)

  var seenEmpId = {}
  var seenEmail = {}
  var duplicate = 0, failed = 0, resignedSkipped = 0
  var problems = []
  var writes = [] // { uid, fields, mask, isNew }

  for (var i = 1; i < rows.length; i++) {
    var r = rows[i]
    var rowNo = i + 1

    var empId = str_(r[COL.empId])
    var nameTH = str_(r[COL.nameTH])
    var nameEN = str_(r[COL.nameEN])
    var email = str_(r[COL.email]).toLowerCase()
    var displayName = nameTH || nameEN
    var status = str_(r[COL.status])

    // A row with no name is not a person — blank spacer rows are common.
    if (!displayName) { continue }

    // Resigned people are never written — not created, not updated. Someone
    // already in Firestore keeps their existing document untouched (per the
    // file-header safety note: the sheet must not undo what the app already
    // set), and someone who resigned before ever being synced simply never
    // gets a document.
    if (status === 'Resigned') { resignedSkipped++; continue }

    // Need at least one stable key to build a uid from.
    if (!empId && !email) {
      problems.push('แถว ' + rowNo + ': ' + displayName + ' — ไม่มีทั้ง Emp.ID และ Company Email')
      failed++
      continue
    }

    // Duplicates inside the sheet: keep the first, report the rest. Writing both
    // would have the second silently overwrite the first.
    if (empId && seenEmpId[empId]) {
      problems.push('แถว ' + rowNo + ': ' + displayName + ' — Emp.ID ' + empId + ' ซ้ำกับแถว ' + seenEmpId[empId])
      duplicate++
      continue
    }
    if (email && seenEmail[email]) {
      problems.push('แถว ' + rowNo + ': ' + displayName + ' — อีเมล ' + email + ' ซ้ำกับแถว ' + seenEmail[email])
      duplicate++
      continue
    }
    if (empId) seenEmpId[empId] = rowNo
    if (email) seenEmail[email] = rowNo

    // Same deterministic uid the app uses, so a sheet sync and a CSV upload
    // converge on ONE document per employee instead of creating a duplicate.
    var uid = empId
      ? 'csv-' + empId
      : 'csv-' + email.split('@')[0].replace(/[^a-z0-9]/gi, '-').toLowerCase()

    var existing = existingUsers[uid] || null

    var fields = {}
    putString_(fields, 'uid', uid)
    putString_(fields, 'email', email || (existing && existing.email) || (empId || uid) + '@freshket.co')
    putString_(fields, 'displayName', displayName)

    // Optional fields: only written when the sheet actually has a value, so a
    // blank cell never erases data already on file.
    putIfPresent_(fields, 'displayNameEN', nameEN)
    putIfPresent_(fields, 'nickname', str_(r[COL.nickname]))
    putIfPresent_(fields, 'employeeId', empId)
    putIfPresent_(fields, 'department', str_(r[COL.department]))
    putIfPresent_(fields, 'position', str_(r[COL.position]))
    putIfPresent_(fields, 'rank', str_(r[COL.rank]))
    putIfPresent_(fields, 'lineManager', str_(r[COL.lineManager]))
    putIfPresent_(fields, 'employmentStatus', str_(r[COL.status]))

    var start = parseDate_(r[COL.startDate])
    if (start) fields.startDate = { timestampValue: start.toISOString() }

    // role is derived ONLY when creating. For an existing person the app is the
    // source of truth — an admin may have promoted them, and re-deriving from
    // Rank every night would silently demote them back.
    if (!existing) {
      putString_(fields, 'role', rankToRole_(str_(r[COL.rank])))
      putString_(fields, 'photoURL', null)
      fields.createdAt = { timestampValue: new Date().toISOString() }
    }
    fields.updatedAt = { timestampValue: new Date().toISOString() }

    writes.push({ uid: uid, rowNo: rowNo, displayName: displayName, fields: fields, isNew: !existing })
  }

  var created = 0, updated = 0
  for (var b = 0; b < writes.length; b += BATCH_SIZE) {
    var batch = writes.slice(b, b + BATCH_SIZE)
    var results = batchWrite_(projectId, token, batch)
    for (var j = 0; j < batch.length; j++) {
      if (results[j]) {
        if (batch[j].isNew) created++; else updated++
      } else {
        problems.push('แถว ' + batch[j].rowNo + ': ' + batch[j].displayName + ' — เขียน Firestore ไม่สำเร็จ')
        failed++
      }
    }
    setProgress_({ done: Math.min(b + BATCH_SIZE, writes.length), total: totalRows, created: created, updated: updated, duplicate: duplicate, failed: failed, resignedSkipped: resignedSkipped, status: 'running' })
  }

  var summary = 'Sync เสร็จ — เพิ่มใหม่ ' + created + ' คน, อัปเดต ' + updated + ' คน, ซ้ำ ' + duplicate + ' คน, ไม่สำเร็จ ' + failed + ' คน, ลาออกแล้ว (ข้าม) ' + resignedSkipped + ' คน'
  Logger.log(summary)
  if (problems.length) {
    Logger.log('ปัญหาที่พบ (' + problems.length + '):')
    problems.forEach(function (p) { Logger.log('  - ' + p) })
  }
  setProgress_({ done: totalRows, total: totalRows, created: created, updated: updated, duplicate: duplicate, failed: failed, resignedSkipped: resignedSkipped, status: 'done' })
  return { created: created, updated: updated, duplicate: duplicate, failed: failed, resignedSkipped: resignedSkipped, problems: problems }
}

// ── Progress tracking (polled by the status page while a sync runs) ───────────
var PROGRESS_KEY = 'sync_progress'

function setProgress_(p) {
  PropertiesService.getScriptProperties().setProperty(PROGRESS_KEY, JSON.stringify(p))
}

function getProgress_() {
  var raw = PropertiesService.getScriptProperties().getProperty(PROGRESS_KEY)
  return raw ? JSON.parse(raw) : null
}

// ── Rank → role. Same thresholds as rankToRole() in the app. ──────────────────
function rankToRole_(rank) {
  var m = String(rank || '').match(/JG(\d+)/i)
  if (!m) return 'sale'
  var n = parseInt(m[1], 10)
  if (n >= 11) return 'super_admin'  // Head of Dept, VP, C-Level
  if (n >= 9) return 'manager'
  if (n >= 7) return 'team_lead'
  return 'sale'
}

// ── Dates. Accepts a real Date cell, "27-Aug-2018", "27/08/2018", "2018-08-27" ─
var MONTHS = { Jan:1, Feb:2, Mar:3, Apr:4, May:5, Jun:6, Jul:7, Aug:8, Sep:9, Oct:10, Nov:11, Dec:12 }
function parseDate_(v) {
  if (v instanceof Date && !isNaN(v.getTime())) return v
  var s = str_(v)
  if (!s) return null

  var m = s.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/)
  if (m) {
    var mo = MONTHS[m[2].charAt(0).toUpperCase() + m[2].slice(1).toLowerCase()]
    if (mo) return new Date(parseInt(m[3], 10), mo - 1, parseInt(m[1], 10))
  }
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10))
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (m) return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10))

  var d = new Date(s)
  return isNaN(d.getTime()) ? null : d
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
 * Every uid + email already in Firestore, in as few requests as pagination
 * allows (1,000 docs/page — the Firestore max). Replaces a GET-per-row check:
 * at ~1,600 rows that's 2 requests total instead of 1,600.
 */
function listAllUsers_(projectId, token) {
  var out = {}
  var pageToken = ''
  do {
    var url = collectionUrl_(projectId) + '?pageSize=1000&mask.fieldPaths=email'
      + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '')
    var res = UrlFetchApp.fetch(url, {
      method: 'get',
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true,
    })
    if (res.getResponseCode() !== 200) {
      throw new Error('อ่านรายชื่อผู้ใช้เดิมจาก Firestore ไม่สำเร็จ: ' + res.getContentText())
    }
    var body = JSON.parse(res.getContentText())
    (body.documents || []).forEach(function (doc) {
      var uid = doc.name.split('/').pop()
      out[uid] = { email: readString_(doc, 'email') }
    })
    pageToken = body.nextPageToken || ''
  } while (pageToken)
  return out
}

/**
 * Writes up to BATCH_SIZE documents in ONE Firestore :batchWrite call instead
 * of one PATCH per document. Each entry gets its own field-level updateMask,
 * so this is equivalent to the old per-row PATCH — just all in one round trip.
 * Returns a boolean per input write (batchWrite reports per-write status, it
 * doesn't fail the whole call if one write is bad).
 */
function batchWrite_(projectId, token, batch) {
  var writes = batch.map(function (w) {
    return {
      update: { name: docUrl_(projectId, w.uid).replace('https://firestore.googleapis.com/v1/', ''), fields: w.fields },
      updateMask: { fieldPaths: Object.keys(w.fields) },
    }
  })

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
    return batch.map(function () { return false })
  }

  var body = JSON.parse(res.getContentText())
  var statuses = body.status || []
  return batch.map(function (_, i) {
    // An empty status object ({}) means OK — Firestore only populates it on error.
    return !(statuses[i] && statuses[i].code)
  })
}

// ── Value helpers ─────────────────────────────────────────────────────────────
function str_(v) { return v === null || v === undefined ? '' : String(v).trim() }

function putString_(fields, key, value) {
  fields[key] = value === null ? { nullValue: null } : { stringValue: String(value) }
}

/** Only writes when there is a value — a blank cell must not erase what's stored. */
function putIfPresent_(fields, key, value) {
  var s = str_(value)
  if (s) fields[key] = { stringValue: s }
}

function readString_(doc, key) {
  return doc && doc.fields && doc.fields[key] ? doc.fields[key].stringValue : ''
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
    var empId = str_(r[COL.empId])
    var email = str_(r[COL.email]).toLowerCase()
    Logger.log('  uid=' + (empId ? 'csv-' + empId : 'csv-' + (email.split('@')[0] || '?')) +
      ' | ' + str_(r[COL.nameTH]) +
      ' | rank=' + str_(r[COL.rank]) + ' → role=' + rankToRole_(str_(r[COL.rank])) +
      ' | start=' + parseDate_(r[COL.startDate]))
  }
}

// ── Sync log + status page ────────────────────────────────────────────────────
//
// A daily trigger runs unattended, so "did it work?" has to be answerable without
// opening the Apps Script editor. Every run appends a line to a SYNC_LOG tab, and
// the web app (/exec) renders the last runs as a page anyone on the team can open.
//
// Note the two are independent: opening /exec only DISPLAYS status, it does not
// push data. Use the button on that page (or `syncEmployeesToFirestore` in the
// editor) to force a run.

var LOG_SHEET = 'SYNC_LOG'

function logSheet_() {
  // Locked because startSyncAsync_ can leave two scheduledSync executions
  // racing (a stale trigger plus a fresh manual run) — without the lock both
  // see no SYNC_LOG tab yet and both call insertSheet, and the second one
  // throws "a sheet with this name already exists".
  var lock = LockService.getScriptLock()
  lock.waitLock(30000)
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet()
    var sh = ss.getSheetByName(LOG_SHEET)
    if (!sh) {
      sh = ss.insertSheet(LOG_SHEET)
      sh.appendRow(['เวลา', 'ผลลัพธ์', 'เพิ่มใหม่', 'อัปเดต', 'ข้าม', 'ปัญหา', 'รายละเอียด'])
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
    result ? result.duplicate + result.failed : 0,
    result && result.problems ? result.problems.length : 0,
    errorMessage || (result && result.problems.length ? result.problems.slice(0, 5).join(' | ') : ''),
  ])
  // Keep the log from growing without bound.
  var max = 500
  if (sh.getLastRow() > max + 1) sh.deleteRows(2, sh.getLastRow() - max - 1)
}

/**
 * What the daily trigger actually calls. Wraps the sync so a failure is still
 * recorded — an unlogged crash is indistinguishable from "never ran".
 */
function scheduledSync() {
  try {
    var result = syncEmployeesToFirestore()
    writeLog_(result, null)
    return result
  } catch (e) {
    setProgress_({ done: 0, total: 0, status: 'error', message: String(e && e.message ? e.message : e) })
    writeLog_(null, String(e && e.message ? e.message : e))
    throw e
  }
}

/**
 * Fires scheduledSync in its OWN execution via a one-time trigger, so the
 * doGet request that kicks it off can return immediately instead of blocking
 * for the whole sync — that's what lets the status page poll live progress
 * instead of the browser tab just hanging until it's done.
 */
function startSyncAsync_() {
  ScriptApp.newTrigger('scheduledSync').timeBased().after(1).create()
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
      .setTitle('Freshket LMS — สถานะ Sync')
  }

  return HtmlService.createHtmlOutput(buildStatusHtml_(false))
    .setTitle('Freshket LMS — สถานะ Sync')
}

function buildStatusHtml_(justStarted) {
  var sh = logSheet_()
  var last = sh.getLastRow()
  var rows = last > 1 ? sh.getRange(2, 1, Math.min(last - 1, 20), 7).getValues() : []
  rows.reverse()

  var triggers = ScriptApp.getProjectTriggers().filter(function (t) {
    return t.getHandlerFunction() === 'scheduledSync' ||
           t.getHandlerFunction() === 'syncEmployeesToFirestore'
  })

  var html = '<html><head><meta charset="utf-8"><title>Freshket LMS — สถานะ Sync</title>'
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

  html += '<h1>Freshket LMS — สถานะ Sync พนักงาน</h1>'
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
      + ' (เพิ่ม ' + latest[2] + ', อัปเดต ' + latest[3] + ', ข้าม ' + latest[4] + ')</p>'

    html += '<table><tr><th>เวลา</th><th>ผล</th><th>เพิ่ม</th><th>อัปเดต</th><th>ข้าม</th><th>ปัญหา</th><th>รายละเอียด</th></tr>'
    rows.forEach(function (r) {
      html += '<tr><td>' + Utilities.formatDate(new Date(r[0]), Session.getScriptTimeZone(), 'dd/MM/yy HH:mm') + '</td>'
        + '<td class="' + (r[1] === 'สำเร็จ' ? 'ok' : 'bad') + '">' + r[1] + '</td>'
        + '<td>' + r[2] + '</td><td>' + r[3] + '</td><td>' + r[4] + '</td><td>' + r[5] + '</td>'
        + '<td>' + String(r[6] || '').replace(/</g, '&lt;') + '</td></tr>'
    })
    html += '</table>'
  }

  html += '<a class="btn" href="?run=1" id="syncBtn">Sync เดี๋ยวนี้</a>'

  // Polls ?status=1 every 2s while a sync is running, updates the bar in
  // place, then reloads once to show the finished row in SYNC_LOG.
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
    if (fn === 'scheduledSync' || fn === 'syncEmployeesToFirestore') ScriptApp.deleteTrigger(t)
  })
  // scheduledSync, not syncEmployeesToFirestore: the wrapper records every run —
  // including a failure — in SYNC_LOG. A crash in the bare function would leave
  // no trace, and "it failed" would look exactly like "it never ran".
  ScriptApp.newTrigger('scheduledSync')
    .timeBased()
    .atHour(2)          // 02:00 in the script's timezone — set that under Project Settings
    .everyDays(1)
    .create()
  Logger.log('ตั้ง trigger รายวัน 02:00 เรียบร้อย (เรียก scheduledSync)')
}

// ── In-sheet sidebar ───────────────────────────────────────────────────────────
//
// Same async-trigger + polling mechanism as the /exec status page, but surfaced
// as a menu + sidebar inside the spreadsheet itself so nobody has to leave the
// sheet or hunt for the deployed web app URL to run a sync.

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('FKT-LMS Sync')
    .addItem('เปิดหน้า Sync', 'showSyncSidebar')
    .addToUi()
}

function showSyncSidebar() {
  var html = HtmlService.createHtmlOutput(buildSidebarHtml_())
    .setTitle('Sync พนักงาน → Firestore')
  SpreadsheetApp.getUi().showSidebar(html)
}

/** Same status/run contract as doGet, callable from the sidebar via google.script.run. */
function sidebarStatus() {
  return getProgress_() || { status: 'idle' }
}

function sidebarStartSync() {
  var current = getProgress_()
  if (current && current.status === 'running') return // already in flight — ignore a double-click
  setProgress_({ done: 0, total: 0, created: 0, updated: 0, duplicate: 0, failed: 0, resignedSkipped: 0, status: 'running' })
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
    + '<h2>Sync พนักงาน → Firestore</h2>'
    + '<button id="btn">Sync to Firestore</button>'
    + '<div id="progressWrap"><div id="progressLabel">กำลัง sync…</div>'
    + '<div id="progressBar"><div id="progressFill"></div></div></div>'
    + '<div id="resultCard">'
    + '<div class="row"><span><span class="dot ok"></span>สำเร็จ</span><span class="val" id="rCreated">0</span></div>'
    + '<div class="row"><span><span class="dot warn"></span>ซ้ำ</span><span class="val" id="rDup">0</span></div>'
    + '<div class="row"><span><span class="dot bad"></span>ไม่สำเร็จ</span><span class="val" id="rFailed">0</span></div>'
    + '<div class="row"><span><span class="dot" style="background:#94a3b8"></span>ลาออกแล้ว (ข้าม)</span><span class="val" id="rResigned">0</span></div>'
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
    + 'document.getElementById("rResigned").textContent=p.resignedSkipped||0;'
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
