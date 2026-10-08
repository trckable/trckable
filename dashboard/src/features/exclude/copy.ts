// Every word of "exclude my visits": the avatar menu's item, the first day's
// card (its own are in moments/copy.ts) and the Settings field.
import { defineCopy } from '../../i18n'

export const copy = defineCopy('exclude', {
  leave: 'Exclude this browser',
  again: 'Count this browser again',
  ips: {
    label: 'Exclude IP ranges',
    hint: 'Up to 50. Never counted, never stored',
    placeholder: '203.0.113.7\n198.51.100.0/24\n2001:db8::/32',
    bad: (line: string) => `“${line}” isn’t an IP address. Use one like 203.0.113.7 or a range like 203.0.113.0/24, one per line.`,
    many: 'Use 50 addresses or fewer. Remove a few.',
    saved: (n: number) => `${n} ${n === 1 ? 'address' : 'addresses'} excluded`,
    cleared: 'No addresses are excluded now',
  },
})
