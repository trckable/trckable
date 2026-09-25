// gifenc ships no types; only what ShareGif uses.
declare module 'gifenc' {
  type Palette = number[][]
  export function quantize(rgba: Uint8Array | Uint8ClampedArray, max: number, o?: { format?: 'rgb565' | 'rgb444' | 'rgba4444' }): Palette
  export function applyPalette(rgba: Uint8Array | Uint8ClampedArray, palette: Palette, format?: 'rgb565' | 'rgb444' | 'rgba4444'): Uint8Array
  export function GIFEncoder(): {
    writeFrame(index: Uint8Array, w: number, h: number, o: { palette?: Palette; delay?: number; repeat?: number }): void
    finish(): void
    bytes(): Uint8Array
  }
}
