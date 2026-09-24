// npx trckable <command>
//
//   mcp     run the MCP server on stdio (TRCKABLE_HOST, TRCKABLE_API_KEY)
//   help    show this help
import { MCP_VERSION, createMcpServer } from './mcp'
import { doctor, format } from './doctor'
import { apply, diff, plan } from './init'

// Node's globals, typed locally so the package needs no @types/node.
interface Proc {
  argv: string[]
  env: Record<string, string | undefined>
  exit(code?: number): never
  stdin: { setEncoding(e: string): void; on(ev: 'data', cb: (chunk: string) => void): void; on(ev: 'end', cb: () => void): void }
  stdout: { write(s: string): boolean }
  stderr: { write(s: string): boolean }
}
const proc = (globalThis as unknown as { process: Proc }).process

const HELP = `trckable ${MCP_VERSION}: tiny analytics that shows which traffic pays

usage:
  npx trckable mcp [--host URL] [--key tkb_live_…]
      Run the MCP server for any MCP-capable assistant (stdio).
      Reads TRCKABLE_HOST and TRCKABLE_API_KEY when the flags are omitted.
      Create a read-only key in your dashboard: Settings → API keys.

  npx trckable init --host URL --site tkb_… [--yes]
      Look at this project, print exactly what would change, and write it
      only with --yes. It never edits checkout or payment code.

  npx trckable doctor [--host URL] [--site tkb_…] [--url https://your.site]
      Check an install from the outside: is the server there, is the script
      served, will browsers be allowed to post, does trckable see a real
      address, and is the snippet on your page. It reads only.

  npx trckable help

docs: https://trckable.com/docs`

function flag(name: string): string | undefined {
  const i = proc.argv.indexOf('--' + name)
  if (i > 0) return proc.argv[i + 1]
  const eq = proc.argv.find((a) => a.startsWith(`--${name}=`))
  return eq?.slice(name.length + 3)
}

function mcp() {
  const host = flag('host') ?? proc.env.TRCKABLE_HOST
  const apiKey = flag('key') ?? proc.env.TRCKABLE_API_KEY
  if (!host || !apiKey) {
    proc.stderr.write('trckable mcp: set TRCKABLE_HOST (your trckable URL) and TRCKABLE_API_KEY (Settings → API keys).\n')
    return proc.exit(2)
  }
  const server = createMcpServer({ host, apiKey })
  let buf = ''
  let pending = 0
  let ended = false
  const done = () => ended && pending === 0 && proc.exit(0)
  proc.stdin.setEncoding('utf8')
  proc.stdin.on('data', (chunk) => {
    buf += chunk
    let nl: number
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 1)
      if (!line) continue
      let msg: Parameters<typeof server.handle>[0]
      try {
        msg = JSON.parse(line)
      } catch {
        proc.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }) + '\n')
        continue
      }
      pending++
      server
        .handle(msg)
        .then((res) => res && proc.stdout.write(JSON.stringify(res) + '\n'))
        .catch((e) => proc.stderr.write(`trckable mcp: ${e}\n`))
        .finally(() => {
          pending--
          done()
        })
    }
  })
  proc.stdin.on('end', () => {
    ended = true
    done()
  })
  proc.stderr.write(`trckable mcp ${MCP_VERSION} connected to ${host}\n`)
}

async function initCmd() {
  const host = flag('host') ?? proc.env.TRCKABLE_HOST
  const site = flag('site') ?? proc.env.TRCKABLE_SITE
  if (!host || !site) {
    proc.stderr.write('trckable init: pass --host https://stats.yoursite.com and --site tkb_… (Settings → Install).\n')
    return proc.exit(2)
  }
  const fs = await import('node:fs/promises')
  const io = {
    host,
    site,
    dir: flag('dir') ?? '.',
    read: async (path: string) => fs.readFile(path, 'utf8').catch(() => null),
    exists: async (path: string) =>
      fs
        .stat(path)
        .then(() => true)
        .catch(() => false),
    save: async (path: string, body: string) => {
      await fs.mkdir(path.slice(0, path.lastIndexOf('/')) || '.', { recursive: true })
      await fs.writeFile(path, body)
    },
  }
  const p = await plan(io)
  proc.stdout.write(`trckable init — ${p.framework}\n\n`)
  for (const c of p.changes) proc.stdout.write(diff(c) + '\n\n')
  if (p.note) proc.stdout.write(p.note + '\n\n')

  const yes = proc.argv.includes('--yes') || proc.argv.includes('-y')
  if (!yes) {
    proc.stdout.write('Nothing was written. Run again with --yes to apply the changes above.\n')
    return
  }
  const written = await apply(io, p)
  proc.stdout.write(written.length ? `Wrote:\n${written.map((w) => '  ' + w).join('\n')}\n` : 'Nothing to write — the rest is by hand.\n')
  proc.stdout.write(`\nThen: npx trckable doctor --host ${host} --site ${site}\n`)
}

async function doctorCmd() {
  const host = flag('host') ?? proc.env.TRCKABLE_HOST
  if (!host) {
    proc.stderr.write('trckable doctor: pass --host https://stats.yoursite.com (or set TRCKABLE_HOST).\n')
    return proc.exit(2)
  }
  const checks = await doctor({ host, site: flag('site') ?? proc.env.TRCKABLE_SITE, url: flag('url') })
  proc.stdout.write(format(checks) + '\n')
  if (checks.some((c) => !c.ok)) proc.exit(1)
}

switch (proc.argv[2]) {
  case 'init':
    void initCmd()
    break
  case 'doctor':
    void doctorCmd()
    break
  case 'mcp':
    mcp()
    break
  case 'version':
  case '--version':
  case '-v':
    proc.stdout.write(MCP_VERSION + '\n')
    break
  case undefined:
  case 'help':
  case '--help':
  case '-h':
    proc.stdout.write(HELP + '\n')
    break
  default:
    proc.stderr.write(`unknown command "${proc.argv[2]}"\n\n${HELP}\n`)
    proc.exit(2)
}
