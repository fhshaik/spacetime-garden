// MetricSpec: a high-level "recipe" for a black hole that survives mutation.
//
// Bases:
//   schwarzschild   — Cartesian Schwarzschild form. Parameter: M.
//   kerr            — Kerr-Schild form. Parameters: M, a.
//
// Schwarzschild-lineage features:
//   charge          — adds +Q²/r² to A(r)         → Reissner–Nordström
//   cosmological    — adds -Λr²/3 to A(r)         → Schwarzschild–de Sitter
//   antiCharge      — adds -Qa²/r² to A(r)        → repulsive ("anti-charge") geometry
//   order3          — adds c3/r³ to A(r)          → higher-order PPN
//   order4          — adds c4/r⁴ to A(r)          → higher-order PPN
//   yukawa          — adds c·e^(-r/L)/r to A(r)   → modified-gravity falloff
//   hayward         — replaces -2M/r with regular -2Mr²/(r³+2Mℓ³)  → singularity-free
//   bardeen         — replaces -2M/r with regular -2Mr²/(r²+e²)^(3/2) → singularity-free
//
// Kerr-lineage features:
//   charge          — produces Kerr-Newman: f → (2Mr-Q²)·r²/(r⁴+a²Y²) and Δ → r²-2Mr+a²+Q²
//
// hayward and bardeen are mutually exclusive (both replace the mass term).

export type Base =
  | { kind: 'schwarzschild' }
  | { kind: 'kerr' }

export type Feature =
  | { kind: 'charge' }
  | { kind: 'cosmological' }
  | { kind: 'antiCharge' }
  | { kind: 'order3' }
  | { kind: 'order4' }
  | { kind: 'yukawa' }
  | { kind: 'hayward' }
  | { kind: 'bardeen' }

export interface MetricSpec {
  base:       Base
  features:   Feature[]
  parameters: Record<string, number>
}

// Defaults used when a feature is freshly spliced — small enough that
// the visual changes incrementally rather than jumping.
export const FEATURE_PARAM_DEFAULTS: Record<Feature['kind'], Record<string, number>> = {
  charge:       { Q:      0.20  },
  cosmological: { Lambda: 0.005 },
  antiCharge:   { Qa:     0.20  },
  order3:       { c3:     0.30  },
  order4:       { c4:     0.30  },
  yukawa:       { cy:     0.30, Ly: 4.0 },
  hayward:      { ell:    0.50  },
  bardeen:      { eb:     0.50  },
}

// Set of feature kinds available for splicing on a given base.
export function availableFeatureKinds(base: Base): Feature['kind'][] {
  switch (base.kind) {
    case 'schwarzschild':
      return ['charge', 'cosmological', 'antiCharge', 'order3', 'order4', 'yukawa', 'hayward', 'bardeen']
    case 'kerr':
      return ['charge']
  }
}

// Exclude features that conflict with what's already present in the spec.
// hayward and bardeen are mutually exclusive (both replace the mass term).
export function availableFeaturesForSplice(spec: MetricSpec): Feature['kind'][] {
  const present = new Set(spec.features.map((f) => f.kind))
  let kinds = availableFeatureKinds(spec.base).filter((k) => !present.has(k))
  if (present.has('hayward')) kinds = kinds.filter((k) => k !== 'bardeen')
  if (present.has('bardeen')) kinds = kinds.filter((k) => k !== 'hayward')
  return kinds
}
