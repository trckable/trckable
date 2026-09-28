// The dialog's left column: the four kinds of card.
import { BarChart3, LayoutDashboard, MessageSquareText, Sparkles, type LucideIcon } from 'lucide-react'
import { TEMPLATES, type Template } from './card'
import { copy } from './copy'

const ICONS: Record<Template, LucideIcon> = { spotlight: Sparkles, leaderboard: BarChart3, dashboard: LayoutDashboard, post: MessageSquareText }

export function Templates({ value, onChange }: { value: Template; onChange: (t: Template) => void }) {
  return (
    <div className="sd-templates" role="radiogroup" aria-label={copy.templates}>
      {TEMPLATES.map((t) => {
        const Icon = ICONS[t]
        return (
          <button key={t} type="button" role="radio" aria-checked={value === t} className="sd-template" onClick={(e) => {
            onChange(t)
            e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' })
          }}>
            <span className="sd-template-icon" aria-hidden="true">
              <Icon size={17} strokeWidth={1.8} />
            </span>
            <span className="sd-template-text">
              <b>{copy.template[t].name}</b>
              <span>{copy.template[t].hint}</span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
