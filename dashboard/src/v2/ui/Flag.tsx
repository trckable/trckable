import './flag.css'

// A country's flag as a picture: Windows browsers draw flag emoji as two letters. Each file loads only when its flag is shown.
const files = import.meta.glob<string>('/node_modules/flag-icons/flags/4x3/*.svg', { eager: true, import: 'default', query: '?no-inline' })

/** The file of a country's flag, or undefined where there is none. */
export const flagSrc = (code: string): string | undefined => files[`/node_modules/flag-icons/flags/4x3/${code.toLowerCase()}.svg`]

export function Flag({ code, width = 16 }: { code: string; width?: number }) {
  const src = flagSrc(code)
  return src ? <img className="cflag" src={src} alt="" width={width} height={(width * 3) / 4} loading="lazy" /> : null
}
