// Who is talking about a site: the page behind /{domain}/mentions. A hero for
// what is happening now, the feed with its filters, one mention's detail in a
// panel, and an empty state that teaches. All of it is this chunk.
import { ArrowLeft } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { AllBar } from '../header/AllBar'
import { Loading } from '../../components/loading/Loading'
import type { Site } from '../../lib/api'
import { navigate, useLocation } from '../../lib/url'
import { Detail } from './Detail'
import { Empty } from './Empty'
import { Feed } from './Feed'
import { Hero } from './Hero'
import type { Period, Words } from './api'
import { copy } from './copy'
import { page } from './pageCopy'
import { heroOf, openedOf, type Filter } from './pageModel'
import { mentionsPath } from './route'
import { useCurves } from './usePage'
import { useMentions } from './useMentions'
import './page.css'

export default function MentionsPage({ site, header }: { site: Site; header: ReactNode }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [period, setPeriod] = useState<Period>('30d')
  const [words, setWords] = useState<Words | null>(null)
  const { params } = useLocation()
  const got = useMentions(site.id, period, 60_000)
  const ready = got.state === 'ready'
  const curves = useCurves(site.id, period, ready)
  const data = got.state === 'ready' ? got.data : null
  const list = data?.mentions ?? []
  const opened = openedOf(list, `?m=${params.get('m') ?? ''}`)
  const w = words ?? data?.words
  const searched = w ? [...w.default, ...w.added] : []
  const hero = data ? heroOf(list, data.driving) : null
  const open = (id: number | null) => navigate(mentionsPath(site.domain) + (id ? `?m=${id}` : ''), { replace: true })
  return (
    <>
      <AllBar header={header} />
      <main className="mp-page">
        <div className="mp-head">
          <div>
            <button type="button" className="linkish mp-back" onClick={() => navigate('/' + encodeURIComponent(site.domain))}>
              <ArrowLeft size={14} aria-hidden="true" />
              {page.back}
            </button>
            <h1>{copy.title}</h1>
            <p className="muted">{site.name || site.domain}</p>
          </div>
        </div>
        {got.state === 'loading' && <Loading height={200} />}
        {got.state === 'failed' && <p className="muted" role="alert">{page.failed}</p>}
        {data && w && list.length === 0 && period === '30d' && <Empty site={site.id} words={w} sources={data.sources} onWords={setWords} />}
        {data && (list.length > 0 || period !== '30d') && (
          <>
            {hero && <Hero hero={hero} curves={curves} onOpen={open} />}
            <Feed list={list} words={searched} curves={curves} filter={filter} period={period} onFilter={setFilter} onPeriod={setPeriod} onOpen={(m) => open(m.id)} />
          </>
        )}
      </main>
      {opened && <Detail site={site.id} m={opened} words={searched} onClose={() => open(null)} />}
    </>
  )
}
