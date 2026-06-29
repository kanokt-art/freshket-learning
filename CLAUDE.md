# Freshket Sale Tracking — Project Instructions for Claude Code

## Project Overview

Internal web platform for Freshket sale team training tracking and enablement.

- **Stack**: Next.js 14 App Router, TypeScript, Firebase Auth + Firestore, Tailwind CSS, Vercel
- **Auth**: Google OAuth, `@freshket.co` domain only. Block all other domains immediately.
- **RBAC**: `sale` < `team_lead` < `manager` < `super_admin`
- **Demo mode**: `NEXT_PUBLIC_DEMO_MODE=true` bypasses Firebase entirely, serves mock data
- **Security**: Never commit `.env`, `.env.local`, or any file with API keys / service account JSON

## Development Rules

### Icons
Always use **inline SVG** icons — do NOT use icon libraries (lucide-react, heroicons, etc.) unless already installed. When adding a new icon, write it as a `<svg>` element directly in JSX.

### Font
Use **Noto Sans Thai** as the primary font, with Inter as fallback.

```css
font-family: 'Noto Sans Thai', 'Inter', sans-serif;
```

Never use `text-[10px]` or `text-[11px]` — minimum label size is `text-xs` (12px).

### UX/UI Design System — Freshket CI

Design language: **white / clean** — Freshket CI is used as accent only, NOT as background gradient.

Base = `white` + `gray-100` border; Freshket green = border, badge, icon, active state only.

---

## Design Tokens

### Colors

| Token | Hex | Usage |
|---|---|---|
| `freshket-500` | `#00ce7c` | Active icon, progress bar fill, success, active nav state |
| `freshket-600` | `#00a862` | Solid Admin badge bg, hover state |
| `freshket-700` | `#00804c` | Dark text on freshket-100 bg |
| `freshket-100` | `#d6fdf0` | Pastel bg — badges, avatar, pill backgrounds |
| `freshket-200` | `#a7f3d0` | Pastel border — pill border, badge border |
| `primary-600` | `#2563eb` | Admin actions, primary buttons |
| Slate BG | `#f8fafc` | Page backgrounds |
| White | `#ffffff` | All cards, panels, nav |

Add these to `tailwind.config.ts` under `extend.colors.freshket`:

```js
freshket: {
  100: '#d6fdf0',
  200: '#a7f3d0',
  500: '#00ce7c',
  600: '#00a862',
  700: '#00804c',
}
```

### Logo

```jsx
<img
  src="https://ivpysunrulnrdykfaezk.supabase.co/storage/v1/object/public/logo-freshket/FRESHKET%20LOGO-01.png"
  className="h-7 w-auto object-contain"
  alt="Freshket"
/>
// Sidebar: h-7 | Navbar: h-8
```

---

## Component Patterns

### Pastel Pill Badge

```jsx
// Neutral / employee
<span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-freshket-100 text-freshket-700 border border-freshket-200">
  Employee
</span>

// Admin (solid)
<span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full bg-freshket-600 text-white border border-freshket-700">
  Admin
</span>
```

### Card Layout

```jsx
// Standard card — no decorative stripes or gradients
<div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-6">
  {/* content */}
</div>

// Highlighted card (e.g. active/selected state)
<div className="bg-freshket-50 rounded-2xl border border-freshket-200 shadow-sm p-6">
  {/* content */}
</div>
```

> ⛔ **ห้ามใช้** left accent stripe (`w-1.5 bg-freshket-500` ริมซ้าย) — เป็น AI-generated UI pattern ที่ดู generic

### Progress Bar

```jsx
<div className="h-2 bg-gray-100 rounded-full overflow-hidden">
  <div
    className="h-full rounded-full transition-all duration-300"
    style={{ width: `${pct}%`, background: '#00ce7c' }}
  />
</div>
```

### Score Color Thresholds

| Score | Text | Bar |
|---|---|---|
| ≥ 4.0 | `text-freshket-600` | `bg-freshket-500` |
| 3.0–3.9 | `text-amber-600` | `bg-amber-400` |
| < 3.0 | `text-rose-600` | `bg-rose-400` |

### Department Badge Palette (12-color rotating)

```js
const DEPT_COLORS = [
  'bg-emerald-100 text-emerald-800',
  'bg-blue-100 text-blue-800',
  'bg-purple-100 text-purple-800',
  'bg-amber-100 text-amber-800',
  'bg-cyan-100 text-cyan-800',
  'bg-rose-100 text-rose-800',
  'bg-indigo-100 text-indigo-800',
  'bg-teal-100 text-teal-800',
  'bg-orange-100 text-orange-800',
  'bg-pink-100 text-pink-800',
  'bg-lime-100 text-lime-800',
  'bg-sky-100 text-sky-800',
]
// index = hash(deptName) % 12
```

---

## Page Templates

### Light Form Page (default)

```
Body:   bg-slate-50 flex flex-col h-full
Card:   bg-white rounded-2xl border border-gray-100 shadow-sm
Header: sticky, white, border-b, h-16
Max-w:  max-w-2xl mx-auto (forms), max-w-4xl (dashboard sections)
```

### Modal

```
Backdrop:  fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50
Card:      bg-white rounded-2xl max-w-sm mx-auto p-6 text-center shadow-2xl
Entrance:  scale-95 opacity-0 → scale-100 opacity-100, 200ms
```

---

## Shared UI Conventions

| Property | Value |
|---|---|
| Border radius | `rounded-2xl` cards/forms, `rounded-3xl` result cards, `rounded-xl` buttons, `rounded-full` badges |
| Shadow | `shadow-sm` cards, `shadow-xl` / `shadow-2xl` modals |
| Transition interactive | `transition-all duration-150` |
| Transition modals | `duration-300` |
| Transition progress | `duration-500` |
| Focus ring | `focus:ring-2 focus:ring-freshket-300` (inputs) |
| Disabled | `opacity-60 cursor-not-allowed` |
| XSS safety | Always `.textContent =` not `.innerHTML =` for user strings |

---

## Animation Catalog

| Name | Effect | Use on |
|---|---|---|
| `pulse-ring` | box-shadow pulse outward | QR / badge |
| `float` | translateY 0 → -9px → 0 | floating cards |
| `fade-in` | opacity + translateY(18px) | page elements |
| `slide-in-right` | opacity + translateX(24px) | list items |
| `pop-in` | scale(0.88) opacity(0) → scale(1) | result card |
| `shimmer` | bg-position sweep | skeleton loader |

---

## Responsive Breakpoints

| Breakpoint | Changes |
|---|---|
| Mobile (default) | Single column, compressed cards |
| `sm:` 640px | 2-col cards, inline badges |
| `lg:` 1024px | 12-col dashboard grid, sidebar visible |
| `xl:` 1280px | Wider sidebars |

---

## Full UX/UI Reference

See [design.md](./design.md) for the complete design spec: page templates, animation catalog, modal patterns, QR dark screen, check-in result cards, Likert scale cards, AI analysis section, and radar chart config.

## Skills Available

See [Skill.md](./Skill.md) for the full list of available skills and when to invoke them.
