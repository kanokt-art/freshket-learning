'use client'

import {
  ResponsiveContainer,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'

// --- Status Bar Chart ---
interface StatusData {
  name: string
  completed: number
  in_progress: number
  not_started: number
}

interface StatusBarChartProps {
  data: StatusData[]
}

export function StatusBarChart({ data }: StatusBarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" />
        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip
          contentStyle={{ fontSize: 12, borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
        />
        <Legend wrapperStyle={{ fontSize: 12 }} />
        <Bar dataKey="completed" name="ผ่านแล้ว" fill="#27AE60" radius={[3, 3, 0, 0]} />
        <Bar dataKey="in_progress" name="กำลังเรียน" fill="#3B82F6" radius={[3, 3, 0, 0]} />
        <Bar dataKey="not_started" name="ยังไม่เริ่ม" fill="#E5E7EB" radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  )
}

// --- Department Completion Chart (course overview modal, admin-only) ---
interface DeptCompletionDatum {
  name: string
  completedPct: number
  total: number
}

export function DeptCompletionChart({ data }: { data: DeptCompletionDatum[] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(data.length * 44, 120)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 24, left: 8, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#F0F0F0" horizontal={false} />
        <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} tick={{ fontSize: 11 }} />
        <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 11 }} />
        <Tooltip
          formatter={(value: number, _name, item) => [`${value}% (${item.payload.total} คน)`, 'เรียนจบแล้ว']}
          contentStyle={{ fontSize: 12, borderRadius: 8, border: 'none', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}
        />
        <Bar dataKey="completedPct" fill="#00ce7c" radius={[0, 4, 4, 0]} barSize={20} />
      </BarChart>
    </ResponsiveContainer>
  )
}
