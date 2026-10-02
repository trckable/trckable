// The words of the live extras: the count in the tab, the sale toast, the
// browser notices and the card that asks for them. This is what moves to the
// message files.
export const signals = {
  sale: (amount: string) => `Cha-ching! ${amount}`,
  // Settings.
  on: 'On',
  off: 'Off',
  tab: { label: 'Live count in the tab', hint: 'A ● and how many are online, in the title of this browser tab' },
  sound: { label: 'Sale sound', hint: 'A short chime when a payment arrives' },
  notify: { label: 'Browser notices', hint: 'A first sale from a new source, a spike, or tracking stopping, while a trckable tab is open' },
  blocked: 'Notices are blocked for this site: allow them in your browser’s site settings',
  // The notices themselves.
  firstSource: (source: string) => `First sale from ${source}`,
  firstSourceBody: (domain: string) => `${domain} has a new paying source`,
  spike: (n: number) => `${n} online: about three times usual`,
  spikeBody: (domain: string) => `${domain} is busier than it has been in this tab`,
  stopped: (domain: string) => `Tracking stopped on ${domain}`,
  stoppedBody: (hours: number) => `Nothing has arrived for ${hours} hours`,
  // The side card.
  card: {
    label: 'Notices',
    title: 'Get notified?',
    body: 'A notice for a first sale from a new source, a spike or tracking stopping. Only while a trckable tab is open.',
    yes: 'Turn on',
    close: 'Close',
  },
}
