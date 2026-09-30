// The Filter list's rows (FilterPop.tsx): the dimensions, the values of one
// (or of every dimension, when searching), and the ones with nothing to pick.
import { Check, ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { ALL_DIMS, FILTER_GROUPS } from './filterGroups'
import { filterCopy as t } from './filterCopy'

export interface Value {
  dim: string
  value: string
  label: string
  visitors: number
}

const dimOf = (dim: string) => ALL_DIMS.find((d) => d.dim === dim)

/** Every dimension that has values, in its groups (a little air between them). */
export function DimRows({ count, picked, onOpen }: { count: (dim: string) => number; picked: (dim: string) => boolean; onOpen: (dim: string) => void }) {
  return (
    <>
      {FILTER_GROUPS.map((g) => {
        const live = g.dims.filter((d) => count(d.dim) > 0)
        if (!live.length) return null
        return (
          <div key={g.name} className="lgrp" role="presentation">
            {live.map((d) => (
              <button key={d.dim} type="button" role="menuitem" className="lrow" title={g.name} onClick={() => onOpen(d.dim)}>
                <d.icon size={15} strokeWidth={1.75} aria-hidden="true" />
                <span>{d.label}</span>
                <span className="end">
                  {picked(d.dim) && <span className="dotf" role="img" aria-label={t.filtered} />}
                  <span className="num">{count(d.dim)}</span>
                </span>
              </button>
            ))}
          </div>
        )
      })}
    </>
  )
}

/** Values: a wash behind each row as wide as its share of the most visited. */
export function ValueRows({ values, showDim, isOn, onPick }: { values: Value[]; showDim: boolean; isOn: (dim: string, value: string) => boolean; onPick: (dim: string, value: string) => void }) {
  const top = Math.max(1, ...values.map((v) => v.visitors))
  return (
    <>
      {values.map((v) => {
        const d = dimOf(v.dim)
        if (!d) return null
        const on = isOn(v.dim, v.value)
        return (
          <button key={v.dim + v.value} type="button" role="menuitem" className={on ? 'lrow val on' : 'lrow val'} style={{ ['--w' as string]: `${(v.visitors / top) * 100}%` }} title={v.label} onClick={() => onPick(v.dim, v.value)}>
            {showDim && <d.icon size={15} strokeWidth={1.75} aria-hidden="true" />}
            <span className="lbl">{v.label || '/'}</span>
            {showDim && <span className="sub">{d.label}</span>}
            <span className="end num">{on ? <Check size={14} strokeWidth={2.25} className="ok" aria-label={t.filtered} /> : v.visitors.toLocaleString()}</span>
          </button>
        )
      })}
    </>
  )
}

/** One row for what has nothing to pick; it opens to say which and why. */
export function IdleRows({ count }: { count: (dim: string) => number }) {
  const [open, setOpen] = useState(false)
  const idle = ALL_DIMS.filter((d) => count(d.dim) === 0)
  if (!idle.length) return null
  return (
    <div className="lgrp" role="presentation">
      <button type="button" role="menuitem" className={open ? 'lrow lf-idle open' : 'lrow lf-idle'} aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>{t.idle}</span>
        <span className="end">
          <span className="num">{idle.length}</span>
          <ChevronDown size={14} strokeWidth={1.75} className="ch" aria-hidden="true" />
        </span>
      </button>
      {open &&
        idle.map((d) => (
          <div key={d.dim} className="lrow idle" title={d.note === t.fullMode ? t.idleWhy.full : t.idleWhy.none}>
            <d.icon size={15} strokeWidth={1.75} aria-hidden="true" />
            <span>{d.label}</span>
            <span className="end">{d.note === t.fullMode ? t.fullMode : ''}</span>
          </div>
        ))}
    </div>
  )
}
