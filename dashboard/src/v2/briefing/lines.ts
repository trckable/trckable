// Two short lines of the Briefing's hero: the sentence under the headline and the line over the chart.
import { copy } from './copy'

export const heroSub = (meet: string | null, low: boolean, fallback: string, own?: boolean): string => {
  if (meet && !own) return meet
  return low ? copy.fewVisitors : fallback
}

export const chartLine = (learning: boolean, low: boolean, hd: number, note: () => string): string => {
  if (learning) return copy.learningNormal(hd + 1)
  return low ? copy.quietSite : note()
}
