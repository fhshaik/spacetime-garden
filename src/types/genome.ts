import type { Metric } from './metric'
import type { MetricSpec } from './spec'

// Renderer-side "matter and observer" config, kept separate from the
// metric (which describes only spacetime geometry).
export interface ViewConfig {
  inclination:    number  // 0 = face-on disk,   1 = edge-on
  diskBrightness: number  // 0..1
  diskRadius:     number  // 0..1, multiplier on outer disk extent
  jetStrength:    number  // 0..1
}

// Visual phenotype: how the same metric gets rendered. Mutates independently
// of the metric AST, so two genomes with identical Schwarzschild can still
// look very different (different palette, jet style, starfield seed).
export type Palette  = 'plasma' | 'aurora' | 'magma' | 'ice' | 'toxic'
export type JetMorph = 'none' | 'twin' | 'single' | 'helical'

export interface Phenotype {
  palette:        Palette
  jetMorph:       JetMorph
  starSeed:       number  // discrete, used as noise/hash domain shift
  diskTurbulence: number  // 0..1, multiplier on FBM contribution to disk
}

export interface MetricGenome {
  id:        string
  name:      string
  // The high-level genome — base family + features + parameters. This is
  // the source of truth that mutations operate on.
  spec:      MetricSpec
  // Derived from `spec` via compileSpec(). Cached on the genome so the
  // renderer doesn't have to recompile per frame.
  metric:    Metric          // Cartesian, fed to the integrator
  displayMetric?: Metric     // Spherical, fed to the LaTeX renderer
  view:      ViewConfig
  phenotype: Phenotype
}
