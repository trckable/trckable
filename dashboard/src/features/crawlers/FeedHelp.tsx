// How a site's server reports the robots it answers.
import { CodeBlock } from '../../components/Code'
import { DialogActions } from '../../components/DialogActions'
import { Modal } from '../../components/Modal'
import type { Site } from '../../lib/api'
import { copy } from './copy'

const middleware = (host: string, site: string) => `// Next.js — middleware.ts
import { reportCrawler } from 'trckable/server'

export function middleware(req) {
  reportCrawler({
    host: '${host}',
    site: '${site}',
    key: process.env.TRCKABLE_PROXY_KEY,
    url: req.url,
    ua: req.headers.get('user-agent'),
  })
}`

const curl = (host: string, site: Site) => `# any language: one POST per robot request
curl -X POST ${host}/api/crawl \\
  -H 'content-type: application/json' \\
  -H 'X-Trckable-Proxy-Key: ${site.proxy_key}' \\
  -d '{"s":"${site.id}","u":"https://${site.domain}/page","ua":"<user agent>","st":200}'`

export function FeedHelp({ site, onClose }: { site: Site; onClose: () => void }) {
  const host = location.origin
  return (
    <Modal label={copy.help.label} className="wide" onClose={onClose}>
      <h2>{copy.help.title}</h2>
      <p className="muted crawl-help">{copy.help.intro}</p>
      <CodeBlock lang="js" code={middleware(host, site.id)} />
      <CodeBlock lang="shell" code={curl(host, site)} />
      <span className="faint crawl-small">{copy.help.note}</span>
      <DialogActions>
        <button type="button" className="btn primary big" onClick={onClose}>
          {copy.help.done}
        </button>
      </DialogActions>
    </Modal>
  )
}
