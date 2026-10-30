'use client'

import { useRef, useState } from 'react'
import ReactCrop, { type Crop, centerCrop, makeAspectCrop } from 'react-image-crop'
import 'react-image-crop/dist/ReactCrop.css'
import { useAuth } from '@/hooks/useAuth'
import { authedFetch } from '@/lib/api/authedFetch'

// Cover-image picker (Gallery / Upload+crop / AI-assisted Unsplash search) —
// shared by Course and Tool cover images so both entities get the same
// picker instead of Tools' plain URL text box. Generalized out of what was
// originally courses/page.tsx's local `ImageSection`.

const THUMB_COLORS = [
  '#e5e7eb', '#f87171', '#fbbf24', '#34d399', '#2dd4bf',
  '#60a5fa', '#818cf8', '#e879f9', '#fb7185', '#1f2937',
]

function isImageUrl(s: string) { return s.startsWith('http') || s.startsWith('/') }

// Recommended and minimum pixel size for a frame of this aspect ratio (width / height).
const REC_WIDTH = 1200
const MIN_WIDTH = 900
const MAX_OUT_WIDTH = 1600   // what the crop is scaled down to, so the upload stays well under 5 MB
const sizeGuide = (aspect: number) => ({
  rec: `${REC_WIDTH} × ${Math.round(REC_WIDTH / aspect)}`,
  min: `${MIN_WIDTH} × ${Math.round(MIN_WIDTH / aspect)}`,
  ratio: `${Number.isInteger(aspect) ? aspect : aspect.toFixed(2)}:1`,
})

type PickerTab = 'gallery' | 'upload' | 'ai'

export interface CoverImageCatalogItem { url: string; label: string; category: string }

export function CoverImagePicker({
  value, onChange, title, description, entityId, catalog,
  uploadEndpoint, uploadIdField, aspect = 3 / 1,
}: {
  value: string
  onChange: (url: string) => void
  /** Subject name — seeds the AI prompt placeholder and the Gemini keyword request. */
  title: string
  description?: string
  /** Used as the upload path prefix; a temp id is generated when creating something new. */
  entityId?: string
  catalog: CoverImageCatalogItem[]
  /** e.g. '/api/upload/course-image' or '/api/upload/tool-image'. */
  uploadEndpoint: string
  /** FormData field name the upload route expects for the id, e.g. 'courseId' | 'toolId'. */
  uploadIdField: string
  /** Crop aspect ratio (width/height). Course headers use 3/1; Tool cards ~2/1. */
  aspect?: number
}) {
  const { getIdToken } = useAuth()
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerTab, setPickerTab] = useState<PickerTab>('gallery')
  const [draft, setDraft] = useState(value)
  const [thumbError, setThumbError] = useState(false)
  const [catalogFilter, setCatalogFilter] = useState('All')
  const [urlInput, setUrlInput] = useState(value)
  const [rawSrc, setRawSrc] = useState('')
  const [crop, setCrop] = useState<Crop>()
  const [completedCrop, setCompletedCrop] = useState<Crop>()
  const [uploading, setUploading] = useState(false)
  // Shown when the picture is smaller than the minimum, or could not be opened for repositioning.
  const [lowRes, setLowRes] = useState<number | null>(null)
  const [cropError, setCropError] = useState('')
  const imgRef = useRef<HTMLImageElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [aiPrompt, setAiPrompt] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [keywords, setKeywords] = useState<string[]>([])
  const [suggestion, setSuggestion] = useState('')
  const [selectedKw, setSelectedKw] = useState('')
  const [kwLoading, setKwLoading] = useState(false)

  function openPicker() {
    setDraft(value); setUrlInput(value)
    setRawSrc(''); setCrop(undefined); setCompletedCrop(undefined); setLowRes(null); setCropError('')
    setKeywords([]); setSelectedKw(''); setAiPrompt(''); setSuggestion('')
    setThumbError(false)
    setPickerOpen(true)
  }

  function handleSave() {
    onChange(draft)
    setPickerOpen(false)
    setRawSrc('')
  }

  function handleCancel() {
    setPickerOpen(false)
    setRawSrc('')
    setDraft(value)
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setRawSrc(reader.result as string)
    reader.readAsDataURL(file)
    setCrop(undefined); setCompletedCrop(undefined); setLowRes(null); setCropError('')
  }

  function onImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { width, height, naturalWidth } = e.currentTarget
    setLowRes(naturalWidth < MIN_WIDTH ? naturalWidth : null)
    setCrop(centerCrop(makeAspectCrop({ unit: '%', width: 100 }, aspect, width, height), width, height))
  }

  // Slide or resize the 3:1 frame over a picture that is already chosen (uploaded, from the
  // gallery, or a link). The result is cut and uploaded again, so the new position is what
  // everyone sees.
  function startReposition() {
    if (!isImageUrl(draft)) return
    setCropError(''); setLowRes(null)
    setCrop(undefined); setCompletedCrop(undefined)
    setRawSrc(draft)
  }

  async function handleCropUpload() {
    if (!imgRef.current || !completedCrop) return
    const canvas = document.createElement('canvas')
    const scaleX = imgRef.current.naturalWidth / imgRef.current.width
    const scaleY = imgRef.current.naturalHeight / imgRef.current.height
    const srcW = completedCrop.width * scaleX
    const srcH = completedCrop.height * scaleY
    // Never larger than MAX_OUT_WIDTH wide; the frame's own shape is kept.
    const outW = Math.max(1, Math.floor(Math.min(srcW, MAX_OUT_WIDTH)))
    canvas.width = outW
    canvas.height = Math.max(1, Math.floor(outW * (srcH / srcW)))
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    setCropError('')
    ctx.drawImage(imgRef.current, completedCrop.x * scaleX, completedCrop.y * scaleY,
      srcW, srcH, 0, 0, canvas.width, canvas.height)
    setUploading(true)
    try {
      const blob = await new Promise<Blob>((res, rej) =>
        canvas.toBlob((b) => b ? res(b) : rej(new Error('toBlob')), 'image/jpeg', 0.9))
      const fd = new FormData()
      fd.append('file', new File([blob], 'header.jpg', { type: 'image/jpeg' }))
      // The upload route validates this against /^[A-Za-z0-9_-]+$/ (it becomes a
      // storage path), so keep the temp id in that charset — no dots.
      fd.append(uploadIdField, entityId ?? `tmp-${Date.now().toString(36)}`)
      // The route requires a verified super_admin ID token (it holds the
      // Supabase service-role key), so send one.
      const idToken = await getIdToken()
      const r = await fetch(uploadEndpoint, {
        method: 'POST',
        headers: idToken ? { Authorization: `Bearer ${idToken}` } : undefined,
        body: fd,
      })
      const data = await r.json()
      if (data.url) { setDraft(data.url); setUrlInput(data.url); setRawSrc('') }
      else setCropError(data.error ? String(data.error) : 'อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง')
    } catch {
      // Typically a picture from another site that does not allow editing, or a network error.
      setCropError('ตัดรูปนี้ไม่ได้ (รูปจากเว็บอื่นอาจไม่อนุญาต) ลองอัปโหลดไฟล์รูปเองแทน')
      /* keep rawSrc so user can retry */
    }
    finally { setUploading(false) }
  }

  async function handleGenerate() {
    const prompt = aiPrompt.trim() || title
    if (!prompt) return
    setAiLoading(true); setKeywords([]); setSuggestion(''); setSelectedKw('')
    try {
      const res = await authedFetch('/api/gemini/course-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ courseName: prompt, description }),
      })
      const data = await res.json()
      if (data.keywords) { setKeywords(data.keywords.slice(0, 4)); setSuggestion(data.suggestion ?? '') }
    } catch { /* silently fail */ }
    finally { setAiLoading(false) }
  }

  async function selectKeyword(kw: string) {
    setSelectedKw(kw); setKwLoading(true)
    try {
      const res = await authedFetch(`/api/unsplash/search?q=${encodeURIComponent(kw)}`)
      const data = await res.json()
      if (data.url) setDraft(data.url)
    } catch {
      const seed = kw.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')
      setDraft(`https://picsum.photos/seed/${seed}/1200/400`)
    } finally { setKwLoading(false) }
  }

  const hasThumbnail = !!value && !thumbError
  const galleryCategories = ['All', ...Array.from(new Set(catalog.map((c) => c.category)))]
  const filteredCatalog = catalogFilter === 'All' ? catalog : catalog.filter((c) => c.category === catalogFilter)

  return (
    <div className="relative">
      {/* ── Thumbnail preview area ── */}
      <div
        className="relative w-full rounded-xl overflow-hidden bg-gray-100 border border-gray-200"
        style={{ height: '160px' }}
      >
        {hasThumbnail ? (
          isImageUrl(value) ? (
            <img
              src={value}
              alt="thumbnail"
              className="absolute inset-0 w-full h-full object-cover"
              onError={() => setThumbError(true)}
            />
          ) : (
            <div className="absolute inset-0" style={{ background: value }} />
          )
        ) : (
          <div className="absolute inset-0 flex items-center justify-center gap-2 bg-gray-50">
            <svg className="size-5 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
            </svg>
            <p className="text-xs text-gray-400">คลิก "Add Thumbnail" เพื่อใส่รูปปก</p>
          </div>
        )}

        {/* Overlay buttons */}
        <div className="absolute inset-0 flex items-end justify-center pb-3 gap-2">
          <button
            type="button"
            onClick={openPicker}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/95 backdrop-blur-sm shadow text-xs font-bold text-gray-700 hover:bg-white hover:shadow-md transition-all border border-white/80"
          >
            <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z" />
            </svg>
            {hasThumbnail ? 'เปลี่ยนรูป' : 'Add Thumbnail'}
          </button>
          {hasThumbnail && (
            <button
              type="button"
              onClick={() => { onChange(''); setThumbError(false) }}
              className="size-9 flex items-center justify-center rounded-xl bg-white/95 backdrop-blur-sm shadow text-gray-500 hover:bg-rose-500 hover:text-white transition-all border border-white/80"
              title="ลบรูป"
            >
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      <p className="mt-1.5 text-xs text-gray-400">
        ขนาดที่แนะนำ {sizeGuide(aspect).rec} px (อัตราส่วน {sizeGuide(aspect).ratio})
      </p>

      {/* ── Picker modal — card overlay, changes only take effect on confirm ── */}
      {pickerOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="animate-pop-in bg-white rounded-2xl border border-gray-200 shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden">

          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-gray-100 shrink-0">
            <h3 className="text-sm font-bold text-gray-900">เลือกภาพปก</h3>
            <button type="button" onClick={handleCancel}
              className="size-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-all">
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Tab bar */}
          <div className="flex border-b border-gray-100 shrink-0">
            {([
              {
                id: 'gallery' as PickerTab,
                label: 'Gallery',
                icon: (
                  <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
                  </svg>
                ),
              },
              {
                id: 'upload' as PickerTab,
                label: 'Upload',
                icon: (
                  <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                  </svg>
                ),
              },
              {
                id: 'ai' as PickerTab,
                label: 'AI',
                icon: (
                  <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
                  </svg>
                ),
              },
            ] as { id: PickerTab; label: string; icon: React.ReactNode }[]).map((t) => (
              <button key={t.id} type="button" onClick={() => setPickerTab(t.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-3 text-xs font-normal border-b-2 transition-all -mb-px ${
                  pickerTab === t.id
                    ? 'border-gray-900 text-gray-900 bg-white'
                    : 'border-transparent text-gray-400 hover:text-gray-600 bg-gray-50'
                }`}>
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="p-4 space-y-3 overflow-y-auto flex-1">

            {pickerTab === 'gallery' && (
              <>
                {/* Solid colors */}
                <div>
                  <p className="text-xs font-bold text-gray-500 mb-2">สีพื้น</p>
                  <div className="flex flex-wrap gap-2">
                    {THUMB_COLORS.map((hex) => (
                      <button
                        key={hex}
                        type="button"
                        onClick={() => setDraft(hex)}
                        className={`size-8 rounded-lg border-2 transition-all hover:scale-110 ${
                          draft === hex ? 'border-freshket-500 scale-110 shadow-md' : 'border-transparent hover:border-gray-300'
                        }`}
                        style={{ background: hex }}
                        title={hex}
                      />
                    ))}
                  </div>
                </div>

                {/* Photos */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-bold text-gray-500">รูปภาพ</p>
                    <div className="flex flex-wrap gap-1.5">
                      {galleryCategories.map((cat) => (
                        <button
                          key={cat}
                          type="button"
                          onClick={() => setCatalogFilter(cat)}
                          className={`px-2.5 py-1 rounded-full text-xs font-bold transition-all ${
                            catalogFilter === cat
                              ? 'bg-gray-900 text-white'
                              : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                          }`}
                        >
                          {cat}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-5 gap-1.5">
                    {/* No image option */}
                    <button
                      type="button"
                      onClick={() => setDraft('')}
                      className={`relative rounded-xl overflow-hidden border-2 transition-all flex flex-col items-center justify-center gap-0.5 bg-gray-50 hover:bg-gray-100 ${
                        draft === '' ? 'border-freshket-500 shadow-md' : 'border-transparent hover:border-gray-200'
                      }`}
                      style={{ aspectRatio: String(aspect) }}
                      title="ไม่มีรูป"
                    >
                      <svg className="size-3 text-gray-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      <span className="text-xs text-gray-400 font-normal leading-none">ไม่มีรูป</span>
                    </button>
                    {filteredCatalog.map((item) => (
                      <button
                        key={item.url}
                        type="button"
                        onClick={() => setDraft(item.url)}
                        className={`relative rounded-xl overflow-hidden border-2 transition-all hover:opacity-90 ${
                          draft === item.url ? 'border-freshket-500 shadow-md' : 'border-transparent hover:border-gray-200'
                        }`}
                        style={{ aspectRatio: String(aspect) }}
                        title={item.label}
                      >
                        <img src={item.url} alt={item.label} className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
                        {draft === item.url && (
                          <div className="absolute inset-0 bg-freshket-500/20 flex items-center justify-center">
                            <svg className="size-4 text-freshket-500 drop-shadow-sm" viewBox="0 0 24 24" fill="currentColor">
                              <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
                            </svg>
                          </div>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}

            {pickerTab === 'upload' && (
              <>
                {/* Size guide */}
                <div className="rounded-xl bg-freshket-50 border border-freshket-200 px-3.5 py-2.5 text-xs text-freshket-700 space-y-0.5">
                  <p className="font-bold">ขนาดที่แนะนำ {sizeGuide(aspect).rec} px (กว้าง × สูง, อัตราส่วน {sizeGuide(aspect).ratio})</p>
                  <p>ขั้นต่ำ {sizeGuide(aspect).min} px · ไฟล์ JPG, PNG หรือ WEBP ไม่เกิน 5 MB</p>
                  <p>อัปโหลดแล้วลากกรอบเพื่อเลื่อนตำแหน่ง ลากมุมเพื่อย่อหรือขยายส่วนที่จะใช้</p>
                </div>

                {/* URL quick-enter */}
                <div>
                  <label className="text-xs text-gray-500 font-normal block mb-1.5">URL รูปภาพ (ถ้ามี)</label>
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => { setUrlInput(e.target.value); setDraft(e.target.value) }}
                    placeholder="https://images.unsplash.com/..."
                    className="w-full px-3 py-2 text-xs rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-300 font-mono"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex-1 h-px bg-gray-100" />
                  <span className="text-xs text-gray-400 shrink-0">หรืออัปโหลดไฟล์</span>
                  <div className="flex-1 h-px bg-gray-100" />
                </div>

                {/* File + Crop */}
                <input ref={fileInputRef} type="file" accept="image/*" onChange={onFileChange} className="hidden" />
                {!rawSrc ? (
                  <button type="button" onClick={() => fileInputRef.current?.click()}
                    className="w-full py-7 border-2 border-dashed border-gray-200 rounded-xl flex flex-col items-center gap-1.5 text-gray-400 hover:border-freshket-300 hover:text-freshket-500 transition-all">
                    <svg className="size-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                    </svg>
                    <span className="text-xs font-bold">คลิกเพื่อเลือกไฟล์รูปภาพ</span>
                    <span className="text-xs">PNG, JPG, WEBP · {sizeGuide(aspect).rec} px ({sizeGuide(aspect).ratio})</span>
                  </button>
                ) : (
                  <div className="space-y-3">
                    <div className="rounded-xl overflow-hidden border border-gray-200">
                      <ReactCrop crop={crop} onChange={(c) => setCrop(c)} onComplete={(c) => setCompletedCrop(c)} aspect={aspect} minHeight={60}>
                        <img ref={imgRef} src={rawSrc} alt="crop preview" crossOrigin="anonymous" onLoad={onImageLoad}
                          onError={() => { setRawSrc(''); setCropError('เปิดรูปนี้เพื่อปรับตำแหน่งไม่ได้ (รูปจากเว็บอื่นอาจไม่อนุญาต) ลองอัปโหลดไฟล์รูปเองแทน') }}
                          className="max-h-48 w-full object-contain" />
                      </ReactCrop>
                    </div>
                    <p className="text-xs text-gray-400">ลากกรอบเพื่อเลื่อนตำแหน่ง · ลากมุมเพื่อย่อ/ขยาย (อัตราส่วน {sizeGuide(aspect).ratio})</p>
                    {lowRes !== null && (
                      <p className="text-xs text-amber-600">รูปนี้กว้างแค่ {lowRes} px (ขั้นต่ำ {MIN_WIDTH} px) ภาพอาจไม่คมชัด แนะนำให้ใช้รูปที่ใหญ่กว่า</p>
                    )}
                    <div className="flex gap-2">
                      <button type="button" onClick={() => { setRawSrc(''); if (fileInputRef.current) fileInputRef.current.value = '' }}
                        className="flex-1 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-500 hover:bg-gray-50 transition-all">
                        เลือกใหม่
                      </button>
                      <button type="button" onClick={handleCropUpload} disabled={!completedCrop || uploading}
                        className="flex-1 py-2 rounded-xl bg-gray-900 text-white text-xs font-bold hover:bg-gray-700 transition-all disabled:opacity-60 flex items-center justify-center gap-1.5">
                        {uploading
                          ? <><span className="size-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />กำลังอัปโหลด...</>
                          : 'Crop & อัปโหลด'}
                      </button>
                    </div>
                  </div>
                )}

                {cropError && <p className="text-xs text-rose-600">{cropError}</p>}

                {/* Draft preview, in the shape it will be shown */}
                {draft && !rawSrc && (
                  <div className="space-y-2">
                    <div className="rounded-xl overflow-hidden border border-freshket-200 w-full" style={{ aspectRatio: String(aspect), maxHeight: '9rem' }}>
                      {isImageUrl(draft)
                        ? <img src={draft} alt="preview" className="w-full h-full object-cover" />
                        : <div className="w-full h-full" style={{ background: draft }} />}
                    </div>
                    {isImageUrl(draft) && (
                      <button type="button" onClick={startReposition}
                        className="w-full py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 transition-all">
                        ปรับตำแหน่ง / ตัดใหม่
                      </button>
                    )}
                  </div>
                )}
              </>
            )}

            {pickerTab === 'ai' && (
              <>
                <div className="flex gap-2">
                  <input type="text" value={aiPrompt}
                    onChange={(e) => setAiPrompt(e.target.value)}
                    placeholder={title || 'พิมพ์ชื่อหรือ prompt...'}
                    className="flex-1 px-3 py-2 text-xs rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-freshket-300 placeholder:text-gray-300"
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleGenerate())}
                  />
                  <button type="button" onClick={handleGenerate} disabled={aiLoading}
                    className="px-3 py-2 rounded-xl bg-gray-900 text-white text-xs font-bold hover:bg-gray-700 transition-all disabled:opacity-60 flex items-center gap-1.5 shrink-0">
                    {aiLoading
                      ? <span className="size-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      : <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" /></svg>}
                    Generate
                  </button>
                </div>
                {suggestion && <p className="text-xs text-gray-500 italic">{suggestion}</p>}
                {keywords.length > 0 ? (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-400">คลิก keyword เพื่อดูรูปตัวอย่าง:</p>
                    <div className="flex flex-wrap gap-2">
                      {keywords.map((kw) => (
                        <button key={kw} type="button" onClick={() => selectKeyword(kw)}
                          className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-all ${
                            selectedKw === kw ? 'bg-freshket-500 text-white border-freshket-500' : 'bg-white text-gray-600 border-gray-200 hover:border-freshket-300 hover:text-freshket-600'
                          }`}>
                          {kw}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : !aiLoading ? (
                  <p className="text-xs text-gray-400 text-center py-3">กด Generate เพื่อให้ AI แนะนำ keyword สำหรับรูปหน้าปก</p>
                ) : null}
                {selectedKw && (
                  <div className="h-24 rounded-xl overflow-hidden border border-freshket-200 relative bg-gray-100">
                    {kwLoading ? (
                      <div className="w-full h-full flex items-center justify-center">
                        <span className="size-5 border-2 border-freshket-500 border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : draft ? (
                      <>
                        <img src={draft} alt={selectedKw} className="w-full h-full object-cover" />
                        <span className="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-black/60 text-white text-xs">{selectedKw}</span>
                      </>
                    ) : null}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Confirm / Cancel — selecting a swatch, photo, or keyword only stages a
              draft; nothing is applied to the course until ยืนยัน is pressed. */}
          <div className="flex items-center justify-end gap-2 px-4 py-3.5 border-t border-gray-100 shrink-0">
            <button type="button" onClick={handleCancel}
              className="px-4 py-2 rounded-xl border border-gray-200 text-xs font-bold text-gray-600 hover:bg-gray-50 transition-all">
              ยกเลิก
            </button>
            <button type="button" onClick={handleSave}
              className="px-5 py-2 rounded-xl bg-freshket-500 hover:bg-freshket-600 text-white text-xs font-bold transition-all flex items-center gap-1.5">
              <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              ยืนยันเปลี่ยนรูป
            </button>
          </div>
        </div>
        </div>
      )}
    </div>
  )
}
