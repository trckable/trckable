// The site in the header, and the list that opens from it (SiteList): every site with who is on it now, a finder, and what
// belongs to this site. The check beside the name says when something independent vouches for the numbers.
import { Suspense, useCallback, useRef, useState, type ReactNode } from 'react'
import type { Site } from '../../lib/api'
import { lazyLoad, warm } from '../../lib/lazyLoad'
import { layoutReady, preloadLayout } from '../../features/sites/useSiteLayout'
import { dotState } from '../../features/sites/StateDot'
import { VerifiedPill } from '../../features/verified/VerifiedPill'
import { useDomainControl } from '../../lib/domainControl'
import { copy } from '../copy'
import { domainLabel } from './DomainRows'
import { MenuFoot, type FootItem } from './MenuFoot'
import { useMenu } from './useMenu'
import { SetupLine } from './SetupLine'
import { WorkspaceRow, type Workspace } from './WorkspaceRow'
import { useTopLayerWhen } from '../../lib/topLayer'
import { currentWorkspace, menuVariant, slimMenu, ThinAccount, AccountView, AccountChips, accountSites, byAccount, teams, TeamMenu } from './menuProto'

const SiteList = lazyLoad(() => import('./SiteList').then((m) => ({ default: m.SiteList })))
const warmUp = () => {
  SiteList.preload()
  preloadLayout()
}
/** The list opens whole and in its final order: its chunk is waited for, and the layout (300 ms at most), rather than shown late. */
const LAYOUT_WAIT = 300

const DOT: Record<string, string> = { stopped: 'down', quiet: 'quiet' }

interface SiteMenuProps {
  sites: Site[]
  current: Site | null
  /** The workspace line at the top, when the account has one. */
  workspace?: Workspace
  onPick: (id: string) => void
  footer: FootItem[]
  find: string
  all: string
}

export function SiteChip({ p }: { p: SiteMenuProps }) {
  const { open, setOpen, attach, close } = useMenu()
  const [accounts, setAccounts] = useState(false)
  const [acct, setAcct] = useState(0)
  const [team, setTeam] = useState(0)
  const menu = useRef<HTMLDivElement>(null)
  useTopLayerWhen(open, menu)
  const cur = p.current
  const domains = useDomainControl()
  const picked = cur && domains ? domainLabel(domains) : null
  const state = cur ? dotState(cur) : 'live'
  const toggle = () => {
    setAccounts(false)
    if (open) setOpen(false)
    else void Promise.all([layoutReady(LAYOUT_WAIT), SiteList.load()]).then(() => setOpen(true))
  }
  const done = useCallback(() => close(), [close])
  const slim = slimMenu()
  const variant = menuVariant()
  const baseline = p.workspace ?? (variant === 'current' ? currentWorkspace : undefined)
  let account: ReactNode = baseline && <WorkspaceRow w={baseline} close={done} />
  if (variant === 'a') account = <ThinAccount onOpen={() => setAccounts(true)} />
  if (variant === 'e') account = <AccountChips at={acct} onPick={setAcct} />
  const scoped = variant === 'f' || variant === 'g'
  const own = variant === 'e' || scoped ? accountSites(p.sites, acct) : p.sites
  const shown = cur && own.some((s) => s.id === cur.id) ? cur : (own[0] ?? cur)
  const label = scopedLabel(shown, p.all)
  const footer = <MenuFoot items={slim ? p.footer.filter((f) => f.key === 'add') : p.footer} done={done} />
  return (
    <div ref={attach} style={{ position: 'relative' }} className="sitechip">
      {scoped && <TeamMenu kind={variant} at={acct} onPick={setAcct} />}
      <button type="button" id="siteBtn" className="mk-chip" aria-haspopup="menu" aria-expanded={open} data-key="site" {...warm(warmUp)} onClick={toggle}>
        <span className={`mk-dot ${DOT[state] ?? ''}`} />
        <span className="nmx">{label}</span>
        {picked && <span className="dom">{`/ ${picked}`}</span>}
        <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
          <path d="M3 4.5 6 7.5 9 4.5" stroke="var(--mk-muted)" fill="none" strokeWidth="1.5" />
        </svg>
        <span className="mk-kbd">{'S'}</span>
      </button>
      {cur && <VerifiedPill verified={cur.verified} site={cur} seal />}
      <div ref={menu} className={`mk-menu sites${open ? ' on' : ''}`} id="siteMenu" role={open ? 'dialog' : undefined} aria-label={open ? copy.sites : undefined}>
        {open && accounts && <AccountView back={() => setAccounts(false)} close={done} />}
        {open && !accounts && (
          <Suspense fallback={null}>
            <SiteList
              sites={own}
              byAccount={variant === 'd' ? byAccount(p.sites) : undefined}
              team={teams[team]}
              onTeam={(n) => setTeam(Math.max(0, teams.indexOf(n)))}
              current={cur}
              workspace={
                <>
                  {account}
                  <SetupLine close={done} />
                </>
              }
              onPick={p.onPick}
              footer={footer}
              find={p.find}
              all={p.all}
              slim={slim}
              close={done}
            />
          </Suspense>
        )}
      </div>
    </div>
  )
}
const scopedLabel = (s: Site | null | undefined, all: string) => (s ? s.name || s.domain : all)
