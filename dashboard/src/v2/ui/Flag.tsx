// A country's flag as a picture: Windows browsers draw flag emoji as two letters. Each file loads only when its flag is shown.
const files = import.meta.glob<string>('/node_modules/flag-icons/flags/4x3/*.svg', { eager: true, import: 'default', query: '?no-inline' })

export function Flag({ code }: { code: string }) {
  const src = files[`/node_modules/flag-icons/flags/4x3/${code.toLowerCase()}.svg`]
  return src ? <img className="flag" src={src} alt="" width={16} height={12} loading="lazy" /> : null
}
