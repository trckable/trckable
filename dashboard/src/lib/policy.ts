// The paragraph a site needs in its privacy policy, written from what that
// site is actually set to collect. A generic one would be wrong the moment
// someone turns a module off; this one is read from the settings themselves,
// so it stays true, and it says plainly where it might not be enough.
import type { SiteConfig } from './api'

export type PolicyInput = {
  domain: string
  host: string // where trckable itself runs
  config: SiteConfig
  modules: Record<string, boolean>
}

// Semicolons, because the items have commas of their own: "your browser,
// operating system and device type" inside a comma-separated list reads as
// three separate things.
const join = (xs: string[]) => (xs.length < 2 ? (xs[0] ?? '') : xs.slice(0, -1).join('; ') + '; and ' + xs[xs.length - 1])

const retention = (days: number) =>
  days === 0
    ? 'Visit records are kept for as long as the site is running.'
    : `Visit records are deleted automatically after ${days} day${days === 1 ? '' : 's'}.`

/** The paragraph itself. Plain prose, no legalese: it has to be readable by
 *  the person it is about, which is the whole point of the requirement. */
export function policyText(p: PolicyInput): string {
  const collected = ['the page you are on', 'the site that sent you here']
  collected.push(p.config.record_city && !p.config.consent_free ? 'your country and city' : 'your country')
  collected.push('your browser, operating system and device type', 'how long you stayed')
  if (p.modules.goals) collected.push('which of a handful of marked actions you took, such as signing up')
  if (p.modules.outbound) collected.push('which links you followed away from the site, and which files you downloaded')

  const out: string[] = []
  out.push(`## Analytics on ${p.domain}`)
  out.push('')
  out.push(
    `We measure how ${p.domain} is used with trckable, an open-source analytics tool that we run ourselves on ${p.host}. ` +
      `No data about you is sent to any other company, and none of it is sold, shared or used for advertising.`,
  )
  out.push('')
  out.push(`**What is recorded.** For each visit: ${join(collected)}.`)
  out.push('')
  out.push(
    `**What is not recorded.** Your IP address is never stored. It is used once, in memory, to work out your country` +
      (p.config.record_city && !p.config.consent_free ? ' and city' : '') +
      `, and is then discarded — it is not written to a log or a database. We do not build a profile of you, and we cannot identify you from what is kept.`,
  )
  out.push('')
  // One module, two ways of asking; only trckable's own bar keeps the answer.
  const asks = p.modules.consent
  const ownBar = asks && p.config.banner?.mode === 'bar'
  if (asks && !p.config.consent_free) {
    out.push(
      `**Cookies, and only if you say so.** Until you answer our cookie banner, nothing about your visit is sent. If you decline, your visit is not counted at all. If you leave without answering, the pages you saw are counted without a cookie, using a number derived from your request that changes every day. ` +
        `If you agree, one cookie, \`trckable_vid\`, holds a random number so that a return visit is not counted as a new person. ` +
        `It contains no personal data, is not readable by anyone else, and is never used for advertising. If you change your mind, that cookie is deleted.` +
        (ownBar ? ` Your answer itself — yes or no — is kept in your browser, so that we do not ask again on every page.` : ''),
    )
  } else if (p.config.consent_free) {
    out.push(
      `**No cookies, and nothing stored on your device.** trckable is running in cookieless mode: it sets no cookie and stores nothing in your browser. ` +
        `Visits are counted using a number derived from your request (your IP address and browser) that changes every day; your IP address itself is never stored.`,
    )
  } else {
    out.push(
      `**Cookies.** One cookie, \`trckable_vid\`, holds a random number so that a return visit is not counted as a new person. ` +
        `It contains no personal data, is not readable by anyone else, and is never used for advertising. ` +
        `Depending on where you are, your consent may be required before it is set.`,
    )
  }
  out.push('')
  if (p.config.honor_dnt || asks) {
    out.push(`**Do Not Track.** If your browser sends a Do Not Track or Global Privacy Control signal, nothing about your visit is recorded at all.`)
    out.push('')
  }
  if (p.modules.revenue) {
    out.push(
      `**Purchases.** If you buy something, our payment provider tells us the amount and which visit led to it, so we know which parts of the site are worth keeping. ` +
        `The provider's notice of the payment, which includes your email address, is kept on our own server so the figures stay correct. ` +
        `If you ask us to erase your data, that notice is deleted and the payment is no longer linked to you, and your card details never reach us.`,
    )
    out.push('')
  }
  out.push(`**How long it is kept.** ${retention(p.config.retention_days)}`)
  out.push('')
  out.push(
    `**Your rights.** You can ask us what we hold about you and ask us to delete it. ` +
      `Because we store no name, email or IP address, we will usually need something to find you by — the id in the \`trckable_vid\` cookie, or the email address you used at checkout.`,
  )
  return out.join('\n')
}

/** What this paragraph cannot know, said out loud rather than left to be
 *  discovered by a regulator. */
export function policyCaveats(p: PolicyInput): string[] {
  const out: string[] = []
  const ownBar = p.modules.consent && p.config.banner?.mode === 'bar'
  if (ownBar && !p.config.consent_free)
    out.push("trckable's bar asks about trckable's cookie and nothing else. Embedded video, fonts, chat or ads on your pages need their own consent, from a consent manager that covers them.")
  else if (p.modules.consent && !p.config.consent_free)
    out.push('The cookie waits for your banner. Check that refusing is as easy as agreeing, and that your banner tells people what the analytics cookie is for.')
  else if (!p.config.consent_free)
    out.push('This site sets a cookie. In the EU and the UK that normally needs consent before the script runs. Cookieless mode above sets none; whether you can then skip the banner depends on your country.')
  if (p.config.consent_free)
    out.push('Cookieless mode stores nothing on the device, but the script still reads the page address, referrer, screen width and language, and counts visitors by a daily hash of IP and browser. France, Italy, the Netherlands, Spain and the UK have analytics exemptions with conditions; Germany and Austria generally still ask for consent.')
  if (p.config.record_city && !p.config.consent_free) out.push('City is being recorded. It is derived from the IP address and never stored with it, but it is more precise than country alone.')
  if (p.config.retention_days === 0) out.push('Nothing expires. A retention period is easier to justify than keeping everything forever.')
  if (p.modules.goals) out.push('Goals can carry properties you choose. Do not put names, emails or anything else personal in them — trckable stores whatever you send.')
  out.push('This covers trckable only. Anything else on your site — embedded video, fonts, chat, ads — needs its own paragraph.')
  return out
}
