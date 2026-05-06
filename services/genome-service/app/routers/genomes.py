from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_session
from app.models import Genome
from app.schemas import GenomeIn, GenomeOut

router = APIRouter(prefix="/genomes", tags=["genomes"])


@router.post("", response_model=GenomeOut, status_code=status.HTTP_201_CREATED)
async def create_genome(
    payload: GenomeIn,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Genome:
    row = Genome(
        name=payload.name,
        spec=payload.spec.model_dump(),
        view=payload.view.model_dump(),
        phenotype=payload.phenotype.model_dump(),
        owner=payload.owner,
    )
    session.add(row)
    await session.commit()
    await session.refresh(row)
    return row


@router.get("", response_model=list[GenomeOut])
async def list_genomes(
    session: Annotated[AsyncSession, Depends(get_session)],
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> list[Genome]:
    stmt = select(Genome).order_by(Genome.created_at.desc()).limit(limit).offset(offset)
    result = await session.execute(stmt)
    return list(result.scalars().all())


@router.get("/{genome_id}", response_model=GenomeOut)
async def get_genome(
    genome_id: UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> Genome:
    row = await session.get(Genome, genome_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Genome not found")
    return row


@router.delete("/{genome_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_genome(
    genome_id: UUID,
    session: Annotated[AsyncSession, Depends(get_session)],
) -> None:
    row = await session.get(Genome, genome_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Genome not found")
    await session.delete(row)
    await session.commit()
