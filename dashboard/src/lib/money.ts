import type { Money } from './api'

/** Why some payments are not in the totals: a rate still to come, or none at all. */
export function unconvertedNote(money: Money): string {
  const payments = money.unconverted === 1 ? '1 payment' : `${money.unconverted} payments`
  if (money.no_rate?.length)
    return `${payments} in other currencies aren't counted: the ECB publishes no exchange rate for ${money.no_rate.join(', ')}, so they can't be converted into ${money.currency}.`
  return `${payments} in other currencies wait for today's ECB exchange rate and aren't counted yet.`
}
