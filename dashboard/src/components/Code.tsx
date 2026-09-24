// A small code view: a language label, a copy button and enough highlighting
// to read a snippet at a glance. About 60 lines and no dependency — a syntax
// highlighter would be bigger than the dashboard's whole chart kit.
import { useMemo, useState } from 'react'

type Tok = { t: string; c?: string }

const KEYWORDS =
  /^(import|export|from|const|let|await|async|function|return|new|if|else|npm|npx|curl|add_action|location|proxy_pass|proxy_set_header|scripts|app|head|exports|require)\b/

/** Order matters: comments and strings win over everything else. */
function lex(src: string): Tok[] {
  const out: Tok[] = []
  let i = 0
  const push = (t: string, c?: string) => {
    if (!t) return
    const last = out[out.length - 1]
    if (last && last.c === c) last.t += t
    else out.push({ t, c })
  }
  while (i < src.length) {
    const rest = src.slice(i)
    let m: RegExpMatchArray | null
    if ((m = rest.match(/^(<!--[\s\S]*?-->|\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/)/))) {
      push(m[0], 'c-comment')
      i += m[0].length
      continue
    }
    if ((m = rest.match(/^("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)/))) {
      push(m[0], 'c-str')
      i += m[0].length
      continue
    }
    if ((m = rest.match(/^<\/?[A-Za-z][\w:-]*|^\/?>|^<\?php|^\?>/))) {
      push(m[0], 'c-tag')
      i += m[0].length
      continue
    }
    if ((m = rest.match(KEYWORDS))) {
      push(m[0], 'c-key')
      i += m[0].length
      continue
    }
    if ((m = rest.match(/^\d[\d._]*/))) {
      push(m[0], 'c-num')
      i += m[0].length
      continue
    }
    push(src[i])
    i++
  }
  return out
}

/** What to call this snippet, from what is in it. */
function langOf(code: string): string {
  if (code.includes('<?php')) return 'php'
  if (/^\s*</.test(code)) return 'html'
  if (/^(npm|npx|curl|#)/m.test(code) && !code.includes('import ')) return 'shell'
  if (code.includes('location /')) return 'nginx'
  if (code.trim().startsWith('{')) return 'json'
  return 'js'
}

// A URL, a key or a list of event names is not code to read line by line: it
// wraps instead of scrolling sideways.
const WRAPS = new Set(['url', 'secret', 'events', 'text', 'markdown'])

// Prose is not code. Lexing English as JavaScript paints "from", "new" and
// "else" as keywords and any number as a literal, which is worse than no
// highlighting at all.
const PROSE = new Set(['text', 'markdown', 'events', 'secret'])

// A key wraps anywhere, because it has no words. A sentence must not: breaking
// "browser" across two lines as "brow / ser" is hard to read.
const WORDS = new Set(['text', 'markdown'])

// A snippet somebody has to read and copy should never scroll sideways: the
// script tag is one long line, and hiding half of it behind a scrollbar is the
// worst thing this component can do.

export function CodeBlock({ code, lang, wrap: always }: { code: string; lang?: string; wrap?: boolean }) {
  const [copied, setCopied] = useState(false)
  const toks = useMemo(() => (PROSE.has(lang ?? '') ? [{ t: code }] : lex(code)), [code, lang])
  // One long line is unreadable behind a scrollbar; several short ones are
  // fine, and wrapping those would be worse.
  const wrap = always || WRAPS.has(lang ?? '') || (!code.includes('\n') && code.length > 60)
  return (
    <div className="code-card">
      <div className="code-bar">
        <span className="faint num">{lang ?? langOf(code)}</span>
        <span className="spacer" style={{ flex: 1 }} />
        <button
          type="button"
          onClick={() =>
            navigator.clipboard?.writeText(code).then(() => {
              setCopied(true)
              setTimeout(() => setCopied(false), 1500)
            })
          }
        >
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className={['code', wrap && 'wrap', WORDS.has(lang ?? '') && 'words'].filter(Boolean).join(' ')}>
        {toks.map((t, i) => (
          <span key={i} className={t.c}>
            {t.t}
          </span>
        ))}
      </pre>
    </div>
  )
}
