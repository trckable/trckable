// Why visitors leave after one page, when it is clearly more than usual: a quiet line with the way into the guide.
import { rangeQS } from '../../lib/api'
import { queryOf } from '../../lib/dashQuery'
import { isShared } from '../../lib/me'
import { readView } from '../../lib/url'
import type { Range } from '../../lib/dates'
import type { Site } from '../../lib/api'
import { copy, useBounceGuide } from '../../features/bounce/b'
import { Act } from '../ui/ConnectPlaceholder'

export function BounceNote({ site, range }: { site: Site; range: Range }) {
  const { guide } = useBounceGuide(site.id, isShared() ? null : rangeQS(queryOf(readView(new URLSearchParams(location.search)), range)))
  if (guide?.direction !== 'high' || guide.usual === null) return null
  return <Act text={copy.cardHigh(Math.round(guide.rate * 10), Math.round(guide.usual * 10))} label={copy.seeWhy} onAct={() => window.dispatchEvent(new Event('trckable:bounce'))} />
}
