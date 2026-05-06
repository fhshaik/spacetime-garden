from fastapi import APIRouter, status

from app.genetics import breed_generation
from app.schemas import BreedRequest, BreedResponse

router = APIRouter(tags=["breed"])


@router.post("/breed", response_model=BreedResponse, status_code=status.HTTP_200_OK)
async def breed(payload: BreedRequest) -> BreedResponse:
    offspring = breed_generation(
        parents=payload.parents,
        strength=payload.strength,
        target_count=payload.target_count,
    )
    return BreedResponse(offspring=offspring)
