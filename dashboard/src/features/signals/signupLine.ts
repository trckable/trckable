// A signup on the stream as one line: "New signup · Lively Ibis · google.com". The cookieless site has no name to give.
import type { Visit } from '../../lib/api'
import { channelLabel } from '../../lib/palette'
import { nameOf } from '../../lib/visitor'
import { signals } from './copy'

/** Where the person came from: the site that sent them, else the channel. */
export const sourceOf = (v: Pick<Visit, 'referrer' | 'channel'>): string => (v.referrer ? v.referrer.replace(/^www\./, '') : channelLabel(v.channel || 'Direct'))

export const signupLine = (v: Visit): string => signals.signup(v.visitor ? nameOf(v.visitor) : '', sourceOf(v))

/** The stream's visits that are someone reaching the signup goal. */
export const isSignup = (v: { kind: string; goal?: string }, goal: string | undefined): boolean => !!goal && v.kind === 'goal' && v.goal === goal
