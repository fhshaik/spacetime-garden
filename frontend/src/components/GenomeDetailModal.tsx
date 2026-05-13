import { useEffect, useState } from 'react'
import { ApiError, api } from '../api/client'
import { hydrate } from '../api/hydrate'
import type { MetricGenome } from '../types/genome'
import { MetricRenderer } from './MetricRenderer'

interface Props {
  genomeId: string
  onClose: () => void
  onError: (msg: string) => void
}

// Picks a display size that takes most of the viewport while staying square
// and leaving room for the close affordance. Recomputed on resize.
function useModalSize(): number {
  const [size, setSize] = useState(() => computeSize())
  useEffect(() => {
    const handle = () => setSize(computeSize())
    window.addEventListener('resize', handle)
    return () => window.removeEventListener('resize', handle)
  }, [])
  return size
}

function computeSize(): number {
  const vmin = Math.min(window.innerWidth, window.innerHeight)
  return Math.max(280, Math.min(900, Math.round(vmin * 0.82)))
}

export function GenomeDetailModal({ genomeId, onClose, onError }: Props) {
  const [genome, setGenome] = useState<MetricGenome | null>(null)
  const displaySize = useModalSize()

  useEffect(() => {
    let cancelled = false
    setGenome(null)
    api.genomes
      .get(genomeId)
      .then((server) => {
        if (cancelled) return
        setGenome(hydrate(server))
      })
      .catch((err) => {
        if (cancelled) return
        onError(err instanceof ApiError ? `Detail: ${err.message}` : 'Detail failed')
        onClose()
      })
    return () => {
      cancelled = true
    }
  }, [genomeId, onClose, onError])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Black hole detail"
      onClick={onClose}
      className="
        fixed inset-0 z-40 flex items-center justify-center
        bg-black/85 backdrop-blur-sm
      "
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex flex-col items-center gap-4"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="
            absolute -top-3 -right-3 z-10 w-8 h-8 rounded-full
            border border-cyan-700 bg-black text-cyan-300
            hover:border-cyan-300 hover:text-cyan-100
            font-mono text-sm leading-none
          "
        >
          ×
        </button>

        {genome ? (
          <>
            <MetricRenderer genome={genome} displaySize={displaySize} />
            <span className="text-sm font-mono text-slate-300 tracking-[0.25em] uppercase">
              {genome.name}
            </span>
          </>
        ) : (
          <div
            style={{ width: displaySize, height: displaySize }}
            className="flex items-center justify-center rounded bg-[#0a0a12] border border-[#1a1a2e]"
          >
            <span className="text-slate-500 text-xs font-mono tracking-[0.25em] uppercase">
              Loading…
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
