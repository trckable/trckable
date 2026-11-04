// The small icon a page's row wears, chosen from the first segment of its path (after a locale like /de/ or /pt-br/).
import { BookOpen, CircleCheck, FileText, House, Info, LifeBuoy, LogIn, Newspaper, Scale, ShoppingCart, Sparkles, Tag, UserPlus, type LucideIcon } from 'lucide-react'

const BY_WORD: [string[], LucideIcon][] = [
  [['pricing', 'plans', 'plan', 'price', 'prices'], Tag],
  [['blog', 'posts', 'post', 'articles', 'article', 'news'], Newspaper],
  [['docs', 'doc', 'guide', 'guides', 'help', 'documentation'], BookOpen],
  [['support', 'contact', 'contactus'], LifeBuoy],
  [['signup', 'register', 'start', 'join'], UserPlus],
  [['login', 'signin'], LogIn],
  [['thanks', 'thankyou', 'success', 'confirm', 'confirmed'], CircleCheck],
  [['checkout', 'cart', 'pay', 'payment'], ShoppingCart],
  [['about', 'team', 'aboutus'], Info],
  [['changelog', 'updates', 'releases'], Sparkles],
  [['legal', 'privacy', 'terms', 'tos'], Scale],
]

const LOCALE = /^[a-z]{2}([-_][a-z]{2})?$/

/** The icon for a page path; a plain page icon when nothing in the path says more. */
export function pageIcon(path: string): LucideIcon {
  const parts = path.split(/[?#]/)[0].toLowerCase().split('/').filter(Boolean)
  if (LOCALE.test(parts[0] ?? '')) parts.shift()
  const first = parts[0]
  if (first === undefined) return House
  const word = first.replace(/\.[a-z0-9]+$/, '').replace(/[-_*]/g, '')
  return BY_WORD.find(([words]) => words.includes(word))?.[1] ?? FileText
}
