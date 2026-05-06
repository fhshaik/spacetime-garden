import type { JetMorph, MetricGenome, Palette, Phenotype, ViewConfig } from '../types/genome'
import type { Base, Feature, MetricSpec } from '../types/spec'
import { availableFeaturesForSplice, FEATURE_PARAM_DEFAULTS } from '../types/spec'
import { JET_MORPH_NAMES, PALETTE_NAMES } from '../data/palettes'
import { compileSpec } from './compileSpec'

let uidCounter = 100

function nextId(): string {
  return `g-${String(++uidCounter).padStart(4, '0')}`
}

function gaussian(stdDev: number): number {
  const u1 = Math.random()
  const u2 = Math.random()
  return stdDev * Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2)
}

const clamp01  = (v: number): number => Math.max(0, Math.min(1, v))
const clampPos = (v: number, eps = 0.05): number => Math.max(eps, v)

// ── Spec mutation: drift, splice, prune, transitionBase ──────────────────────

// Magnitude parameters that must stay positive for the metric to be physical
// (mass M, charge magnitudes Q/Qa, spin |a|, regularization length scales).
// Everything else (Λ, c3, c4, cy) is allowed to drift through zero — that's
// where the "free sign flip" mutation comes from.
const POSITIVE_ONLY = new Set(['M', 'Q', 'Qa', 'a', 'ell', 'eb', 'Ly'])

function driftParameters(params: Record<string, number>, std: number): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [k, v] of Object.entries(params)) {
    const drifted = v + gaussian(std) * (Math.abs(v) + 0.05)
    out[k] = POSITIVE_ONLY.has(k) ? clampPos(drifted) : drifted
  }
  return out
}

// Splice: add a new feature to the spec, with default parameter values.
// Returns spec unchanged if the base doesn't accept any new features or
// all available features are already present.
function spliceFeature(spec: MetricSpec): MetricSpec {
  const candidates = availableFeaturesForSplice(spec)
  if (candidates.length === 0) return spec

  const kind = candidates[Math.floor(Math.random() * candidates.length)]
  const defaults = FEATURE_PARAM_DEFAULTS[kind]
  return {
    ...spec,
    features:   [...spec.features, { kind } as Feature],
    parameters: { ...spec.parameters, ...defaults },
  }
}

// Prune: drop a random feature and its parameters.
function pruneFeature(spec: MetricSpec): MetricSpec {
  if (spec.features.length === 0) return spec
  const idx = Math.floor(Math.random() * spec.features.length)
  const removed = spec.features[idx]
  const removedParams = FEATURE_PARAM_DEFAULTS[removed.kind]
  const newParams = { ...spec.parameters }
  for (const k of Object.keys(removedParams)) delete newParams[k]
  return {
    ...spec,
    features:   spec.features.filter((_, i) => i !== idx),
    parameters: newParams,
  }
}

// Rare base transition: Schwarzschild ↔ Kerr. Drops features (since
// Kerr-base features aren't implemented) and seeds the new parameter set
// with sensible defaults pulled from the previous spec where applicable.
function transitionBase(spec: MetricSpec): MetricSpec {
  const M = spec.parameters.M ?? 1.0
  if (spec.base.kind === 'schwarzschild') {
    return {
      base:       { kind: 'kerr' },
      features:   [],
      parameters: { M, a: 0.40 },
    }
  }
  return {
    base:       { kind: 'schwarzschild' },
    features:   [],
    parameters: { M },
  }
}

function mutateSpec(spec: MetricSpec, std: number, rerollRate: number): MetricSpec {
  let out: MetricSpec = { ...spec, parameters: driftParameters(spec.parameters, std) }
  // Splice / prune / transition are independent low-probability events.
  // Rates are tied to the mutation slider.
  const spliceProb     = rerollRate * 0.45
  const pruneProb      = rerollRate * 0.30
  const transitionProb = rerollRate * 0.10
  if (Math.random() < spliceProb)     out = spliceFeature(out)
  if (Math.random() < pruneProb)      out = pruneFeature(out)
  if (Math.random() < transitionProb) out = transitionBase(out)
  return out
}

// ── View / phenotype mutation (continuous + discrete) ────────────────────────

function mutateView(v: ViewConfig, std: number): ViewConfig {
  return {
    inclination:    clamp01(v.inclination    + gaussian(std)),
    diskBrightness: clamp01(v.diskBrightness + gaussian(std)),
    diskRadius:     clamp01(v.diskRadius     + gaussian(std)),
    jetStrength:    clamp01(v.jetStrength    + gaussian(std)),
  }
}

function mutatePhenotype(p: Phenotype, std: number, rerollRate: number): Phenotype {
  return {
    palette:        Math.random() < rerollRate ? randomPalette()  : p.palette,
    jetMorph:       Math.random() < rerollRate ? randomJetMorph() : p.jetMorph,
    starSeed:       Math.random() < rerollRate ? Math.floor(Math.random() * 1000) : p.starSeed,
    diskTurbulence: clamp01(p.diskTurbulence + gaussian(std)),
  }
}

function randomPalette(): Palette {
  return PALETTE_NAMES[Math.floor(Math.random() * PALETTE_NAMES.length)]
}

function randomJetMorph(): JetMorph {
  return JET_MORPH_NAMES[Math.floor(Math.random() * JET_MORPH_NAMES.length)]
}

// ── Crossover ────────────────────────────────────────────────────────────────

function pickField<T, K extends keyof T>(a: T, b: T, k: K): T[K] {
  return Math.random() < 0.5 ? a[k] : b[k]
}

// Same-base parents may have different feature sets; we union the sets and
// for shared parameters pick from one parent at random. Different-base
// parents fall back to inheriting one parent's spec wholesale.
function crossSpecs(a: MetricSpec, b: MetricSpec): MetricSpec {
  if (a.base.kind !== b.base.kind) {
    return Math.random() < 0.5 ? a : b
  }
  const base: Base = { kind: a.base.kind }

  // Union of features by kind, each with 50/50 chance of inclusion if it
  // appears in just one parent and 100% if it appears in both.
  const aKinds = new Set(a.features.map((f) => f.kind))
  const bKinds = new Set(b.features.map((f) => f.kind))
  const allKinds = new Set([...aKinds, ...bKinds])
  const features: Feature[] = []
  for (const kind of allKinds) {
    const inBoth = aKinds.has(kind) && bKinds.has(kind)
    if (inBoth || Math.random() < 0.5) {
      features.push({ kind } as Feature)
    }
  }

  // Build the parameter set: each parameter's value picked from whichever
  // parent had it (or both, in which case 50/50).
  const allParamKeys = new Set([...Object.keys(a.parameters), ...Object.keys(b.parameters)])
  const parameters: Record<string, number> = {}
  for (const k of allParamKeys) {
    if (k in a.parameters && k in b.parameters) {
      parameters[k] = pickField(a.parameters, b.parameters, k)
    } else if (k in a.parameters) {
      parameters[k] = a.parameters[k]
    } else {
      parameters[k] = b.parameters[k]
    }
  }

  // Drop parameters that aren't needed and fill in any missing ones with
  // sensible defaults (a child can need a param that neither parent had if
  // the union of features grew).
  const required = new Map<string, number>()
  if (base.kind === 'kerr')          { required.set('M', 1.0); required.set('a', 0.4) }
  if (base.kind === 'schwarzschild') { required.set('M', 1.0) }
  for (const f of features) {
    for (const [k, v] of Object.entries(FEATURE_PARAM_DEFAULTS[f.kind])) {
      required.set(k, v)
    }
  }
  const filtered: Record<string, number> = {}
  for (const [k, fallback] of required) {
    filtered[k] = k in parameters ? parameters[k] : fallback
  }

  return { base, features, parameters: filtered }
}

// ── Genome mutation / crossover ─────────────────────────────────────────────

function buildChild(spec: MetricSpec, view: ViewConfig, phenotype: Phenotype, baseName: string): MetricGenome {
  const id = nextId()
  const compiled = compileSpec(spec)
  return {
    id,
    name:          `${baseName}-${id.slice(-3)}`,
    spec,
    metric:        compiled.metric,
    displayMetric: compiled.displayMetric,
    view,
    phenotype,
  }
}

function mutate(g: MetricGenome, std: number, rerollRate: number): MetricGenome {
  const baseName = g.name.split('-')[0]
  return buildChild(
    mutateSpec(g.spec, std, rerollRate),
    mutateView(g.view, std),
    mutatePhenotype(g.phenotype, std, rerollRate),
    baseName,
  )
}

function crossover(a: MetricGenome, b: MetricGenome): MetricGenome {
  const view: ViewConfig = {
    inclination:    pickField(a.view, b.view, 'inclination'),
    diskBrightness: pickField(a.view, b.view, 'diskBrightness'),
    diskRadius:     pickField(a.view, b.view, 'diskRadius'),
    jetStrength:    pickField(a.view, b.view, 'jetStrength'),
  }
  const phenotype: Phenotype = {
    palette:        pickField(a.phenotype, b.phenotype, 'palette'),
    jetMorph:       pickField(a.phenotype, b.phenotype, 'jetMorph'),
    starSeed:       pickField(a.phenotype, b.phenotype, 'starSeed'),
    diskTurbulence: pickField(a.phenotype, b.phenotype, 'diskTurbulence'),
  }
  return buildChild(crossSpecs(a.spec, b.spec), view, phenotype, a.name.split('-')[0])
}

// `strength` ∈ [0, 1]: dilates Gaussian σ and reroll/splice/prune probabilities.
export function breedGeneration(
  parents: MetricGenome[],
  strength = 0.5,
  targetCount = 6,
): MetricGenome[] {
  const s = Math.max(0, Math.min(1, strength))
  const std        = s * 0.45
  const rerollRate = s * 0.85

  if (parents.length === 0) {
    throw new Error('breedGeneration requires at least 1 parent')
  }
  if (parents.length === 1) {
    return Array.from({ length: targetCount }, () => mutate(parents[0], std, rerollRate))
  }
  return Array.from({ length: targetCount }, () => {
    const idxA = Math.floor(Math.random() * parents.length)
    let idxB = Math.floor(Math.random() * (parents.length - 1))
    if (idxB >= idxA) idxB++
    // Crossover already mixes from two parents; soften the post-mutation.
    return mutate(crossover(parents[idxA], parents[idxB]), std * 0.5, rerollRate * 0.5)
  })
}
