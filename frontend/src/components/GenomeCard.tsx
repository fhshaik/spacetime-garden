import type { MetricGenome } from '../types/genome'
import { metricToLatex } from '../utils/latex'
import { MetricLatex } from './MetricLatex'
import { MetricRenderer } from './MetricRenderer'

interface Props {
  genome: MetricGenome
  selected: boolean
  onSelect: (id: string) => void
}

export function GenomeCard({ genome, selected, onSelect }: Props) {
  // Prefer the spherical display form for clean physics notation; fall back
  // to the compute (Cartesian) form if a genome doesn't have one.
  const latex = metricToLatex(genome.displayMetric ?? genome.metric)
  return (
    <button
      onClick={() => onSelect(genome.id)}
      className={[
        'flex flex-col items-center gap-2 p-2 rounded-lg',
        'bg-[#0a0a12] border transition-all duration-200 cursor-pointer',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400',
        selected
          ? 'border-[#00f5ff] shadow-[0_0_0_2px_#00f5ff,0_0_24px_#00f5ff44]'
          : 'border-[#1a1a2e] hover:border-cyan-800',
      ].join(' ')}
    >
      <MetricRenderer genome={genome} />

      <MetricLatex
        latex={latex}
        className="text-[10px] text-slate-300 leading-snug max-w-[220px] overflow-x-auto px-1 py-1"
      />

      <span className="text-[11px] font-mono text-slate-400 tracking-widest uppercase pb-1">
        {genome.name}
      </span>
    </button>
  )
}
