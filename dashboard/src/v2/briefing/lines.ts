// The line over the chart.
import { isShared } from '../../lib/me'
import { copy } from './copy'

export const chartLine = (learning: boolean, low: boolean, hd: number, note: () => string): string => {
  // A stranger's link has no usual of its own to learn: the note is for the site's own people.
  if (learning) return isShared() ? '' : copy.learningNormal(hd + 1)
  return low ? copy.quietSite : note()
}
