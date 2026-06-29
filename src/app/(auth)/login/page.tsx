'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/hooks/useAuth'
import { FRESHKET_LOGO_URL, getDemoMode } from '@/lib/demo/demoMode'
const DEMO_MODE = getDemoMode()
import { ROLE_LABELS, type UserRole } from '@/types/user'
import { clsx } from 'clsx'

const DEMO_ROLES: { role: UserRole; emoji: string; desc: string; color: string }[] = [
  { role: 'sale',        emoji: '👤', desc: 'Dashboard & Training',          color: 'border-emerald-200 hover:border-emerald-400 hover:bg-emerald-50' },
  { role: 'team_lead',   emoji: '👥', desc: 'ทีมของฉัน + ภาพรวม',          color: 'border-blue-200 hover:border-blue-400 hover:bg-blue-50'           },
  { role: 'manager',     emoji: '📊', desc: 'สถิติ + Skill Gap Analysis',    color: 'border-purple-200 hover:border-purple-400 hover:bg-purple-50'     },
  { role: 'super_admin', emoji: '⚙️', desc: 'จัดการระบบ + นำเข้าข้อมูล', color: 'border-orange-200 hover:border-orange-400 hover:bg-orange-50'    },
]

export default function LoginPage() {
  const { user, loading, error, signInWithGoogle, demoRole, setDemoRole } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && user) {
      router.replace('/sale')
    }
  }, [user, loading, router])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="size-8 border-4 border-freshket-500 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  // ── Demo Mode login ──────────────────────────────────────────────────────────
  if (DEMO_MODE) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={FRESHKET_LOGO_URL} alt="Freshket" className="h-10 w-auto object-contain mx-auto mb-4" />
            <h1 className="text-xl font-bold text-gray-900">Sale Tracking</h1>
            <span className="inline-flex items-center gap-1.5 mt-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-700">
              <span className="relative flex size-1.5">
                <span className="animate-ping absolute inline-flex size-full rounded-full bg-amber-500 opacity-75" />
                <span className="relative inline-flex size-1.5 rounded-full bg-amber-600" />
              </span>
              Demo Mode — ไม่ต้องการ Firebase
            </span>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 p-6 space-y-4">
            <div>
              <h2 className="text-sm font-bold text-gray-900">เลือก Role เพื่อเข้าสู่ระบบ</h2>
              <p className="text-xs text-gray-500 mt-1">ข้อมูลเป็น Mockup — สามารถเปลี่ยน Role ได้ตลอดเวลา</p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {DEMO_ROLES.map((r) => (
                <button
                  key={r.role}
                  onClick={() => setDemoRole(r.role)}
                  className={clsx(
                    'flex flex-col items-start gap-1 rounded-xl border-2 p-3 text-left transition-all duration-150',
                    demoRole === r.role
                      ? 'border-freshket-500 bg-freshket-100'
                      : `border-gray-200 bg-white ${r.color}`,
                  )}
                >
                  <span className="text-xl">{r.emoji}</span>
                  <span className="text-sm font-bold text-gray-900">{ROLE_LABELS[r.role]}</span>
                  <span className="text-xs text-gray-500 leading-tight">{r.desc}</span>
                  {demoRole === r.role && (
                    <span className="mt-1 inline-flex items-center gap-1 text-xs font-normal text-freshket-600">
                      <svg className="size-3.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
                      </svg>
                      เลือกอยู่
                    </span>
                  )}
                </button>
              ))}
            </div>

            <button
              onClick={signInWithGoogle}
              className="w-full flex items-center justify-center gap-2 bg-freshket-500 hover:bg-freshket-600 text-white font-bold py-3 px-4 rounded-xl transition-all duration-150"
            >
              เข้าสู่ระบบ Demo ในฐานะ {ROLE_LABELS[demoRole]}
            </button>

            <p className="text-center text-xs text-gray-400">Demo Mode — ข้อมูลไม่ได้บันทึกจริง</p>
          </div>
        </div>
      </main>
    )
  }

  // ── Real Firebase login — Split layout ──────────────────────────────────────
  return (
    <main className="min-h-screen flex">
      {/* Left panel — dark brand */}
      <div className="hidden lg:flex w-[480px] xl:w-[540px] shrink-0 bg-gray-900 flex-col items-center justify-center p-12 relative overflow-hidden">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-freshket-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-32 -left-32 w-80 h-80 bg-freshket-500/8 rounded-full blur-3xl pointer-events-none" />

        <div className="relative w-full max-w-xs">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={FRESHKET_LOGO_URL}
            alt="Freshket"
            className="h-9 w-auto object-contain mb-10 brightness-0 invert"
          />

          <h1 className="text-4xl font-bold text-white leading-snug mb-4">
            ระบบติดตาม<br />
            <span className="text-freshket-500">การพัฒนา</span><br />
            ทีม Sale
          </h1>
          <p className="text-gray-400 text-sm leading-relaxed">
            ติดตามความก้าวหน้า จัดการ Training และวิเคราะห์ Skill Gap ของทีมขายในที่เดียว
          </p>

          <div className="mt-8 flex flex-wrap gap-2">
            {['Training Tracker', 'Skill Gap', 'Team Dashboard', 'AI Analysis'].map((f) => (
              <span
                key={f}
                className="text-xs px-3 py-1.5 rounded-full border border-gray-700 text-gray-400 font-normal"
              >
                {f}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — white/clean */}
      <div className="flex-1 bg-white flex items-center justify-center p-8 lg:p-16">
        <div className="w-full max-w-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={FRESHKET_LOGO_URL}
            alt="Freshket"
            className="h-8 w-auto object-contain mb-8"
          />

          <div className="mb-8">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">เข้าสู่ระบบ</h2>
            <p className="text-gray-500 text-sm">
              ยินดีต้อนรับ — อนุญาตเฉพาะบัญชี{' '}
              <span className="font-bold text-freshket-600">@freshket.co</span>
            </p>
          </div>

          {error && (
            <div className="mb-6 rounded-xl bg-red-50 border border-red-100 p-3.5">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <button
            onClick={signInWithGoogle}
            className="w-full flex items-center justify-center gap-3 px-4 py-3.5 rounded-xl border-2 border-gray-200 bg-white hover:border-freshket-300 hover:bg-freshket-100/40 text-gray-800 font-bold text-sm transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-freshket-300"
          >
            <svg className="size-5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
            </svg>
            Sign in with Google
          </button>

          <p className="text-center text-xs text-gray-400 mt-6">
            หากมีปัญหาในการเข้าสู่ระบบ กรุณาติดต่อ HR
          </p>
          <p className="text-center text-xs text-gray-300 mt-2">
            Freshket © {new Date().getFullYear()} · Sale Enablement Platform
          </p>
        </div>
      </div>
    </main>
  )
}
