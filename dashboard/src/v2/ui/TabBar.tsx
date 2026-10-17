// The phone's bar at the bottom: Live, Briefing, Explore. The chosen one is lime; the bar keeps clear of the home indicator.
import { Ico } from './icons'

type TabKey = 'live' | 'briefing' | 'explore'

const ICON = {
  live: (
    <>
      <circle cx="12" cy="12" r="2.4" />
      <path d="M7.5 7.5a6.4 6.4 0 0 0 0 9M16.5 7.5a6.4 6.4 0 0 1 0 9" />
    </>
  ),
  briefing: <path d="M6 3h9l4 4v14H6zM9 12h7M9 16h7M9 8h3" />,
}

export function TabBar({ value, onChange, labels, hide }: { value: TabKey | null; onChange: (t: TabKey) => void; labels: Record<TabKey, string>; /** Tabs this page does not have (a shared link has no Live). */ hide?: TabKey[] }) {
  const tab = (k: TabKey) => (
    <button key={k} type="button" className={value === k ? 'on' : ''} aria-current={value === k ? 'page' : undefined} onClick={() => onChange(k)}>
      {k === 'explore' ? (
        <Ico name="search" strokeWidth={1.7} />
      ) : (
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {ICON[k]}
        </svg>
      )}
      {labels[k]}
    </button>
  )
  return (
    <nav className="tabbar" aria-label="Views">
      {(['live', 'briefing', 'explore'] as const).filter((k) => !hide?.includes(k)).map(tab)}
    </nav>
  )
}
