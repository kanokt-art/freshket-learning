'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAllUsers } from '@/hooks/useFirestore'
import type { UserRole } from '@/types/user'

interface RoleCard {
  role: UserRole
  label: string
  href: string
  description: string
  color: string
  bg: string
  border: string
  badgeBg: string
  badgeText: string
  btnBg: string
  icon: React.ReactNode
}

const ROLE_CARDS: RoleCard[] = [
  {
    role: 'sale',
    label: 'Sale',
    href: '/sale',
    description: 'ดูหลักสูตร, ติดตาม progress, และ check-in เข้า training',
    color: 'text-freshket-700',
    bg: 'bg-freshket-50',
    border: 'border-freshket-200',
    badgeBg: 'bg-freshket-100',
    badgeText: 'text-freshket-700',
    btnBg: 'bg-freshket-500 hover:bg-freshket-600',
    icon: (
      <svg className="size-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
      </svg>
    ),
  },
  {
    role: 'team_lead',
    label: 'Team Lead',
    href: '/team-lead',
    description: 'ดูภาพรวมทีม, ติดตาม progress สมาชิก, และจัดการ training',
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    badgeBg: 'bg-blue-100',
    badgeText: 'text-blue-700',
    btnBg: 'bg-blue-500 hover:bg-blue-600',
    icon: (
      <svg className="size-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
      </svg>
    ),
  },
  {
    role: 'manager',
    label: 'Manager',
    href: '/manager',
    description: 'ดู dashboard ภาพรวมทุกทีม, วิเคราะห์ผล และรายงาน',
    color: 'text-purple-700',
    bg: 'bg-purple-50',
    border: 'border-purple-200',
    badgeBg: 'bg-purple-100',
    badgeText: 'text-purple-700',
    btnBg: 'bg-purple-500 hover:bg-purple-600',
    icon: (
      <svg className="size-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
      </svg>
    ),
  },
  {
    role: 'super_admin',
    label: 'Super Admin',
    href: '/users',
    description: 'จัดการ users ทั้งหมด, สร้างทีม, ตั้งค่า courses และ admin tools',
    color: 'text-orange-700',
    bg: 'bg-orange-50',
    border: 'border-orange-200',
    badgeBg: 'bg-orange-100',
    badgeText: 'text-orange-700',
    btnBg: 'bg-orange-500 hover:bg-orange-600',
    icon: (
      <svg className="size-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
  },
]

export default function AdminPage() {
  const router = useRouter()
  const { data: allUsers, loading } = useAllUsers()
  const [selected, setSelected] = useState<Record<string, string>>({})

  function getUsersForRole(role: UserRole) {
    return allUsers.filter(u => u.role === role)
  }

  function handleView(card: RoleCard) {
    const uid = selected[card.role]
    if (uid) {
      router.push(`/users/${uid}`)
    } else {
      window.open(card.href, '_blank')
    }
  }

  return (
    <div className="min-h-full bg-slate-50 p-6 lg:p-10">
      <div className="max-w-5xl mx-auto">

        {/* Header */}
        <div className="mb-8">
          <p className="text-xs font-bold text-gray-400 mb-1">Administration</p>
          <h1 className="text-xl font-bold text-gray-900">Role Preview</h1>
          <p className="text-sm text-gray-500 mt-1">เลือก user เพื่อดูมุมมองของแต่ละ role</p>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {ROLE_CARDS.map((card) => {
            const roleUsers = getUsersForRole(card.role)
            const selectedUid = selected[card.role] ?? ''
            const selectedUser = roleUsers.find(u => u.uid === selectedUid)

            return (
              <div
                key={card.role}
                className={`bg-white rounded-2xl border ${card.border} p-5 flex flex-col gap-4 hover:shadow-[0_8px_24px_rgba(38,41,44,0.08)] hover:-translate-y-0.5 transition-all duration-150`}
              >
                {/* Icon + badge */}
                <div className="flex items-start justify-between">
                  <div className={`p-2.5 rounded-xl ${card.bg} ${card.color}`}>
                    {card.icon}
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${card.badgeBg} ${card.badgeText}`}>
                    {card.label}
                  </span>
                </div>

                {/* Description */}
                <p className="text-xs text-gray-500 leading-relaxed">{card.description}</p>

                {/* User count */}
                <p className="text-xs text-gray-400">
                  {loading ? '...' : `${roleUsers.length} คน`}
                </p>

                {/* User dropdown */}
                <div className="relative">
                  <select
                    value={selectedUid}
                    onChange={e => setSelected(prev => ({ ...prev, [card.role]: e.target.value }))}
                    className={`w-full appearance-none text-xs font-normal pl-3 pr-8 py-2 rounded-xl border focus:outline-none focus:ring-2 cursor-pointer transition-colors ${
                      selectedUid
                        ? `${card.badgeBg} ${card.badgeText} border-transparent focus:ring-offset-1`
                        : 'bg-gray-50 text-gray-500 border-gray-200 focus:ring-gray-200'
                    }`}
                  >
                    <option value="">— เลือก user —</option>
                    {roleUsers.map(u => (
                      <option key={u.uid} value={u.uid}>
                        {u.displayName}{u.nickname ? ` (${u.nickname})` : ''}
                      </option>
                    ))}
                  </select>
                  <svg
                    className={`absolute right-2.5 top-1/2 -translate-y-1/2 size-3.5 pointer-events-none ${selectedUid ? card.color : 'text-gray-400'}`}
                    viewBox="0 0 20 20" fill="currentColor"
                  >
                    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                  </svg>
                </div>

                {/* View button */}
                <button
                  onClick={() => handleView(card)}
                  className={`inline-flex items-center justify-center gap-2 w-full py-2 rounded-xl text-xs font-bold text-white transition-colors ${card.btnBg} ${!selectedUid ? 'opacity-70' : ''}`}
                >
                  <svg className="size-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.641 0-8.573-3.007-9.964-7.178z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  </svg>
                  {selectedUser ? `ดู ${selectedUser.nickname ?? selectedUser.displayName.split(' ')[0]}` : `View as ${card.label}`}
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
