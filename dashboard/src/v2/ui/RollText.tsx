// A number already written for the reader, rising into place one character at a time. It animates the text as it is, so
// it can never show a different figure, whatever the locale or currency.
export function RollText({ text }: { text: string }) {
  return (
    <span className="roll" role="img" aria-label={text}>
      {Array.from(text).map((ch, i) => (
        <span key={`${text}${i}`} aria-hidden="true" style={{ animationDelay: `${i * 28}ms` }}>
          {ch === ' ' ? ' ' : ch}
        </span>
      ))}
    </span>
  )
}
