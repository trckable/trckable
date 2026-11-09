// The small marks on a payment's or customer's line: a country is its flag, a provider its mark, a source its mark,
// how it was paid its glyph. Each carries the words it replaces as its title and label.
import { Bitcoin, Building2, CreditCard, Smartphone, Unlink, Wallet, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { SourceMark } from '../../../../components/visitor/SourceMark'
import { countryName } from '../../../../lib/format'
import { channelLabel } from '../../../../lib/palette'
import { providerName } from '../../../../features/verified/model'
import { ProviderMark } from '../../../../views/ProviderMark'
import { Flag } from '../../../ui/Flag'
import { copy } from '../../copy'
import { methodLabel } from './customerModel'

/** A mark with its words: the title for a pointer, the label for a screen reader. */
function Tip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="xpm" role="img" title={label} aria-label={label}>
      {children}
    </span>
  )
}

export function CountryMark({ code }: { code?: string }) {
  if (!code) return null
  const name = countryName(code)
  return (
    <Tip label={name}>
      <Flag code={code} width={18} />
    </Tip>
  )
}

export function ProviderTag({ id }: { id?: string }) {
  if (!id) return null
  return (
    <Tip label={providerName(id)}>
      <ProviderMark id={id} />
    </Tip>
  )
}

export function SourceTag({ channel, referrer }: { channel?: string; referrer?: string }) {
  if (!channel) return null
  return (
    <Tip label={[channelLabel(channel), referrer].filter(Boolean).join(' · ')}>
      <SourceMark channel={channel} referrer={referrer} size={20} />
    </Tip>
  )
}

const METHODS: Record<string, LucideIcon> = { card: CreditCard, paypal: Wallet, apple_pay: Smartphone, google_pay: Smartphone, bank: Building2, crypto: Bitcoin }

/** How it was paid, as a glyph; nothing for "other" or when the provider does not say. */
export function MethodMark({ method }: { method?: string }) {
  const Icon = method ? METHODS[method] : undefined
  if (!Icon) return null
  return (
    <Tip label={methodLabel(method, copy.methods)}>
      <Icon size={13} strokeWidth={1.8} aria-hidden="true" />
    </Tip>
  )
}

/** A buyer whose payment is not tied to a visit, in the meta line. */
export function UnlinkedMark() {
  return (
    <Tip label={copy.pay.unlinked}>
      <Unlink size={13} strokeWidth={1.8} aria-hidden="true" />
    </Tip>
  )
}
