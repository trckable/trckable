// A mark per provider, for the payments dialogs and rows.
/**
 * A mark per provider, drawn in trckable's own hand. Not their logo: shipping
 * someone else's trademark would mean bundling their assets and following
 * their brand rules, and a copy in the wrong colour is worse than a clean
 * shape of our own. The tint follows each brand, so they stay recognisable.
 */
const MARKS: Record<string, { tint: string; d: string }> = {
  // Stripe: the slanted S, as two strokes.
  stripe: { tint: '#635bff', d: 'M15 7.5c-1-.6-2.2-1-3.4-1-1.6 0-2.6.7-2.6 1.7 0 2.6 6.4 1.6 6.4 5.6 0 2-1.8 3.2-4.3 3.2-1.4 0-2.9-.4-4.1-1' },
  // Lemon Squeezy: a lemon.
  lemonsqueezy: { tint: '#ffc233', d: 'M7 15.5c2.4 2.4 7 2.6 9.4.2s2.2-7-.2-9.4c-1.6 1.6-3 1-5 1.4s-3.6 1.8-4 3.6.2 3 .2 3z' },
  // Polar: a circle with a bite of light, like the pole at midnight.
  polar: { tint: '#0062ff', d: 'M12 4a8 8 0 1 0 0 16 8 8 0 0 0 0-16Zm0 4a4 4 0 1 1 0 8' },
  // Paddle: a paddle blade.
  paddle: { tint: '#ffd400', d: 'M12 3c3.3 0 6 2.7 6 6s-2.7 6-6 6-6-2.7-6-6 2.7-6 6-6Zm0 12v6' },
  // Dodo: a bird, in three strokes.
  dodo: { tint: '#f97316', d: 'M7 17c0-4 2.5-7 6-7 1.7 0 3 .8 3.7 1.8M16.7 11.8 20 9m-9 8h5M8 10.5h.01' },
  // Gumroad: a road, the brand's pink.
  gumroad: { tint: '#ff90e8', d: 'M5 16c2-6 5-9 14-9M5 16c3 1 8 1 11-1' },
  // PayPal: two stacked P strokes.
  paypal: { tint: '#003087', d: 'M8 20 10 6h5a3 3 0 0 1 0 6h-4M6 20l1.5-9' },
  // Anything else, connected by webhook.
  custom: { tint: '#9ca3af', d: 'M4 12h4l2-5 4 10 2-5h4' },
}

export function ProviderMark({ id }: { id: string }) {
  const m = MARKS[id] ?? MARKS.custom
  return (
    <span className="prov-mark" aria-hidden="true" style={{ background: `color-mix(in srgb, ${m.tint} 16%, transparent)`, color: m.tint }}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
        <path d={m.d} />
      </svg>
    </span>
  )
}
