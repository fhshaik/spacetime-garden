import { useEffect, useState } from 'react'
import { ApiError, api, type GalleryItem } from './api/client'
import { hydrate } from './api/hydrate'
import { SaveButton } from './components/CardActions'
import { GalleryView } from './components/GalleryView'
import { GenomeCard } from './components/GenomeCard'
import { initialGenomes } from './data/initialGenomes'
import type { MetricGenome } from './types/genome'

type View = 'breed' | 'gallery'
type Toast = { text: string; kind: 'info' | 'error' }

export default function App() {
  const [genomes, setGenomes] = useState<MetricGenome[]>(initialGenomes)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set())
  const [generation, setGeneration] = useState(0)
  const [mutationStrength, setMutationStrength] = useState(0.5)
  const [isLoading, setIsLoading] = useState(false)
  const [view, setView] = useState<View>('breed')
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([])
  const [toast, setToast] = useState<Toast | null>(null)

  // Auto-clear toast after a few seconds.
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3500)
    return () => clearTimeout(t)
  }, [toast])

  function showError(message: string) {
    setToast({ text: message, kind: 'error' })
  }
  function showInfo(message: string) {
    setToast({ text: message, kind: 'info' })
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleBreed() {
    const parents = genomes.filter((g) => selected.has(g.id))
    if (parents.length === 0 || isLoading) return
    setIsLoading(true)
    try {
      const { offspring } = await api.breed(parents, mutationStrength)
      setGenomes(offspring.map(hydrate))
      setSelected(new Set())
      setSavedIds(new Set()) // new generation has new IDs; clear saved-marks
      setGeneration((g) => g + 1)
    } catch (err) {
      showError(
        err instanceof ApiError
          ? `Breeding service: ${err.message}`
          : 'Unexpected error',
      )
    } finally {
      setIsLoading(false)
    }
  }

  async function handleSave(genome: MetricGenome) {
    if (savedIds.has(genome.id)) return
    try {
      await api.genomes.create({
        name: genome.name,
        spec: genome.spec,
        view: genome.view,
        phenotype: genome.phenotype,
      })
      setSavedIds((prev) => new Set(prev).add(genome.id))
      showInfo(`Saved "${genome.name}"`)
    } catch (err) {
      showError(err instanceof ApiError ? `Save failed: ${err.message}` : 'Save failed')
    }
  }

  async function refreshGallery() {
    try {
      const items = await api.gallery.list()
      setGalleryItems(items)
    } catch (err) {
      showError(err instanceof ApiError ? `Gallery: ${err.message}` : 'Gallery error')
    }
  }

  async function showGalleryView() {
    setView('gallery')
    await refreshGallery()
  }

  async function handleLike(genomeId: string) {
    try {
      await api.gallery.like(genomeId)
      await refreshGallery()
    } catch (err) {
      showError(err instanceof ApiError ? `Like failed: ${err.message}` : 'Like failed')
    }
  }

  const selCount = selected.size
  const breedDisabled = selCount === 0 || isLoading

  return (
    <div className="min-h-screen bg-[#050508] flex flex-col items-center py-10 px-4">
      {/* Toast */}
      {toast && (
        <div
          className={[
            'fixed top-4 z-50 px-4 py-2 rounded font-mono text-xs tracking-widest uppercase',
            toast.kind === 'error'
              ? 'bg-red-950/80 border border-red-700 text-red-200'
              : 'bg-cyan-950/80 border border-cyan-700 text-cyan-200',
          ].join(' ')}
        >
          {toast.text}
        </div>
      )}

      {/* Header */}
      <header className="mb-6 text-center select-none">
        <h1 className="text-3xl font-mono font-semibold tracking-[0.25em] text-cyan-300 uppercase">
          Spacetime Garden
        </h1>
        <p className="text-slate-600 text-xs mt-2 tracking-[0.2em] uppercase">
          {view === 'breed' ? (
            <>
              Generation{' '}
              <span className="text-slate-400 font-semibold">{generation}</span>
            </>
          ) : (
            'Public Gallery'
          )}
        </p>
      </header>

      {/* View toggle */}
      <nav className="mb-6 flex gap-2 select-none">
        <ViewTab active={view === 'breed'} onClick={() => setView('breed')}>
          Breed
        </ViewTab>
        <ViewTab active={view === 'gallery'} onClick={showGalleryView}>
          Gallery
        </ViewTab>
      </nav>

      {/* Main view */}
      {view === 'breed' ? (
        <main className="grid grid-cols-3 gap-4 mb-8">
          {genomes.map((genome) => (
            <GenomeCard
              key={genome.id}
              genome={genome}
              selected={selected.has(genome.id)}
              onSelect={toggleSelect}
              actionButton={
                <SaveButton
                  onClick={() => handleSave(genome)}
                  saved={savedIds.has(genome.id)}
                />
              }
            />
          ))}
        </main>
      ) : (
        <GalleryView items={galleryItems} onLike={handleLike} />
      )}

      {/* Breed controls — only in breed view */}
      {view === 'breed' && (
        <footer className="flex flex-col items-center gap-4">
          <div className="flex items-center gap-3 select-none">
            <label
              htmlFor="mutation-slider"
              className="text-slate-600 text-xs tracking-[0.2em] uppercase"
            >
              Mutation
            </label>
            <input
              id="mutation-slider"
              type="range"
              min={0}
              max={1}
              step={0.01}
              value={mutationStrength}
              onChange={(e) => setMutationStrength(parseFloat(e.target.value))}
              className="w-44 accent-cyan-500 cursor-pointer"
            />
            <span className="text-cyan-300 text-xs font-mono w-10 text-right tabular-nums">
              {Math.round(mutationStrength * 100)}%
            </span>
          </div>

          <p className="text-slate-600 text-xs tracking-widest uppercase select-none">
            {isLoading
              ? 'Breeding…'
              : selCount === 0
                ? 'Select candidates to breed'
                : selCount === 1
                  ? '1 parent selected — will mutate ×6'
                  : `${selCount} parents selected`}
          </p>

          <button
            onClick={handleBreed}
            disabled={breedDisabled}
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
            {isLoading ? 'Breeding…' : 'Breed Next Generation'}
          </button>
        </footer>
      )}
    </div>
  )
}

function ViewTab({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={[
        'px-4 py-1.5 rounded font-mono text-[11px] tracking-[0.2em] uppercase border transition-all duration-150',
        active
          ? 'border-cyan-400 text-cyan-200 bg-cyan-950/30 shadow-[0_0_12px_#00f5ff33]'
          : 'border-[#1a1a2e] text-slate-500 hover:border-cyan-800 hover:text-cyan-400',
      ].join(' ')}
    >
      {children}
    </button>
  )
}
