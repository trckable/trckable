// The studio of Settings → Widgets: pick a design, see it with the real numbers,
// and set its mode, parts, look, language and words. Used to make a widget and
// to edit one.
import type { ReactNode } from 'react'
import { Select } from '../components/Select'
import { Switch } from '../components/Switch'
import type { Site, WidgetKind, WidgetLook } from '../lib/apiMore'
import { DEFAULT_PARTS, KINDS, LANGS, MAX_NAME, MAX_TEXT, MODES, TEXT, TEXT_FIELDS, defaultName, kindOf, modeOf, partsOf, placeOf, withPlace, type Place } from './widgetKinds'
import { WidgetStage } from './WidgetStage'

const ACCENTS = ['', '#38bdf8', '#818cf8', '#f472b6', '#fb923c', '#facc15']
const RADII = [
  { id: 4, label: 'Square' },
  { id: 16, label: 'Rounded' },
  { id: 28, label: 'Round' },
]
const PLACES: { id: Place; label: string }[] = [
  { id: 'inline', label: 'Where I paste it' },
  { id: 'br', label: 'Floating, bottom right' },
  { id: 'bl', label: 'Floating, bottom left' },
]
const PLACE_SHORT: Record<Place, string> = { inline: 'Inline', br: 'Corner ↘', bl: 'Corner ↙' }
const THEME_NAME = { auto: 'Auto', dark: 'Dark', light: 'Light' }

export function WidgetStudio({ site, look, onLook, place, onPlace, footer }: { site: Site; look: WidgetLook; onLook: (patch: Partial<WidgetLook>) => void; place: Place; onPlace: (p: Place) => void; footer: ReactNode }) {
  const set = onLook
  // The words of one design are not the words of the next.
  const pick = (kind: WidgetKind) => set({ kind, shows: kind === 'online' ? withPlace(DEFAULT_PARTS[kind], place) : DEFAULT_PARTS[kind], texts: {} })
  const setText = (key: string, value: string) => set({ texts: { ...look.texts, [key]: value } })
  // The online design keeps its corner with the widget; the others only change the code.
  const setPlace = (p: Place) => {
    onPlace(p)
    if (look.kind === 'online') set({ shows: withPlace(look.shows, p) })
  }
  const togglePart = (p: string) => set({ shows: look.shows.includes(p) ? look.shows.filter((x) => x !== p) : [...look.shows, p] })
  const parts = partsOf(look)
  const kind = kindOf(look.kind)
  return (
    <>
      <div className="wg-tabs" role="radiogroup" aria-label="Design">
        {KINDS.map((k) => (
          <button key={k.id} type="button" role="radio" aria-checked={look.kind === k.id} className="wg-tab" onClick={() => pick(k.id)} title={k.hint}>
            <k.Icon size={15} strokeWidth={1.75} aria-hidden="true" />
            {k.name}
            {k.fresh && <span className="wg-dot" title="Only in trckable" aria-label="new, only in trckable" />}
          </button>
        ))}
      </div>
      <p className="wg-hint">
        {kind.hint}
        {kind.fresh && <span className="wg-only">{TEXT.only}</span>}
      </p>

      <div className="wg-studio">
        <WidgetStage site={site} look={look} place={place} />
        <div className="wg-options">
          {look.kind === 'online' && (
            <label className="wg-opt">
              <span>{TEXT.mode}</span>
              <span className="seg" role="group" aria-label="Mode">
                {MODES.map((m) => (
                  <button key={m.id} type="button" aria-pressed={modeOf(look.shows) === m.id} onClick={() => set({ shows: withPlace(m.shows, placeOf(look.shows)) })}>
                    {m.label}
                  </button>
                ))}
              </span>
            </label>
          )}
          {parts.length > 0 && (
            <div className="wg-opt">
              <span>{TEXT.show}</span>
              <div className="wg-parts">
                {parts.map((p) => (
                  <label key={p.id} className="wg-part" title={p.hint}>
                    <span>
                      <b>{p.name}</b>
                      {p.hint && <span className="faint">{p.hint}</span>}
                    </span>
                    <Switch on={look.shows.includes(p.id)} label={p.name} onChange={() => togglePart(p.id)} />
                  </label>
                ))}
              </div>
            </div>
          )}
          <label className="wg-opt">
            <span>{TEXT.theme}</span>
            <span className="seg" role="group" aria-label="Theme">
              {(['auto', 'dark', 'light'] as const).map((t) => (
                <button key={t} type="button" aria-pressed={look.theme === t} onClick={() => set({ theme: t })}>
                  {THEME_NAME[t]}
                </button>
              ))}
            </span>
          </label>
          <div className="wg-opt">
            <span>{TEXT.colour}</span>
            <span className="wg-swatches" role="radiogroup" aria-label="Colour">
              {ACCENTS.map((c) => (
                <button
                  key={c || 'own'}
                  type="button"
                  role="radio"
                  aria-checked={look.accent === c}
                  aria-label={c || "trckable's own"}
                  className={'wg-swatch' + (c ? '' : ' own')}
                  style={c ? { backgroundColor: c } : undefined}
                  onClick={() => set({ accent: c })}
                />
              ))}
            </span>
          </div>
          <label className="wg-opt">
            <span>{TEXT.corners}</span>
            <span className="seg" role="group" aria-label="Corners">
              {RADII.map((r) => (
                <button key={r.id} type="button" aria-pressed={look.radius === r.id} onClick={() => set({ radius: r.id })}>
                  {r.label}
                </button>
              ))}
            </span>
          </label>
          <label className="wg-opt">
            <span>{TEXT.placement}</span>
            <span className="seg wg-place" role="group" aria-label="Placement">
              {PLACES.map((p) => (
                <button key={p.id} type="button" aria-pressed={place === p.id} onClick={() => setPlace(p.id)}>
                  {PLACE_SHORT[p.id]}
                </button>
              ))}
            </span>
            <span className="faint wg-place-hint">{PLACES.find((p) => p.id === place)?.label}</span>
          </label>
          <div className="wg-opt">
            <span>{TEXT.language}</span>
            <Select value={look.lang} aria-label={TEXT.language} onChange={(e) => set({ lang: e.target.value })}>
              {LANGS.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </Select>
          </div>
          {TEXT_FIELDS[look.kind].length > 0 && (
            <details className="wg-opt wg-texts">
              <summary>{TEXT.texts}</summary>
              {TEXT_FIELDS[look.kind].map((f) => (
                <label key={f.key} className="wg-text">
                  <span>{f.label}</span>
                  <input value={look.texts[f.key] ?? ''} maxLength={MAX_TEXT} placeholder={f.def} onChange={(e) => setText(f.key, e.target.value)} />
                </label>
              ))}
              <span className="faint">{TEXT.textsHint}</span>
            </details>
          )}
          <label className="wg-opt">
            <span>{TEXT.nameLabel}</span>
            <input className="wg-name" value={look.name ?? ''} maxLength={MAX_NAME} placeholder={defaultName(look)} aria-label={TEXT.name} onChange={(e) => set({ name: e.target.value })} />
          </label>
          {footer}
        </div>
      </div>
    </>
  )
}
