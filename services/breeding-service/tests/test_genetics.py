"""
Property tests for the genetics port. RNG output isn't bit-identical to
the TS source (different generators), so these lock in *structural*
invariants — the things that have to be true regardless of the random
draws.
"""

import random

import pytest

from app.genetics import breed_generation
from app.schemas import (
    Feature,
    Genome,
    KerrBase,
    MetricSpec,
    Phenotype,
    SchwarzschildBase,
    ViewConfig,
)
from app.spec_meta import available_features_for_splice


def _schw_genome(
    name: str = "Schwarzschild",
    M: float = 1.0,
    inclination: float = 0.5,
    palette: str = "plasma",
) -> Genome:
    return Genome(
        name=name,
        spec=MetricSpec(
            base=SchwarzschildBase(kind="schwarzschild"),
            features=[],
            parameters={"M": M},
        ),
        view=ViewConfig(
            inclination=inclination,
            diskBrightness=0.6,
            diskRadius=0.5,
            jetStrength=0.1,
        ),
        phenotype=Phenotype(
            palette=palette,  # type: ignore[arg-type]
            jetMorph="twin",
            starSeed=17,
            diskTurbulence=0.7,
        ),
    )


def _kerr_genome(name: str = "Kerr", M: float = 1.0, a: float = 0.4) -> Genome:
    return Genome(
        name=name,
        spec=MetricSpec(
            base=KerrBase(kind="kerr"),
            features=[],
            parameters={"M": M, "a": a},
        ),
        view=ViewConfig(
            inclination=0.5, diskBrightness=0.6, diskRadius=0.5, jetStrength=0.1
        ),
        phenotype=Phenotype(
            palette="ice", jetMorph="twin", starSeed=99, diskTurbulence=0.5
        ),
    )


# ── target_count + degenerate inputs ───────────────────────────────────────


def test_breed_generation_returns_exact_target_count() -> None:
    parent = _schw_genome()
    for n in (1, 4, 8, 20):
        result = breed_generation([parent], strength=0.5, target_count=n)
        assert len(result) == n


def test_empty_parents_raises_value_error() -> None:
    with pytest.raises(ValueError, match="at least 1 parent"):
        breed_generation([], strength=0.5)


def test_offspring_have_unique_ids() -> None:
    parent = _schw_genome()
    result = breed_generation([parent], strength=0.5, target_count=20)
    ids = [c.id for c in result]
    assert len(set(ids)) == len(ids)


# ── strength=0 invariants ──────────────────────────────────────────────────


def test_strength_zero_single_parent_preserves_genome() -> None:
    parent = _schw_genome(M=1.7)
    result = breed_generation([parent], strength=0.0, target_count=5)
    for child in result:
        assert child.spec == parent.spec
        assert child.view == parent.view
        assert child.phenotype == parent.phenotype
        assert child.id is not None and child.id != parent.id


def test_strength_zero_two_parents_field_values_inherited() -> None:
    """With strength=0, no drift or reroll fires; crossover still mixes
    parents 50/50 per field, so each value must equal *one* parent's."""
    p1 = _schw_genome(name="A", M=1.0, inclination=0.20, palette="plasma")
    p2 = _schw_genome(name="B", M=2.5, inclination=0.90, palette="aurora")
    result = breed_generation([p1, p2], strength=0.0, target_count=20)
    for child in result:
        assert child.spec.parameters["M"] in (1.0, 2.5)
        assert child.view.inclination in (0.20, 0.90)
        assert child.phenotype.palette in ("plasma", "aurora")


# ── splice / prune / transition correctness ────────────────────────────────


def test_available_splice_excludes_already_present_features() -> None:
    spec = MetricSpec(
        base=SchwarzschildBase(kind="schwarzschild"),
        features=[Feature(kind="charge")],
        parameters={"M": 1.0, "Q": 0.2},
    )
    candidates = available_features_for_splice(spec)
    assert "charge" not in candidates


def test_available_splice_respects_hayward_bardeen_exclusivity() -> None:
    spec = MetricSpec(
        base=SchwarzschildBase(kind="schwarzschild"),
        features=[Feature(kind="hayward")],
        parameters={"M": 1.0, "ell": 0.5},
    )
    candidates = available_features_for_splice(spec)
    assert "bardeen" not in candidates
    assert "hayward" not in candidates


def test_available_splice_for_kerr_only_offers_charge() -> None:
    spec = MetricSpec(
        base=KerrBase(kind="kerr"),
        features=[],
        parameters={"M": 1.0, "a": 0.4},
    )
    assert available_features_for_splice(spec) == ["charge"]


# ── high-strength behaviour ────────────────────────────────────────────────


def test_high_strength_drifts_parameters() -> None:
    """With strength=1, drift std is 0.45 — most M values should move
    measurably away from 1.0."""
    random.seed(2026)
    parent = _schw_genome(M=1.0)
    result = breed_generation([parent], strength=1.0, target_count=30)
    drifted = [c for c in result if abs(c.spec.parameters.get("M", 1.0) - 1.0) > 0.01]
    # Most (>80%) should drift; loose bound to absorb RNG variability.
    assert len(drifted) >= 24


def test_positive_only_parameters_stay_positive_under_drift() -> None:
    """M must never go non-positive — otherwise the metric is unphysical."""
    random.seed(7)
    parent = _schw_genome(M=0.1)  # close to floor
    result = breed_generation([parent], strength=1.0, target_count=50)
    for child in result:
        assert child.spec.parameters["M"] >= 0.05  # _clamp_pos floor


# ── name lineage ───────────────────────────────────────────────────────────


def test_offspring_inherit_parent_base_name() -> None:
    parent = _schw_genome(name="MyLineage")
    result = breed_generation([parent], strength=0.3, target_count=5)
    for child in result:
        assert child.name.startswith("MyLineage-")
