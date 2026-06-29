'use client'

import { useState, useRef, type DragEvent, type ChangeEvent } from 'react'
import { clsx } from 'clsx'
import { Button } from '@/components/common/Button'
import type { CSVImportError } from '@/types/tracking'

type ImportType = 'employees' | 'training_results'

interface CSVUploaderProps {
  type: ImportType
  onSuccess?: (batchId: string, rows: number) => void
}

const TYPE_LABELS: Record<ImportType, string> = {
  employees: 'ข้อมูลพนักงาน',
  training_results: 'ผลการอบรม',
}

const TYPE_TEMPLATES: Record<ImportType, string[]> = {
  employees: ['employeeId', 'email', 'displayName', 'role', 'teamId', 'department', 'position'],
  training_results: ['employeeEmail', 'courseId', 'courseTitle', 'status', 'score', 'completedAt'],
}

export function CSVUploader({ type, onSuccess }: CSVUploaderProps) {
  const [file, setFile] = useState<File | null>(null)
  const [dragging, setDragging] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [result, setResult] = useState<{ success: number; failed: number; batchId: string } | null>(null)
  const [errors, setErrors] = useState<CSVImportError[]>([])
  const inputRef = useRef<HTMLInputElement>(null)

  function handleFile(f: File) {
    if (!f.name.endsWith('.csv')) {
      alert('กรุณาอัปโหลดไฟล์ .csv เท่านั้น')
      return
    }
    setFile(f)
    setResult(null)
    setErrors([])
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    const f = e.dataTransfer.files[0]
    if (f) handleFile(f)
  }

  function onChange(e: ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) handleFile(f)
  }

  async function handleUpload() {
    if (!file) return
    setUploading(true)
    setErrors([])

    const formData = new FormData()
    formData.append('file', file)
    formData.append('type', type)

    try {
      const res = await fetch('/api/csv/import', { method: 'POST', body: formData })
      const json = await res.json()

      if (!res.ok) {
        setErrors([{ row: 0, field: 'server', message: json.error ?? 'เกิดข้อผิดพลาด', rawValue: '' }])
        return
      }

      setResult({ success: json.successRows, failed: json.failedRows, batchId: json.batchId })
      setErrors(json.errors ?? [])
      onSuccess?.(json.batchId, json.successRows)
    } catch {
      setErrors([{ row: 0, field: 'network', message: 'ไม่สามารถเชื่อมต่อได้ กรุณาลองใหม่', rawValue: '' }])
    } finally {
      setUploading(false)
    }
  }

  function downloadTemplate() {
    const header = TYPE_TEMPLATES[type].join(',')
    const blob = new Blob([header + '\n'], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `template_${type}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-brand-dark">นำเข้า{TYPE_LABELS[type]}</h3>
        <button
          onClick={downloadTemplate}
          className="text-xs text-brand-green underline underline-offset-2 hover:text-brand-green-dark"
        >
          ดาวน์โหลด Template
        </button>
      </div>

      {/* Drop zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        onClick={() => inputRef.current?.click()}
        className={clsx(
          'flex flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed cursor-pointer p-8 transition-colors',
          dragging
            ? 'border-brand-green bg-brand-green-50'
            : 'border-gray-200 hover:border-brand-green hover:bg-brand-green-50',
        )}
      >
        <svg className="size-10 text-brand-muted" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
        </svg>
        <div className="text-center">
          <p className="text-sm font-normal text-brand-dark">
            {file ? file.name : 'ลากไฟล์มาวาง หรือคลิกเพื่อเลือก'}
          </p>
          <p className="text-xs text-brand-muted mt-1">รองรับเฉพาะ .csv</p>
        </div>
        <input ref={inputRef} type="file" accept=".csv" className="hidden" onChange={onChange} />
      </div>

      {file && (
        <Button onClick={handleUpload} loading={uploading} className="w-full">
          {uploading ? 'กำลังนำเข้าข้อมูล...' : `นำเข้า${TYPE_LABELS[type]}`}
        </Button>
      )}

      {/* Result */}
      {result && (
        <div className="rounded-lg bg-brand-green-50 border border-brand-green-100 p-4 text-sm">
          <p className="font-bold text-brand-green">นำเข้าสำเร็จ</p>
          <p className="text-brand-dark mt-1">
            สำเร็จ {result.success} แถว · ผิดพลาด {result.failed} แถว
          </p>
        </div>
      )}

      {/* Errors */}
      {errors.length > 0 && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 space-y-2">
          <p className="text-sm font-bold text-red-700">พบข้อผิดพลาด {errors.length} รายการ</p>
          <ul className="text-xs text-red-600 space-y-1 max-h-40 overflow-y-auto">
            {errors.map((e, i) => (
              <li key={i}>
                แถว {e.row} · {e.field}: {e.message}
                {e.rawValue ? ` (ค่า: "${e.rawValue}")` : ''}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
