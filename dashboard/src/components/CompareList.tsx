// The comparison menu's list (CompareMenu.tsx): No comparison, period before,
// last year and custom dates, the one in force marked with a check. Its own chunk.
import { Check } from 'lucide-react'
import type { CompareMode } from '../lib/dates'
import { copy } from '../features/header/copy'
import type { PickerValue } from './DatePicker'
import { CMP_LABEL } from './dateRangeCopy'
import './ListPop.css'
import './CompareList.css'

const MODES: CompareMode[] = ['none', 'previous', 'year', 'custom']

export default function CompareList({ value, keyCap, onChoose }: { value: PickerValue; keyCap: string; onChoose: (m: CompareMode) => void }) {
  const on = value.compare !== 'none'
  return (
    <div className="pop lpop cmp-pop" role="menu" aria-label={copy.compareMenu}>
      {MODES.map((m) => (
        <button key={m} type="button" role="menuitemradio" aria-checked={value.compare === m} className={value.compare === m ? 'lrow on' : 'lrow'} onClick={() => onChoose(m)}>
          <span>{CMP_LABEL[m]}</span>
          <span className="end" aria-hidden="true">
            {value.compare === m && <Check size={14} strokeWidth={2.25} className="ok" />}
            {m === 'previous' && !on && <span className="k">{keyCap}</span>}
          </span>
        </button>
      ))}
    </div>
  )
}
