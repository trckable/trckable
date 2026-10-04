// Every word of "exclude my visits": the avatar menu's item, the first day's
// card (its own are in moments/copy.ts) and the Settings field.
export const copy = {
  leave: 'Exclude this browser',
  again: 'Count this browser again',
  ips: {
    label: 'Exclude IP ranges',
    hint: 'Up to 50. Never counted, never stored',
    placeholder: '203.0.113.7\n198.51.100.0/24\n2001:db8::/32',
    bad: (line: string) => `${line} is not an IP address or a range like 203.0.113.0/24`,
    many: 'Up to 50 addresses',
    saved: (n: number) => `${n} ${n === 1 ? 'address' : 'addresses'} excluded`,
    cleared: 'No addresses are excluded now',
  },
}
