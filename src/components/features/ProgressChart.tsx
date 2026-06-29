'use client'

import {
  RadialBarChart,
  RadialBar,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts'

// --- Donut / Completion Ring ---
interface CompletionRingProps {
  percent: number
  label?: string
  size?: number
}

export function CompletionRing({ percent, label = 'ผ่านแล้ว', size = 120 }: CompletionRingProps) {
  const data = [{ value: percent }, { value: 100 - percent }]
  const COLORS = ['#27AE60', '#E8F5E9']

  return (
    <div className="flex flex-col items-center gap-1">
      <div style={{ width: size, height: size }} className="relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              innerRadius={size * 0.33}
              outerRadius={size * 0.46}
              startAngle={90}
              endAngle={-270}
              dataKey="value"
              strokeWidth={0}
            >
              {data.map((_, i) => (
                <Cell key={i} fill={COLORS[i]} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold text-brand-dark">{Math.round(percent)}%</span>
        </div>
      </div>
      <span className="text-xs text-brand-muted">{label}</span>
    </div>
  )
}

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

// --- Score Radial Chart ---
interface ScoreRadialProps {
  score: number
}

export function ScoreRadial({ score }: ScoreRadialProps) {
  const data = [{ name: 'คะแนนเฉลี่ย', value: score, fill: '#27AE60' }]

  return (
    <ResponsiveContainer width={140} height={140}>
      <RadialBarChart
        cx="50%"
        cy="50%"
        innerRadius={40}
        outerRadius={60}
        startAngle={180}
        endAngle={-180}
        barSize={10}
        data={data}
      >
        <RadialBar background dataKey="value" cornerRadius={5} />
        <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" className="text-sm font-bold fill-brand-dark">
          {score}
        </text>
      </RadialBarChart>
    </ResponsiveContainer>
  )
}
