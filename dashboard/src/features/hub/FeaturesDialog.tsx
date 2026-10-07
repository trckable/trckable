// The Features pop-up: every feature there is, by group, with a search on top.
// Most of them are off by default and live in Settings; here they are one
// card each, with the switch for a module or a way to open the place it lives.
// The whole file is a lazy chunk (components/FeaturesHost.tsx).
import { Search, X } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { confirm } from '../../components/Confirm'
import { Modal } from '../../kit/Modal'
import { toast } from '../../components/toastBus'
import type { Site } from '../../lib/api'
import { canChange } from '../../lib/me'
import { copy } from './copy'
import { FeatureCard } from './FeatureCard'
import { canOpen, canToggle, matches, statusOf } from './model'
import { needsSite, openWhere } from './open'
import { FEATURES, GROUPS, type Feature } from './registry'
import { markAllSeen } from './seen'
import { useFeatureMods } from './useFeatureMods'
import { words } from './words'
import './hub.css'

const textOf = (f: Feature) => {
  const w = words[f.id as keyof typeof words]
  return `${w.name} ${w.line} ${copy.groups[f.group]}`
}

export default function FeaturesDialog({ site, user, onClose }: { site: Site | null; user: string; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const { mods, busy, set } = useFeatureMods(site)
  const owner = canChange()
  // Looking at the list is what makes it seen: the menu's dot goes.
  useEffect(() => markAllSeen(user), [user])
  const shown = useMemo(() => FEATURES.filter((f) => matches(textOf(f), query)), [query])

  const toggle = async (f: Feature) => {
    const name = words[f.id as keyof typeof words].name
    const on = statusOf(f, mods) === 'on'
    if (on && !(await confirm({ title: copy.offTitle(name), body: copy.offBody, confirmLabel: copy.offConfirm, cancelLabel: copy.keep, danger: true }))) return
    if (f.module && (await set(f.module, !on))) toast(on ? copy.turnedOff(name) : copy.turnedOn(name))
  }
  const open = (f: Feature) => {
    onClose()
    if (f.where) openWhere(f.where, site ?? undefined)
  }

  return (
    <Modal label={copy.title} className="feat-modal" onClose={onClose}>
      <div className="feat-top">
        <div className="feat-head">
          <h2>{copy.title}</h2>
          {site && <span className="faint">{site.domain}</span>}
          <button type="button" className="modal-close" aria-label={copy.close} title={copy.close} onClick={onClose}>
            <X size={16} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </div>
        <label className="feat-search">
          <Search size={16} strokeWidth={1.75} aria-hidden="true" />
          <input type="search" aria-label={copy.search} placeholder={copy.search} value={query} onChange={(e) => setQuery(e.target.value)} autoFocus={matchMedia('(hover: hover)').matches} />
        </label>
      </div>
      {shown.length === 0 && <p className="faint feat-none">{copy.none}</p>}
      {GROUPS.map((g) => {
        const list = shown.filter((f) => f.group === g)
        if (list.length === 0) return null
        return (
          <section key={g} className="feat-group" aria-label={copy.groups[g]}>
            <h3>{copy.groups[g]}</h3>
            <ul>
              {list.map((f) => (
                <FeatureCard
                  key={f.id}
                  f={f}
                  status={statusOf(f, mods)}
                  toggle={canToggle(f, owner) && mods !== null}
                  busy={busy === f.module}
                  canOpen={canOpen(f, { owner, mods }) && (!!site || !(f.where && needsSite(f.where)))}
                  onToggle={() => void toggle(f)}
                  onOpen={() => open(f)}
                />
              ))}
            </ul>
          </section>
        )
      })}
    </Modal>
  )
}
