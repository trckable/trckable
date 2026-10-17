import type { SiteKind } from '../../lib/apiMore'
import { KINDS } from './kind'
import { wizard as t } from './copy'

function sayKind(reading: boolean, guess: SiteKind | null, value: SiteKind | null): string {
  if (reading) return t.kindReading
  if (guess && value === guess) return t.kindLooks(t.kinds[guess])
  return value ? t.kindChosen : t.kindNone
}

/** After the domain: what kind of site this is, read from the homepage and changeable with one tap. */
export function KindStep({ reading, guess, value, onPick }: { reading: boolean; guess: SiteKind | null; value: SiteKind | null; onPick: (k: SiteKind) => void }) {
  const line = sayKind(reading, guess, value)
  return (
    <div className="wiz-kind">
      <p className="muted" role="status">
        {line}
      </p>
      <div className="wiz-kinds" role="group" aria-label={t.steps[1]}>
        {KINDS.map((k) => (
          <button key={k} type="button" className="btn" aria-pressed={value === k} onClick={() => onPick(k)}>
            {t.kinds[k]}
          </button>
        ))}
      </div>
    </div>
  )
}
