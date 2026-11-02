// The line over the chart.
import { copy } from './copy'

export const chartLine = (learning: boolean, low: boolean, hd: number, note: () => string): string => {
  if (learning) return copy.learningNormal(hd + 1)
  return low ? copy.quietSite : note()
}
