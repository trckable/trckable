// The Answers line of the Briefing: its own chunk, and only where the server asks the AI assistants and the page is not a shared link.
import { Suspense } from 'react'
import type { Site } from '../../lib/api'
import type { Range } from '../../lib/dates'
import { lazyLoad } from '../../lib/lazyLoad'
import { hasAnswers, isShared } from '../../lib/me'

const AnswersNote = lazyLoad(() => import('../../features/answers/AnswersNote'))

export function AnswersSlot({ site, range }: { site: Site; range: Range }) {
  if (!hasAnswers() || isShared()) return null
  return (
    <Suspense fallback={null}>
      <AnswersNote site={site} range={range} />
    </Suspense>
  )
}
