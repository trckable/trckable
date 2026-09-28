// Where the site's own repo (trckable.com, its docs and figures) is checked out
// on this machine. It is not part of this repo, so nothing here names it:
//
//   TRCKABLE_SITE_REPO=/path/to/it            (wins), or
//   .trckable.local.json  {"siteRepo": "/path/to/it"}   (git-ignored, repo root;
//                                             a relative path is from the repo root)
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname

export function siteRepo({ required = true, env = process.env, root = ROOT } = {}) {
  let path = env.TRCKABLE_SITE_REPO || ''
  const file = resolve(root, '.trckable.local.json')
  if (!path && existsSync(file)) path = JSON.parse(readFileSync(file, 'utf8')).siteRepo || ''
  if (path) return resolve(root, path)
  if (required) throw new Error('The site repo is not set: export TRCKABLE_SITE_REPO=/path/to/it, or put {"siteRepo": "/path/to/it"} in .trckable.local.json at the repo root')
  return ''
}
