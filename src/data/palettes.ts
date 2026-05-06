import type { JetMorph, Palette } from '../types/genome'

// Three radial color stops for the accretion disk gradient: hot inner,
// orange/mid, cool outer. Each palette is a distinct visual identity.
export interface PaletteStops {
  hot:  readonly [number, number, number]
  mid:  readonly [number, number, number]
  cool: readonly [number, number, number]
}

export const PALETTES: Record<Palette, PaletteStops> = {
  plasma: {
    hot:  [0.92, 0.97, 1.05],
    mid:  [1.00, 0.55, 0.20],
    cool: [0.50, 0.08, 0.02],
  },
  aurora: {
    hot:  [0.85, 1.00, 0.92],
    mid:  [0.20, 0.85, 0.55],
    cool: [0.05, 0.18, 0.50],
  },
  magma: {
    hot:  [1.00, 0.95, 0.65],
    mid:  [1.00, 0.42, 0.10],
    cool: [0.30, 0.02, 0.06],
  },
  ice: {
    hot:  [0.95, 0.98, 1.10],
    mid:  [0.55, 0.85, 1.05],
    cool: [0.08, 0.15, 0.40],
  },
  toxic: {
    hot:  [0.95, 1.00, 0.70],
    mid:  [0.45, 0.85, 0.20],
    cool: [0.10, 0.20, 0.05],
  },
}

export const PALETTE_NAMES: readonly Palette[] = ['plasma', 'aurora', 'magma', 'ice', 'toxic']

// Integer codes for the GLSL uniform — keeps shader branching simple.
export const JET_MORPH_CODE: Record<JetMorph, number> = {
  none:    0,
  twin:    1,
  single:  2,
  helical: 3,
}

export const JET_MORPH_NAMES: readonly JetMorph[] = ['none', 'twin', 'single', 'helical']
