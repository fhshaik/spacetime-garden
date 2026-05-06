"""
Wire schemas for genome-service. Mirrors frontend/src/types/{spec,genome}.ts
JSON-shape exactly so the API boundary is round-trippable from the frontend.

Field names use camelCase intentionally (e.g. `diskBrightness`, `jetMorph`)
to match the TS source. Don't rename to snake_case — the JSONB columns
already store the camelCase keys.
"""

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

# ── Base + features (discriminated by `kind`) ──────────────────────────────


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
    diskBrightness: float  # noqa: N815  (mirrors TS field name)
    diskRadius: float  # noqa: N815
    jetStrength: float  # noqa: N815


Palette = Literal["plasma", "aurora", "magma", "ice", "toxic"]
JetMorph = Literal["none", "twin", "single", "helical"]


class Phenotype(BaseModel):
    palette: Palette
    jetMorph: JetMorph  # noqa: N815
    starSeed: int  # noqa: N815
    diskTurbulence: float  # noqa: N815


# ── Genome request/response models ─────────────────────────────────────────


class GenomeIn(BaseModel):
    name: str
    spec: MetricSpec
    view: ViewConfig
    phenotype: Phenotype
    owner: str | None = None


class GenomeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    spec: MetricSpec
    view: ViewConfig
    phenotype: Phenotype
    owner: str | None
    created_at: datetime
    updated_at: datetime
