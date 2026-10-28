// The foot of every card: its one action on the left, one plain link deeper on the right, and the "⋯" with what else
// there is. The incident card keeps its three quiet buttons (its own action opens the incident, so it has no link).
import { Eye, ArrowUpRight, CircleHelp } from 'lucide-react'
import { isShared } from '../../lib/me'
import { copy } from '../briefing/copy'
import { copy as cardCopy } from '../briefing/cards.copy'
import { useV2Extras } from '../slots'
import { CardMenu, type CardMenuItem } from './CardMenu'
import type { Act, Story } from '../briefing/cards'
import type { CardCtx } from './StoryCard'

const doneLabel: Record<Act['k'], string> = { set: copy.alertSet, copy: copy.copiedDone, goal: copy.goalDone, x: '', link: '' }

export function Foot({ s, c, link }: { s: Story; c: CardCtx; link: string | null }) {
  const { askPeekNow } = useV2Extras()
  const w = c.watched(s)
  const dn = c.done(s)
  const inc = s.key === 'uptime'
  const idle = inc ? cardCopy.watchSite : copy.watch
  const watchText = w ? copy.watching : idle
  const watch = !isShared() && (
    <button type="button" className={`${inc ? 'qb' : 'gh'}${w ? ' on' : ''}`} data-watch="1" title={copy.watchTitle} onClick={() => c.onWatch(s)}>
      {inc && <Eye size={14} strokeWidth={1.9} aria-hidden="true" />}
      {watchText}
    </button>
  )
  const extra = s.extra && !isShared() ? [{ key: 'extra', label: s.extra.t, onClick: () => c.onExtra(s), hook: 'data-extra' }] : []
  const watchItem: CardMenuItem[] = isShared() ? [] : [{ key: 'watch', label: w ? copy.watching : copy.watch, onClick: () => c.onWatch(s), hook: 'data-watch' }]
  const act = s.act && !isShared() && (
    <button type="button" className={`xb cact${inc ? ' p' : ''}${dn ? ' done' : ''}`} data-ca="1" onClick={() => c.onAct(s)}>
      {inc && !dn && <ArrowUpRight size={14} strokeWidth={1.9} aria-hidden="true" />}
      {dn ? doneLabel[s.act.k] || copy.doneMark : s.act.t}
    </button>
  )
  // Where there is Peek, "Why?" asks it (the question already sent); without Peek the card says how it knows.
  const peek = s.ask && askPeekNow ? s.ask : null
  const why = { label: peek || s.cause ? copy.whyQ : copy.how, onClick: () => (peek && askPeekNow ? askPeekNow(peek) : c.onHow(s)), hook: peek ? 'data-ask-peek' : 'data-hw' }
  if (inc) {
    return (
      <div className="ic-f">
        {act}
        {watch}
        <button type="button" className="qb" {...{ [why.hook]: '1' }} {...(peek ? {} : { 'aria-expanded': c.how(s) })} onClick={why.onClick}>
          <CircleHelp size={14} strokeWidth={1.9} aria-hidden="true" />
          {why.label}
        </button>
      </div>
    )
  }
  const items: CardMenuItem[] = [...watchItem, ...extra, { key: 'why', label: why.label, onClick: why.onClick, hook: why.hook }]
  return (
    <div className="ic-f">
      {act}
      <span className="ic-fr">
        {link && (
          <button type="button" className="ic-lk" data-deeper="1" onClick={() => c.onDeeper(s)}>
            {link}
            <span aria-hidden="true"> →</span>
          </button>
        )}
        <CardMenu id={s.key} items={items} />
      </span>
    </div>
  )
}
