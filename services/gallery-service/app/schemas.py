"""
Wire schemas. Mirrors frontend/src/types/spec.ts for the spec/view/phenotype
shape (frontend needs all of it to render the gallery's BHs).
"""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class SchwarzschildBase(BaseModel):
    kind: Literal["schwarzschild"]


class KerrBase(BaseModel):
    kind: Literal["kerr"]


MetricBase = Annotated[SchwarzschildBase | KerrBase, Field(discriminator="kind")]

FeatureKind = Literal[
    "charge",
    "cosmological",
    "antiCharge",
    "order3",
    "order4",
    "yukawa",
    "hayward",
    "bardeen",
]


class Feature(BaseModel):
    kind: FeatureKind


class MetricSpec(BaseModel):
    base: MetricBase
    features: list[Feature] = Field(default_factory=list)
    parameters: dict[str, float] = Field(default_factory=dict)


class ViewConfig(BaseModel):
    inclination: float
    diskBrightness: float  # noqa: N815
    diskRadius: float  # noqa: N815
    jetStrength: float  # noqa: N815


Palette = Literal["plasma", "aurora", "magma", "ice", "toxic"]
JetMorph = Literal["none", "twin", "single", "helical"]


class Phenotype(BaseModel):
    palette: Palette
    jetMorph: JetMorph  # noqa: N815
    starSeed: int  # noqa: N815
    diskTurbulence: float  # noqa: N815


class GalleryItem(BaseModel):
    """One row of the gallery: a genome plus its like count."""

    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    spec: MetricSpec
    view: ViewConfig
    phenotype: Phenotype
    like_count: int


class LikeResponse(BaseModel):
    like_count: int
