// "trckable 0.1.3 is out": what changed, and the three commands that upgrade
// a Docker install. Loaded when the pill in the header is pressed.
import { ExternalLink, Sparkles } from 'lucide-react'
import type { Latest } from '../lib/update'
import { CodeBlock } from './Code'
import { Modal } from './Modal'

/** The release notes as short plain lines: headings and bullets, no markup. */
function lines(md = ''): string[] {
  return md
    .split('\n')
    .map((l) => l.replace(/^#+\s*/, '').replace(/^[-*]\s+/, '• ').replace(/\*\*|`/g, '').trim())
    .filter(Boolean)
    .slice(0, 10)
}

export default function UpdateDialog({ latest, current, onClose }: { latest: Latest; current: string; onClose: () => void }) {
  const notes = lines(latest.notes)
  return (
    <Modal label={`trckable ${latest.v} is out`} className="update-modal" onClose={onClose}>
      <div className="modal-head">
        <span className="modal-badge" aria-hidden="true">
          <Sparkles size={19} strokeWidth={1.75} />
        </span>
        <div>
          <h2>trckable {latest.v} is out</h2>
          <span className="faint">This server runs {current}. Every release is free, the same day for everyone.</span>
        </div>
      </div>
      {notes.length > 0 && (
        <div className="update-notes">
          {notes.map((l, i) => (
            <p key={i} className={l.startsWith('• ') ? 'bullet' : 'head'}>
              {l}
            </p>
          ))}
        </div>
      )}
      <div className="update-steps">
        <b>Upgrade a Docker install</b>
        <CodeBlock
          wrap
          lang="bash"
          code={`docker exec trckable trckabled backup      # a copy to go back to
docker pull ghcr.io/trckable/trckable:${latest.v}
docker restart trckable`}
        />
        <span className="faint">Nothing the server accepted is lost while it restarts. On Railway or another host, redeploy with the new image.</span>
      </div>
      <div className="update-links">
        <a className="btn" href="https://trckable.com/docs/self-host/upgrading/" target="_blank" rel="noreferrer">
          Upgrade guide <ExternalLink size={14} strokeWidth={1.75} aria-hidden="true" />
        </a>
        {latest.url && (
          <a className="btn ghost" href={latest.url} target="_blank" rel="noreferrer">
            Release notes <ExternalLink size={14} strokeWidth={1.75} aria-hidden="true" />
          </a>
        )}
        <button type="button" className="btn primary" style={{ marginLeft: 'auto' }} onClick={onClose}>
          Later
        </button>
      </div>
    </Modal>
  )
}
