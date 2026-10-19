// One platform's card: its views over the period, the change, the trend, and "Monitoring N accounts".
import { AtSign, MoreHorizontal, Play, Camera } from 'lucide-react'
import type { ReactNode } from 'react'
import { confirm } from '../../components/Confirm'
import { Popover } from '../../kit'
import { delta, fmtInt } from '../../lib/format'
import { can } from '../../lib/permissions'
import { dayWords } from '../../v2/dayWords'
import { Spark } from '../../views/AllSitesSpark'
import { channelsApi, type ChannelAccount, type Platform } from './api'
import { Connect } from './Connect'
import { copy } from './copy'
import type { CardView } from './model'

const MARK: Record<Platform, ReactNode> = {
  youtube: <Play size={16} aria-hidden="true" />,
  instagram: <Camera size={16} aria-hidden="true" />,
  threads: <AtSign size={16} aria-hidden="true" />,
}

export const Mark = ({ platform }: { platform: Platform }) => <span className="ch-mark" data-p={platform}>{MARK[platform]}</span>

/** Disconnecting asks first: it deletes what was stored for the account. */
function disconnect(a: ChannelAccount, done: () => void) {
  void confirm({
    title: copy.confirmTitle(a.handle),
    body: copy.confirmBody,
    confirmLabel: copy.confirmLabel,
    danger: true,
    run: () => channelsApi.disconnect(a.id),
    done: copy.disconnected,
  }).then((ok) => ok && done())
}

function Menu({ card, done }: { card: CardView; done: () => void }) {
  if (!can('channels.connect')) return null
  return (
    <Popover
      label={copy.more(card.name)}
      className="menu tm-menu"
      trigger={(p) => (
        <button type="button" className="tm-more" aria-label={copy.more(card.name)} {...p}>
          <MoreHorizontal size={18} aria-hidden="true" />
        </button>
      )}
    >
      {(close) => (
        <div role="menu">
          {card.accounts.map((a) => (
            <button key={a.id} type="button" role="menuitem" className="tm-item" onClick={() => { close(); disconnect(a, done) }}>
              {copy.disconnect(a.handle)}
            </button>
          ))}
        </div>
      )}
    </Popover>
  )
}

function Problem({ card }: { card: CardView }) {
  if (!card.problem) return null
  const retry = card.problem === 'denied' || card.problem === 'expired'
  return (
    <p className="ch-problem" role="status">
      {copy.problem[card.problem]}
      {retry && <Connect platform={card.platform} ready={card.ready} className="ch-link" />}
    </p>
  )
}

export function ChannelCardView({ card, reload }: { card: CardView; reload: () => void }) {
  const d = delta(card.views ?? 0, card.previous)
  return (
    <article className="ch-card" data-p={card.platform}>
      <header>
        <Mark platform={card.platform} />
        <h3>{card.name}</h3>
        <Menu card={card} done={reload} />
      </header>
      {card.state === 'waiting' ? (
        <p className="ch-wait muted">{copy.waiting}</p>
      ) : (
        <>
          <div className="ch-num">
            <b className="num">{fmtInt(card.views ?? 0)}</b>
            <span className="muted">{copy.views.toLowerCase()}</span>
            {d && <span className={'ch-chip ' + (d.tone === 'down' ? 'low' : d.tone)} title={copy.versus}>{d.text}</span>}
          </div>
          <div className="ch-trend" aria-label={copy.trend(card.name)}>
            <Spark values={card.values} h={40} />
          </div>
          {card.from && <p className="ch-note muted">{copy.since(dayWords(card.from))}</p>}
        </>
      )}
      <p className="ch-foot muted">
        {copy.monitoring(card.accounts.length)}
        <span className="ch-handles">{card.accounts.map((a) => a.handle).join(' · ')}</span>
      </p>
      <Problem card={card} />
    </article>
  )
}
