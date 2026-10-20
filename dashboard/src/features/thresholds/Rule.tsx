// The target alert's line in Settings → Alerts: "Tell me at [10] [sales] [in a day]". It saves when a
// choice is made or the number is finished, never on a keystroke.
import { useState } from 'react'
import type { Alert } from '../../lib/api'
import { copy } from './copy'
import { METRICS, PERIODS, reachable, ruleOf, type Metric, type Period, type Rule as RuleValue } from './model'
import './Rule.css'

export function ThresholdRule({ alert, onSave }: { alert?: Alert; onSave: (rule: RuleValue) => void }) {
  const rule = ruleOf(alert)
  const [text, setText] = useState(String(rule.threshold))
  const [seen, setSeen] = useState(rule.threshold)
  if (seen !== rule.threshold) {
    setSeen(rule.threshold)
    setText(String(rule.threshold))
  }
  const finish = () => {
    const n = Number(text)
    if (n !== rule.threshold && reachable(rule.metric, n)) onSave({ ...rule, threshold: n })
    else setText(String(rule.threshold))
  }
  const metric = (m: Metric) => onSave({ ...rule, metric: m, threshold: reachable(m, rule.threshold) ? rule.threshold : Math.ceil(rule.threshold) })
  return (
    <span className="th-rule">
      {copy.lead}
      <input
        className="input num th-num"
        value={text}
        inputMode="decimal"
        aria-label={copy.numberLabel}
        onChange={(e) => setText(e.target.value)}
        onBlur={finish}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      <select className="input th-pick" aria-label={copy.metricLabel} value={rule.metric} onChange={(e) => metric(e.target.value as Metric)}>
        {METRICS.map((m) => (
          <option key={m} value={m}>
            {copy.metric[m]}
          </option>
        ))}
      </select>
      <select className="input th-pick" aria-label={copy.periodLabel} value={rule.period} onChange={(e) => onSave({ ...rule, period: e.target.value as Period })}>
        {PERIODS.map((p) => (
          <option key={p} value={p}>
            {copy.period[p]}
          </option>
        ))}
      </select>
    </span>
  )
}
