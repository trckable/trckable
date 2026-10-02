// A new site's dashboard, before its first visit: one calm, centred card and
// nothing behind it. The four common tabs, the code with Copy, "Check my
// site" and a prompt for an AI editor. The first visit swaps it for the real
// dashboard (the live stream brings it), so this never needs a refresh.
import { Check } from 'lucide-react'
import { useState } from 'react'
import { Ghost } from '../../components/Logo'
import type { Site, Visit } from '../../lib/api'
import type { Ctx } from '../../lib/install'
import { CheckPanel } from './CheckPanel'
import { FirstCards } from './FirstCards'
import { aiPrompt, copy, waitCard as t } from './copy'
import { MethodPanel } from './MethodPanel'
import { MethodTabs } from './MethodTabs'
import { methodOf } from './snippet'
import { useInstallCheck } from './useInstallCheck'

function Sub({ id, where, domain }: { id: string; where: string; domain: string }) {
  if (id !== 'script') return <p className="muted wait-sub">{t.subOther(where)}</p>
  return (
    <p className="muted wait-sub">
      {t.subScript[0]} <code>{t.subScript[1]}</code> {t.subScript[2](domain)}
    </p>
  )
}

/** setup: inside the first run, which shows these actions on its own next screen. */
export function WaitingCard({ site, visits, ctx, pick, onPick, setup }: { site: Site; visits: Visit[]; ctx: Ctx; pick: string; onPick: (id: string) => void; setup?: boolean }) {
  const [started, setStarted] = useState(false)
  const [copied, setCopied] = useState(false)
  const first = visits[0]
  const check = useInstallCheck(site.id, !!first)
  const method = methodOf(pick)
  const prompt = () =>
    navigator.clipboard?.writeText(aiPrompt(ctx, method)).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    })
  return (
    <section className="wait-card rise" aria-label={copy.label}>
      <div className={first ? 'wait-mark live' : 'wait-mark'} aria-hidden="true">
        <span className="ring" />
        <span className="ring b" />
        <Ghost size={46} peek={!first} />
      </div>
      <div className="wait-text">
        <h2>{first ? copy.titleLive : t.title}</h2>
        {first ? <p className="muted wait-sub">{copy.liveFrom(first.path ?? '/', first.country)}</p> : <Sub id={method.id} where={method.where} domain={site.domain} />}
      </div>
      <MethodTabs value={method.id} onChange={onPick} />
      <MethodPanel method={method} ctx={ctx} />
      <div className="wait-actions">
        <button
          type="button"
          className="btn wait-btn"
          onClick={() => {
            setStarted(true)
            check.start()
          }}
        >
          {t.check}
        </button>
        <button type="button" className="btn wait-btn" onClick={prompt}>
          {copied && <Check size={15} strokeWidth={2} aria-hidden="true" />}
          <span aria-live="polite">{copied ? t.promptCopied : t.prompt}</span>
        </button>
      </div>
      {started && <CheckPanel state={check.state} domain={site.domain} first={first} onAgain={check.start} />}
      {!setup && <FirstCards site={site} />}
      <p className="faint wait-foot">{t.foot}</p>
    </section>
  )
}
