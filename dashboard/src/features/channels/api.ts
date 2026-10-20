// The team's own social accounts (Channels): what the server answers, and the two calls the page makes. Connecting is a
// browser visit to the server's start address, which sends the person to the platform and back; there is no call for it.
import { call } from '../../lib/api'

export type Platform = 'youtube' | 'instagram' | 'threads'

/** Every platform, in the order the section shows them. */
export const PLATFORMS: readonly Platform[] = ['youtube', 'instagram', 'threads']

export const PERIODS = [7, 30, 90] as const
export type Days = (typeof PERIODS)[number]

export interface ChannelAccount {
  id: string
  platform: Platform
  handle: string
  created_at: number
  last_ok_at?: number
  /** A short code of why the last read failed: denied, expired, limited or failed. */
  error?: string
}

export interface ChannelCard {
  platform: Platform
  /** The server has this platform's app keys: Connect works. */
  ready: boolean
  accounts: ChannelAccount[]
  monitoring: number
  /** Absent until an account has been read once: not zero, unknown. */
  views?: number
  /** The period before, only told when the history reaches back that far. */
  previous?: number
  /** The day the numbers start from, when the period began earlier. */
  from?: string
  series: { day: string; views: number }[]
}

export interface Channels {
  /** The instance is self-hosted, so its owner can set the app keys: show how. Managed, there is nothing to set up. */
  setup_docs: boolean
  days: number
  /** The newest day counted (YYYY-MM-DD). */
  through: string
  platforms: ChannelCard[]
}

export const channelsApi = {
  read: (days: number, signal?: AbortSignal) => call<Channels>('GET', `/channels?days=${days}`, undefined, signal),
  disconnect: (id: string) => call<unknown>('DELETE', `/channels/accounts/${encodeURIComponent(id)}`),
}

/** Where the browser goes to connect a platform. */
export const startUrl = (p: Platform) => `/api/v1/channels/${p}/start`
