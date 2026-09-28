// Jump links over Full. A section inside the grid has no box of its own
// (display: contents), so the jump goes to its first card instead.
import { jumpCopy } from './gridCopy'

function jump(id: string) {
  if (id === 'top') {
    window.scrollTo({ top: 0, behavior: 'smooth' })
    return
  }
  const el = document.getElementById(id)
  if (!el) return
  const target = getComputedStyle(el).display === 'contents' ? el.firstElementChild : el
  target?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

export function JumpNav({ grid }: { grid: boolean }) {
  const links = grid ? jumpCopy.grid : jumpCopy.classic
  return (
    <nav className="jump rise" aria-label={jumpCopy.label}>
      {links.map(([label, id]) => (
        <button key={id} type="button" onClick={() => jump(id)}>
          {label}
        </button>
      ))}
    </nav>
  )
}
