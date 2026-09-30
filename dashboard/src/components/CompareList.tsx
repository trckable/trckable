// The comparison menu's list (CompareMenu.tsx): period before, last year,
// custom dates, and No comparison once one is set. Its own chunk.
import { Check } from 'lucide-react'
import type { CompareMode } from '../lib/dates'
import { copy } from '../features/header/copy'
import type { PickerValue } from './DatePicker'
import { CMP_LABEL } from './dateRangeCopy'
import './ListPop.css'
import './CompareList.css'

const MODES: CompareMode[] = ['previous', 'year', 'custom']

export default function CompareList({ value, keyCap, onChoose }: { value: PickerValue; keyCap: string; onChoose: (m: CompareMode) => void }) {
  const on = value.compare !== 'none'
  return (
    <div className="pop lpop cmp-pop" role="menu" aria-label={copy.compareMenu}>
      {MODES.map((m) => (
        <button key={m} type="button" role="menuitemradio" aria-checked={value.compare === m} className={value.compare === m ? 'lrow on' : 'lrow'} onClick={() => onChoose(m)}>
          <span className="cmp-sw" aria-hidden="true" />
          <span>{CMP_LABEL[m]}</span>
          <span className="end" aria-hidden="true">
            {value.compare === m && <Check size={14} strokeWidth={2.25} className="ok" />}
            {m === 'previous' && !on && <span className="k">{keyCap}</span>}
          </span>
        </button>
      ))}
      {on && (
        <>
          <div className="lline" />
          <button type="button" role="menuitem" className="lrow dim" onClick={() => onChoose('none')}>
            {CMP_LABEL.none}
          </button>
        </>
      )}
    </div>
  )
}
