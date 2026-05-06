"""
Wire schemas. Mirrors frontend/src/types/{spec,genome}.ts. camelCase
field names preserved intentionally so JSON round-trips with the frontend
without translation.

Compared to genome-service: the breeding service uses a single combined
Genome model (id is optional on input, set on output) since it's purely
transit — it doesn't write to a DB.
"""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, Field

# ── Base + features ────────────────────────────────────────────────────────


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


# ── MetricSpec / ViewConfig / Phenotype ────────────────────────────────────


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


# ── Genome (in/out) and request/response ───────────────────────────────────


class Genome(BaseModel):
    """id is optional on input (parents may carry frontend-local IDs we
    ignore) and always set on output (offspring with server UUIDs)."""

    id: UUID | None = None
    name: str
    spec: MetricSpec
    view: ViewConfig
    phenotype: Phenotype


class BreedRequest(BaseModel):
    parents: list[Genome] = Field(min_length=1)
    strength: float = Field(0.5, ge=0.0, le=1.0)
    target_count: int = Field(6, ge=1, le=20)


class BreedResponse(BaseModel):
    offspring: list[Genome]
