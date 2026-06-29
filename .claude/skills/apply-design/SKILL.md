---
name: apply-design
description: Apply Freshket DS 2026 design tokens — card border/shadow/hover, badge no-border, DS-#124 hover rule — to this webapp
trigger: /apply-design
---

# apply-design — Freshket DS 2026 Enforcement Skill

Apply the design spec in `design.md` to the Sale Tracking webapp. Fix all violations.

## Step 1 — Read the spec

Read `design.md` in full before making any changes. The spec is the source of truth.

## Step 2 — Apply global tokens

Update `globals.css` `:root` block with all `--card-*` and `--shadow-*` CSS variables from design.md §6.

Update `.card` component class:
- border: `var(--card-border)` (rgba, not solid)
- border-radius: `var(--card-radius)` = 18px
- transition: `var(--card-transition)`
- NO box-shadow at rest (DS-#023)

Update `.badge-fk` and `.badge-fk-solid`:
- Remove `border` and `border-*` classes (DS-#042 — no border on badges/chips)

Add new component classes:
- `.card-ds` — base: border rgba(230,233,235,0.60), radius 18px, white bg, no shadow
- `.card-ds-hover` — extends card-ds + hover:shadow-[var(--card-shadow-hover)] hover:-translate-y-0.5 transition-[var(--card-transition)]
- `.card-ds-tint` — freshket-100 bg + border rgba(200,230,224,0.60)

## Step 3 — Apply to shared components

Scan `src/components/` for clickable card elements:
- Any `<div>` or `<a>` with `bg-white rounded-*xl border` that has `onClick` or `href`
- Must add hover shadow + translateY(-2px) (DS-#124)
- Replace `hover:shadow-md hover:border-*` with DS-compliant hover

## Step 4 — Apply to page files

Scan `src/app/` for:
1. **Cards at rest**: `border border-gray-100` → change to `style={{ border: 'var(--card-border)' }}`
   or use `.card-ds` class if applicable
2. **Clickable cards missing hover**: add `hover:shadow-[0_8px_24px_rgba(38,41,44,0.08)] hover:-translate-y-0.5 transition-all duration-150`
3. **Badges with border**: remove `border border-freshket-200` from `badge-fk`, remove `border border-freshket-700` from `badge-fk-solid`

## Step 5 — Update tailwind.config.ts

Add shadow tokens:
```js
boxShadow: {
  'ds-hover':        '0 8px 24px rgba(38,41,44,.08)',
  'ds-ambient':      '0 6px 20px rgba(190,190,190,.20)',
  'ds-ambient-tint': '0 0 8px rgba(0,128,101,.06), 0 6px 16px rgba(0,128,101,.11)',
  'ds-ambient-pure': '0 0 16px rgba(0,128,101,.10)',
}
```

## Step 6 — Verify

After changes, confirm:
- [ ] `.card` class uses rgba border (no `border-gray-100`)
- [ ] `.badge-fk` has no `border` property
- [ ] Clickable card components have hover shadow + translate
- [ ] No shadow at rest on information/product cards
- [ ] Primary CTA cards (if any) have rest shadow as exception

## Rules that NEVER change

From `CLAUDE.md`:
- Icons: inline SVG only
- Font: Noto Sans Thai, Inter
- No left accent stripe on cards
- Minimum text-xs (12px)
