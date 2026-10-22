// The header of a page that is not Live or the Briefing (All sites, the incident record, the install screen, mentions and
// links): the same header, in its own frame, with the site the page is about (or none).
import type { Site } from '../lib/api'
import { PageHeader, type PageHeaderProps } from './PageHeader'
import '../mock/mock.css'
import '../kit/layout.css'
import '../mock/theme.css'

export function PageBar(p: Omit<PageHeaderProps, 'tab' | 'period'> & { site: Site | null }) {
  return (
    <div className="mk mk-body mk-bar">
      <PageHeader {...p} />
    </div>
  )
}
