// A second account for the suite's viewer, made the way a later version's
// invitations will: through the store's own tables, never through a product
// route (no route lets anyone join a second account yet). The server keeps
// running; the database is shared (WAL), and a busy moment is waited out.
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'

export interface Team {
  account: string
  owner: string
  sites: { id: string; domain: string }[]
}

/** A team with its own owner and sites, and `viewer` (an existing person, by
 *  address) in it as a viewer who may see only the sites in `allowed`. */
export async function seedTeam(viewer: string, tag: string, domains: string[], allowed: number[]): Promise<Team> {
  // Experimental in Node 22 and quiet about it once loaded.
  const { DatabaseSync } = (await import('node:sqlite')) as { DatabaseSync: new (path: string) => { exec(sql: string): void; prepare(sql: string): { run(...a: unknown[]): unknown; get(...a: unknown[]): unknown }; close(): void } }
  const db = new DatabaseSync(join(process.env.TRCKABLE_DATA_DIR!, 'trckable.db'))
  try {
    db.exec('PRAGMA busy_timeout = 10000; PRAGMA foreign_keys = ON')
    const now = Math.floor(Date.now() / 1000)
    const account = `acc_${randomBytes(6).toString('hex')}`
    const owner = `boss-${tag}@team.example`
    const ownerId = `usr_${randomBytes(6).toString('hex')}`
    const who = db.prepare('SELECT id FROM users WHERE email = ?').get(viewer) as { id: string }
    db.exec('BEGIN IMMEDIATE')
    db.prepare('INSERT INTO accounts (id, created_at) VALUES (?, ?)').run(account, now)
    // An owner nobody signs in as: its password hash is not a hash.
    db.prepare("INSERT INTO users (id, account_id, email, password_hash, role, created_at) VALUES (?, ?, ?, '-', 'owner', ?)").run(ownerId, account, owner, now)
    db.prepare("INSERT INTO memberships (user_id, account_id, role, created_at) VALUES (?, ?, 'owner', ?)").run(ownerId, account, now)
    db.prepare("INSERT INTO memberships (user_id, account_id, role, created_at) VALUES (?, ?, 'viewer', ?)").run(who.id, account, now + 1)
    const sites = domains.map((domain) => ({ id: `tkb_${randomBytes(8).toString('hex').slice(0, 12)}`, domain }))
    for (const s of sites) {
      db.prepare('INSERT INTO sites (id, account_id, domain, name, created_at, proxy_key) VALUES (?, ?, ?, ?, ?, ?)').run(s.id, account, s.domain, s.domain, now, `tkb_px_${randomBytes(16).toString('hex')}`)
    }
    db.prepare('INSERT INTO site_access (subject, account_id, sites, updated_at) VALUES (?, ?, ?, ?)').run(who.id, account, JSON.stringify(allowed.map((i) => sites[i].id).sort()), now)
    db.exec('COMMIT')
    return { account, owner, sites }
  } finally {
    db.close()
  }
}
