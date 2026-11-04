import { describe, expect, it } from 'vitest'
import { BookOpen, CircleCheck, FileText, House, Info, LifeBuoy, LogIn, Newspaper, Scale, ShoppingCart, Sparkles, Tag, UserPlus } from 'lucide-react'
import { pageIcon } from './pageIcon'

describe('pageIcon', () => {
  it.each([
    ['/', House],
    ['', House],
    ['/pricing', Tag],
    ['/Plans/team', Tag],
    ['/blog/my-post', Newspaper],
    ['/docs/start', BookOpen],
    ['/help', BookOpen],
    ['/contact', LifeBuoy],
    ['/sign-up', UserPlus],
    ['/register', UserPlus],
    ['/login', LogIn],
    ['/thank-you', CircleCheck],
    ['/checkout/step', ShoppingCart],
    ['/about', Info],
    ['/changelog', Sparkles],
    ['/privacy', Scale],
    ['/something-else', FileText],
  ])('%s', (path, icon) => expect(pageIcon(path)).toBe(icon))

  it('skips a locale prefix', () => {
    expect(pageIcon('/de/pricing')).toBe(Tag)
    expect(pageIcon('/pt-br/blog/x')).toBe(Newspaper)
    expect(pageIcon('/en')).toBe(House)
    expect(pageIcon('/en/')).toBe(House)
  })
})
