// Your picture, before it is saved: drag it inside the circle and zoom, so a
// holiday photo becomes a face. The result is drawn at 256 × 256 and saved as
// WebP, well under the server's 256 KB, whatever size the original was.
import { Check, ImageUp, ZoomIn, ZoomOut } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Modal } from './Modal'
import './AvatarCrop.css'

const VIEW = 240 // the circle on screen
const OUT = 256 // the saved picture

export default function AvatarCrop({
  file,
  onCancel,
  onSave,
  onDone,
  square = false,
  title = 'Your picture',
}: {
  file: File
  onCancel: () => void
  /** Stores the picture; the dialog stays open, busy, until it resolves. */
  onSave: (picture: Blob) => Promise<unknown>
  /** Closes the dialog, once "Saved" has been seen. */
  onDone: () => void
  /** A site's icon is a rounded square, not a circle. */
  square?: boolean
  title?: string
}) {
  const [img, setImg] = useState<HTMLImageElement | null>(null)
  const [zoom, setZoom] = useState(1)
  const [at, setAt] = useState({ x: 0, y: 0 }) // offset of the image centre, in view pixels
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null)

  useEffect(() => {
    const url = URL.createObjectURL(file)
    const i = new Image()
    i.onload = () => setImg(i)
    // Say which file and why, not just "no". A PNG the browser knows yet cannot
    // open is damaged or not what its name says; anything else is a format
    // this browser does not read — most often an iPhone photo (HEIC).
    i.onerror = () => {
      const known = /^image\/(png|jpeg|webp|gif)$/.test(file.type)
      const heic = /heic|heif/i.test(file.type + file.name)
      setErr(
        known
          ? `${file.name} could not be read. It may be damaged, or not really a ${file.type.slice(6).toUpperCase()} — try saving it again.`
          : `${file.name} is not a picture this browser can open. Use a PNG, JPEG, WebP or GIF` +
              (heic ? ' — an iPhone photo (HEIC) can be exported as JPEG from Photos first.' : '.'),
      )
    }
    i.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])

  // At zoom 1 the picture just covers the circle; zooming makes it larger.
  const base = img ? VIEW / Math.min(img.width, img.height) : 1
  const scale = base * zoom
  const w = img ? img.width * scale : 0
  const h = img ? img.height * scale : 0
  // Never let an edge of the picture come inside the circle.
  const clamp = (x: number, y: number) => ({
    x: Math.max(-(w - VIEW) / 2, Math.min((w - VIEW) / 2, x)),
    y: Math.max(-(h - VIEW) / 2, Math.min((h - VIEW) / 2, y)),
  })
  useEffect(() => setAt((p) => clamp(p.x, p.y)), [zoom, img]) // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => {
    if (!img) return
    const c = document.createElement('canvas')
    c.width = c.height = OUT
    const ctx = c.getContext('2d')!
    const k = OUT / VIEW
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, (VIEW / 2 - w / 2 + at.x) * k, (VIEW / 2 - h / 2 + at.y) * k, w * k, h * k)
    setBusy(true)
    setErr(null)
    // A save takes a few milliseconds here; without a moment of "Saving…" and
    // a tick, the dialog just vanished and nobody could tell it had worked.
    const t0 = Date.now()
    const after = (ms: number) => new Promise((r) => setTimeout(r, Math.max(0, ms - (Date.now() - t0))))
    c.toBlob(
      (blob) => {
        if (!blob) return (setBusy(false), setErr('Could not make the picture — try another file.'))
        Promise.all([onSave(blob), after(700)])
          .then(() => {
            setBusy(false)
            setSaved(true)
            setTimeout(onDone, 650)
          })
          .catch((e: Error) => (setBusy(false), setErr(e.message)))
      },
      'image/webp',
      0.9,
    )
  }

  return (
    <Modal label={title} className="crop-modal" onClose={busy || saved ? undefined : onCancel}>
      <div className="modal-head">
        <span className="modal-badge" aria-hidden="true">
          <ImageUp size={19} strokeWidth={1.75} />
        </span>
        <div>
          <h2>{title}</h2>
          <span className="faint">Drag it into place and zoom until it looks right.</span>
        </div>
      </div>
      {!(err && !img) && (
      <div
        className={'crop-stage' + (busy ? ' saving' : '') + (saved ? ' saved' : '')}
        aria-busy={busy}
        style={{ width: VIEW, height: VIEW }}
        onPointerDown={(e) => {
          ;(e.target as Element).setPointerCapture?.(e.pointerId)
          drag.current = { x: e.clientX, y: e.clientY, ox: at.x, oy: at.y }
        }}
        onPointerMove={(e) => {
          const d = drag.current
          if (d) setAt(clamp(d.ox + e.clientX - d.x, d.oy + e.clientY - d.y))
        }}
        onPointerUp={() => (drag.current = null)}
        onWheel={(e) => setZoom((z) => Math.max(1, Math.min(4, z - e.deltaY / 500)))}
      >
        {img && (
          <img
            src={img.src}
            alt=""
            draggable={false}
            style={{ width: w, height: h, transform: `translate(${VIEW / 2 - w / 2 + at.x}px, ${VIEW / 2 - h / 2 + at.y}px)` }}
          />
        )}
        <span className={'crop-ring' + (square ? ' square' : '')} aria-hidden="true" />
        {(busy || saved) && (
          <span className={'crop-veil' + (square ? ' square' : '')} aria-hidden="true">
            {saved ? <Check size={30} strokeWidth={2.25} /> : <span className="btn-spin" />}
          </span>
        )}
      </div>
      )}
      {img && (
        <label className="crop-zoom">
          <ZoomOut size={16} strokeWidth={1.75} aria-hidden="true" />
          <input type="range" min={1} max={4} step={0.01} value={zoom} onChange={(e) => setZoom(+e.target.value)} aria-label="Zoom" />
          <ZoomIn size={16} strokeWidth={1.75} aria-hidden="true" />
        </label>
      )}
      {err && (
        <p className="confirm-err" role="alert">
          {err}
        </p>
      )}
      <div className="person-actions">
        <button type="button" className="btn ghost" onClick={onCancel} disabled={busy || saved}>
          Cancel
        </button>
        <button type="button" className="btn primary" onClick={save} disabled={busy || saved || !img} aria-live="polite">
          {busy && <span className="btn-spin" aria-hidden="true" />}
          {saved && <Check size={16} strokeWidth={2.25} aria-hidden="true" />}
          {busy ? 'Saving…' : saved ? 'Saved' : 'Save picture'}
        </button>
      </div>
    </Modal>
  )
}
