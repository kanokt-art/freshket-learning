# Design System · Freshket Sale Tracking Web 2026

**Source:** FKT Design Guidelines v1.0 · 2026-06-17 (merged from 25+ spec files at `Design.MD-fkt/FKT Design Guidelines-20260628T094735Z-3-001/`)
**Tokens ref:** `tailwind.config.ts` · `globals.css`
**Last updated:** 2026-08-20 — re-aligned against the full FKT source set; fixed factual drift (wrong/reversed values, self-contradicting DS-# citations) and closed gaps in the Decision References table (DS-#001–#128, all now present)

---

## Design Foundation

### 4 Visual Pillars
1. **Soft** — high radius · diffused shadow · smooth transitions
2. **Modern** — clean geometry · functional minimalism · not overly trendy
3. **Clear** — obvious hierarchy · clear states · 1 CTA per viewport
4. **Clean** — 80% whitespace · no gradients · no decoration noise

> Every decision must pass all 4 pillars simultaneously.

### 5 Key Rules
1. **Color** — use only colors defined in this spec
2. **Font weight** — 400 or 700 only · nothing in between
3. **Icon** — strokeWidth = 1 on every icon (Portal) / strokeWidth = 2 (Marketplace)
4. **Search input** — radius = 8px same as regular input · not pill (DS-#119)
5. **Text** — Sentence case always · no ALL CAPS

### Critical Constraints
| Forbidden | Reason |
|---|---|
| Gradient / Dark Mode | Conflicts with Pillar 2+4 (DS-#020) |
| letter-spacing ≠ normal | Typography rule (DS-#006) |
| Color ring on card (content surface) | Focus Variant B: shadow only (DS-#002) |
| More than 1 Primary CTA per viewport | Pillar 3 (DS-#017) |
| font-size < 12px (decision-grade) | Floor rule (DS-#014) |
| Pure white `#FFFFFF` as text | Use `neutral-50` instead (DS-#052) |
| Opacity to reduce text hierarchy | Use a lighter color token (DS-#100) |
| Font weight other than 400 / 700 | Binary weight rule (DS-#093) |
| ALL CAPS / `textTransform: uppercase` | Sentence case always (DS-#082) |
| Shadow on Primary button | DS-#059 |
| `neutral-200+` as page background | Pillar 4 |
| Hardcoded hex values | Always use tokens |
| Pixel values outside 4px base scale | Breaks spacing system |
| strokeWidth ≠ 1 on icons | DS icon rule |

---

## Colors

### Layer 1 — Primitive Palette (12 families · 11 stops each)

#### neutral · Core
| Stop | Hex | Role |
|---|---|---|
| `neutral-50` | `#F8F9FA` | Page bg option |
| `neutral-100` | `#E6E9EB` | Row bg, `border-subtle`, `border-default` |
| `neutral-200` | `#C2C5C8` | `border-disabled` |
| `neutral-300` | `#A7ACAF` | `text-disabled` |
| `neutral-400` | `#8C9296` | Icon muted |
| `neutral-500` | `#71787D` | Text tertiary |
| ★ `neutral-600` | `#565E64` | `text-secondary` |
| `neutral-700` | `#464C51` | Text hover |
| `neutral-800` | `#363B3F` | Heading |
| `neutral-900` | `#26292C` | `text-primary` on white |
| `neutral-950` | `#161719` | Extreme emphasis |

#### dark-green · Brand Primary
| Stop | Hex | Role |
|---|---|---|
| `dark-green-50` | `#F0FAF8` | Badge bg, Quick Menu bg |
| `dark-green-100` | `#C8E6E0` | Muted brand fill — never as a solid `focus-ring` (use the `focus-ring` rgba token instead, DS-#004) |
| `dark-green-200` | `#A0D1C7` | Chip bg |
| ★ `dark-green-600` | `#008065` | Brand primary · `bg-brand` · Tier 1 CTA |
| `dark-green-700` | `#006D56` | `interactive-hover` |
| `dark-green-800` | `#005A47` | `interactive-pressed` |
| `dark-green-900` | `#004637` | On-brand text, text-on-tint |
| `dark-green-950` | `#003328` | Emphasis on tint |

#### green-fresh · Success · Brand 2° (dual-role)
| Stop | Hex | Role |
|---|---|---|
| `green-fresh-50` | `#F0FAF6` | Success bg |
| `green-fresh-100` | `#CCF5E5` | Light success |
| ★ `green-fresh-600` | `#00CE7C` | Brand 2° + Success main · Checkbox/Toggle checked |
| `green-fresh-700` | `#00B56D` | Hover |
| `green-fresh-800` | `#009157` | Active, success text |
| `green-fresh-900` | `#006E42` | On-fill text |

#### Semantic / Functional Colors (key stops)
| Family | ★ Main (-600) | Hex | Role |
|---|---|---|---|
| `lime` | -300 | `#ECFB56` | Signature accent · Snack/Deli · ≤1% budget |
| `banana` | -500 | `#FFF53E` | Spotlight accent · ≤2% budget |
| `orange` | -600 | `#FF6600` | Bakery · Promo · LMS portal |
| `purple` | -600 | `#6B4FE0` | Beverage · Premium · special cases only |
| `pink` | -600 | `#FF6686` | Fruit |
| `brown` | -600 | `#D29C4F` | Dry Goods |
| `teal` | -600 | `#8BD2D4` | Frozen · WMS portal |
| `blue` | -600 | `#1E60D0` | Info · Link · Seafood |
| `red` | -600 | `#F53939` | Danger · Error · Meat |
| `yellow` | -600 | `#FFD340` | Warning · Poultry/Egg |

### Layer 2 — Semantic Aliases
| Alias | Primitive | Hex | Usage |
|---|---|---|---|
| `bg-canvas` | neutral-0 | `#FFFFFF` (default) | Page background — pure white by default; off-white or a very light tint is allowed depending on context (DS-#029) |
| `bg-surface` | neutral-0 | `#FFFFFF` | Card / Panel surface |
| `bg-subtle` | neutral-50 | `#F8F9FA` | Optional separator |
| `bg-brand` | dark-green-600 | `#008065` | Header, Primary Action |
| `text-primary` | neutral-900 / neutral-50 | `#26292C` / `#F8F9FA` | Body text — `neutral-900` on white, `neutral-50` on dark/black surface (DS-#030) |
| `text-secondary` | neutral-600 | `#565E64` | Sub-text, meta |
| `text-on-tint` | dark-green-900 | `#004637` | Text on tinted/colored bg |
| `text-on-brand` | neutral-50 | `#F8F9FA` | Text on dark-green-600 |
| `interactive-hover` | dark-green-700 | `#006D56` | Hover state |
| `interactive-pressed` | dark-green-800 | `#005A47` | Pressed state |
| `focus-border` | dark-green-600 | `#008065` | Focus border |
| `focus-ring` | rgba | `rgba(0,128,101,.18)` | 4px outer halo |
| `border-default` | neutral-100 | `#E6E9EB` | Input, card rest border |
| `bg-disabled` | neutral-50 | `#F8F9FA` | Disabled bg |
| `text-disabled` | neutral-300 | `#A7ACAF` | Disabled text |
| `border-disabled` | neutral-200 | `#C2C5C8` | Disabled border |

### Layer 3 — Category Colors (12 Categories)
| Category | Vivid Chip | Text on Chip |
|---|---|---|
| Meat | `red-600` `#F53939` | white |
| Seafood | `blue-600` `#1E60D0` | white |
| Poultry & Egg | `yellow-600` `#FFD340` | `dark-green-950` |
| Fresh Produce | `green-fresh-600` `#00CE7C` | `dark-green-950` |
| Fruit | `pink-600` `#FF6686` | white |
| Dry Goods | `brown-600` `#D29C4F` | white |
| Bakery | `orange-600` `#FF6600` | white |
| Dairy | `neutral-100` `#E6E9EB` | `neutral-900` |
| Herbs & Spices | `dark-green-600` `#008065` | white |
| Beverage | `purple-600` `#6B4FE0` | white |
| Frozen | `teal-600` `#8BD2D4` | `dark-green-950` |
| Snack/Deli | `lime-300` `#ECFB56` | `dark-green-950` |

### Color Rules
- **80-15-5 Ratio**: Whitespace 80% / Neutrals 15% / Accent ≤5% (DS-#025)
- **1 accent per viewport** — functional category chips are excluded from budget (DS-#010)
- **No gradients** in product UI — marketing/onboarding carve-out only (DS-#020)
- **Text on tinted bg** — use same family stop -900; -950 only if -900 fails WCAG (DS-#018)
- **Yellow bg** — `yellow-950` normal text / `yellow-900` large text only (DS-#037)
- **Price display** — Regular price: `neutral-900` / Discounted: `red-600` (DS-#038)
- **Action hierarchy** — Tier 1: `dark-green-600` (1 per viewport) / Tier 2: secondary palette / Tier 3: ghost/link
- **Interactive link** — Rest: `dark-green-600` / Hover: `dark-green-700` + underline / Active: `dark-green-800`
- **Text hierarchy — no opacity** — always use lighter color token (DS-#100)
- **Portal text color** — Primary: `neutral-900` / Secondary: `neutral-600` / Active: `dark-green-600` / Disabled: `neutral-400` (DS-#097)
- **bg hierarchy order** — (1) pure white → (2) `neutral-50` → (3) any `{family}-50` tint → (4) dark/solid = special approved cases only (DS-#041)
- **Colored full-viewport bg** — solid colored background is a marketing/onboarding/campaign carve-out only, never in-product (DS-#012)
- **No 3 colors in 1 element** — a single badge/avatar/icon must not mix more than 2 colors internally (DS-#016)
- **Border color** — never darker than `neutral-200`, except for focus or semantic (error/success) states (DS-#031)
- **Purple** — special-cases-only accent (Beverage/Premium), never a general-purpose accent color (DS-#039)
- **Premium pairing** — `dark-green-900` + `brown-400`, or `brown-50` + `dark-green-800`/`900` (DS-#040)
- **Banana is never Warning** — system Warning state always uses `yellow-600`, never `banana` (DS-#062)
- **Layout grid alignment** — sections on the same page must share the same column system; mismatched grid lines are prohibited (DS-#019)

---

## Typography

**Font:** Noto Sans Thai only · 2 weights: Regular 400 / Bold 700

### Heading Scale
| Token | Desktop (px/lh) | Tablet (px/lh) | Mobile (px/lh) | Role |
|---|---|---|---|---|
| H1 | 72/90 | 58/68 | 48/60 | Landing / Hero |
| H2 | 56/64 | 46/54 | 38/44 | Marketing section |
| H3 | 40/50 | 38/48 | 34/42 | Marketing sub-section (DS-#056) |
| H4 | 24/32 | 22/30 | 20/28 | In-product panel / card title (DS-#056) |
| H5 | 18/26 | 18/26 | 18/26 | Component title / drawer header (DS-#091) |
| H6 | 16/24 | 16/24 | 16/24 | Sub-section label / group header (DS-#091) |

All heading weights: **Bold 700**

### Body Scale
| Token | Size/LH | Used for |
|---|---|---|
| Body1 | 16/24 | Primary body text, paragraph |
| Body2 | 14/20 | Label, meta, sub-text |
| Caption1 | 12/18 | Timestamp, metadata |
| Caption2 | 10/14 | Helper text, legal — exception to 12px floor · never for decision-grade content (price, quantity, status) (DS-#092) |

### Type Rules
- **Binary weight only** — Regular 400 (body) / Bold 700 (heading, label, CTA) · No Medium 500 / SemiBold 600 (DS-#093)
- **No opacity** for text hierarchy — use lighter color token (DS-#100)
- **letter-spacing: normal** always — no overrides (DS-#006)
- **Minimum 12px** for decision-grade content (DS-#014)
- **No uppercase** — Sentence case always (DS-#082)
- **All label types** — Bold 700 on every surface (DS-#090)
- **Nav item / tab / option** — Regular 400 at every state (DS-#118); state via color/bg not weight

### Price Typography
| Context | Price number (size/lh) | Currency unit (size/lh) |
|---|---|---|
| Product Detail / Cart | 32/40 · Bold 700 | 14/40 · Bold 700 |
| Product Listing | 20–24/32 · Bold 700 | 12/32 · Bold 700 |

Bottom-aligned · red-600 for discounted price (must be large text for WCAG) (DS-#055)

---

## Spacing · Grid · Radius · Shadows

### Spacing Scale (4px base)
| Token | px | rem | Usage |
|---|---|---|---|
| `s1` | 4 | 0.25 | Small gap |
| `s2` | 8 | 0.5 | Icon spacing |
| `s3` | 12 | 0.75 | Compact group |
| `s4` | 16 | 1 | Standard padding |
| `s5` | 20 | 1.25 | Card padding (spacious) |
| `s6` | 24 | 1.5 | Section gap |
| `s8` | 32 | 2 | Major section gap |
| `s10` | 40 | 2.5 | Hero / page top |
| `s12` | 48 | 3 | Page chunks |
| `macro-sm` | 80 | 5 | Landing section gap (min) |
| `macro-lg` | 120 | 7.5 | Landing section gap (max) |

### Grid System
- **Desktop (≥1200px):** 12 cols · Gutter 24px · Margin 80px+
- **Tablet (600–1199px):** 8 cols · Gutter 16px · Margin 32px
- **Mobile (<600px):** 4 cols · Gutter 12px · Margin 16–20px · Section gap 24–32px (DS-#024)

### Radius Scale
| Token | px | Usage |
|---|---|---|
| `r-sm` | 4 | Checkbox, small chips |
| `r-md` | 8 | Button, Input |
| `r-lg` | 14 | Panel, Filter sidebar |
| `r-xl` | 18 | **Card** (Product, Content) |
| `r-2xl` | 24 | **Modal, Bottom Sheet** |
| `r-pill` | 999 | Pill, Avatar, Tag, Badge, Top Navigation button (Mobile) (DS-#021) |

### Shadow Tokens
| Token | Value | Usage |
|---|---|---|
| `shadow-sm` | `0 1px 2px rgba(38,41,44,.04)` | Sticky header, **Primary CTA card rest** |
| `shadow-md` | `0 4px 12px rgba(38,41,44,.06)` | Dropdown |
| `shadow-lg` | `0 8px 24px rgba(38,41,44,.08)` | Popover, Toast, **Card hover/focus** |
| `shadow-xl` | `0 16px 40px rgba(38,41,44,.10)` | Modal, Bottom sheet |
| `shadow-ambient` | `0 6px 20px rgba(190,190,190,.20)` | Card rest on white/neutral bg (opt-in) |
| `shadow-ambient-on-tint` | `0 0 8px rgba(0,128,101,.06), 0 6px 16px rgba(0,128,101,.11)` | Card rest on tinted bg |
| `shadow-ambient-pure` | `0 0 16px rgba(0,128,101,.10)` | Floating element |

> Default cards: **no shadow at rest** — border or shadow-ambient only. Shadow reserved for Primary CTA card (DS-#023).
> When using shadow-ambient: **do not use border** — choose one or the other (DS-#066).
> On tinted bg: use green-family shadow not neutral gray (DS-#067).

### Focus States
**Variant A — Selectable (Input, Button, Checkbox, Radio, Toggle, Category):**
- Border: 1.5px solid `dark-green-600` (#008065)
- Outer halo: `box-shadow: 0 0 0 4px rgba(0,128,101,.18)` (focus-ring)
- `:focus-visible` only — mouse/touch does NOT show ring (DS-#108)
- Error focus ring: `rgba(245,57,57,.18)` (red-100 pattern)

**Variant B — Content Surface (Card, List row):**
- `shadow-lg` + `translateY(-2px)` · **no color ring** (DS-#002)

### Disabled State Tokens
| Token | Primitive | Hex |
|---|---|---|
| `bg-disabled` | neutral-50 | `#F8F9FA` |
| `text-disabled` | neutral-300 | `#A7ACAF` |
| `border-disabled` | neutral-200 | `#C2C5C8` |

### Border Hierarchy
- **Default**: `neutral-100` 1px (surface-aware: family-100 on tinted bg)
- **Form controls**: `neutral-100` 1px (locked, does not change by surface)
- **Card**: `family-100` @ 60% opacity 1px
- **Button**: Secondary = `dark-green-600` border · Primary/Ghost = none
- **No-border group**: Badge · Chip · Toggle · Primary/Ghost/Danger button

---

## Icons

### Library Priority
| Priority | Library | Use when |
|---|---|---|
| 1 | **Freshket custom** | Brand/product-specific icon exists |
| 2 | **Lucide** | Primary fallback (DS-#063) |
| 3 | **Material Symbols Rounded** | Last resort |

### Lucide Spec
| Tier | Size | strokeWidth | Context |
|---|---|---|---|
| Tier A | 16–40px | `2` (Marketplace) · `1` (Portal) | Button, nav, chip, badge, card |
| Tier B | 12–14px | `1.25` | Caption, helper text, small inline |

Always use `absoluteStrokeWidth=true` (DS-#065)

**Portal Override (DS-#083):**
| Tier | Size | strokeWidth |
|---|---|---|
| Portal A | ≤ 40px | `1` |
| Portal B | > 40px | `1.5` |

### Icon Color
| Context | Token |
|---|---|
| Muted / inactive | `neutral-400` `#8C9296` |
| Default UI | `neutral-600` `#565E64` |
| Brand / active | `dark-green-600` `#008065` |
| On brand surface | `neutral-50` `#F8F9FA` |
| On tint surface | `dark-green-900` `#004637` |
| Error | `red-600` `#F53939` |
| Success | `green-fresh-600` `#00CE7C` |

### Placement Rules
- **Default: icon left** (leading) — DS-#046
- **Exceptions (icon right):** Dropdown arrow / Forward navigation / External link / Trailing action (chip dismiss ×)

### Category Icon Exception
Category uses **emoji / product image / Freshket asset** only — NOT Lucide/Material (DS-#045)

---

## Button

### Types
| Type | Tier | Use when |
|---|---|---|
| **Primary** | 1 | Main CTA — 1 per viewport always |
| **Secondary** | 2 | Supporting action, paired with Primary |
| **Ghost** | 3 | Low-priority: "See more" · "Back" |
| **Availability** | — | "Notify me" · "Coming soon" · "Pre-order" |
| **Danger** | — | Destructive actions (irreversible + severe + intentional alarm) |
| **Icon-only** | — | Icon communicates without label |

### Shared Base
| Property | M | S |
|---|---|---|
| height | 40px | 32px |
| radius | `r-md` 8px | 4px |
| padding | 0 16px | 0 12px |
| font | 14px/700 | 12px/700 |
| shadow | **none** all states (DS-#059) | ← same |
| transition | `150ms cubic-bezier(.2,.7,.2,1)` | ← same |

### State Tables

**Primary** (dark-green-600 bg · neutral-50 text):
Rest → Hover `dark-green-700` → Pressed `dark-green-800` → Disabled: `bg-disabled` bg + `text-disabled` text + `border-disabled` 1px border

**Secondary** (white bg · dark-green-600 border + text):
Rest → Hover: `dark-green-50` bg / `dark-green-700` border+text → Pressed: `dark-green-100` bg / `dark-green-800`

**Ghost** (dark-green-50 bg · dark-green-600 text · no border):
Rest → Hover: `dark-green-100` → Pressed: `dark-green-200`

**Availability** (neutral-900 bg · neutral-50 text · no border):
Rest → Hover: `neutral-800` → Pressed: `neutral-700`

**Danger** (red-600 bg · neutral-50 text):
Rest → Hover: `red-700` → Pressed: `red-800`
> Danger requires a Confirmation Dialog before executing — never trigger immediately

### Focus Ring by Family
Primary/Secondary/Ghost: `dark-green-600` border + `dark-green-100` ring (`#C8E6E0`)
Availability: `neutral-600` border + `neutral-100` ring (`#E6E9EB`)
Danger: `red-600` border + `red-100` ring (`#FEEBEB`)

### Loading State
Visual = hover bg + spinner · no text · `pointer-events: none` · `aria-busy="true"`
```css
.spinner-m { width: 13px; height: 13px; }
.spinner-s { width: 10px; height: 10px; }
@keyframes spin { to { transform: rotate(360deg); } }
```
> After Add to Cart loading → must transition to QTY adjuster · never show green check

### Icon-only Button
Circle shape (r-pill 999px) · M: 40×40px icon 20px · S: 32×32px icon 16px
Same type system as text button — requires `aria-label` (WCAG 1.1.1)

### CSS Variables
```css
--btn-radius-m: 8px; --btn-radius-s: 4px;
--btn-height-m: 40px; --btn-height-s: 32px;
--btn-transition: 150ms cubic-bezier(.2,.7,.2,1);
--btn-primary-bg: var(--dark-green-600);
--btn-primary-hover: var(--dark-green-700);
--btn-primary-pressed: var(--dark-green-800);
--btn-primary-text: var(--neutral-50);
--btn-secondary-bg: #FFFFFF;
--btn-secondary-border: var(--dark-green-600);
--btn-secondary-hover: var(--dark-green-50);
--btn-ghost-bg: var(--dark-green-50);
--btn-ghost-hover: var(--dark-green-100);
--btn-ghost-pressed: var(--dark-green-200);
--btn-avail-bg: var(--neutral-900);
--btn-avail-hover: var(--neutral-800);
--btn-danger-bg: var(--red-600);
--btn-danger-hover: var(--red-700);
--btn-disabled-bg: var(--bg-disabled);
--btn-disabled-text: var(--text-disabled);
--btn-disabled-border: var(--border-disabled);
```

---

## Badge & Chip

### Badge vs Chip
| | Badge | Chip |
|---|---|---|
| Interactive | ❌ Not clickable | ✅ May be clickable or dismissible |
| Purpose | Display status / label | Filter · Category · Selection · Tag |

### Sizing
| Size | Height | Padding | Font | Radius |
|---|---|---|---|---|
| S | 20px | 0 8px | Caption 12px / 700 | r-pill |
| M | 24px | 0 10px | Caption 12px / 700 | r-pill |
| L | 28px | 0 12px | Body2 13px / 700 | r-pill |

**No border on any variant (DS-#042)**

### Variants
**Light (Default)** — bg = family-50 · text = family-800/900 · no border (DS-#043, #044)
**Vivid** — use when high-importance state OR category without icon · bg = WCAG-passing stop (DS-#045)
**Availability** — always `neutral-100` bg + `neutral-900` text · not Red (DS-#049)
**Lime Accent** — `lime-300` bg + `dark-green-950` text · ≤1% budget (DS-#051)
**Banana Accent** — `banana-50` bg + `banana-800` text (light) · ≤2% budget (DS-#061)

### Light Variant Table
| Family | bg | text |
|---|---|---|
| `dark-green` | `dark-green-50` `#F0FAF8` | `dark-green-800` `#005A47` |
| `green-fresh` | `green-fresh-50` `#F0FAF6` | `green-fresh-900` `#006E42` |
| `blue` | `blue-50` `#E8F0FC` | `blue-800` `#143F85` |
| `red` | `red-50` `#FEF5F5` | `red-800` `#AD2828` |
| `yellow` | `yellow-50` `#FFFBF0` | `yellow-900` `#8C7423` |
| `neutral` | `neutral-50` `#F8F9FA` | `neutral-700` `#464C51` |

### Vivid WCAG Stops
| Family | Stop | Hex | Contrast vs white |
|---|---|---|---|
| `dark-green` | -600 | `#008065` | 4.91:1 ✓ |
| `blue` | -600 | `#1E60D0` | 5.77:1 ✓ |
| `red` | -600 | `#F53939` | 3.80:1 ✓ |
| `purple` | -600 | `#6B4FE0` | 5.50:1 ✓ |
| `pink` | -700 | `#E05673` | 3.65:1 ✓ |
| `orange` | -700 | `#DF5900` | 3.77:1 ✓ |
| `banana` | -800 | `#7D7713` | 4.65:1 ✓ |
| `yellow` | -900 | `#8C7423` | 4.53:1 ✓ |

### Interactive Hover Rule (Universal)
| State | bg |
|---|---|
| Rest | `{family}-50` |
| Hover | `{family}-100` (+1 stop) |
| Pressed | `{family}-200` (+2 stop) |
| Selected | `{family}-100` persistent |

### Dismiss Button
× (Lucide X · stroke 1.8) · 14×14px icon · 20×20px touch area
Light variant — Rest: transparent bg · `family-600` icon · Hover: `family-100` bg · `family-700` icon
Vivid variant — icon color is **white** (not `family-600`), since it sits on a solid vivid-color chip

### Vivid ≠ Clickable
Vivid styling does not imply the badge/chip is clickable — it's used for high-importance states regardless of interactivity (DS-#048)

### CSS Variables
```css
--chip-height-s: 20px; --chip-height-m: 24px; --chip-height-l: 28px;
--chip-radius: 9999px;
--chip-light-bg: var(--dark-green-50);
--chip-light-text: var(--dark-green-800);
--chip-vivid-bg: var(--dark-green-600);
--chip-vivid-text: var(--neutral-50);
--chip-avail-bg: var(--neutral-100);
--chip-avail-text: var(--neutral-900);
```

---

## Input Field

### Types
| Type | Radius | Use when |
|---|---|---|
| Text | r-md 8px | Name, address, general |
| Password | r-md 8px | Masked · show/hide toggle |
| Search | r-md 8px | Product/global search (DS-#119) |
| Number | r-md 8px | Numbers, price, QTY |
| Textarea | r-md 8px | Multiline text |

### Shared Base (M/S)
| Property | M | S |
|---|---|---|
| height | 40px | 32px |
| radius | 8px | 4px |
| padding | 0 12px | 0 10px |
| bg | white | white |
| border rest | 1px `neutral-100` `#E6E9EB` | ← same |
| font | Body2 14px/400 | Caption 12px/400 |

### Anatomy
```
[Label]  (required *) / (optional)   [labelAction — right, contextual link DS-#125]
┌────────────────────────────────────────┐
│ [prefix icon]  value / placeholder [suffix] │
└────────────────────────────────────────┘
[Helper text] / [⚠ Error message]
```

### States
| State | Border | bg | Value |
|---|---|---|---|
| Rest (empty) | 1px `neutral-100` | white | — |
| Filled | 1px `neutral-100` | white | `neutral-900` |
| Focus | 1.5px `dark-green-600` (no glow DS-#116) | white | `neutral-900` |
| Error | 1px `red-600` | white | `neutral-900` |
| Error + Focus | 1.5px `red-600` | white | `neutral-900` |
| Disabled | 1px `border-disabled` | `bg-disabled` | `text-disabled` |
| Read-only | 1px `border-subtle` | `neutral-50` | `neutral-600` |
| Success (Valid) | 1px `green-fresh-600` | white | `neutral-900` |

### Search Placeholder Rule
Do NOT use "Search" word · use object name being searched:
- ✅ `Product name, product code` · ✅ `Restaurant name`
- ❌ `Search product name` · ❌ `Type to search`

### Form Group Spacing
| Gap | Value |
|---|---|
| Label → Field | 4px |
| Field → Helper/Error | 4px |
| Field → Field (standard) | 16px (s4) |
| Field → Field (dense) | 12px (s3) |
| Section Group → Section Group | 24px (s6) |
| Form → Submit button | 24–32px |

### Textarea
- min-height 80px · padding 10px 12px · resize vertical only
- Char count: `current/max` bottom-right · Normal <80%: `neutral-400` · Warning ≥80%: `neutral-700` · Limit: `red-600`

### NumberInput Compact (DS-#125)
Dense/inline context: 26px height · Caption 12px · padding 0 8px · `r-sm` 4px
Use only in table-inline / dense context — not in forms or dialogs

---

## Checkbox · Radio · Toggle

### Checkbox (r-sm 4px)
| State | Border | bg | Checkmark |
|---|---|---|---|
| Unchecked | 1px `neutral-100` | white | — |
| Unchecked hover | 1.5px `green-fresh-600` | white | — |
| Checked | — | `green-fresh-600` `#00CE7C` | white ✓ |
| Error | 1.5px `red-600` | white | — |
| Disabled unchecked | 1px `border-disabled` | `bg-disabled` | — |
| Disabled checked | — | `neutral-200` | white ✓ |

### Radio Button
Same size as Checkbox (16×16px) · Circle shape (r-pill)
Selected: `green-fresh-600` outer ring · white gap 2px · `green-fresh-600` inner dot 6px

### Toggle
| Size | Track W×H | Knob | Off track | On track |
|---|---|---|---|---|
| M | 40×24px | 18×18px white | `neutral-200` | `green-fresh-600` |
| S | 32×18px | 14×14px white | `neutral-200` | `green-fresh-600` |

Track radius: r-pill · Knob: white + `box-shadow: 0 1px 3px rgba(38,41,44,.15)`
> Toggle = immediate on/off · no confirmation needed · always external label only

### Group Layout
- **Vertical (default):** gap s3 (12px)
- **Horizontal (≤3 options, short labels):** gap s6 (24px)
- Toggle in list: label left · toggle right (space-between)

---

## Dropdown / Select

### Types
| Type | When to use |
|---|---|
| **Select** | Choose 1 from defined list |
| **Combobox** | Choose 1 + type to filter |
| **Multi-select** | Choose multiple · shown as chips |
| **Tag input** | Add free-form + predefined values |

### Trigger
Extends Input Field base · chevron suffix: `ChevronDown` 16px · rotates 180° on open

### Dropdown Panel
| Property | Value |
|---|---|
| bg | `#FFFFFF` |
| border | `1px solid neutral-100` |
| radius | r-md 8px |
| shadow | `shadow-md` |
| z-index | 300 (z-dropdown) |
| max-height | 240px (scroll) |
| offset | 4px from trigger |

### Option States
| State | bg | text |
|---|---|---|
| Rest | transparent | `neutral-900` |
| Hover | `dark-green-50` | `neutral-900` |
| Selected | `dark-green-50` | `dark-green-900` (text-on-tint) |
| Selected + Hover | `dark-green-100` | `dark-green-900` |
| Disabled | transparent | `neutral-300` |

### Multi-select Trigger
Selected values shown as Light chips S (dark-green family) · >3 chips shows `+N` badge

### Keyboard Navigation
↓/↑ move · Enter/Space select · Escape close · Tab close+move · Home/End first/last

---

## OTP Input

### Sizes
| Size | Box W×H | Radius | Digit font | Gap |
|---|---|---|---|---|
| M | 48×56px | r-md 8px | 22px/700 | 8px |
| S | 40×48px | r-sm 4px | 18px/700 | 6px |

### States (all boxes simultaneously on error/success)
| State | Border | bg |
|---|---|---|
| Empty | 1px `neutral-100` | white |
| Focus | 1.5px `dark-green-600` + focus-ring | white |
| Filled | 1px `neutral-100` | white |
| Error | 1px `red-600` (all boxes) | white |
| Success | 1px `green-fresh-600` (all boxes) | white |
| Disabled | 1px `border-disabled` | `bg-disabled` |

### Digit Layouts
- 4 digits: `□□□□`
- 6 digits standard: `□□□□□□`
- 6 with separator: `□□□ — □□□` (payment context)

### Auto-behavior
- Type → auto-focus next box · Backspace empty → focus previous · Paste → fill all from clipboard
- `autocomplete="one-time-code"` for SMS autofill · `inputmode="numeric"`

---

## Quantity Adjuster

### Entry Points
| | A — Transition | B — Direct |
|---|---|---|
| Trigger | Replaces Add to Cart button after tap | Renders as QTY from start |
| Initial QTY | Always 1 | From cart/order data |
| Context | Product card, detail | Cart, order form, table row |

### Variants
| | A — Ghost+Primary | B — Full Ghost |
|---|---|---|
| +/- style | Primary circle `dark-green-600` | Ghost transparent circles |
| Best for | Product card, detail | Table row, cart list |

> Container bg is decided by the **Surface Rule** below, independent of Variant A/B — the +/- style is the only thing that differs between variants (DS-#029)

### Shared Base
- M: 40px height · 32×32px buttons · 9999px radius
- S: 32px height · 26×26px buttons
- Count: Body2 14px/700 · min-width 40px · `dark-green-900`

### Surface Rule
| Surface | Container bg |
|---|---|
| White | `dark-green-50` `#F0FAF8` |
| Tinted/neutral-50+ | `white` `#FFFFFF` |

### Transition Flow (Entry Point A)
```
[Add to Cart — Primary] → tap → [Loading spinner] → [QTY Adjuster QTY=1]
[QTY=1, press −] → [Loading] → [Add to Cart returns]
```
Width stays constant throughout — no layout shift

---

## Card

### Card Types
| Type | Used with |
|---|---|
| **Product card** | Marketplace catalog, product grid |
| **Information card** | Data display, entity info, stat panel |
| **Primary CTA card** | 1 per screen — forces primary action |

### Base Spec
| Property | Token | Value |
|---|---|---|
| `radius` | `r-xl` | 18px |
| `bg` | `bg-surface` | #FFFFFF |
| `padding` (standard) | `s4` | 16px |
| `padding` (spacious) | `s5` | 20px |
| `transition` | — | `150ms cubic-bezier(.2,.7,.2,1)` |
| `hover-lift` | — | `translateY(-2px)` |
| `focus` | Variant B | `shadow-lg` + `translateY(-2px)` · no color ring |

### Surface Rules — Border & Shadow
**Border Rule (same for all card types):**
| Surface | Border |
|---|---|
| White / neutral bg | `1px solid rgba(230,233,235, 0.60)` |
| Tinted bg (`{color}-50`) | `1px solid rgba({family}-100-rgb, 0.60)` |

| bg | border rgba |
|---|---|
| white / neutral | `rgba(230,233,235, 0.60)` |
| `dark-green-50` | `rgba(200,230,224, 0.60)` |
| `green-fresh-50` | `rgba(204,245,229, 0.60)` |
| `red-50` | `rgba(254,235,235, 0.60)` |
| `blue-50` | `rgba(209,225,249, 0.60)` |
| `yellow-50` | `rgba(255,247,214, 0.60)` |

> DS-#068: border = family-100 at 60% opacity · Shadow at rest = none

**Shadow-ambient (opt-in — do NOT combine with border):**
| Surface | Value |
|---|---|
| White / neutral bg | `0 6px 20px rgba(190,190,190,.20)` |
| Tinted bg | `0 0 8px rgba(0,128,101,.06), 0 6px 16px rgba(0,128,101,.11)` |
| Floating element | `0 0 16px rgba(0,128,101,.10)` |

### States
| State | Visual |
|---|---|
| **rest** | border per Surface Rules · no shadow |
| **hover** | `0 8px 24px rgba(38,41,44,.08)` + `translateY(-2px)` |
| **focus** | Variant B — shadow-hover + translateY(-2px) · no color ring (DS-#002) |
| **unavailable** | `opacity: 0.55` · image `grayscale(1)` · pointer-events: none |
| **disabled** | bg-neutral-50 · text-neutral-300 · border-neutral-200 |

> **DS-#124:** any element styled as a card (white bg + border + radius) that is clickable MUST use hover rule (shadow + translateY(-2px)) — including list rows

### Primary CTA Card (DS-#023)
| Property | Value |
|---|---|
| shadow at rest | `shadow-sm` (`0 1px 2px rgba(38,41,44,.04)`) or `shadow-md` |
| bg (optional) | dark-green-600 `#008065` |
| text on dark bg | neutral-50 `#F8F9FA` |
| border | none |

### Content Structure — Product Card
```
┌─────────────────────────┐
│  [product image] 170px  │  ← neutral-50 bg placeholder
├─────────────────────────┤
│  Price (16px/700)       │
│  Product name (14px/400)│
│  Volume (12px/neutral-600)│
│  [CTA button full width]│  ← dark-green-600 · r-md · 40px
└─────────────────────────┘
padding: 8px · content gap: 4px · image→content: 16px
```

### Content Structure — Information Card
Icon circle 44px (`{color}-50` bg, r-pill) · Title 18px/700 `neutral-900` · Body 14px/400 `neutral-600` · optional link/CTA chip
Padding: `24px 32px` · internal gap 16px (between blocks) / 8px (between text items)

### Bento Layout
Permitted sizes: **1×1, 1×2, 2×1, 2×2, 3×2** · gap: `s4` (16px) standard
Dashboard only — do not use with Marketplace, Catalog, or List view (DS-#026)
Primary CTA card → use Card Variant Primary CTA · all others: no shadow at rest

### CSS Variables
```css
--card-radius: 18px;
--card-bg: #FFFFFF;
--card-padding: 16px;
--card-transition: 150ms cubic-bezier(.2,.7,.2,1);
--card-border: 1px solid rgba(230,233,235, 0.60);
--card-border-tint: 1px solid rgba(200,230,224, 0.60);
--card-shadow-hover: 0 8px 24px rgba(38,41,44,.08);
--card-hover-lift: translateY(-2px);
--shadow-ambient: 0 6px 20px rgba(190,190,190,.20);
--shadow-ambient-on-tint: 0 0 8px rgba(0,128,101,.06), 0 6px 16px rgba(0,128,101,.11);
--shadow-ambient-pure: 0 0 16px rgba(0,128,101,.10);
```

**Tailwind utility classes (globals.css @layer components):**
- `.card-ds` — base: border rgba, radius 18px, white bg, no shadow
- `.card-ds-hover` — extends card-ds: adds hover shadow + lift + transition (DS-#124)
- `.card-ds-tint` — tinted freshket-50 bg, green border rgba

---

## Section Header · Panel Header · Empty State

### SectionHeader
```
[icon]  Section Title (H5/H6)          [right action]
        subtitle / description (Body2)
────────────────────────────────────────
```
- Title: H5 20px/700 (default) · H6 16px/700 (compact) · `neutral-900`
- Icon: 20px · strokeWidth 1 · `neutral-600` · 8px gap
- Right action: **Body2 link** or Button S · `dark-green-600`
- Divider (optional): `1px solid neutral-100` below the whole block · `s3` (12px) gap

### PanelHeader
Inside a card · uses card padding
- Title: Body1 16px/700 (card panel) · H6 16px/700 (standalone panel) · `neutral-900`
- Icon (optional): 16px · strokeWidth 1 · `neutral-500` · `s2` (8px) gap
- Right action: Caption 12px link · Ghost Icon S · or Badge
- Divider (optional): `1px solid neutral-100`
- Spacing: min-height 40px · header→content gap `s3` (12px) with divider / `s2` (8px) without

### EmptyState Variants
| Variant | Illustration | Title | Description | Action | Container padding |
|---|---|---|---|---|---|
| Full page | 120px | H4 24px/700 | `neutral-500` | Primary/Secondary button | `s8` (32px) |
| Section | 80px | H6 16px/700 | `neutral-500` | Ghost/Secondary button | `s6` (24px) |
| Inline | 48px | Body2 14px/700 | `neutral-400` | Ghost link | `s4` (16px) |

**Illustration options:** Emoji (consumer) · Icon circle family-50 bg + family-600 icon (portal) · Custom SVG (important screens)

**Wording:** "No orders yet" ✅ · "No data found" ❌ (DS-#128)

---

## Modal · Bottom Sheet

### Sizes
| Size | Width | Use with |
|---|---|---|
| S | 400px | Simple confirmation |
| M | 560px | Form (default) |
| L | 720px | Data table, complex form |
| Full | `calc(100% - 32px)` | Mobile always |

max-height: `90vh` · content scrolls inside

### Bottom Sheet
Width 100% · max-height 80vh · r-2xl top corners · handle bar 32×4px `neutral-200`

### Visual
| Property | Value |
|---|---|
| bg | `#FFFFFF` |
| border | `1px solid neutral-100` |
| radius | r-2xl 24px |
| shadow | `shadow-xl` |
| backdrop | `rgba(22,23,25,.45)` |
| z-index | Modal: 500 · Backdrop: 400 |

### Animation
Modal: `scale(.95) opacity(0) → scale(1) opacity(1)` · 200ms ease-out · Exit: reverse · 150ms ease-in
Bottom Sheet: `translateY(100%) → translateY(0)` · 280ms cubic-bezier(.2,.7,.2,1) · Exit: reverse · **200ms** ease-in

### Nested Modal
Level 1: z-index 500 · backdrop 400 @ opacity .45
Level 2: z-index 520 · backdrop 510 @ opacity .30 · must be smaller than Level 1
Max nesting: 2 levels

### Click Outside Behavior
Dismissible (default) — simple info/filter/menu modals: click backdrop closes
Non-dismissible — destructive confirm, unsaved-form, payment-in-progress: backdrop click triggers the shake animation instead of closing

### Non-dismissible Shake
```css
@keyframes modal-shake {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-6px); }
  75% { transform: translateX(6px); }
}
```

### ConfirmModal Shorthand (DS-#126)
Size S always · icon circle 44×44px `{family}-50` bg + `{family}-600` icon 20px/strokeWidth 1 · centered layout · Ghost cancel + Primary/Danger confirm
- `red` family → destructive · `dark-green` → positive · `yellow` → caution · `blue` → info

---

## Date Picker

### Trigger
Calendar icon suffix 16px · Value: `D MMM YYYY` (Thai Buddhist Era, e.g. "16 May 2026") · Opens calendar panel (no direct keyboard)
Chevron rotates 180°/0° on open/close · `transform 300ms cubic-bezier(.2,.7,.2,1)`
Open state: border + calendar icon + placeholder text + chevron all turn `dark-green-600`

### Calendar Panel
bg white · r-lg 14px · `shadow-xl` · width 280px (single) / 560px (range)
z-index: 300 (z-dropdown)

### Date Cell States
| State | bg | text | Ring |
|---|---|---|---|
| Default | transparent | `neutral-900` | — |
| Hover | `dark-green-50` | `dark-green-900` | — |
| Selected | `dark-green-600` | `neutral-50` | `0 0 0 2px #FFF` (white ring) |
| Today (unselected) | transparent | `dark-green-600` bold + dot below | — |
| Other month | transparent | `neutral-200` (pointer cursor) | — |
| Disabled | transparent | `neutral-200` | — |

Cell: 36×36px · r-sm 4px · gap 2px

### Range Selection
- Start/End: `dark-green-600` bg · `neutral-50` text · pill half-radius
- Fill (between): **`dark-green-50` bg** · `neutral-900` text (DS-#123 — do NOT use green-fresh-50)

### Footer
Clear: Ghost S · Confirm: Primary S (disabled until both dates selected)

---

## Toast / Snackbar

### Positioning
Mobile (xs–sm): fixed bottom 24px · centered · width `calc(100% - 32px)`
Desktop (md+): fixed top 24px · right 24px · width 360px
z-index: 600 (z-toast) · shadow: `shadow-lg`

### 4 Variants
| Variant | bg | border | Use |
|---|---|---|---|
| A — White | `#FFFFFF` | 0.5px neutral-100 | Neutral surface |
| B — Tinted 50 | `{family}-50` | 0.5px {family}-100 | **Default** |
| C — Tinted 100 | `{family}-100` | 0.5px {family}-200 | Warning/Error attention |
| D — Dark 900 | `neutral-900` | 0.5px neutral-700 | Critical · dark surface |

### 4 Types
| Type | Variant B bg | Auto-dismiss |
|---|---|---|
| Success | `green-fresh-50` | ✅ 4s |
| Warning | `yellow-50` (neutral-900 text) | ❌ manual |
| Error | `red-50` | ❌ manual |
| Normal comm | non-semantic — Variant A or D only, no color tint | ✅ 4s |

> Warning = always yellow bg + neutral-900 text across all variants (DS-#073)
> Never use `banana` for Warning — Warning is always `yellow-600` (DS-#062)

### Anatomy
```
┌────────────────────────────────────────┐
│  [emoji]  Message text            [×]  │
│           Sub-message (optional)       │
│           [Action link] (optional)     │
└────────────────────────────────────────┘
```
- Emoji: top-left · 16px · primary icon (no colored borders or left accents)
- Message: Body2 14px/400 · max 2 lines — if more is needed, use a Modal instead
- Border radius: r-xl 18px
- Container: `min-width: 320px` · `max-width: 480px` (desktop) / `calc(100% - 32px)` (mobile) · padding `s4` (16px) top/bottom/right · `s3` (12px) left

### Animation
Enter: translateY(16px) → 0 (mobile) / translateX(16px) → 0 (desktop) + opacity 0→1 · 200ms ease-out
Exit: reverse + opacity 0 · 150ms ease-in
Max 3 visible · queue beyond that

---

## Table

### 3 Variants (DS-#076)
| Variant | Border | Use when |
|---|---|---|
| **Grid** | all cell borders | Data table with many columns |
| **Outline** | header/row bottom-borders only · no outer border, no vertical borders | Standard list view |
| **Clean** | header bottom border only · rows borderless | Marketplace · light UI |

### Density
Header row height is always **40px regardless of density** — only row height/padding scale below.

| Size | Row height | Padding | Font |
|---|---|---|---|
| S (dense) | 40px | 0 12px | Caption 12px/400 |
| M | 52px | 0 16px | Body2 14px/400 |
| L (comfortable) | 64px | 0 16px | Body2 14px/400 |

### Column Builder Helpers
`col.text` · `col.number` · `col.currency` · `col.name` · `col.badge` · `col.action` — shared helpers for per-column alignment/width defaults (DS-#127)

### Bulk Action Toolbar
Appears when rows are selected · bg `dark-green-50` · border `1px solid dark-green-100` · height 48px · sticky top · z-index 40

### Frozen Column
Sticky header z-index 10 · frozen column z-index 20 · header+frozen intersection z-index 30 · frozen column casts a shadow toward scrollable content (DS-#076)

### Key Rules
- **Active vs Selected** (DS-#127): Active = row clicked to expand its 2-Layer sub-table (click-to-expand, no checkbox) → bg `neutral-50` · Selected = checkbox checked for batch/bulk action → bg `dark-green-50`. Both use `border-left: 3px solid dark-green-600`
- **Sticky header** — column headers stay visible on scroll
- **Column alignment**: text left · number right · action right
- **2-Layer expand pattern**: click row → expand row below with sub-table / details

### Sorting
Inactive: both arrows `neutral-300` · Ascending: up arrow `dark-green-600` · Descending: down arrow `dark-green-600`

---

## Navigation

### Top Header Bar
| Property | Value |
|---|---|
| height | 56px (desktop) / 48px (mobile) |
| bg | white `#FFFFFF` |
| border-bottom | `1px solid rgba(230,233,235, 0.60)` |
| z-index | `z-header` (200) |

**Scroll state:** bg `rgba(255,255,255,0.85)` + `backdrop-filter: blur(10px)` + shadow-sm

**Right zone order (left→right):** Search · Cart · Notification · Menu · **Profile** (always rightmost)

### Sidebar
| State | Width | Trigger |
|---|---|---|
| **Full** | 240px | Default desktop |
| **Mini** | 56px | User collapse / tablet |
| **Hide** | 0px | Mobile / drawer mode |

Transition: `200ms cubic-bezier(.2,.7,.2,1)`

**Nav item active state** (portal-aware):
| Portal | bg | left accent 2px | icon/text |
|---|---|---|---|
| MC/OMS/SCN | `dark-green-50` | `dark-green-600` | `dark-green-600` / `dark-green-900` |
| LMS | `orange-50` | `orange-600` | `orange-600` / `orange-900` |
| WMS | `teal-50` | `teal-600` | `teal-600` / `teal-900` |

> Nav item weight: Regular 400 always — active state communicated by bg+color, NOT weight (DS-#118)

**Dynamic Layout System:** sidebar auto-collapses based on content density:
- `density: 'medium'` → auto Mini (sub-panel, form, data)
- `density: 'high'` → auto Hide (kanban, map, canvas)
- Restores prev-state when trigger closes

### Bottom Tab Bar (Mobile)
| Property | Value |
|---|---|
| height | 56px + `env(safe-area-inset-bottom)` |
| bg | white |
| border-top | `0.5px solid rgba(230,233,235,.60)` |
| z-index | z-sidebar (100) |

Active indicator: 2px top border `dark-green-600`
Tab items: icon 24px / label 10–11px · 4 or 5 max

**Center CTA Variant:** 48×48px circle Primary button `dark-green-600` · `translateY(-12px)` float above bar

### Top Tab Patterns
**Folder Tab** (Portal data views): `{portal}-50` bg active · r-md top corners · no border · divider below
**Pill Segmented Control** (2–3 options): `green-fresh-50` active · r-pill container · Regular 400 all states

---

## Layout Grid

### Breakpoints
| Token | Range | Use for |
|---|---|---|
| `xs` | 0–599px | Smartphone |
| `sm` | 600–767px | Large phone / portrait |
| `md` | 768–1023px | Tablet |
| `lg` | 1024–1199px | Tablet landscape / small laptop |
| `xl` | 1200–1439px | Laptop |
| `2xl` | ≥1440px | Desktop / large monitor |

### App Shell Combinations
| Layout | Sidebar | Header | Bottom Tab | Used for |
|---|---|---|---|---|
| **A — Full** | 240px | ✅ 56px | — | Desktop Portal |
| **B — Compact** | 56px | ✅ 56px | — | Tablet Portal |
| **C — Header only** | — | ✅ 56px | — | Marketplace Desktop |
| **D — Mobile** | — (drawer) | ✅ 48px | ✅ 56px | Mobile all |
| **E — No chrome** | — | — | — | Onboarding / Overlay |

### Z-index Stack
| Layer | z-index |
|---|---|
| Base content | 0 |
| Sticky elements | 10 |
| Sidebar | 100 |
| Top Header | 200 |
| Dropdown / Popover | 300 |
| Modal backdrop | 400 |
| Modal / Dialog | 500 |
| Toast / Snackbar | 600 |

### CSS Variables
```css
--header-height: 56px; --header-height-mobile: 48px;
--sidebar-full: 240px; --sidebar-mini: 56px; --sidebar-hide: 0px;
--sidebar-transition: 200ms cubic-bezier(.2,.7,.2,1);
--bottom-tab-height: 56px;
--z-base: 0; --z-sticky: 10; --z-sidebar: 100; --z-header: 200;
--z-dropdown: 300; --z-overlay: 400; --z-modal: 500; --z-toast: 600;
--marketplace-max-width: 1440px;
--sub-content-std: 480px; --sub-content-wide: 600px;
```

---

## Page Layout

### Portal Shell
```
┌────────────────────────────────────────────┐
│  PortalHeader (56px · sticky)              │
├────────────┬───────────────────────────────┤
│ Sidebar    │  Content area (flex:1)        │
│ 240/56px   │  maxWidth 1420px · mx:auto    │
└────────────┴───────────────────────────────┘
```
- NavItem active: `dark-green-50` bg + 2px `dark-green-600` left accent · weight 400 (DS-#118)

### Auth Page
```
Page (100dvh · neutral-50 · flex column center)
  └─ Auth Card (maxWidth 480px · my:auto · bg white · r-lg · shadow-xl)
       padding 20px (mobile) / 48px (desktop) · gap 32px
```
> `100dvh` (not `100vh`) · `my: auto` not `justifyContent: center` on parent (DS-#087)

### Full-page Data Table
Flex structure: Toolbar (flexShrink:0) + Table card (flex:1 · overflow:hidden)
Table container: `overflowY: auto` with sticky column headers

### Dual-panel Workspace
Left panel (~280px fixed) + Right panel (flex:1) · Left panel has batch cards with active state `dark-green-50` + 2px accent

---

## Widgets (Ready-made Patterns)

### Auth Card
- Container: `maxWidth: 480px` · bg white · r-lg · shadow-xl
- Border: `1px rgba(230,233,235,0.60)` · padding 20px (mobile) / 48px (desktop)

### PageLoader
- Container: `position: fixed · inset: 0` · bg `neutral-50` · flex center
- Logo: `freshket-original.svg` · width 120px
- 3 dots: 7×7px · r-pill · `dark-green-600` · gap 8px
- Animation: `scale 0.6→1→0.6` + `opacity 0.35→1→0.35` · 1.2s ease-in-out · stagger +0.2s

### Filter Bar (List Toolbar Widget)
CalendarBtn / SortDropdown / SearchInput — all 32px height, `r-sm` 4px (DS-#084 context-group consistency)
Dismissible FilterChips — 24px height, pill, `neutral-100` bg

> Not to be confused with the **Full-page Data Table** category-chip scroll strip above (horizontal scroll · fade mask at edge — gradient exemption from DS-#020 for the scroll indicator)

### UserAvatar Dropdown
Avatar 32×32px · `dark-green-50` bg + `dark-green-900` initials (2 chars) · dropdown on click

### BulkBar
Fixed floating bar (above bottom nav) · appears when selection count > 0 · white bg · `border-radius: 20px` · `box-shadow: 0 8px 24px rgba(38,41,44,.10)` · `z-index: 1300`

### Skeleton Row
Pulse animation: `neutral-100` bg · 1.5s ease-in-out infinite · matches real content shape

### Pagination Bar
Ghost icon buttons for prev/next · page number buttons: 28×28px square, `r-sm` 4px (not pill) — active: solid `dark-green-600` bg + `neutral-50` text

### InlineEditCell
Table cell switches to input on click · confirm only via explicit ✓ button click · `onBlur` (focus leaves component) = **cancel**, not confirm

---

## UX Writing

### Toast Copy
| Type | Pattern | Example |
|---|---|---|
| Success (4s) | `[action past tense] already` | "Saved" / "Email sent" |
| Info (4s) | State information, concise | — |
| Warning (manual) | Consequence statement | "Changes will be lost if you leave this page" |
| Error (manual) | `[action] failed — [next step]` | "Save failed — try again" |

Max 2 lines — if more copy is needed, use a Modal instead

### Modal Copy
- Title: Noun phrase ≤5 words, not a question
- ✅ "Confirm deletion" / "Change password" · ❌ "Are you sure?" / "Please confirm"
- Destructive CTA: specify the object: [Delete order] not [Yes / OK]
- Destructive example — Title: "Delete this order?" · Body: "Order PO-202600022 will be permanently deleted" · Buttons: [Cancel] [Delete order]

### Loading Copy
PageLoader / Skeleton rows need no label text. If an API call/upload/save must show text, use `[action in progress]…` — e.g. "Saving…", "Uploading…"

### Coming Soon
✅ "Coming soon" · ❌ "Coming soon (Q3 2026)" — never promise a timeline that isn't confirmed

### Navigation Labels (Sidebar)
Nouns only · no pronouns · ≤3 words
✅ "Orders" · ❌ "Manage orders" / "My orders"
✅ "Product prices" · ❌ "View prices" — ✅ "Pick list" · ❌ "Check pick list"

### Password & Auth
Password rules checklist always uses **positive framing** — show all requirements, not just the ones that currently fail

### Auth CTA Table
| Page | Title | Primary CTA |
|---|---|---|
| Login | Log in | Log in |
| Sign Up | Create new account | Sign up |
| Forgot Password | Forgot password | Send reset link |
| Reset Password | Set new password | Set password |
| Change Password | Change password | Save |

### Search Placeholder
Use object name, not "Search":
✅ `Product name, product code` · ❌ `Search product name`

### Error Messages
Action-oriented — tell user how to fix:
✅ "Enter no more than 20 characters" · ❌ "Invalid data"

---

## Mobile UX

### Touch Target — Minimum 44×44px
Every interactive element must have touch area ≥44×44px (add padding if element is smaller)

### Thumb Zone
- Easy (bottom 40%): Primary CTA, Bottom Tab
- Moderate (middle 35%): scrollable content
- Hard (top 25%): Settings, Profile, Search (intentional use only)

### Screen Density Rule
**1 screen = 1 goal** · Login: ≤3 fields · Primary action must be visible without scrolling

### Mobile Navigation
- Bottom Tab Bar (2–5 items) — NOT sidebar/hamburger
- Stack navigation for drill-down (list → detail)
- Bottom Sheet — NOT center modal for quick actions

### Mobile Spacing
Content padding: 16px horizontal · Card padding: 16px · Section gap: 24px · List item height (M): 56–64px (touch target headroom)
`paddingBottom: 80px` for ScrollView when bottom nav exists (56px nav + 24px breathing) — use `ListFooterComponent`/`contentInsetAdjustmentBehavior` for FlatList; plain 24px padding when there is no bottom nav
Bottom safe area: use `SafeAreaView`, never hardcode the inset value

### Skeleton Loading
Priority: Skeleton > Spinner > Nothing
- Color: `neutral-100` · pulse 1.5s ease-in-out · matches real content shape
- Reveal: fade-in 400ms when ready
- Never show a "Loading..." text placeholder — skeleton shape communicates state instead

### Platform Differences
| UX Pattern | iOS | Android |
|---|---|---|
| Back navigation | Swipe from left edge | Hardware/gesture back |
| Share sheet | Native share sheet | Native share intent |
| Date picker | Wheel spinner | Dialog |
| Alerts | `Alert.alert` native style | Material dialog style |
| Bottom sheet | Slide up + handle | Similar |
| Tab bar position | Bottom | Bottom (top also common) |

---

## React Native / App Guidelines

### Token Translation
| Property | Web | React Native |
|---|---|---|
| Spacing | `"16px"` | `16` (unitless) |
| Radius | `"8px"` | `8` |
| Shadow | `box-shadow` string | `SHADOW_*` spread object |
| Font weight | `fontWeight: "700"` | `fontWeight: "700"` (string, as-is) — Android has its own override, see DS-#110 below |
| Focus ring | `:focus-visible + box-shadow` | `onFocus/onBlur` → borderColor |

### DS-#110 Android Font Rule
On Android: do NOT combine `fontFamily + fontWeight` — use `fontFamily: "NotoSansThai-Bold"` only

### DS-#111 Android Shadow
`elevation` on Android does not match DS spec — document the gap and use elevation only for layering, not exact shadow match

### DS-#112 Key Differences
- Hover → `pressed` state in `Pressable`
- `position: fixed` → **none** — use navigation patterns instead (no direct RN equivalent)
- `:hover` → `Pressable` pressed state
- Touch target: ≥44×44px via `padding` on `Pressable`

### DS-#113 iOS-Specific Rules
- Safe-area insets: Dynamic Island `top≈59px`/`bottom≈34px` · Notch `≈44px`/`≈34px` · Home button `≈20px`/`≈0px`
- Tap highlight: use `Pressable`, not `TouchableHighlight`
- `StatusBar` style by background: `neutral-50`/white → `dark` · `dark-green-600` → `light` · modal overlay → `light`
- `KeyboardAvoidingView` behavior: `iOS: "padding"` / `Android: "height"`
- Swipe-back gesture: never set `gestureEnabled: false`
- Haptic feedback mapping: Tap→light · Submit success→success · Form error→error · Delete/destructive→heavy · Long press→medium (Android support is partial)

### Layout Differences (Web → RN)
`div`→`View` · `p/span/h1`→`Text` (all text must be inside a `Text` node) · `overflow:scroll`→`ScrollView` · Flex direction default is **column** in RN (row on web) · use a spacer View or `marginRight` instead of `gap` on SDK below 71

### Padding After Safe Area
0px when an App Bar is present · 8–12px following an App Bar · 16px full-screen/edge-to-edge (Material Design 3 keyline) · 20–24px for a spacious layout (Grab/Shopee pattern) · recommended default `paddingTop: 16`

### Expo SDK Compatibility
SDK 54 = current Expo Go · `npx create-expo-app APP --template blank@sdk-54`

### SafeAreaView
```jsx
import { SafeAreaView } from 'react-native-safe-area-context';
<SafeAreaView edges={['top', 'bottom']}>
```
`<StatusBar style="auto" />` — or set explicitly per DS-#113's per-background table above

### Font Setup
```css
/* Web */
@font-face {
  font-family: 'Noto Sans Thai';
  src: url('assets/font/NotoSansThai-VariableFont_wdth,wght.ttf') format('truetype');
  font-weight: 100 900;
}
```

---

## Handoff to Dev (DS-#115)

### 4-Section Package
1. **Workflow** — user flow · entry point · transitions
2. **Component Spec** — token names · sizes · states · animations
3. **Wording** — all copy strings labeled and translated
4. **Source Code** — example code, `[WEB]`/`[APP]` code-block format

### Checklist Before Handoff (5 categories)
**Workflow / Component Spec / Wording / Source Code / DS Compliance**
- ✓ All colors use design token names (no hex)
- ✓ All states designed (rest · hover · focus · error · disabled · loading · empty)
- ✓ Desktop + Mobile specs included
- ✓ Touch target ≥ 44×44px on mobile (DS-#114)
- ✓ Copy strings written + labeled — UX writing check: no leading "Enter" as an imperative without context
- ✓ `tokens.platform.js` included
- ✓ DS-#112: `[WEB]`/`[APP]`/`[BOTH]` specified in the Build Manifest
- ✓ Passed Web AI Designer validation / Passed App AI Designer validation
- ✓ No `[PROPOSED]` items left unlogged

### Handoff Template & Storage
Template: Date / Designer / Platform / DS Decisions header + numbered workflow/spec/wording/code sections
Store at: `handoff/[feature-name]-handoff.md` · code lives under `[WEB]/components/` and `[APP]/components/`

---

## Quick Reference — Tailwind Classes

### Card (DS-compliant)
```jsx
// Base card — static display
<div className="card-ds p-4">...</div>

// Clickable card — adds hover shadow + lift (DS-#124)
<div className="card-ds-hover cursor-pointer">...</div>

// Tinted card (freshket-50 bg)
<div className="card-ds-tint p-4">...</div>
```

### Badge — Light (no border)
```jsx
<span className="badge-fk">Employee</span>
// bg-freshket-100 text-freshket-700 — no border
```

### Badge — Vivid
```jsx
<span className="badge-fk-solid">Admin</span>
// bg-freshket-600 text-white — no border
```

---

## Decision References

| Decision | Subject |
|---|---|
| DS-#001 | Checkbox r-sm (4px) · r-sm NOT used for input text — use r-md (8px) |
| DS-#002 | Focus = no color ring on content card (Variant B) |
| DS-#003 | Field focus = Variant A (same as category) |
| DS-#004 | focus-border = dark-green-600 · focus-ring = rgba(0,128,101,.18) |
| DS-#005 | text-on-tint origin decision (generalized by DS-#018) |
| DS-#006 | letter-spacing = normal always |
| DS-#007 | bg-canvas → white |
| DS-#008 | r-xl = 18px for cards |
| DS-#010 | 1 accent per viewport |
| DS-#011 | Border hierarchy system |
| DS-#012 | Colored full-viewport bg — marketing/onboarding carve-out only, never in-product |
| DS-#013 | Type hierarchy: role-based size + binary weight |
| DS-#014 | Min font size 12px (decision-grade) |
| DS-#015 | ≤2 size variants per viewport |
| DS-#016 | No 3 colors in 1 element (badge/avatar/icon) |
| DS-#017 | Action color hierarchy 3-tier |
| DS-#018 | Text on tinted bg = same family -900 |
| DS-#019 | Layout grid alignment — shared column system across sections on the same page |
| DS-#020 | No gradients in product UI |
| DS-#021 | r-pill for mobile top nav (search superseded by DS-#119) |
| DS-#022 | Tinted surface Quick Menu spec |
| DS-#023 | No shadow at rest · CTA card exception |
| DS-#024 | Mobile margin 16–20px · section gap 24–32px |
| DS-#025 | 80-15-5 color budget |
| DS-#026 | Bento Box layout (Dashboard only) |
| DS-#027 | Landing macro-whitespace 80–120px |
| DS-#028 | dark-green rename |
| DS-#029 | bg canvas / component-bg flexibility — e.g. QTY Adjuster container follows the surface beneath it, not the variant |
| DS-#030 | text-primary is context-aware: neutral-900 on white, neutral-50 on dark surface |
| DS-#031 | Border color must never be darker than neutral-200, except focus/semantic states |
| DS-#032 | Disabled tokens: bg/text/border |
| DS-#034 | Chip bg = vivid/mid-tone |
| DS-#035 | lime-300 ≤1% accent |
| DS-#037 | Yellow bg text rule |
| DS-#038 | Price color: neutral-900 / red-600 |
| DS-#039 | purple = special-cases-only accent, never general-purpose |
| DS-#040 | Premium color pairing: dark-green-900+brown-400, or brown-50+dark-green-800/900 |
| DS-#041 | bg hierarchy order: white → neutral-50 → any {family}-50 tint → dark (special cases only) |
| DS-#042 | No border on badges/chips |
| DS-#043 | Light Badge = default non-clickable |
| DS-#044 | Default = Light · Vivid = exception |
| DS-#045 | Vivid when high-importance or category no icon |
| DS-#046 | Icon position — left default · trailing exceptions |
| DS-#047 | Clickable chip: cursor+hover+focus signal |
| DS-#048 | Vivid does not imply clickable |
| DS-#049 | Availability = always neutral |
| DS-#050 | Promotion color system (badge/chip) |
| DS-#051 | lime-300 ≤1% · urgent + special comms |
| DS-#052 | text-on-brand = neutral-50 |
| DS-#054 | text-on-tint = dark-green-900 default |
| DS-#055 | Price typography spec |
| DS-#056 | H3 = marketing/landing · H4 = in-product panel/card title |
| DS-#059 | Primary button — no shadow |
| DS-#060 | Availability button — solid neutral-900 |
| DS-#061 | banana ≤2% · featured/spotlight |
| DS-#062 | banana is never Warning — Warning is always yellow-600 |
| DS-#063 | Lucide as fallback Priority 2 |
| DS-#065 | Lucide stroke 2-tier · absoluteStrokeWidth=true |
| DS-#066 | shadow-ambient 3 variants |
| DS-#067 | Tinted bg → green-family shadow only |
| DS-#068 | Border = family-100 @ 60% opacity · all card types |
| DS-#071 | Icon spec (fkt-icon.md) |
| DS-#072 | Toast spec created |
| DS-#073 | Toast v2 — 4 variants · emoji top-left |
| DS-#075 | Dropdown spec created (Select/Combobox/Multi-select) |
| DS-#076 | Table — 3 border variants · fixed header/frozen column · frozen-column shadow rule |
| DS-#080 | Modal structural-only spec |
| DS-#082 | No uppercase — sentence case always |
| DS-#083 | Portal icon strokeWidth=1 (≤40px) / 1.5 (>40px) override |
| DS-#086 | PageLoader dots animation · Skeleton pattern |
| DS-#087 | Mobile UX (keyboard/viewport) · Auth Page 100dvh · my:auto |
| DS-#088 | Auth Card standard |
| DS-#090 | Labels Bold 700 on every surface (label · button) — NavItem case superseded by DS-#118 |
| DS-#091 | H5/H6 added to close the H4↔Body1 gap |
| DS-#092 | Caption1/Caption2 restructured — Caption2 never for decision-grade content |
| DS-#093 | Binary weight only: 400 / 700 |
| DS-#094 | Text on colored surface rule |
| DS-#095 | Interactive text states (link) |
| DS-#096 | Text on semantic surface (alert box) |
| DS-#097 | Portal text color hierarchy |
| DS-#098 | r-sm/r-md = 4/8 reconciled |
| DS-#100 | No opacity for text hierarchy |
| DS-#105 | r-2xl = 24px for modal/bottom sheet |
| DS-#107 | Clarifies DS-#013 (typography hierarchy) |
| DS-#108 | focus-visible + single focus-ring token |
| DS-#109 | React Native App Guidelines (general) |
| DS-#110 | Android font: fontFamily only, no fontWeight |
| DS-#111 | Android shadow = elevation (gap documented) |
| DS-#112 | Cross-platform (RN/Expo) guidelines |
| DS-#113 | iOS-specific rules |
| DS-#114 | Mobile UX Principles |
| DS-#115 | Design-to-Dev Handoff format |
| DS-#116 | Input field: border only on focus (no box-shadow glow) |
| DS-#118 | Nav weight = Regular 400 all states · state via color/bg only |
| DS-#119 | Search input = r-md 8px (not pill) |
| DS-#123 | Range fill = dark-green-50 only (not green-fresh-50) |
| DS-#124 | Clickable card-shaped element = shadow-hover + translateY(-2px) |
| DS-#125 | labelAction contextual link · NumberInput Compact 26px |
| DS-#126 | ConfirmModal = S size · icon circle 44×44px family-50 |
| DS-#127 | Table: Active (click-to-expand row) vs Selected (checkbox for batch) · `col.*` column builders · 2-Layer expand pattern |
| DS-#128 | SectionHeader + PanelHeader + EmptyState spec |
