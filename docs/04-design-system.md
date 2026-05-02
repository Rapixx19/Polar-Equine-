# 04 · Design System

The visual language of La Fattoria. Apply consistently across PWA and admin dashboard.

## Tone

Quiet, professional, scientific. Inspired by Linear, Whoop, Stripe — not by consumer fitness apps. The product takes itself seriously because it's research data.

No gradients. No drop shadows beyond `shadow-sm`. No emoji except the four activity icons. No colorful chart palettes — stone with a single semantic accent per chart.

## Colors

| Use | Tailwind | Hex |
|---|---|---|
| Background | `bg-stone-50` | `#FAFAF9` |
| Surface | `bg-white` | `#FFFFFF` |
| Border | `border-stone-200` | `#E7E5E4` |
| Border emphasis | `border-stone-300` | `#D6D3D1` |
| Ink (body) | `text-stone-900` | `#1C1917` |
| Ink (secondary) | `text-stone-600` | `#57534E` |
| Ink (tertiary) | `text-stone-400` | `#A8A29E` |
| Primary action | `bg-stone-900 text-white` | — |
| Good | `text-emerald-600 bg-emerald-50` | — |
| Watch | `text-amber-600 bg-amber-50` | — |
| Alert | `text-red-600 bg-red-50` | — |
| Walk (chart) | `bg-stone-300` | — |
| Trot (chart) | `bg-blue-400` | — |
| Canter/gallop (chart) | `bg-amber-500` | — |
| Jump (chart) | `bg-red-500` | — |
| Rest (chart) | `bg-stone-200` | — |

## Typography

- Font: Inter via `next/font/google`
- Base: 14px mobile, 15px desktop
- Headings: font-weight 600, `tracking-tight`
- Numerics: `font-variant-numeric: tabular-nums` for tables and metrics
- Big numbers: `text-7xl font-light tracking-tight`
- Labels: `text-xs uppercase tracking-wider text-stone-500`

## Components (shadcn/ui)

Install only what's needed:
```
button, card, dialog, dropdown-menu, input, label, select,
sheet, tabs, sonner, toggle, alert
```

## Buttons

| Variant | Class |
|---|---|
| Primary | `bg-stone-900 hover:bg-stone-800 text-white px-4 py-2.5 rounded-md font-medium text-sm` |
| Secondary | `bg-white border border-stone-200 hover:border-stone-400 text-stone-900 px-4 py-2.5 rounded-md font-medium text-sm` |
| Ghost | `text-stone-600 hover:text-stone-900 px-3 py-2 text-sm` |
| Destructive | `bg-red-600 hover:bg-red-700 text-white px-4 py-2.5 rounded-md font-medium text-sm` |

PWA buttons: full-width on mobile, height ≥ 56px for tap targets.

## Logo (placeholder until supplied)

```jsx
<div className="flex items-center gap-3">
  <div className="w-8 h-8 bg-stone-900 rounded-sm flex items-center justify-center">
    <span className="text-white font-bold text-xs tracking-tight">LF</span>
  </div>
  <div>
    <div className="font-semibold tracking-tight">La Fattoria</div>
    <div className="text-xs text-stone-500 -mt-0.5">Equine Welfare Study</div>
  </div>
</div>
```

When real logo arrives: drop SVG into `/public/logo.svg`, swap component.

## Spacing rhythm

Multiples of 4px (Tailwind 1, 2, 3, 4, 6, 8). Section spacing `py-8`. Card padding `p-5` standard, `p-6` for primary cards.

## Charts (recharts)

```jsx
<CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" />
<XAxis stroke="#A8A29E" tickLine={false} axisLine={false}
       tick={{ fontSize: 11 }} />
```

One color per chart. Don't mix three palettes.

## Animation

Minimal. 150ms ease-out on hover/focus. 200ms fade for new content. No scroll triggers, no parallax.

## Empty states

```
[ icon ]
Title
Brief explanation of what this becomes when there's data.
[ optional CTA ]
```

Under 80 words. No illustrations.

## Loading

Skeleton shapes (`bg-stone-100 animate-pulse`) for page loads. "Loading..." text in `text-stone-500` for inline.

## Accessibility

- Contrast ≥ 4.5:1 for body text (stone-900 on stone-50 = 17.8:1)
- Focus rings: `focus:ring-2 focus:ring-stone-900 focus:ring-offset-2`
- Form labels with `htmlFor`
- Charts include `<title>` and accessible data tables
