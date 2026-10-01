// Your picture, before it is saved: drag it inside the frame and zoom, so a
// holiday photo becomes a face or a wide logo fits whole. The result is drawn
// at 256 × 256 (transparent around a picture smaller than the frame) and saved
// as WebP, well under the server's 256 KB, whatever size the original was.
import { Check, Crosshair, ImageUp, ZoomIn, ZoomOut } from 'lucide-react'
import { useEffect, useId, useState } from 'react'
import { DialogActions } from './DialogActions'
import { DialogHead } from './DialogHead'
import { Modal } from './Modal'
import { copy } from './crop/copy'
import { drawRect, OUT, placed, VIEW } from './crop/math'
import { useCrop } from './crop/useCrop'
import { fail } from './toastBus'
import './AvatarCrop.css'

// Say which file and why, not just "no". A PNG the browser knows yet cannot
// open is damaged or not what its name says; anything else is a format this
// browser does not read — most often an iPhone photo (HEIC).
function unreadable(file: File) {
  if (/^image\/(png|jpeg|webp|gif)$/.test(file.type)) return copy.damaged(file.name, file.type.slice(6).toUpperCase())
  if (/heic|heif/i.test(file.type + file.name)) return copy.heic(file.name)
  return copy.unknown(file.name)
}

export default function AvatarCrop({
  file,
  onCancel,
  onSave,
  onDone,
  square = false,
  title = copy.title,
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
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [err, setErr] = useState<string | null>(null)
  // A face fills its circle; an icon starts whole, as logos are often wide.
  const crop = useCrop(img, !square)
  const keysId = useId()

  useEffect(() => {
    const url = URL.createObjectURL(file)
    const i = new Image()
    i.onload = () => setImg(i)
    i.onerror = () => setErr(unreadable(file))
    i.src = url
    return () => URL.revokeObjectURL(url)
  }, [file])

  const save = () => {
    if (!img) return
    const c = document.createElement('canvas')
    c.width = c.height = OUT
    const ctx = c.getContext('2d')
    if (!ctx) return
    const r = drawRect(crop.w, crop.h, crop.at)
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(img, r.x, r.y, r.w, r.h)
    setBusy(true)
    setErr(null)
    // A save takes a few milliseconds here; without a moment of "Saving…" and
    // a tick, the dialog just vanished and nobody could tell it had worked.
    const t0 = Date.now()
    const after = (ms: number) => new Promise((res) => setTimeout(res, Math.max(0, ms - (Date.now() - t0))))
    c.toBlob(
      (blob) => {
        if (!blob) {
          setBusy(false)
          setErr(copy.noCanvas)
          return
        }
        Promise.all([onSave(blob), after(700)])
          .then(() => {
            setBusy(false)
            setSaved(true)
            setTimeout(onDone, 650)
          })
          .catch((e: unknown) => {
            setBusy(false)
            fail(e)
          })
      },
      'image/webp',
      0.9,
    )
  }

  const saveLabel = () => {
    if (busy) return copy.saving
    if (saved) return copy.saved
    return copy.save
  }
  const shape = square ? ' square' : ''
  const at = placed(crop.w, crop.h, crop.at)
  const percent = Math.round(crop.zoom * 100)

  return (
    <Modal label={title} className="crop-modal" onClose={busy || saved ? undefined : onCancel}>
      <DialogHead icon={ImageUp} heading={title} hint={copy.hint} />
      {!(err && !img) && (
        <div
          className={'crop-stage' + (busy ? ' saving' : '') + (saved ? ' saved' : '')}
          role="application"
          // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- the frame takes the arrow keys that move the picture, so it takes focus
          tabIndex={img ? 0 : -1}
          aria-label={copy.stage}
          aria-describedby={keysId}
          aria-busy={busy}
          style={{ width: VIEW, height: VIEW }}
          {...crop.stage}
        >
          {img && (
            <img
              className={crop.gliding ? 'gliding' : undefined}
              src={img.src}
              alt=""
              draggable={false}
              style={{ width: at.w, height: at.h, transform: `translate(${at.x}px, ${at.y}px)` }}
            />
          )}
          <span className={'crop-ring' + shape} aria-hidden="true" />
          {(busy || saved) && (
            <span className={'crop-veil' + shape} aria-hidden="true">
              {saved ? <Check size={30} strokeWidth={2.25} /> : <span className="btn-spin" />}
            </span>
          )}
        </div>
      )}
      <span id={keysId} className="sr">
        {copy.keys}
      </span>
      {img && (
        <div className="crop-tools">
          <label className="crop-zoom">
            <ZoomOut size={16} strokeWidth={1.75} aria-hidden="true" />
            <input
              type="range"
              min={1}
              max={crop.range.max}
              step={0.01}
              value={crop.zoom}
              onChange={(e) => crop.setZoom(+e.target.value)}
              aria-label={copy.zoom}
              aria-valuetext={copy.zoomValue(percent)}
            />
            <ZoomIn size={16} strokeWidth={1.75} aria-hidden="true" />
          </label>
          <button type="button" className="btn ghost small" onClick={crop.center} disabled={busy || saved}>
            <Crosshair size={15} strokeWidth={1.75} aria-hidden="true" />
            {copy.center}
          </button>
        </div>
      )}
      <span className="sr" role="status">
        {crop.centred > 0 && copy.centered}
      </span>
      {err && (
        <p className="confirm-err" role="alert">
          {err}
        </p>
      )}
      <DialogActions
        left={
          <button type="button" className="btn ghost" onClick={onCancel} disabled={busy || saved}>
            {copy.cancel}
          </button>
        }
      >
        <button type="button" className="btn primary" onClick={save} disabled={busy || saved || !img} aria-live="polite">
          {busy && <span className="btn-spin" aria-hidden="true" />}
          {saved && <Check size={16} strokeWidth={2.25} aria-hidden="true" />}
          {saveLabel()}
        </button>
      </DialogActions>
    </Modal>
  )
}
