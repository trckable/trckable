import { exportURL, type ReportQuery } from './api'
import { toast } from '../components/Toast'

/** A download, not a fetch: the browser writes the file, names it from the
 *  header, and nothing has to be held in memory here. */
export function downloadCsv(site: string, query: ReportQuery) {
  const a = document.createElement('a')
  a.href = exportURL(site, query)
  a.download = ''
  a.click()
  toast('Building your file…')
}
