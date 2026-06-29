'use client'

import { useState, useEffect, useMemo } from 'react'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { getClientFirestore } from '@/lib/firebase/client'
import { getDemoMode } from '@/lib/demo/demoMode'
import { useAllUsers } from '@/hooks/useFirestore'
import { MODULE_REGISTRY, ALL_MODULE_IDS, DEFAULT_MODULES, type ModuleId, type ModuleAccessConfig } from '@/lib/modules'

// ── Types ─────────────────────────────────────────────────────────────────────

interface DeptConfig {
  [dept: string]: ModuleId[]
}

// ── Demo mock data ────────────────────────────────────────────────────────────

const DEMO_CONFIG: DeptConfig = {
  default: ['lms', 'points'],
  Sale: ALL_MODULE_IDS,
  Logistic: ['lms'],
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ModuleSettingsPage() {
  const { data: allUsers } = useAllUsers()
  const isDemo = getDemoMode()

  const [config, setConfig] = useState<DeptConfig>({})
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [loadError, setLoadError] = useState(false)

  // Derive unique departments from users
  const departments = useMemo(() => {
    const depts = new Set<string>()
    allUsers.forEach(u => { if (u.department) depts.add(u.department) })
    return Array.from(depts).sort()
  }, [allUsers])

  // Load config from Firestore (or demo mock)
  useEffect(() => {
    if (isDemo) {
      setConfig(DEMO_CONFIG)
      return
    }
    const db = getClientFirestore()
    getDoc(doc(db, 'appConfig', 'moduleAccess'))
      .then(snap => {
        if (snap.exists()) {
          setConfig((snap.data() as ModuleAccessConfig).departments ?? {})
        } else {
          setConfig({})
        }
      })
      .catch(() => setLoadError(true))
  }, [isDemo])

  function getModulesForDept(dept: string): ModuleId[] {
    return config[dept] ?? config['default'] ?? DEFAULT_MODULES
  }

  function toggleModule(dept: string, moduleId: ModuleId) {
    setConfig(prev => {
      const current = prev[dept] ?? prev['default'] ?? DEFAULT_MODULES
      const next = current.includes(moduleId)
        ? current.filter(m => m !== moduleId)
        : [...current, moduleId]
      return { ...prev, [dept]: next }
    })
    setSaved(false)
  }

  function setAllModules(dept: string, enabled: boolean) {
    setConfig(prev => ({ ...prev, [dept]: enabled ? [...ALL_MODULE_IDS] : [] }))
    setSaved(false)
  }

  async function handleSave() {
    if (isDemo) { setSaved(true); return }
    setSaving(true)
    try {
      const db = getClientFirestore()
      await setDoc(doc(db, 'appConfig', 'moduleAccess'), { departments: config })
      setSaved(true)
    } catch {
      setLoadError(true)
    } finally {
      setSaving(false)
    }
  }

  const allDepts = departments.length > 0 ? departments : Object.keys(config).filter(k => k !== 'default')

  return (
    <div className="flex flex-col h-full bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-10 bg-white border-b border-gray-100 h-16 flex items-center px-6 gap-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold text-gray-900">Module Settings</h1>
          <p className="text-xs text-gray-400">ตั้งค่าว่าแผนกไหนเข้าถึง module ไหนได้บ้าง</p>
        </div>
        <div className="flex items-center gap-3">
          {saved && (
            <span className="flex items-center gap-1.5 text-xs text-freshket-600 font-bold">
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
              บันทึกแล้ว
            </span>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-freshket-500 hover:bg-freshket-600 text-white text-sm font-bold transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? (
              <svg className="size-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            ) : (
              <svg className="size-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.593 3.322c1.1.128 1.907 1.077 1.907 2.185V21L12 17.25 4.5 21V5.507c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0z" />
              </svg>
            )}
            บันทึก
          </button>
        </div>
      </header>

      <div className="flex-1 overflow-auto">
        <div className="max-w-5xl mx-auto px-6 py-6 space-y-6">

          {/* Error banner */}
          {loadError && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl px-4 py-3 flex items-center gap-2 text-rose-600 text-sm">
              <svg className="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              เกิดข้อผิดพลาด ไม่สามารถบันทึกหรือโหลดการตั้งค่าได้
            </div>
          )}

          {/* Demo banner */}
          {isDemo && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl px-4 py-3 flex items-center gap-2 text-amber-700 text-sm">
              <svg className="size-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
              </svg>
              Demo mode — การเปลี่ยนแปลงจะไม่ถูกบันทึกจริง
            </div>
          )}

          {/* Info card */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-start gap-3">
              <div className="size-10 rounded-xl bg-freshket-100 flex items-center justify-center shrink-0">
                <svg className="size-5 text-freshket-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15m-10.875 0h15.75c.621 0 1.125-.504 1.125-1.125V5.625c0-.621-.504-1.125-1.125-1.125H4.125C3.504 4.5 3 5.004 3 5.625v12.75c0 .621.504 1.125 1.125 1.125z" />
                </svg>
              </div>
              <div>
                <h2 className="text-sm font-bold text-gray-900 mb-1">การตั้งค่า Module ต่อแผนก</h2>
                <p className="text-xs text-gray-500 leading-relaxed">
                  เลือกว่าแต่ละแผนกจะเห็น module ไหนใน sidebar และสามารถเข้าใช้งานได้บ้าง
                  Super Admin จะเห็นทุก module เสมอโดยไม่ขึ้นกับการตั้งค่านี้
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {MODULE_REGISTRY.map(m => (
                    <span key={m.id} className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-freshket-100 text-freshket-700 border border-freshket-200">
                      {m.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Default config row */}
          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-50 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-gray-900">ค่าเริ่มต้น (default)</h3>
                <p className="text-xs text-gray-400 mt-0.5">ใช้กับแผนกที่ยังไม่ได้ตั้งค่า</p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => setAllModules('default', true)} className="text-xs text-freshket-600 hover:text-freshket-700 font-bold px-2 py-1 rounded-lg hover:bg-freshket-100 transition-colors">
                  เลือกทั้งหมด
                </button>
                <button onClick={() => setAllModules('default', false)} className="text-xs text-gray-400 hover:text-gray-600 font-bold px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors">
                  ล้าง
                </button>
              </div>
            </div>
            <div className="px-6 py-4">
              <ModuleCheckboxRow
                modules={getModulesForDept('default')}
                onToggle={(m) => toggleModule('default', m)}
              />
            </div>
          </div>

          {/* Per-department table */}
          {allDepts.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-12 text-center">
              <svg className="size-10 text-gray-300 mx-auto mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
              </svg>
              <p className="text-sm text-gray-400">ยังไม่มีข้อมูลแผนก — กรอกข้อมูล department ให้ users ก่อน</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-50">
                <h3 className="text-sm font-bold text-gray-900">ตั้งค่าต่อแผนก</h3>
                <p className="text-xs text-gray-400 mt-0.5">แผนกที่มีการตั้งค่าจะ override ค่า default ด้านบน</p>
              </div>

              {/* Table header */}
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-50">
                      <th className="text-left text-xs font-bold text-gray-500 px-6 py-3 w-48">แผนก</th>
                      {MODULE_REGISTRY.map(m => (
                        <th key={m.id} className="text-center text-xs font-bold text-gray-500 px-4 py-3 min-w-[100px]">
                          <div>{m.label}</div>
                          <div className="text-gray-400 font-normal mt-0.5">{m.description.split(' ').slice(0, 3).join(' ')}</div>
                        </th>
                      ))}
                      <th className="text-center text-xs font-bold text-gray-400 px-4 py-3 w-24">ทั้งหมด</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allDepts.map((dept, idx) => {
                      const mods = getModulesForDept(dept)
                      const hasOverride = dept in config
                      const allEnabled = MODULE_REGISTRY.every(m => mods.includes(m.id))
                      return (
                        <tr key={dept} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                          <td className="px-6 py-3">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-bold text-gray-800">{dept}</span>
                              {hasOverride ? (
                                <span className="text-xs px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-500 font-bold border border-blue-100">
                                  custom
                                </span>
                              ) : (
                                <span className="text-xs px-1.5 py-0.5 rounded-full bg-gray-50 text-gray-400 font-bold border border-gray-100">
                                  default
                                </span>
                              )}
                            </div>
                          </td>
                          {MODULE_REGISTRY.map(m => (
                            <td key={m.id} className="text-center px-4 py-3">
                              <label className="inline-flex items-center justify-center cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={mods.includes(m.id)}
                                  onChange={() => toggleModule(dept, m.id)}
                                  className="size-4 rounded border-gray-300 text-freshket-500 focus:ring-freshket-300 cursor-pointer"
                                />
                              </label>
                            </td>
                          ))}
                          <td className="text-center px-4 py-3">
                            <button
                              onClick={() => setAllModules(dept, !allEnabled)}
                              className={`text-xs font-bold px-2.5 py-1 rounded-full transition-colors ${
                                allEnabled
                                  ? 'bg-freshket-100 text-freshket-700 border border-freshket-200 hover:bg-freshket-200'
                                  : 'bg-gray-100 text-gray-500 border border-gray-200 hover:bg-gray-200'
                              }`}
                            >
                              {allEnabled ? 'ปิดทั้งหมด' : 'เปิดทั้งหมด'}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── ModuleCheckboxRow ─────────────────────────────────────────────────────────

function ModuleCheckboxRow({
  modules,
  onToggle,
}: {
  modules: ModuleId[]
  onToggle: (id: ModuleId) => void
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {MODULE_REGISTRY.map(m => {
        const checked = modules.includes(m.id)
        return (
          <label
            key={m.id}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border cursor-pointer transition-all select-none ${
              checked
                ? 'bg-freshket-50 border-freshket-300 text-freshket-800'
                : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
            }`}
          >
            <input
              type="checkbox"
              checked={checked}
              onChange={() => onToggle(m.id)}
              className="size-4 rounded border-gray-300 text-freshket-500 focus:ring-freshket-300 cursor-pointer"
            />
            <div>
              <div className="text-xs font-bold">{m.label}</div>
              <div className="text-xs text-gray-400 font-normal">{m.description}</div>
            </div>
          </label>
        )
      })}
    </div>
  )
}
