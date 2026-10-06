# Glance (prototype): the Data header rules

Local prototype, behind a flag (`?glance=1` once, or `localStorage.trckableGlance = '1'`;
`?glance=0` turns it off). With the flag off nothing here is loaded and Data is unchanged.
Glance is the default format; Charts is the second. The choice is kept per viewer
(localStorage) and written to the address as `?fmt=glance` or `?fmt=charts`.

## One rule

One top bar, one control row, then the hero. No extra rows between them.

## Top bar (logo, site, Live | Data, search, avatar)

| Format | Search button | Peek |
| --- | --- | --- |
| Glance | "Find anything ⌘K" (icon only at 600px and below) | A first row in the palette: "Ask Peek: <query>" |
| Charts | Peek's own button, as today | as today |

Why: one search button, not two. Peek stays one keystroke away from inside the palette.
⌘K / Ctrl+K opens the Glance palette while Glance is up (it takes the key before Peek's
handler); in Charts it opens Peek as today. The palette only has data to search in Glance.

## Control row

| | Left | Right |
| --- | --- | --- |
| Charts, any width | Charts / Glance toggle | exactly as today (period capsule with compare and fold, Filter, share, more) |
| Glance, wide | Charts / Glance toggle (same height as the capsules) | period capsule, Filter, share / more |
| Glance, phone (600px and below) | Live / Data, then the toggle (44px targets) | the period pill (opens the existing sheet) and more |

The period lives in one place in both formats: the control row's period capsule (steps,
the "Last 30 days" picker and its menu, arrow keys). In Glance the capsule drops the compare
toggle and the fold: compare lives in each tile's detail panel (its Compare button). Charts keeps
both. The hero has no period pill.

In Glance the capsule is always open: a fold saved from Charts is ignored (the saved choice is not changed).

An active filter shows as its chip in the row, as today.

## Hero

Starts right under the control row: the people number, the verdict and the strip of days.

## Open

- Should Charts also get the palette (it would need the report's rows outside Glance)?
- Prototype copy is English only (`copy.ts`).
