import type { MetricGenome } from '../types/genome'

export const initialGenomes: MetricGenome[] = [
  {
    // Classic non-rotating, no charge, moderate accretion
    id: 'g-0001',
    name: 'Schwarzschild-I',
    mass: 0.45,
    spin: 0.05,
    charge: 0.0,
    accretion: 0.6,
    jetStrength: 0.1,
    lensing: 0.55,
  },
  {
    // Maximally spinning, wide bright disk, strong jets
    id: 'g-0002',
    name: 'Kerr-Maxima',
    mass: 0.35,
    spin: 0.95,
    charge: 0.2,
    accretion: 0.85,
    jetStrength: 0.75,
    lensing: 0.7,
  },
  {
    // Reissner–Nordström inspired, high charge, dim disk, heavy lensing
    id: 'g-0003',
    name: 'RN-Exotic',
    mass: 0.5,
    spin: 0.15,
    charge: 0.92,
    accretion: 0.25,
    jetStrength: 0.2,
    lensing: 0.8,
  },
  {
    // Small horizon, strong jets, faint lensing
    id: 'g-0004',
    name: 'Microquasar-7',
    mass: 0.15,
    spin: 0.6,
    charge: 0.4,
    accretion: 0.7,
    jetStrength: 0.95,
    lensing: 0.2,
  },
  {
    // Tiny mass, near-zero everything, ghostly
    id: 'g-0005',
    name: 'Primordial-Ghost',
    mass: 0.08,
    spin: 0.12,
    charge: 0.05,
    accretion: 0.15,
    jetStrength: 0.05,
    lensing: 0.35,
  },
  {
    // Large horizon, heavy lensing, bright wide disk
    id: 'g-0006',
    name: 'Quasar-Core',
    mass: 0.72,
    spin: 0.5,
    charge: 0.6,
    accretion: 0.95,
    jetStrength: 0.45,
    lensing: 0.9,
  },
]
