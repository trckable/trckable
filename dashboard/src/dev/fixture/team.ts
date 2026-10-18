// A team of eight sites in every state, for the team overview prototype (?fixture=team). A development build only.
import type { TeamSite } from '../../views/team/model'

const BASE = {
  work: (h: number) => 0.35 + Math.sin(((h - 5) / 18) * Math.PI),
  late: (h: number) => 0.3 + Math.sin(((h - 9) / 18) * Math.PI),
  even: (h: number) => 0.7 + Math.sin((h / 24) * Math.PI * 2) * 0.15,
}

/** A day's curve, 24 hourly buckets up to the hour the page stands at: a smooth shape scaled to the day's visitors, with a small fixed wobble. */
function day(total: number, shape: 'work' | 'even' | 'late', upTo = 14, dip?: [number, number]): number[] {
  const w = Array.from({ length: 24 }, (_, h) => {
    const base = BASE[shape](h)
    return Math.max(0.05, base) * (1 + ((h * 37) % 7) / 40)
  }).slice(0, upTo + 1)
  const sum = w.reduce((a, b) => a + b, 0)
  return w.map((v, h) => Math.round((v / sum) * total * (dip && h >= dip[0] && h <= dip[1] ? 0.05 : 1)))
}

const USD = { currency: 'USD', exponent: 2 }

export const teamFixture: TeamSite[] = [
  { id: 'trk', name: 'trckable.com', color: 'hsl(76 85% 60%)', status: 'ok', online: 19, today: 931, usual: 710, series: day(931, 'work'), topSource: 'Hacker News', revenue: 21800, ...USD },
  { id: 'shop', name: 'shop.example.dev', color: 'hsl(210 80% 66%)', status: 'down', note: '23 min', online: 0, today: 783, usual: 1290, series: day(783, 'work', 14, [11, 13]), topSource: 'Google', revenue: 8750, ...USD },
  { id: 'alb', name: 'albas.al', color: 'hsl(28 90% 62%)', status: 'quiet', note: '7 h without a visit', online: 0, today: 41, usual: 58, series: day(41, 'late', 7), topSource: 'Direct', ...USD },
  { id: 'docs', name: 'docs.trckable.com', color: 'hsl(260 70% 70%)', status: 'ok', online: 8, today: 412, usual: 396, series: day(412, 'work'), topSource: 'Google', ...USD },
  { id: 'bot', name: 'coach-bot.de', color: 'hsl(160 60% 52%)', status: 'ok', online: 23, today: 1204, usual: 1075, series: day(1204, 'even'), topSource: 'ChatGPT', revenue: 14300, ...USD },
  { id: 'notes', name: 'fieldnotes.io', color: 'hsl(340 75% 66%)', status: 'ok', online: 3, today: 266, usual: 330, series: day(266, 'late'), topSource: 'Newsletter', ...USD },
  { id: 'status', name: 'status.example.dev', color: 'hsl(190 70% 56%)', status: 'unverified', note: 'Script not found', online: 0, today: 0, ...USD },
  { id: 'new', name: 'launchpad.new', color: 'hsl(45 85% 60%)', status: 'new', online: 0, today: 0, ...USD },
]
