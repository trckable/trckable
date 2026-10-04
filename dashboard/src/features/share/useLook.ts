// The look of a site's share links, loaded and kept: the Look panel edits it
// and the preview beside it draws it, from this one state. Each change shows
// at once and is saved behind it; the server cleans and limits the logo.
import { useEffect, useRef, useState } from 'react'
import { APIError, fail, more, type ShareLook } from '../../lib/apiMore'
import { toast } from '../../components/Toast'
import { copy } from './copy'

const MAX_LOGO = 128 << 10

export function useLook(site: string) {
  const [look, setLook] = useState<ShareLook | null>(null)
  const [domain, setDomain] = useState('')
  const timer = useRef(0)
  const latest = useRef<ShareLook | null>(null)
  useEffect(() => {
    latest.current = look
  })
  useEffect(() => {
    let stale = false
    more
      .shareLook(site)
      .then((l) => {
        if (stale) return
        setLook(l)
        setDomain(l.domain)
      })
      .catch(() => undefined)
    return () => {
      stale = true
      clearTimeout(timer.current)
    }
  }, [site])

  // Every save carries the whole look as it is now, so one that was waiting
  // (the colour's) cannot undo a switch flipped after it.
  const save = (cur: ShareLook, next: Pick<ShareLook, 'color' | 'hide_brand' | 'domain'>, domainSave = false) => {
    clearTimeout(timer.current)
    return more
      .setShareLook(site, next)
      .then((l) => {
        // Only a domain's save takes the answer: the tidied name. Any other
        // answer may be older than what was typed or picked since.
        if (!domainSave) return
        setLook((p) => (p ? { ...p, domain: l.domain, domain_ok: l.domain_ok, verify_name: l.verify_name, verify_value: l.verify_value, target: l.target } : l)) // the record lines appearing are the confirmation
        setDomain(l.domain)
      })
      .catch((e: unknown) => {
        if (domainSave) toast(copy.domainRefused, 'error')
        else fail(e)
        setDomain((now) => (now === next.domain ? cur.domain : now)) // unless something else was typed meanwhile
      })
  }
  const edit = {
    colour: (color: string) => {
      if (!look) return
      setLook({ ...look, color })
      clearTimeout(timer.current)
      timer.current = window.setTimeout(() => {
        const now = latest.current
        if (now) void save(now, { color: now.color, hide_brand: now.hide_brand, domain: now.domain })
      }, 500)
    },
    flip: () => {
      if (!look) return
      setLook({ ...look, hide_brand: !look.hide_brand })
      void save(look, { color: look.color, hide_brand: !look.hide_brand, domain: look.domain })
    },
    commitDomain: () => {
      if (look && domain.trim() !== look.domain) void save(look, { color: look.color, hide_brand: look.hide_brand, domain }, true)
    },
    upload: (f: File) => {
      if (f.size > MAX_LOGO) return toast(copy.logoBig, 'error')
      more
        .setShareLogo(site, f)
        .then(() => more.shareLook(site))
        .then(setLook)
        .catch((e: unknown) => (e instanceof APIError && e.status === 400 ? toast(copy.logoRefused, 'error') : fail(e)))
    },
    verify: () => {
      more
        .verifyShareDomain(site)
        .then(setLook)
        .catch((e: unknown) => (e instanceof APIError && e.status === 400 ? toast(copy.notYet, 'error') : fail(e)))
    },
    removeLogo: () => {
      more.clearShareLogo(site).then(setLook).catch((e: unknown) => fail(e))
    },
  }
  return { look, domain, setDomain, edit }
}

export type Look = ReturnType<typeof useLook>
