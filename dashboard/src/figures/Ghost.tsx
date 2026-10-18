/*
  The ghost-and-lamp figure uses geometry and the projection method of
  iso-glow / ai-iso-skill: https://github.com/MrBongoC/ai-iso-skill

  MIT License
  Copyright (c) 2026 Tolga Cohce

  Permission is hereby granted, free of charge, to any person obtaining a copy
  of this software and associated documentation files (the "Software"), to deal
  in the Software without restriction, including without limitation the rights
  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
  copies of the Software, and to permit persons to whom the Software is
  furnished to do so, subject to the following conditions:

  The above copyright notice and this permission notice shall be included in all
  copies or substantial portions of the Software.

  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
  SOFTWARE.

  Changes: colours moved to the dashboard's tokens, motion redone as CSS
  keyframes, the ghost and its cards are trckable's own.
*/
import { useEffect, useMemo, useRef } from 'react'
import { attachGhost } from './ghost.interact'
import { ghostMarkup } from './ghost.art'
import './figures.css'
import './ghost.css'

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)

export type Page = { label: string; href: string }

/** The ghost searches three page cards with a lamp; the third lights up. Its
    lamp and eyes follow the pointer. The cards are real links, the found one
    last. */
export default function Ghost({ pages }: { pages: [Page, Page, Page] }) {
  const box = useRef<HTMLDivElement>(null)
  const html = useMemo(
    () => ghostMarkup.replace(/\{\{(h?)(\d)\}\}/g, (_, h: string, i: string) => escape((h ? pages[Number(i)]?.href : pages[Number(i)]?.label) ?? '')),
    [pages],
  )
  useEffect(() => {
    const svg = box.current?.querySelector('svg')
    return svg ? attachGhost(svg) : undefined
  }, [html])
  return <div ref={box} className="tkf-ghost" dangerouslySetInnerHTML={{ __html: html }} />
}
