// Which way Live's half hour is drawn, kept for next time in this browser.
export type ChartMode = 'bars' | 'line'

export const CHART_KEY = 'trckable.live.chart'

export function readChartMode(): ChartMode {
  try {
    return localStorage.getItem(CHART_KEY) === 'bars' ? 'bars' : 'line'
  } catch {
    return 'line'
  }
}

export function keepChartMode(mode: ChartMode) {
  try {
    localStorage.setItem(CHART_KEY, mode)
  } catch {
    /* a blocked store only forgets */
  }
}
