// The story of a surge, as a dialog: the big number and the jump, the last hour
// as a chart with the start marked and the peak labelled, the beats in time
// order, tiles for who sent them, the page, the countries and the devices, the
// honest sentence about what is and is not visible, and the actions. A full-height
// sheet on a phone. Everything in it was counted; nothing says why.
import { Bell, X, TrendingUp } from 'lucide-react'
import { Modal } from '../../components/Modal'
import { countryName, fmtInt, flag } from '../../lib/format'
import { RefMark } from '../cards/refIcons'
import { useHostIcon } from './useHostIcon'
import { Rolling } from '../moments/Rolling'
import { signals } from './copy'
import { beats, deviceShare, honestLine, surgeChip, type Story, type Surge } from './surge'
import { SurgeChart } from './SurgeChart'
import { useSurgeActions } from './useSurgeActions'
import './surge.css'

const t = signals.surge

export default function SurgeModal({ surge, tz, onClose, onSee }: { surge: Surge; tz: string; onClose: () => void; onSee: () => void }) {
  const { see, canAsk, notify } = useSurgeActions(surge, () => {
    onSee()
    onClose()
  })
  const st = surge.story
  const w = surge.why
  return (
    <Modal label={t.modalLabel} onClose={onClose} className="surge-modal" keepSize={false} focus="box">
      <button type="button" className="sgm-x" aria-label={t.close} onClick={onClose}>
        <X size={16} strokeWidth={2} aria-hidden="true" />
      </button>
      <header className="sgm-hero">
        <span className="sgm-badge" aria-hidden="true">
          <TrendingUp size={18} strokeWidth={2} />
        </span>
        <b className="sgm-count">
          <Rolling to={surge.online} fmt={fmtInt} />
        </b>
        <span className="sgm-meta">
          <span className="sg-chip">{surgeChip(surge)}</span>
          {w.before < surge.online && w.minutes > 0 && <span className="sgm-jump">{t.jump(w.before, surge.online, w.minutes)}</span>}
        </span>
      </header>
      <SurgeChart surge={surge} tz={tz} />
      <ol className="sgm-beats">
        {beats(surge, tz).map((b) => (
          <li key={b.key} className={'beat ' + b.key}>
            {b.text}
          </li>
        ))}
      </ol>
      {st && <Tiles surge={surge} story={st} />}
      <p className="sgm-honest muted">{honestLine(surge)}</p>
      {w.campaign && <p className="sgm-camp muted">{t.campaign(w.campaign)}</p>}
      <div className="sgm-actions">
        {canAsk && (
          <button type="button" className="btn ghost" onClick={notify}>
            <Bell size={14} strokeWidth={2} aria-hidden="true" /> {t.notify}
          </button>
        )}
        <button type="button" className="btn primary" onClick={see}>
          {t.seeData}
        </button>
      </div>
    </Modal>
  )
}

function Tiles({ surge, story }: { surge: Surge; story: Story }) {
  const devices = deviceShare(story)
  const total = Math.max(surge.online, 1)
  return (
    <div className="sgm-tiles">
      {!!story.sources?.length && (
        <section className="sgm-tile" aria-label={t.tileSources}>
          <h3>{t.tileSources}</h3>
          {story.sources.map((s) => (
            <Bar key={s.name} name={s.name} n={s.n} of={total} host={surge.why.source === s.name ? surge.why.source_value : undefined} usual={surge.why.source === s.name ? surge.why.source_usual : undefined} />
          ))}
        </section>
      )}
      {!!story.pages?.length && (
        <section className="sgm-tile" aria-label={t.tilePage}>
          <h3>{t.tilePage}</h3>
          {story.pages.map((p) => (
            <p key={p.name} className="sgm-row">
              <code>{p.name}</code>
              <b>{fmtInt(p.n)}</b>
            </p>
          ))}
        </section>
      )}
      {!!story.countries?.length && (
        <section className="sgm-tile" aria-label={t.tileCountries}>
          <h3>{t.tileCountries}</h3>
          {story.countries.map((c) => (
            <p key={c.country} className="sgm-row">
              <span>
                <span aria-hidden="true">{flag(c.country)}</span> {countryName(c.country)}
              </span>
              <b>{fmtInt(c.n)}</b>
            </p>
          ))}
        </section>
      )}
      {devices && (
        <section className="sgm-tile" aria-label={t.tileDevices}>
          <h3>{t.tileDevices}</h3>
          <div className="sgm-split" role="img" aria-label={`${t.phone} ${devices.phone}%, ${t.computer} ${devices.computer}%`}>
            <i style={{ width: `${devices.phone}%` }} />
          </div>
          <p className="sgm-row">
            <span>{t.phone}</span>
            <b>{devices.phone}%</b>
          </p>
          <p className="sgm-row">
            <span>{t.computer}</span>
            <b>{devices.computer}%</b>
          </p>
        </section>
      )}
    </div>
  )
}

/** One source: its icon and name, its people as a bar of everyone online, and what it usually sends when it is the main one. */
function Bar({ name, n, of, host, usual }: { name: string; n: number; of: number; host?: string; usual?: number }) {
  const icon = useHostIcon(host ?? null)
  return (
    <div className="sgm-bar">
      <p className="sgm-row">
        <span>
          {host && <RefMark host={host} icon={icon} />} {name}
          {usual !== undefined && <small className="faint"> · {t.usually(Math.round(usual))}</small>}
        </span>
        <b>{fmtInt(n)}</b>
      </p>
      <i style={{ width: `${Math.min(100, Math.round((n * 100) / of))}%` }} />
    </div>
  )
}
