// What cannot be drawn says so in its own place, and the rest of the page
// stays: without it one bad frame unmounts the whole app and the screen goes
// black. A chunk that is gone (a tab older than the last deploy) reloads the
// page instead (lib/stale.ts); anything else offers a reload. It lets go
// again when what it draws changes (`reset`, compared by identity).
import { Component, type ReactNode } from 'react'
import { kitCopy } from '../charts/copy'
import { reloadOnce, staleChunk } from '../lib/stale'

export class Boundary extends Component<{ reset?: unknown; children: ReactNode }, { bad: boolean; up: boolean }> {
  state = { bad: false, up: false }
  static getDerivedStateFromError = () => ({ bad: true })
  componentDidCatch(err: unknown) {
    if (staleChunk(err)) void reloadOnce().then((up) => this.setState({ up }))
  }
  componentDidUpdate(prev: { reset?: unknown }) {
    if (this.state.bad && prev.reset !== this.props.reset) this.setState({ bad: false, up: false })
  }
  render() {
    const { bad, up } = this.state
    if (!bad) return this.props.children
    return (
      <p className="faint kit-empty" role="status">
        {up ? kitCopy.updated : kitCopy.failed}{' '}
        {!up && (
          <button type="button" className="btn ghost" onClick={() => location.reload()}>
            {kitCopy.reload}
          </button>
        )}
      </p>
    )
  }
}

// What no render sees: a chunk that fails to load outside one (Vite says so
// itself when a preload or an import() fails; an import nobody awaits shows up
// as an unhandled rejection).
window.addEventListener('vite:preloadError', () => void reloadOnce())
window.addEventListener('unhandledrejection', (e) => void (staleChunk(e.reason) && reloadOnce()))
