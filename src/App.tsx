import { useState } from 'react'
import { GenomeCard } from './components/GenomeCard'
import { initialGenomes } from './data/initialGenomes'
import { breedGeneration } from './utils/genetics'
import type { MetricGenome } from './types/genome'

export default function App() {
  const [genomes, setGenomes] = useState<MetricGenome[]>(initialGenomes)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [generation, setGeneration] = useState(0)

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function handleBreed() {
    const parents = genomes.filter(g => selected.has(g.id))
    if (parents.length === 0) return
    setGenomes(breedGeneration(parents))
    setSelected(new Set())
    setGeneration(g => g + 1)
  }

  const selCount = selected.size

  return (
    <div className="min-h-screen bg-[#050508] flex flex-col items-center py-10 px-4">

      {/* ── Header ────────────────────────────────────────────────────── */}
      <header className="mb-8 text-center select-none">
        <h1 className="text-3xl font-mono font-semibold tracking-[0.25em] text-cyan-300 uppercase">
          Spacetime Garden
        </h1>
        <p className="text-slate-600 text-xs mt-2 tracking-[0.2em] uppercase">
          Generation&nbsp;
          <span className="text-slate-400 font-semibold">{generation}</span>
        </p>
      </header>

      {/* ── 3×2 Grid ──────────────────────────────────────────────────── */}
      <main className="grid grid-cols-3 gap-4 mb-8">
        {genomes.map(genome => (
          <GenomeCard
            key={genome.id}
            genome={genome}
            selected={selected.has(genome.id)}
            onSelect={toggleSelect}
          />
        ))}
      </main>

      {/* ── Controls ──────────────────────────────────────────────────── */}
      <footer className="flex flex-col items-center gap-3">
        <p className="text-slate-600 text-xs tracking-widest uppercase select-none">
          {selCount === 0
            ? 'Select candidates to breed'
            : selCount === 1
            ? '1 parent selected — will mutate ×6'
            : `${selCount} parents selected`}
        </p>
        <button
          onClick={handleBreed}
          disabled={selCount === 0}
          className="
            px-8 py-3 rounded font-mono text-sm tracking-[0.15em] uppercase
            bg-transparent border border-cyan-700 text-cyan-400
            hover:border-cyan-400 hover:text-cyan-200 hover:bg-cyan-950/30
            hover:shadow-[0_0_24px_#00f5ff33]
            active:scale-95
            disabled:opacity-25 disabled:cursor-not-allowed disabled:hover:shadow-none
            transition-all duration-200
          "
        >
          Breed Next Generation
        </button>
      </footer>

    </div>
  )
}
