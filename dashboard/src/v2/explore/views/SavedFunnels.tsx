// Under the funnel's title: the funnels this site keeps by name. Anyone opens one; whoever may change things saves the
// one on screen, renames the open one, or deletes it (deleting is here only, after a second tap).
import { useState, type SyntheticEvent } from 'react'
import { can } from '../../../lib/permissions'
import { setView } from '../../../lib/url'
import { copy } from '../copy'
import { sameSteps, useSavedFunnels } from '../data/useSavedFunnels'
import type { Funnel } from '../types'

type Doing = 'save' | 'rename' | 'delete' | null

export function SavedFunnels({ site, spec }: { site: string; spec: Funnel['spec'] }) {
  const { list, save, rename, remove } = useSavedFunnels(site)
  const [doing, setDoing] = useState<Doing>(null)
  const [name, setName] = useState('')
  const open = list.find((f) => sameSteps(f.steps, spec))
  const may = can('funnel.create')
  if (list.length === 0 && !(may && spec.length >= 2)) return null
  const begin = (to: Doing, text = '') => {
    setName(text)
    setDoing(to)
  }
  const send = (e: SyntheticEvent) => {
    e.preventDefault()
    const text = name.trim()
    if (!text) return
    void (doing === 'rename' && open ? rename(open.id, text) : save(text, spec)).then(() => setDoing(null))
  }
  const naming = doing === 'save' || doing === 'rename'
  return (
    <div className="xsvf" data-saved-funnels>
      {list.length > 0 && !naming && (
        <select
          aria-label={copy.savedFunnels}
          value={open?.id ?? ''}
          onChange={(e) => {
            setDoing(null)
            setView({ funnel: list.find((f) => f.id === e.target.value)?.steps })
          }}
        >
          <option value="">{copy.openSaved}</option>
          {list.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
      )}
      {naming && (
        <form className="xsvn" onSubmit={send}>
          <input type="text" aria-label={copy.funnelName} placeholder={copy.funnelNamePlaceholder} value={name} maxLength={60} autoFocus onChange={(e) => setName(e.target.value)} />
          <button type="submit" className="xb p" disabled={!name.trim()}>
            {copy.saveName}
          </button>
          <button type="button" className="xb" onClick={() => setDoing(null)}>
            {copy.cancel}
          </button>
        </form>
      )}
      {!naming && may && !open && spec.length >= 2 && (
        <button type="button" className="xb" onClick={() => begin('save')}>
          {copy.saveFunnel}
        </button>
      )}
      {!naming && may && open && doing !== 'delete' && (
        <>
          <button type="button" className="xb" onClick={() => begin('rename', open.name)}>
            {copy.renameFunnel}
          </button>
          <button type="button" className="xb" onClick={() => setDoing('delete')}>
            {copy.deleteFunnel}
          </button>
        </>
      )}
      {doing === 'delete' && open && (
        <span className="xsvn" role="group" aria-label={copy.confirmDelete(open.name)}>
          <span>{copy.confirmDelete(open.name)}</span>
          <button type="button" className="xb p" onClick={() => void remove(open.id).then(() => setDoing(null))}>
            {copy.deleteFunnel}
          </button>
          <button type="button" className="xb" onClick={() => setDoing(null)}>
            {copy.cancel}
          </button>
        </span>
      )}
    </div>
  )
}
