// Ask with your own assistant: the MCP config to paste, a key for it, and the
// docs.
import { CodeBlock } from '../../components/Code'
import { openAccount } from '../../lib/account'
import { copy } from './copy'

const config = (host: string) => `{
  "mcpServers": {
    "trckable": {
      "command": "npx",
      "args": ["-y", "trckable", "mcp"],
      "env": { "TRCKABLE_HOST": "${host}", "TRCKABLE_API_KEY": "tkb_live_…" }
    }
  }
}`

export function Setup({ onClose }: { onClose: () => void }) {
  return (
    <div className="ask-setup">
      <p>
        {copy.intro}{' '}
        <a href={copy.docs} target="_blank" rel="noopener noreferrer">
          {copy.docsLink}
        </a>
      </p>
      <CodeBlock code={config(location.origin)} />
      <p className="faint">{copy.note}</p>
      <button
        type="button"
        className="btn"
        onClick={() => {
          onClose()
          openAccount('keys')
        }}
      >
        {copy.key}
      </button>
    </div>
  )
}
