// What to share: the kinds of picture.
import { BarChart3, LayoutDashboard, MessageSquareText, type LucideIcon } from 'lucide-react'
import { TEMPLATES, type Template } from './card'
import { copy } from './copy'

const ICONS: Record<Template, LucideIcon> = { overview: LayoutDashboard, leaderboard: BarChart3, post: MessageSquareText }

export function CardSection({ value, onChange }: { value: Template; onChange: (t: Template) => void }) {
  return (
    <div className="sd-chips" role="radiogroup" aria-label={copy.templates}>
      {TEMPLATES.map((t) => {
        const Icon = ICONS[t]
        return (
          <button key={t} type="button" role="radio" aria-checked={value === t} className="sd-chip" title={copy.template[t].hint} onClick={() => onChange(t)}>
            <Icon size={15} strokeWidth={1.8} aria-hidden="true" />
            {copy.template[t].name}
          </button>
        )
      })}
    </div>
  )
}
