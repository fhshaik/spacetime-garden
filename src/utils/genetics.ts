import type { MetricGenome } from '../types/genome'

const GENE_KEYS: (keyof Omit<MetricGenome, 'id' | 'name'>)[] = [
  'mass',
  'spin',
  'charge',
  'accretion',
  'jetStrength',
  'lensing',
]

let uidCounter = 100

function nextId(): string {
  return `g-${String(++uidCounter).padStart(4, '0')}`
}

// Box-Muller transform for Gaussian noise
function gaussianRandom(stdDev: number): number {
  const u1 = Math.random()
  const u2 = Math.random()
  return stdDev * Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2)
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v))
}

function mutate(genome: MetricGenome, stdDev = 0.07): MetricGenome {
  const genes = {} as Record<string, number>
  for (const key of GENE_KEYS) {
    genes[key] = clamp01(genome[key] + gaussianRandom(stdDev))
  }
  return { ...genome, ...(genes as Pick<MetricGenome, typeof GENE_KEYS[number]>), id: nextId() }
}

function crossover(a: MetricGenome, b: MetricGenome): MetricGenome {
  const cut = 1 + Math.floor(Math.random() * (GENE_KEYS.length - 1))
  const genes = {} as Record<string, number>
  for (let i = 0; i < GENE_KEYS.length; i++) {
    const key = GENE_KEYS[i]
    genes[key] = i < cut ? a[key] : b[key]
  }
  // Derive new name from first parent, with short numeric tag
  const baseName = a.name.split('-')[0]
  const tag = String(uidCounter + 1).slice(-3)
  return {
    ...(genes as Pick<MetricGenome, typeof GENE_KEYS[number]>),
    id: nextId(),
    name: `${baseName}-${tag}`,
  }
}

export function breedGeneration(
  parents: MetricGenome[],
  targetCount = 6,
): MetricGenome[] {
  if (parents.length === 0) {
    throw new Error('breedGeneration requires at least 1 parent')
  }

  if (parents.length === 1) {
    return Array.from({ length: targetCount }, () => mutate(parents[0], 0.08))
  }

  return Array.from({ length: targetCount }, () => {
    const idxA = Math.floor(Math.random() * parents.length)
    let idxB = Math.floor(Math.random() * (parents.length - 1))
    if (idxB >= idxA) idxB++

    const child = crossover(parents[idxA], parents[idxB])
    // Post-crossover mutation at half strength to preserve parent traits
    return mutate(child, 0.04)
  })
}
