import type { KeyboardEvent, ReactNode } from 'react'
import type { MetricGenome } from '../types/genome'
import { metricToLatex } from '../utils/latex'
import { MetricLatex } from './MetricLatex'
import { MetricRenderer } from './MetricRenderer'

interface Props {
  genome: MetricGenome
  selected?: boolean
  /** Breed-view: click toggles selection. Mutually exclusive with onOpen. */
  onSelect?: (id: string) => void
  /** Gallery-view: click opens the detail modal. */
  onOpen?: (id: string) => void
  /** Optional corner action — Save in breed view, Like in gallery view. */
  actionButton?: ReactNode
}

export function GenomeCard({ genome, selected = false, onSelect, onOpen, actionButton }: Props) {
  // Prefer the spherical display form for clean physics notation; fall back
  // to the compute (Cartesian) form if a genome doesn't have one.
  const latex = metricToLatex(genome.displayMetric ?? genome.metric)
  const activate = onSelect ?? onOpen
  const isInteractive = activate !== undefined

  const handleClick = () => activate?.(genome.id)
  const handleKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!activate) return
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      activate(genome.id)
    }
  }

  return (
    <div
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      onClick={isInteractive ? handleClick : undefined}
      onKeyDown={isInteractive ? handleKey : undefined}
      className={[
        'relative flex flex-col items-center gap-2 p-2 rounded-lg',
        'bg-[#0a0a12] border transition-all duration-200',
        isInteractive
          ? 'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400'
          : '',
        selected
          ? 'border-[#00f5ff] shadow-[0_0_0_2px_#00f5ff,0_0_24px_#00f5ff44]'
          : `border-[#1a1a2e] ${isInteractive ? 'hover:border-cyan-800' : ''}`,
      ].join(' ')}
    >
      {actionButton && (
        <div className="absolute top-2 right-2 z-10">{actionButton}</div>
      )}

      <MetricRenderer genome={genome} />

      <MetricLatex
        latex={latex}
        className="text-[10px] text-slate-300 leading-snug max-w-[220px] overflow-x-auto px-1 py-1"
      />

      <span className="text-[11px] font-mono text-slate-400 tracking-widest uppercase pb-1">
        {genome.name}
      </span>
    </div>
  )
}
