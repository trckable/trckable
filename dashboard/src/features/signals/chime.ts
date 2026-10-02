// The sale's chime: two short notes made here with the browser's own audio, so
// there is nothing to download. A browser keeps sound shut until the page has
// been used (the switch that turns it on is such a use), and then this plays;
// before that it says nothing rather than failing.
let ctx: AudioContext | undefined

export function chime() {
  try {
    ctx ??= new AudioContext()
    if (ctx.state === 'suspended') void ctx.resume()
    if (ctx.state !== 'running') return
    const start = ctx.currentTime + 0.01
    for (const [i, hz] of [1318.5, 1975.5].entries()) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      const at = start + i * 0.11
      osc.type = 'sine'
      osc.frequency.value = hz
      gain.gain.setValueAtTime(0.0001, at)
      gain.gain.exponentialRampToValueAtTime(0.16, at + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.32)
      osc.connect(gain).connect(ctx.destination)
      osc.start(at)
      osc.stop(at + 0.35)
    }
  } catch {
    /* no audio here: the toast still says it */
  }
}
