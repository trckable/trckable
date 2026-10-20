// Channels on the team's overview: the header row (Views by platform, Accounts), one card for each connected platform, and a
// way to connect the others. Without any account it asks to connect YouTube, Instagram and Threads.
import { useEffect, useState } from 'react'
import { Loading } from '../../components/loading/Loading'
import { toast } from '../../components/Toast'
import { Segmented } from '../../kit'
import { fmtCompact, fmtInt } from '../../lib/format'
import { can } from '../../lib/permissions'
import { PERIODS, type Days } from './api'
import { ChannelCardView, Mark } from './ChannelCard'
import { Connect } from './Connect'
import { copy } from './copy'
import { cardsOf, flashOf, header, type CardView } from './model'
import { useChannels } from './useChannels'
import './channels.css'

/** A connect that just came back says how it went once, and the address forgets it. */
function useFlash() {
  useEffect(() => {
    const f = flashOf(location.search)
    if (!f) return
    toast(f.text, f.kind)
    history.replaceState(null, '', location.pathname + (f.clean ? '?' + f.clean : '') + location.hash)
  }, [])
}

export function Strip({ cards }: { cards: CardView[] }) {
  const h = header(cards)
  return (
    <div className="ch-strip">
      <div data-k="channel-views">
        <span className="tm-k">{copy.views}</span>
        <span className="ch-by">
          {h.views.length === 0 && <b className="num tm-big">—</b>}
          {h.views.map((v) => (
            <span key={v.platform} className="ch-one">
              <b className="num tm-big">{fmtCompact(v.views)}</b>
              <small>{v.name}</small>
            </span>
          ))}
        </span>
      </div>
      <div data-k="channel-accounts">
        <span className="tm-k">{copy.accounts}</span>
        <b className="num tm-big">{fmtInt(h.accounts)}</b>
      </div>
    </div>
  )
}

export function Empty({ cards }: { cards: CardView[] }) {
  const mayConnect = can('channels.connect')
  return (
    <div className="ch-empty">
      <h3>{copy.emptyTitle}</h3>
      <p className="muted">{mayConnect ? copy.emptySub : copy.viewOnly}</p>
      <div className="ch-connects">
        {cards.map((c) => (
          <Connect key={c.platform} platform={c.platform} ready={c.ready} />
        ))}
      </div>
    </div>
  )
}

/** A platform with no account yet, beside the connected ones. */
function Add({ card }: { card: CardView }) {
  if (!can('channels.connect')) return null
  return (
    <div className="ch-add">
      <Mark platform={card.platform} />
      <Connect platform={card.platform} ready={card.ready} />
    </div>
  )
}

export function ChannelsSection() {
  const [days, setDays] = useState<Days>(30)
  const { data, err, reload } = useChannels(days)
  useFlash()
  const cards = data ? cardsOf(data) : null
  const connected = cards?.filter((c) => c.accounts.length > 0) ?? []
  return (
    <section className="ch-sec" aria-labelledby="ch-title">
      <div className="ch-head">
        <div>
          <h2 id="ch-title">{copy.title}</h2>
          <p className="muted">{copy.sub}</p>
        </div>
        {connected.length > 0 && (
          <Segmented label={copy.periodLabel} value={String(days) as `${Days}`} onChange={(v) => setDays(Number(v) as Days)} options={PERIODS.map((n) => ({ value: String(n) as `${Days}`, label: copy.period[n] }))} />
        )}
      </div>
      {err && !cards && <p className="empty">{err}</p>}
      {!cards && !err && <Loading height={140} />}
      {cards && connected.length === 0 && <Empty cards={cards} />}
      {cards && connected.length > 0 && (
        <>
          <Strip cards={cards} />
          <div className="ch-grid">
            {cards.map((c) => (c.accounts.length > 0 ? <ChannelCardView key={c.platform} card={c} reload={reload} /> : <Add key={c.platform} card={c} />))}
          </div>
        </>
      )}
    </section>
  )
}
