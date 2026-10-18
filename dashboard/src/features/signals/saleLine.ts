// A sale on the stream as one line: what the server said it was ("New customer
// · $42 · via Google"), with its own time when it was found late; an older
// server's sale is the amount.
import type { Sale } from '../../lib/api'
import { fmtMoney, dateFmt } from '../../lib/format'
import { signals } from './copy'

const time = (ms: number) => dateFmt(undefined, { hour: '2-digit', minute: '2-digit' }).format(ms)

export function saleLine(s: Sale): string {
  if (!s.text) return signals.sale('+' + fmtMoney(s.amount, s.currency, s.exponent))
  return s.late ? signals.late(s.text, time(s.ts)) : s.text
}

/** Arriving now and adding money: what the chime and the Live pulse are for. */
export const arriving = (s: Sale) => !s.late && s.change !== 'refund'
