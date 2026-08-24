import { RADAR_GROUPS, type RoleplayAssessment, type RoleplayTopicScore } from '@/types/roleplay'

// Octagon radar (8 axes = RADAR_GROUPS) of roleplay assessment ratings (1–10).
// Draws up to two polygons (e.g. latest Pre + latest Post). Self-contained SVG
// so it can be reused wherever a member's roleplay profile is shown.

const RADAR_COLORS = ['#3b82f6', '#00ce7c', '#f59e0b']
const AXIS_TEXT_COLORS = ['#2563eb', '#7c3aed', '#0369a1', '#0891b2', '#059669', '#d97706', '#e11d48', '#6d28d9']

function avgTopics(topics: RoleplayTopicScore[], keys: readonly string[]) {
  const vals = keys.map(k => topics.find(t => t.key === k)?.rating ?? 0).filter(v => v > 0)
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0
}

export function RoleplayRadar({ assessments }: { assessments: RoleplayAssessment[] }) {
  if (!assessments.length) return null

  const cx = 210, cy = 200, maxR = 90
  const n = RADAR_GROUPS.length
  const angle = (i: number) => (2 * Math.PI * i / n) - Math.PI / 2
  const pt = (i: number, r: number) => ({ x: cx + r * Math.cos(angle(i)), y: cy + r * Math.sin(angle(i)) })
  const poly = (scores: number[]) =>
    scores.map((s, i) => pt(i, (s / 10) * maxR)).map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + 'Z'

  const gridPcts = [0.2, 0.4, 0.6, 0.8, 1.0]
  const gridPolys = gridPcts.map(pct =>
    RADAR_GROUPS.map((_, i) => pt(i, maxR * pct)).map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') + 'Z')

  // Newest first → show latest Post and latest Pre (max 2).
  const shown = assessments.slice(0, 2)
  const showLegend = shown.length > 1

  return (
    <svg viewBox="20 55 390 300" className="w-full">
      <path d={gridPolys[4]} fill="#f8fafc" />
      {gridPolys.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={i === 4 ? '#d1d5db' : '#e5e7eb'} strokeWidth={i === 4 ? '1' : '0.75'} />
      ))}
      {RADAR_GROUPS.map((_, i) => {
        const outer = pt(i, maxR)
        return <line key={i} x1={cx} y1={cy} x2={outer.x} y2={outer.y} stroke="#e5e7eb" strokeWidth="0.75" />
      })}
      {[2, 4, 6, 8, 10].map((v, idx) => {
        const p = pt(0, maxR * gridPcts[idx])
        return <text key={idx} x={p.x + 4} y={p.y + 1} fontSize="7" fill="#cbd5e1" fontFamily="Inter, sans-serif">{v}</text>
      })}

      {shown.map((a, ai) => {
        const scores = RADAR_GROUPS.map(g => avgTopics(a.topics, g.keys))
        const color = RADAR_COLORS[ai] ?? '#2563eb'
        return (
          <g key={a.id}>
            <path d={poly(scores)} fill={`${color}1a`} stroke={color} strokeWidth="2" strokeLinejoin="round" />
            {scores.map((s, i) => {
              if (s <= 0) return null
              const vp = pt(i, (s / 10) * maxR)
              return <circle key={i} cx={vp.x} cy={vp.y} r="3.5" fill={color} stroke="white" strokeWidth="1.5" />
            })}
          </g>
        )
      })}

      {showLegend && (() => {
        const startX = cx - ((shown.length * 80 - 10) / 2)
        return (
          <g>
            {shown.map((a, ai) => {
              const color = RADAR_COLORS[ai] ?? '#2563eb'
              const x = startX + ai * 80
              const y = cy + maxR + 38
              return (
                <g key={ai}>
                  <rect x={x} y={y} width={24} height={10} rx="2" fill={`${color}1a`} stroke={color} strokeWidth="1.5" />
                  <text x={x + 29} y={y + 8} fontSize="9" fill="#64748b" fontFamily="Inter, sans-serif">
                    {a.type === 'pre' ? 'Pre' : 'Post'}
                  </text>
                </g>
              )
            })}
          </g>
        )
      })()}

      {RADAR_GROUPS.map((g, i) => {
        const p = pt(i, maxR + 24)
        const anchor = Math.abs(p.x - cx) < 10 ? 'middle' : p.x > cx ? 'start' : 'end'
        return (
          <text key={i} x={p.x} y={p.y} textAnchor={anchor} dominantBaseline="middle"
            fontSize="9.5" fill={AXIS_TEXT_COLORS[i]} fontFamily="Noto Sans Thai, Inter, sans-serif" fontWeight="700">
            {g.shortLabel}
          </text>
        )
      })}
    </svg>
  )
}
