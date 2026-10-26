// "Attribute each sale": how each checkout passes the visitor id.
import { useState } from 'react'
import { CodeBlock } from '../components/Code'
import { Modal } from '../kit/Modal'
import { ProviderMark } from './ProviderMark'

const snippets: Record<string, string> = {
  'Payment links': `<!-- Nothing to do: the trckable script adds the visitor to
     Stripe Payment Links, Lemon Squeezy, Polar and Dodo checkout links on click. -->
<a href="https://buy.stripe.com/…">Buy</a>`,
  Stripe: `import { getIds, checkoutFields } from 'trckable/server'

const ids = getIds(request.headers.get('cookie'))
await stripe.checkout.sessions.create({
  ...params,
  ...checkoutFields('stripe', ids, 'subscription'), // or 'payment'
})`,
  'Lemon Squeezy': `const ids = getIds(request.headers.get('cookie'))
await createCheckout(storeId, variantId, {
  checkoutData: checkoutFields('lemonsqueezy', ids).checkout_data,
})`,
  Polar: `const ids = getIds(request.headers.get('cookie'))
await polar.checkouts.create({ products: [productId], ...checkoutFields('polar', ids) })`,
  Paddle: `// Paddle.js, in the browser: read the trckable_vid cookie
Paddle.Checkout.open({
  items,
  customData: { trckable_vid: document.cookie.match(/trckable_vid=([^;]+)/)?.[1] },
})`,
  Dodo: `const ids = getIds(request.headers.get('cookie'))
await dodo.checkoutSessions.create({ ...params, ...checkoutFields('dodo', ids) })`,
}

/** Which mark goes with which snippet tab. */
const SNIP_FOR: Record<string, string> = {
  'Payment links': 'custom',
  Stripe: 'stripe',
  'Lemon Squeezy': 'lemonsqueezy',
  Polar: 'polar',
  Paddle: 'paddle',
  Dodo: 'dodo',
}

export function Attribution({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState('Payment links')
  return (
    <Modal
      label="Attribute each sale"
      onClose={onClose}
      frame={{
        title: 'Attribute each sale',
        subtitle: 'Pass the visitor id to your checkout.',
        help: 'Renewals follow it automatically. Without it, revenue still counts in totals but shows as unattributed.',
        size: 'md',
        cancel: false,
        actions: (
          <button type="button" className="btn primary big" onClick={onClose}>
            Done
          </button>
        ),
      }}
    >
      <div className="prov-tabs" role="tablist" aria-label="Checkout">
        {Object.entries(SNIP_FOR).map(([label, id]) => (
          <button key={label} type="button" role="tab" aria-selected={tab === label} className={tab === label ? 'mtile on' : 'mtile'} onClick={() => setTab(label)}>
            <ProviderMark id={id} />
            {label}
          </button>
        ))}
      </div>
      <CodeBlock code={snippets[tab]} lang="text" />
    </Modal>
  )
}
