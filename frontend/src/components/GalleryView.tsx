import { hydrate } from '../api/hydrate'
import type { GalleryItem } from '../api/client'
import { GenomeCard } from './GenomeCard'
import { LikeButton } from './CardActions'

interface Props {
  items: GalleryItem[]
  onLike: (genomeId: string) => void
  onOpen: (genomeId: string) => void
}

export function GalleryView({ items, onLike, onOpen }: Props) {
  if (items.length === 0) {
    return (
      <div className="text-slate-600 text-xs tracking-[0.2em] uppercase select-none my-12">
        Gallery is empty — save a genome from the breed view to populate it.
      </div>
    )
  }

  return (
    <main className="grid grid-cols-3 gap-4 mb-8">
      {items.map((item) => {
        const genome = hydrate(item)
        return (
          <GenomeCard
            key={item.id}
            genome={genome}
            onOpen={onOpen}
            actionButton={
              <LikeButton count={item.like_count} onClick={() => onLike(item.id)} />
            }
          />
        )
      })}
    </main>
  )
}
