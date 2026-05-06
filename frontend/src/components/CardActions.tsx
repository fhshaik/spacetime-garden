import type { MouseEvent } from 'react'

interface SaveButtonProps {
  onClick: () => void
  saved?: boolean
}

/** Tiny corner button. Stops propagation so the parent card's
 *  click-to-select doesn't fire when the user is just saving / liking. */
export function SaveButton({ onClick, saved = false }: SaveButtonProps) {
  const handle = (e: MouseEvent) => {
    e.stopPropagation()
    if (!saved) onClick()
  }
  return (
    <button
      onClick={handle}
      disabled={saved}
      className={[
        'px-2 py-0.5 rounded font-mono text-[10px] tracking-widest uppercase',
        'border bg-black/40 transition-all duration-150',
        saved
          ? 'border-emerald-700 text-emerald-300 cursor-default'
          : 'border-cyan-800 text-cyan-300 hover:border-cyan-400 hover:text-cyan-100 hover:bg-cyan-950/40',
      ].join(' ')}
    >
      {saved ? 'Saved' : 'Save'}
    </button>
  )
}

interface LikeButtonProps {
  count: number
  onClick: () => void
}

export function LikeButton({ count, onClick }: LikeButtonProps) {
  const handle = (e: MouseEvent) => {
    e.stopPropagation()
    onClick()
  }
  return (
    <button
      onClick={handle}
      className="
        px-2 py-0.5 rounded font-mono text-[10px] tracking-widest uppercase
        border border-pink-800 bg-black/40 text-pink-300
        hover:border-pink-400 hover:text-pink-100 hover:bg-pink-950/40
        transition-all duration-150
      "
    >
      ♥ {count}
    </button>
  )
}
