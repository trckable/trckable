// Who is talking about a site: the page behind /{domain}/mentions. A hero for
// what is happening now, the feed with its filters, one mention's detail in a
// panel, and an empty state that teaches. All of it is this chunk.
import { useState, type ReactNode } from 'react'
import { Loading } from '../../components/loading/Loading'
import type { Site } from '../../lib/api'
import { navigate, useLocation } from '../../lib/url'
import { Detail } from './Detail'
import { Empty } from './Empty'
import { Feed } from './Feed'
import { Hero } from './Hero'
import { mentionsApi, type Hidden, type Mention, type Period, type Words } from './api'
import { HiddenList } from './HiddenList'
import { HideNote } from './HideNote'
import { can } from '../../lib/permissions'
import { fail } from '../../lib/api'
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
  const [tick, setTick] = useState(0)
  const [lastHidden, setLastHidden] = useState<number | null>(null)
  const [note, setNote] = useState<Hidden | null>(null)
  const { params } = useLocation()
  const got = useMentions(site.id, period, 60_000, true, tick)
  const ready = got.state === 'ready'
  const curves = useCurves(site.id, period, ready)
  const data = got.state === 'ready' ? got.data : null
  const list = data?.mentions ?? []
  const opened = openedOf(list, `?m=${params.get('m') ?? ''}`)
  const w = words ?? data?.words
  const searched = w ? [...w.default, ...w.added] : []
  const hero = data ? heroOf(list, data.driving) : null
  const rules = w?.rules
  const reload = () => setTick((t) => t + 1)
  const hide = (m: Mention) =>
    mentionsApi
      .notAboutUs(site.id, m.id)
      .then((n) => {
        setNote({ ...n, hidden: true, suggest_block: n.suggest_block, suggest_exclude: n.suggest_exclude })
        setLastHidden(m.id)
        reload()
      })
      .catch((e: unknown) => fail(e))
  const keepOut = (k: 'excluded' | 'blocked', v: string) => {
    if (!rules) return
    void mentionsApi
      .setRules(site.id, { ...rules, [k]: [...rules[k], v] })
      .then((r) => w && setWords({ ...w, rules: r }))
      .catch((e: unknown) => fail(e))
    setNote(null)
  }
  const undo = () => {
    if (lastHidden === null) return
    void mentionsApi.restore(site.id, lastHidden).then(reload).catch((e: unknown) => fail(e))
    setNote(null)
  }
  const open = (id: number | null) => navigate(mentionsPath(site.domain) + (id ? `?m=${id}` : ''), { replace: true })
  return (
    <>
      {header}
      <main className="mp-page">
        <h1 className="mp-title">{copy.title}</h1>
        {got.state === 'loading' && <Loading height={200} />}
        {got.state === 'failed' && <p className="muted" role="alert">{page.failed}</p>}
        {data && w && list.length === 0 && period === '30d' && <Empty site={site.id} words={w} sources={data.sources} onWords={setWords} />}
        {data && (list.length > 0 || period !== '30d') && (
          <>
            {note && <HideNote note={note} onExclude={(x) => keepOut('excluded', x)} onBlock={(x) => keepOut('blocked', x)} onUndo={undo} onDone={() => setNote(null)} />}
            {hero && <Hero hero={hero} curves={curves} onOpen={open} />}
            <Feed list={list} curves={curves} filter={filter} period={period} onFilter={setFilter} onPeriod={setPeriod} onOpen={(m) => open(m.id)} onHide={!can('mention.manage') ? undefined : hide} />
          </>
        )}
        {data && <HiddenList site={site.id} tick={tick} onRestored={reload} />}
      </main>
      {opened && <Detail site={site.id} m={opened} words={searched} onClose={() => open(null)} />}
    </>
  )
}
