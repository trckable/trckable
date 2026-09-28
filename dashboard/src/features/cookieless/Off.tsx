// A card cookieless mode leaves without numbers: it says so, and why, where
// the numbers would have been.
import { copy } from './copy'
import './Off.css'

export function CookielessOff({ title }: { title: string }) {
  return (
    <div className="card">
      <div className="card-head">
        <h2>{title}</h2>
      </div>
      <p className="cookieless-off">
        <b>{copy.off}</b>
        <span className="faint">{copy.why}</span>
      </p>
    </div>
  )
}
