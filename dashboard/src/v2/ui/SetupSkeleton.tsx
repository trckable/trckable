// The setup screen while its chunk loads: the title and the install card as bones in the same box, so nothing jumps when it lands.
export function SetupSkeleton({ label }: { label: string }) {
  return (
    <div className="mk mk-body mk-fresh">
      <div className="setup-screen" aria-busy="true" role="status" aria-label={label}>
        <i className="skl" style={{ width: '58%', height: 28, margin: 0 }} />
        <i className="skl" style={{ width: '100%', height: 280, margin: 0, borderRadius: 16 }} />
      </div>
    </div>
  )
}
