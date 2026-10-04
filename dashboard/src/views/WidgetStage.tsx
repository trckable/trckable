// The preview in Settings → Widgets: the real page with the site's numbers,
// on a light or dark floor, alone or on a mock page, inline or in a corner.
import { useState, type ReactNode } from 'react'
import type { Site, WidgetLook } from '../lib/apiMore'
import { STAGE, previewUrl, size, type Place } from './widgetKinds'

const TONES = ['light', 'dark'] as const

function MockPage({ place, h, children }: { place: Place; h: number; children: ReactNode }) {
  const corner = place !== 'inline'
  return (
    <div className="wg-page" style={{ minHeight: Math.max(300, h + 110) }}>
      <span className="wg-page-bar" aria-hidden="true" />
      <span className="wg-line w60" aria-hidden="true" />
      <span className="wg-line w90" aria-hidden="true" />
      <span className="wg-line w75" aria-hidden="true" />
      {corner ? null : <div className="wg-inline">{children}</div>}
      <span className="wg-line w90" aria-hidden="true" />
      <span className="wg-line w50" aria-hidden="true" />
      {corner && <div className={'wg-corner ' + place}>{children}</div>}
    </div>
  )
}

export function WidgetStage({ site, look, place }: { site: Site; look: WidgetLook; place: Place }) {
  const [tone, setTone] = useState<'light' | 'dark'>('dark')
  const [onPage, setOnPage] = useState(false)
  // A widget on auto follows its page: the floor decides how it looks here.
  const src = previewUrl(site.id, { ...look, theme: look.theme === 'auto' ? tone : look.theme })
  const { w, h } = size(look)
  const frame = <iframe key={src} src={src} width={w} height={h} title={STAGE.title} />
  return (
    <div className="wg-stage-box">
      <div className="wg-stage-bar">
        <span className="seg" role="group" aria-label={STAGE.tone}>
          {TONES.map((t) => (
            <button key={t} type="button" aria-pressed={tone === t} onClick={() => setTone(t)}>
              {STAGE[t]}
            </button>
          ))}
        </span>
        <span className="seg" role="group" aria-label={STAGE.view}>
          <button type="button" aria-pressed={!onPage} onClick={() => setOnPage(false)}>
            {STAGE.alone}
          </button>
          <button type="button" aria-pressed={onPage} onClick={() => setOnPage(true)}>
            {STAGE.page}
          </button>
        </span>
      </div>
      <div className={'wg-stage ' + tone}>
        {onPage ? (
          <MockPage place={place} h={h}>
            {frame}
          </MockPage>
        ) : (
          frame
        )}
      </div>
    </div>
  )
}
