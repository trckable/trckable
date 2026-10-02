// The small pieces of Settings → Alerts that need no state: how a destination
// is stored and named, what to do about a failed test, and how long ago.
import { Bell, Check, Mail, MessageSquare, Send, TriangleAlert, Webhook } from 'lucide-react'

// Email addresses are stored as mailto: targets and shown without it.
export const shown = (t: string) => t.replace(/^mailto:/, '')
export const stored = (t: string) => (/^[^\s@/:]+@[^\s@/]+\.[^\s@/]+$/.test(t.trim()) ? 'mailto:' + t.trim() : t.trim())

// What the destination is, from its address.
export function kindOf(t: string): { name: string; Icon: typeof Bell } | null {
  const v = t.trim()
  if (!v) return null
  if (/^[^\s@/:]+@[^\s@/]+\.[^\s@/]+$/.test(v) || v.startsWith('mailto:')) return { name: 'Email', Icon: Mail }
  if (/hooks\.slack\.com/.test(v)) return { name: 'Slack', Icon: MessageSquare }
  if (/discord(app)?\.com\/api\/webhooks/.test(v)) return { name: 'Discord', Icon: MessageSquare }
  if (/^https?:\/\//.test(v)) return { name: 'Webhook', Icon: Webhook }
  return null
}

// The destination as the summary line names it: the address, or the host.
export function whereOf(target: string): string {
  if (!target.trim()) return ''
  if (target.includes('@') && !target.startsWith('http')) return shown(target)
  try {
    return new URL(stored(target)).host
  } catch {
    return target
  }
}

// What to do about a failed test, in words.
export function advice(why: string): string {
  if (/not reachable from outside|private|internal/i.test(why)) return 'Use a public https address: trckable never calls addresses inside your own network.'
  if (/email is not set up|SMTP/i.test(why)) return 'Set TRCKABLE_SMTP_URL on the server, or send them to a webhook instead.'
  if (/40[0-9]|invalid|not found/i.test(why)) return 'The other end refused it: check the webhook URL is complete and still active.'
  if (/timeout|deadline|refused|no such host/i.test(why)) return 'The other end did not answer: check the address, or try again in a moment.'
  return 'Check the address and try again.'
}

// The test button, by where the last test got to.
export const SEND_LABEL = { idle: 'Send a test', busy: 'Sending…', ok: 'Delivered', bad: 'Try again' }

export function SendIcon({ state }: { state?: 'busy' | 'ok' | 'bad' }) {
  if (state === 'ok') return <Check size={15} strokeWidth={2.4} />
  if (state === 'bad') return <TriangleAlert size={15} strokeWidth={2} />
  return <Send size={15} strokeWidth={1.75} />
}

export function ago(unix: number): string {
  const s = Math.max(0, Date.now() / 1000 - unix)
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return `${Math.round(s / 86400)} days ago`
}
