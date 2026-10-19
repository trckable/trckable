// The one place the dashboard's widths are decided. A step starts at its width and runs to the next one:
//   xs  under 600   a phone
//   sm  600 to 839  a small tablet, a folding phone's outer or portrait screen
//   md  840 to 1039 a tablet, a folding phone opened
//   lg  1040 to 1439 a laptop
//   xl  1440 and up
// CSS names a step in a media or container query with its token, `@media (--sm-up)`, and a PostCSS step in the build
// (breakpointsPlugin.ts) writes the numbers from here. A script asks `matchMedia(QUERY['sm-up'])`, or `stepOf(width)`.
// breakpointsGuard.test.ts fails on a width written by hand in the v2 pages' CSS.
export const BP = { xs: 0, sm: 600, md: 840, lg: 1040, xl: 1440 } as const

export type Step = keyof typeof BP
export const STEPS = Object.keys(BP) as Step[]

/** A small phone's width (a 360 px screen is under it, a 390 px one is not): inside `xs`, for the few rows that do not fit it. */
export const NARROW = 375

// A query's upper end sits a hair under the next step's start, so a fractional width (a zoomed page) belongs to exactly one step.
const under = (px: number) => `(max-width: ${px - 0.02}px)`
const from = (px: number) => `(min-width: ${px}px)`

/** The query behind each token: `xs`, `sm`, `md`, `lg`, `xl` (that step only), `sm-up` ... (that step and wider), `xs-down` ... (that step and narrower). */
export const QUERY = {
  xs: under(BP.sm),
  sm: `${from(BP.sm)} and ${under(BP.md)}`,
  md: `${from(BP.md)} and ${under(BP.lg)}`,
  lg: `${from(BP.lg)} and ${under(BP.xl)}`,
  xl: from(BP.xl),
  narrow: under(NARROW),
  'sm-up': from(BP.sm),
  'md-up': from(BP.md),
  'lg-up': from(BP.lg),
  'xl-up': from(BP.xl),
  'xs-down': under(BP.sm),
  'sm-down': under(BP.md),
  'md-down': under(BP.lg),
  'lg-down': under(BP.xl),
} as const

export type Token = keyof typeof QUERY

/** The step a width in CSS pixels falls in. */
export function stepOf(width: number): Step {
  return [...STEPS].reverse().find((s) => width >= BP[s]) ?? 'xs'
}

/** The hero chart's height: a share of the width, kept between a floor and a ceiling, per step (`--chart-h`). */
export const CHART_H: Record<Step, { min: number; vw: number; max: number }> = {
  xs: { min: 168, vw: 40, max: 210 },
  sm: { min: 220, vw: 32, max: 280 },
  md: { min: 240, vw: 28, max: 300 },
  lg: { min: 270, vw: 21, max: 270 },
  xl: { min: 270, vw: 19, max: 270 },
}

/** What a card in a row needs of its own: the narrowest it is drawn (`--fit-min`). Cards fill the row at and above it. */
export const FIT_MIN: Record<Step, number> = { xs: 150, sm: 190, md: 200, lg: 220, xl: 220 }
