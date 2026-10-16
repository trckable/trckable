// The revenue preview Live shows until payments are connected: a blurred sample under a short offer, as the
// walkthrough draws it. Its own file until the Briefing's lock card lands and the two can be merged.
import { useId } from 'react'
import { copy } from './copy'
import './lock.css'

const SAMPLE = {
  total: '$4,820',
  lines: [['Product Hunt', '$2,140', 90], ['Google', '$1,310', 60], ['Newsletter', '$870', 40]] as [string, string, number][],
}

export function LockMini({ onConnect, onHow }: { onConnect: () => void; onHow: () => void }) {
  const id = useId()
  return (
    <section className="lkc mini" data-lock="rev">
      <span className="lkc-tag">{copy.sample}</span>
      <div className="lkc-s" aria-hidden="true">
        <h4>{copy.lockTitle}</h4>
        <div className="bg">{SAMPLE.total}</div>
        {SAMPLE.lines.map(([name, amount, w]) => (
          <div className="ln" key={name}><i style={{ width: w }} />{name}<b>{amount}</b></div>
        ))}
      </div>
      <div className="lkc-o" role="region" aria-labelledby={id}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>
        <p className="lt1" id={id}>{copy.lockLine}</p>
        <p className="lt2">{copy.lockSub}</p>
        <button type="button" className="lkgo" onClick={onConnect}>{copy.connect}</button>
        <button type="button" className="lk3 how" onClick={onHow}>{copy.how}</button>
      </div>
    </section>
  )
}
