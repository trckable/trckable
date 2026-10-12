// `pnpm dev`: everything a contributor needs, from a fresh clone after `pnpm install`.
//
//   pnpm dev    builds the tracker and (once) the dashboard, then starts the server
//               on http://localhost:8080 with its data in ./data, and the
//               dashboard's live-reload server on http://localhost:5173
//
// Edit the dashboard on :5173 and it reloads by itself. The server on :8080
// serves the build of the dashboard made at start-up; restart to refresh it.
// Delete ./data for a clean instance.
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const fail = (msg) => {
  console.error(`\n${msg}\n`)
  process.exit(1)
}

const [nodeMajor] = process.versions.node.split('.').map(Number)
if (nodeMajor < 22) fail(`Node 22 or newer is needed (this is ${process.versions.node}).`)
if (spawnSync('go', ['version']).status !== 0) fail('Go is needed (version in server/go.mod): https://go.dev/dl/')
if (!existsSync(join(root, 'node_modules'))) fail('Run `pnpm install` first.')

const run = (cmd, args, cwd) => {
  const r = spawnSync(cmd, args, { cwd: join(root, cwd), stdio: 'inherit' })
  if (r.status !== 0) fail(`${cmd} ${args.join(' ')} failed in ${cwd}/`)
}

console.log('Building the tracker...')
run('pnpm', ['build'], 'tracker')
if (!existsSync(join(root, 'server/internal/web/dist/index.html'))) {
  console.log('Building the dashboard (first run)...')
  run('pnpm', ['exec', 'vite', 'build'], 'dashboard')
  writeFileSync(join(root, 'server/internal/web/dist/.keep'), '') // the build empties the folder; .keep is tracked
}

const children = [
  spawn('go', ['run', './cmd/trckabled', 'serve'], {
    cwd: join(root, 'server'),
    stdio: 'inherit',
    env: { ...process.env, TRCKABLE_DATA_DIR: join(root, 'data'), TRCKABLE_ADDR: ':8080', TRCKABLE_UPDATE_CHECK: 'off' },
  }),
  spawn('pnpm', ['exec', 'vite', '--port', '5173', '--strictPort'], { cwd: join(root, 'dashboard'), stdio: 'inherit' }),
]
console.log('\nServer:    http://localhost:8080  (the setup link is printed below on first start)')
console.log('Dashboard: http://localhost:5173  (live reload)\n')

let stopping = false
const stop = (code = 0) => {
  if (stopping) return
  stopping = true
  for (const c of children) c.kill('SIGTERM')
  setTimeout(() => process.exit(code), 500)
}
for (const c of children) c.on('exit', (code) => stop(code ?? 1))
process.on('SIGINT', () => stop(0))
process.on('SIGTERM', () => stop(0))
