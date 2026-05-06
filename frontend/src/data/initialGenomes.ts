import type { MetricGenome } from '../types/genome'
import type { MetricSpec } from '../types/spec'
import { compileSpec } from '../utils/compileSpec'

function fromSpec(spec: MetricSpec) {
  const { metric, displayMetric } = compileSpec(spec)
  return { spec, metric, displayMetric }
}

const schw = (M: number): MetricSpec => ({
  base:       { kind: 'schwarzschild' },
  features:   [],
  parameters: { M },
})

const rn = (M: number, Q: number): MetricSpec => ({
  base:       { kind: 'schwarzschild' },
  features:   [{ kind: 'charge' }],
  parameters: { M, Q },
})

const hayward = (M: number, ell: number): MetricSpec => ({
  base:       { kind: 'schwarzschild' },
  features:   [{ kind: 'hayward' }],
  parameters: { M, ell },
})

const yukawa = (M: number, cy: number, Ly: number): MetricSpec => ({
  base:       { kind: 'schwarzschild' },
  features:   [{ kind: 'yukawa' }],
  parameters: { M, cy, Ly },
})

const kerr = (M: number, a: number): MetricSpec => ({
  base:       { kind: 'kerr' },
  features:   [],
  parameters: { M, a },
})

const kerrNewman = (M: number, a: number, Q: number): MetricSpec => ({
  base:       { kind: 'kerr' },
  features:   [{ kind: 'charge' }],
  parameters: { M, a, Q },
})

export const initialGenomes: MetricGenome[] = [
  {
    id:        'g-0001',
    name:      'Schwarzschild',
    ...fromSpec(schw(1.0)),
    view:      { inclination: 0.55, diskBrightness: 0.6,  diskRadius: 0.5, jetStrength: 0.10 },
    phenotype: { palette: 'plasma', jetMorph: 'twin',    starSeed: 17,  diskTurbulence: 0.7 },
  },
  {
    id:        'g-0002',
    name:      'Reissner-Nordström',
    ...fromSpec(rn(1.0, 0.55)),
    view:      { inclination: 0.30, diskBrightness: 0.85, diskRadius: 0.6, jetStrength: 0.30 },
    phenotype: { palette: 'aurora', jetMorph: 'helical', starSeed: 84,  diskTurbulence: 0.9 },
  },
  {
    id:        'g-0003',
    name:      'Hayward-Regular',
    ...fromSpec(hayward(1.0, 0.55)),
    view:      { inclination: 0.50, diskBrightness: 0.7,  diskRadius: 0.5, jetStrength: 0.20 },
    phenotype: { palette: 'magma',  jetMorph: 'single',  starSeed: 231, diskTurbulence: 0.5 },
  },
  {
    id:        'g-0004',
    name:      'Kerr-Newman',
    ...fromSpec(kerrNewman(1.1, 0.55, 0.35)),
    view:      { inclination: 0.55, diskBrightness: 0.7,  diskRadius: 0.5, jetStrength: 0.45 },
    phenotype: { palette: 'ice',    jetMorph: 'twin',    starSeed: 412, diskTurbulence: 0.95 },
  },
  {
    id:        'g-0005',
    name:      'Yukawa-Modified',
    ...fromSpec(yukawa(0.85, 0.40, 4.0)),
    view:      { inclination: 0.40, diskBrightness: 0.55, diskRadius: 0.5, jetStrength: 0.20 },
    phenotype: { palette: 'toxic',  jetMorph: 'twin',    starSeed: 567, diskTurbulence: 0.6 },
  },
  {
    id:        'g-0006',
    name:      'Kerr-Heavy',
    ...fromSpec(kerr(1.6, 0.70)),
    view:      { inclination: 0.85, diskBrightness: 0.95, diskRadius: 0.9, jetStrength: 0.50 },
    phenotype: { palette: 'plasma', jetMorph: 'helical', starSeed: 793, diskTurbulence: 0.85 },
  },
]
