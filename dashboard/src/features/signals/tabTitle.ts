// The browser tab says who is on the site: "● 8 · trckable". Nothing is added
// at 0, or when the person turned it off.
export const DOT = '●'

export function tabTitle(base: string, online: number | null | undefined, on: boolean): string {
  if (!on || !online || online < 1) return base
  return `${DOT} ${Math.floor(online)} · ${base}`
}

/** The title without a count in front of it. */
export const baseTitle = (title: string): string => title.replace(/^● \d+ · /, '')

/** The site's icon with a small live dot at the bottom right: the icon's own SVG, one circle added. */
export function dotted(svg: string): string {
  return svg.replace('</svg>', '<circle cx="50" cy="50" r="12" fill="#22c55e" stroke="#0b0f14" stroke-width="4"/></svg>')
}
