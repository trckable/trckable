// "trckable 0.1.3 is out": what changed, and the three commands that upgrade
// a Docker install. Loaded when the pill in the header is pressed.
import { ExternalLink, Sparkles } from 'lucide-react'
import type { Latest } from '../lib/update'
import { CodeBlock } from './Code'
import { Info } from './Info'
import { Modal } from '../kit/Modal'
import { ModalMark } from '../kit/ModalMark'
import './UpdateDialog.css'

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
    <Modal
      label={`trckable ${latest.v} is out`}
      onClose={onClose}
      frame={{
        title: `trckable ${latest.v} is out`,
        subtitle: `This server runs ${current}.`,
        help: 'Every release is free, the same day for everyone.',
        icon: <ModalMark icon={Sparkles} />,
        size: 'md',
        cancel: 'Later',
        extra: latest.url ? (
          <a className="btn ghost" href={latest.url} target="_blank" rel="noreferrer">
            Release notes <ExternalLink size={14} strokeWidth={1.75} aria-hidden="true" />
          </a>
        ) : undefined,
        actions: (
          <a className="btn primary" href="https://trckable.com/docs/self-host/upgrading/" target="_blank" rel="noreferrer">
            Upgrade guide <ExternalLink size={14} strokeWidth={1.75} aria-hidden="true" />
          </a>
        ),
      }}
    >
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
      <b className="update-label">
        Upgrade with docker compose
        <Info text="A plain docker run install is replaced the same way: pull, then remove the container and run it again with the same volume. The image runs as an unprivileged user: a volume an older image filled as root needs chown -R 65532:65532 on it once, and on Railway set RAILWAY_RUN_UID=0 on the service before redeploying. Nothing the server accepted is lost while it restarts." />
      </b>
      <CodeBlock
        wrap
        lang="bash"
        code={`docker compose exec trckable trckabled backup   # a copy to go back to
docker compose pull
docker compose up -d`}
      />
    </div>
    </Modal>
  )
}
