// What the ⋯ menu does: the table as a file, a link to this view, and the page's details.
import { toast } from '../../components/toastBus'
import type { Site } from '../../lib/api'
import type { Range } from '../../lib/dates'
import { queryOf } from '../../lib/dashQuery'
import { downloadCsv } from '../../lib/download'
import { writeView, type ViewState } from '../../lib/url'
import type { Filter } from '../../lib/api'
import { copy } from './copy'
import { pageDetails } from './pageStore'
import type { Section, Tab } from './types'

export function useActions(o: { site: Site; view: ViewState; range: Range; filters: Filter[]; tab: Tab; section: Section }) {
  const view: ViewState = { ...o.view, filters: o.filters }
  return {
    csv: () => downloadCsv(o.site.id, queryOf(view, o.range)),
    copyLink: () => {
      const url = `${location.origin}${location.pathname}${writeView({ ...view, briefing: true, live: false })}`
      void navigator.clipboard.writeText(url).then(
        () => toast(copy.linkCopied, 'success'),
        () => toast(url, 'success'),
      )
    },
    pageDetails: () => {
      const page = o.filters.find((f) => f.dim === 'page')
      if (page) pageDetails.set(page.value)
    },
  }
}
