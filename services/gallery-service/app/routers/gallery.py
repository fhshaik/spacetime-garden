from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import desc, func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.cache import TTLCache
from app.db import get_session
from app.models import GalleryLike, Genome
from app.schemas import GalleryItem, LikeResponse
from app.settings import settings

router = APIRouter(prefix="/gallery", tags=["gallery"])

# Module-level cache shared across requests in this worker. Each gunicorn
# worker has its own — eventual consistency across workers is fine for a
# public gallery feed.
_gallery_cache: TTLCache[tuple[int, int], list[dict]] = TTLCache(
    maxsize=settings.gallery_cache_size,
    ttl_seconds=settings.gallery_cache_ttl_seconds,
)


def _client_ip(request: Request) -> str:
    """Trust X-Forwarded-For from the ALB; fall back to the direct peer."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "0.0.0.0"


@router.get("", response_model=list[GalleryItem])
async def list_gallery(
    session: Annotated[AsyncSession, Depends(get_session)],
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> list[dict]:
    cache_key = (limit, offset)
    cached = _gallery_cache.get(cache_key)
    if cached is not None:
        return cached

    stmt = (
        select(
            Genome.id,
            Genome.name,
            Genome.spec,
            Genome.view,
            Genome.phenotype,
            func.count(GalleryLike.liker_ip).label("like_count"),
        )
        .outerjoin(GalleryLike, GalleryLike.genome_id == Genome.id)
        .group_by(Genome.id)
        .order_by(desc("like_count"), desc(Genome.created_at))
        .limit(limit)
        .offset(offset)
    )
    result = await session.execute(stmt)
    items = [
        {
            "id": row.id,
            "name": row.name,
            "spec": row.spec,
            "view": row.view,
            "phenotype": row.phenotype,
            "like_count": row.like_count,
        }
        for row in result.all()
    ]
    _gallery_cache.set(cache_key, items)
    return items


@router.post(
    "/{genome_id}/like",
    response_model=LikeResponse,
    status_code=status.HTTP_200_OK,
)
async def like_genome(
    genome_id: UUID,
    request: Request,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> LikeResponse:
    # 404 fast if genome doesn't exist — avoids opaque FK violation on insert.
    exists = await session.scalar(select(Genome.id).where(Genome.id == genome_id).limit(1))
    if exists is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Genome not found")

    liker_ip = _client_ip(request)

    # Idempotent: (genome_id, liker_ip) is the PK. Re-likes are no-ops.
    insert_stmt = (
        insert(GalleryLike)
        .values(genome_id=genome_id, liker_ip=liker_ip)
        .on_conflict_do_nothing(index_elements=["genome_id", "liker_ip"])
    )
    await session.execute(insert_stmt)
    await session.commit()

    count = await session.scalar(
        select(func.count(GalleryLike.liker_ip)).where(GalleryLike.genome_id == genome_id)
    )
    # Liking invalidates the cache (the top-N ordering may have shifted).
    _gallery_cache.clear()
    return LikeResponse(like_count=count or 0)
