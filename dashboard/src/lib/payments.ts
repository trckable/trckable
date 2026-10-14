import type { PayConnection } from './api'
import { relativeAgo } from './format'

// The payment settings' words, apart from the screens that show them
// (views/Payments.tsx).

/** Where a connection stands, in one colour and a few words. */
export function statusOf(c: PayConnection) {
  const live = c.last_event_at
  if (!c.has_secret) return { tone: 'var(--money)', text: 'Needs its signing secret' }
  if (live) return { tone: 'var(--up)', text: `Receiving payments · ${relativeAgo(live)}` }
  if (c.payments > 0) return { tone: 'var(--up)', text: 'Payments recorded' }
  if (c.last_test_event_at) return { tone: 'var(--up)', text: 'Test event received' }
  return { tone: 'var(--text-3)', text: 'Waiting for the first payment' }
}

/** Providers whose test environment is called a sandbox. */
const SANDBOX_NAMED = new Set(['polar', 'paddle', 'paypal'])

/** What a provider calls its test environment. */
export function testModeName(provider: string) {
  if (SANDBOX_NAMED.has(provider)) return 'Sandbox'
  return 'Test'
}

/** The small tag on a connection that runs in test mode. */
export function modeTag(provider: string) {
  if (SANDBOX_NAMED.has(provider)) return 'Sandbox'
  return 'test mode'
}

/** Paddle's key says live or sandbox itself, so the switch has no say once a key is typed. */
export function keyPicksMode(provider: string, key: string) {
  return provider === 'paddle' && key.trim() !== ''
}
