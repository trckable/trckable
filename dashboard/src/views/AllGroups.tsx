// The sites of All sites in the account's groups (the same ones as the
// switcher's, shared by the whole team), then the others. A heading carries
// its totals; a tile dragged onto a group, or onto another tile of it, moves
// there. A viewer only sees them.
import { useState } from 'react'
import { Menu } from '../components/Menu'
import { confirm, confirmWith } from '../components/Confirm'
import { moveTo, removeGroup, renameGroup, stepGroup, type Place } from '../features/sites/layout'
import { copy as menu } from '../features/sites/menuCopy'
import type { Site, SiteLayout, SiteRow } from '../lib/api'
import { fmtInt, fmtMoney } from '../lib/format'
import { AllTile, type Arrange } from './AllTile'
import { totalsOf, type Block } from './allSitesGroups'
import { copy } from './allSitesCopy'

type Props = {
  blocks: Block[]
  sites: Site[]
  layout: SiteLayout
  colorOf: (id: string) => string
  days: number
  start: number
  arrange: Arrange | null
}

function Head({ block, arrange: a }: { block: Block; arrange: Arrange | null }) {
  const t = totalsOf(block.rows)
  const name = block.name
  const sums = copy.totals(block.rows.length, fmtInt(t.visitors), t.money ? fmtMoney(t.money.amount, t.money.currency, t.money.exponent) : '')
  const rename = async () => {
    const to = (await confirmWith({ title: menu.renameTitle(name ?? ''), confirmLabel: menu.save, field: { label: menu.groupName, type: 'text' } }))?.trim()
    if (to && name && a) a.save(renameGroup(a.layout, name, to))
  }
  const remove = async () => {
    const ok = await confirm({ title: menu.removeGroupTitle(name ?? ''), body: menu.removeGroupBody, confirmLabel: menu.remove, danger: true })
    if (ok && name && a) a.save(removeGroup(a.layout, name))
  }
  return (
    <h2 className="all-group-head">
      <span className="all-group-name">{name ?? copy.other}</span>
      <span className="all-group-sums muted">{sums}</span>
      {a && name && (
        <Menu label={copy.groupOptions(name)}>
          {(close) => {
            const item = (label: string, fn: () => void) => (
              <button type="button" role="menuitem" onClick={() => { close(); fn() }}>
                {label}
              </button>
            )
            return (
              <>
                {item(menu.rename, () => void rename())}
                {item(menu.groupUp, () => a.save(stepGroup(a.layout, name, -1)))}
                {item(menu.groupDown, () => a.save(stepGroup(a.layout, name, 1)))}
                {item(menu.removeGroup, () => void remove())}
              </>
            )
          }}
        </Menu>
      )}
    </h2>
  )
}

export function AllGroups({ blocks, sites, layout, colorOf, days, start, arrange }: Props) {
  const [dragged, setDragged] = useState<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const siteOf = new Map(sites.map((s) => [s.id, s]))
  const headed = layout.groups.length > 0
  const drop = (to: Place, before?: string) => {
    if (dragged && arrange && dragged !== before) arrange.save(moveTo(arrange.sites, arrange.layout, dragged, to, before))
    setDragged(null)
    setOver(null)
  }
  return (
    <>
      {blocks.map((b) => {
        const key = b.name ?? ''
        const place: Place = b.name === null ? { kind: 'rest' } : { kind: 'group', name: b.name }
        return (
          <section
            key={key || '-other'}
            className={'all-group' + (over === key && dragged ? ' over' : '')}
            aria-label={b.name ?? copy.other}
            onDragOver={dragged ? (e) => { e.preventDefault(); setOver(key) } : undefined}
            onDragLeave={dragged ? (e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null) } : undefined}
            onDrop={dragged ? (e) => { e.preventDefault(); drop(place) } : undefined}
          >
            {headed && <Head block={b} arrange={arrange} />}
            {b.rows.length === 0 ? (
              <p className="faint all-group-empty">{menu.emptyGroup}</p>
            ) : (
              <div className="all-tiles" role="list">
                {b.rows.map((r: SiteRow) => (
                  <AllTile
                    key={r.id}
                    row={r}
                    site={siteOf.get(r.id)}
                    color={colorOf(r.id)}
                    days={days}
                    start={start}
                    arrange={arrange}
                    dragging={dragged === r.id}
                    onDragStart={() => setDragged(r.id)}
                    onDragEnd={() => { setDragged(null); setOver(null) }}
                    onDropHere={() => drop(place, r.id)}
                  />
                ))}
              </div>
            )}
          </section>
        )
      })}
    </>
  )
}
