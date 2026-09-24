// Channel colors follow the entity, never its rank: "AI" is always pink, even
// when a filter leaves it the only row. Values live in styles.css as
// --ch-* tokens (validated for dark and light surfaces and colour-blind
// readers with the dataviz palette validator).
const CHANNELS = ['Direct', 'Search', 'Social', 'Referral', 'AI', 'Email', 'Paid'] as const

export const channelColor = (name: string) => {
  const i = CHANNELS.indexOf(name as (typeof CHANNELS)[number])
  return i < 0 ? 'var(--text-3)' : `var(--ch-${i + 1})`
}

export const channelLabel = (name: string) => (name === 'AI' ? 'AI assistants' : name || 'Direct')
