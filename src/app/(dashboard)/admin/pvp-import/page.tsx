'use client'

import { useRef, useState, type DragEvent, type ChangeEvent } from 'react'
import { useAuth } from '@/hooks/useAuth'
import { getDemoMode } from '@/lib/demo/demoMode'
import { Header } from '@/components/layout/Header'
import { AdministrationTabs } from '@/components/layout/AdministrationTabs'
import { authedFetch } from '@/lib/api/authedFetch'
import { parsePvpPriceText, type ParsedPvpRow } from '@/lib/utils/csvParser'
import type { CSVImportError } from '@/types/tracking'

// Rows per request. The server caps this at 2000; a 25k-row file therefore
// takes ~13 sequential calls, each well inside the function time limit. This
// is what makes a file this size importable at all — one request for the whole
// thing cannot finish in 60s (see /api/sheets/pvp-sync for that story).
const CHUNK_ROWS = 1500

interface ChunkResult { written: number; unchanged: number; quotaExhausted: boolean }

type Phase = 'idle' | 'parsing' | 'uploading' | 'done'

export default function PvpImportPage() {
  const { user } = useAuth()
  const isDemo = getDemoMode()
  const inputRef = useRef<HTMLInputElement>(null)

  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [phase, setPhase] = useState<Phase>('idle')
  const [parsed, setParsed] = useState<ParsedPvpRow[] | null>(null)
  const [parseErrors, setParseErrors] = useState<CSVImportError[]>([])
  const [sentRows, setSentRows] = useState(0)
  const [totals, setTotals] = useState({ written: 0, unchanged: 0 })
  const [quotaStopped, setQuotaStopped] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (user && user.role !== 'super_admin') {
    return (
      <div className="flex items-center justify-center h-full bg-white">
        <p className="text-sm text-gray-400">ไม่มีสิทธิ์เข้าถึงหน้านี้</p>
      </div>
    )
  }

  const busy = phase === 'parsing' || phase === 'uploading'

  function reset() {
    setFile(null); setParsed(null); setParseErrors([])
    setSentRows(0); setTotals({ written: 0, unchanged: 0 })
    setQuotaStopped(false); setError(null); setPhase('idle')
  }

  async function pickFile(f: File) {
    if (!f.name.toLowerCase().endsWith('.csv')) {
      setError('รองรับเฉพาะไฟล์ .csv')
      return
    }
    reset()
    setFile(f)
    setPhase('parsing')
    try {
      const { data, errors } = parsePvpPriceText(await f.text())
      setParsed(data)
      setParseErrors(errors)
      setPhase('idle')
      if (data.length === 0 && errors.length > 0) {
        setError('อ่านไฟล์ไม่สำเร็จ — ดูรายละเอียดด้านล่าง')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('idle')
    }
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) void pickFile(f)
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) void pickFile(f)
    e.target.value = '' // let the same file be re-picked after a reset
  }

  async function handleImport() {
    if (!parsed || parsed.length === 0) return
    setError(null); setPhase('uploading')
    setSentRows(0); setTotals({ written: 0, unchanged: 0 }); setQuotaStopped(false)

    let written = 0
    let unchanged = 0
    try {
      for (let i = 0; i < parsed.length; i += CHUNK_ROWS) {
        const slice = parsed.slice(i, i + CHUNK_ROWS)
        const res = await authedFetch('/api/csv/pvp-prices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: slice }),
        })
        const json = (await res.json()) as ChunkResult & { error?: string }
        if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)

        written += json.written
        unchanged += json.unchanged
        setTotals({ written, unchanged })
        setSentRows(Math.min(i + slice.length, parsed.length))

        // Out of daily Firestore quota — stop cleanly. What has been written
        // stays written, and re-running the same file tomorrow skips it via
        // the row hash, so it resumes rather than starting over.
        if (json.quotaExhausted) { setQuotaStopped(true); break }
      }
      setPhase('done')
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setPhase('idle')
    }
  }

  const pct = parsed && parsed.length > 0 ? Math.round((sentRows / parsed.length) * 100) : 0

  return (
    <div className="flex flex-col h-full bg-white">
      <Header title="นำเข้าราคาสินค้า (PVP)" subtitle="อัปโหลดไฟล์ CSV เข้าสู่ระบบ" />
      <AdministrationTabs />

      <div className="flex-1 overflow-auto">
        <div className="w-full max-w-3xl mx-auto px-6 py-6 space-y-4">

          {isDemo && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 text-sm text-amber-700">
              โหมด Demo — การนำเข้าจะไม่ถูกบันทึกลงฐานข้อมูลจริง
            </div>
          )}

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6 space-y-4">
            <div
              onDragOver={(e) => { if (busy) return; e.preventDefault(); setDragging(true) }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => { if (busy) { e.preventDefault(); return } onDrop(e) }}
              onClick={() => { if (!busy) inputRef.current?.click() }}
              className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 transition-colors ${
                busy
                  ? 'cursor-not-allowed opacity-60 border-gray-200'
                  : 'cursor-pointer border-gray-200 hover:border-freshket-500 hover:bg-freshket-100/40'
              } ${dragging && !busy ? 'border-freshket-500 bg-freshket-100' : ''}`}
            >
              <svg className="size-8 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-.41-8.98 4.5 4.5 0 018.08-3.05 3 3 0 013.76 3.87 3 3 0 01.42 5.66" />
              </svg>
              <p className="text-sm text-gray-700">{file ? file.name : 'ลากไฟล์มาวาง หรือคลิกเพื่อเลือก'}</p>
              <p className="text-xs text-gray-400 text-center">
                ต้องมีคอลัมน์ SKU, NAME, Pack Size, Category, Picture, Public Price, Public Price Ex-Vat, Private Price, Private Price Ex-Vat, Vat, Remark
              </p>
              <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={onChange} />
            </div>

            {phase === 'parsing' && <p className="text-xs text-gray-500">กำลังอ่านไฟล์…</p>}

            {parsed && (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                <Stat label="แถวที่อ่านได้" value={parsed.length} cls="bg-freshket-100 text-freshket-700" />
                <Stat label="เขียนแล้ว" value={totals.written} cls="bg-freshket-100 text-freshket-700" />
                <Stat label="ไม่เปลี่ยนแปลง" value={totals.unchanged} cls="bg-gray-100 text-gray-600" />
              </div>
            )}

            {phase === 'uploading' && (
              <div>
                <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300"
                    style={{ width: `${pct}%`, background: '#00ce7c' }}
                  />
                </div>
                <p className="text-xs text-gray-500 mt-1.5 tabular-nums">
                  กำลังนำเข้า… {sentRows.toLocaleString()} / {parsed?.length.toLocaleString()} แถว ({pct}%)
                </p>
              </div>
            )}

            {quotaStopped && (
              <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                <p className="font-bold">โควตา Firestore หมดแล้ววันนี้</p>
                <p className="text-xs mt-1">
                  ข้อมูลที่เขียนไปแล้วถูกบันทึกเรียบร้อย — อัปโหลดไฟล์เดิมซ้ำอีกครั้งหลังโควตารีเซ็ต
                  (ประมาณ 15:00 น.) ระบบจะข้ามแถวที่เขียนไปแล้วและทำต่อจากจุดที่ค้าง
                </p>
              </div>
            )}

            {phase === 'done' && !quotaStopped && (
              <div className="rounded-2xl border border-freshket-200 bg-freshket-100 px-4 py-3 text-sm text-freshket-700">
                นำเข้าเสร็จสมบูรณ์ — เขียน {totals.written.toLocaleString()} รายการ,
                ไม่เปลี่ยนแปลง {totals.unchanged.toLocaleString()} รายการ
              </div>
            )}

            {parseErrors.length > 0 && (
              <div className="rounded-2xl border border-gray-200 bg-gray-50 px-4 py-3">
                <p className="text-xs font-bold text-gray-700 mb-1.5">
                  แถวที่มีปัญหา ({parseErrors.length.toLocaleString()})
                </p>
                <ul className="text-xs text-gray-500 space-y-0.5 max-h-40 overflow-y-auto">
                  {parseErrors.slice(0, 100).map((e, i) => (
                    <li key={i}>แถว {e.row} · {e.field}: {e.message}{e.rawValue ? ` ("${e.rawValue}")` : ''}</li>
                  ))}
                  {parseErrors.length > 100 && (
                    <li className="text-gray-400">… และอีก {(parseErrors.length - 100).toLocaleString()} รายการ</li>
                  )}
                </ul>
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">
                {error}
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-1">
              {(file || parsed) && !busy && (
                <button
                  type="button"
                  onClick={reset}
                  className="px-4 py-2.5 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50 transition-all duration-150"
                >
                  ล้าง
                </button>
              )}
              <button
                type="button"
                onClick={handleImport}
                disabled={busy || !parsed || parsed.length === 0 || phase === 'done'}
                className="px-5 py-2.5 rounded-xl bg-freshket-500 text-white text-sm font-bold hover:bg-freshket-600 transition-all duration-150 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {phase === 'uploading' ? 'กำลังนำเข้า…' : 'เริ่มนำเข้า'}
              </button>
            </div>
          </div>

          <p className="text-xs text-gray-400 px-1">
            แถวที่ค่าไม่เปลี่ยนจากครั้งก่อนจะถูกข้าม ไม่เขียนซ้ำ — อัปโหลดไฟล์เดิมซ้ำได้โดยไม่เปลืองโควตา
          </p>
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value, cls }: { label: string; value: number; cls: string }) {
  return (
    <div className={`rounded-xl px-3 py-2.5 ${cls}`}>
      <p className="text-lg font-black leading-none tabular-nums">{value.toLocaleString()}</p>
      <p className="text-xs font-bold mt-1">{label}</p>
    </div>
  )
}
