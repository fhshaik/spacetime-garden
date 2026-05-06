"""
Python port of frontend/src/utils/genetics.ts.

The TS source is authoritative for the algorithm shape; this module
preserves the same control flow and probability constants. RNG output
is *not* bit-identical to TS Math.random() — different generators —
but the structural invariants (target_count, base preservation under
crossover, splice avoiding duplicates, etc.) are tested in
tests/test_genetics.py.

Operates on MetricSpec (the JSON-able recipe). The compiled Metric AST
stays client-side in compileSpec.ts; this service never sees it.
"""

import random
from uuid import uuid4

from app.schemas import (
    Feature,
    Genome,
    KerrBase,
    MetricSpec,
    Phenotype,
    SchwarzschildBase,
    ViewConfig,
)
from app.spec_meta import (
    FEATURE_PARAM_DEFAULTS,
    JET_MORPH_NAMES,
    PALETTE_NAMES,
    available_features_for_splice,
)

# Magnitude parameters that must stay positive for the metric to be physical.
# Everything else (Lambda, c3, c4, cy) is allowed to drift through zero —
# that's where free sign flips come from.
POSITIVE_ONLY = frozenset({"M", "Q", "Qa", "a", "ell", "eb", "Ly"})


def _gaussian(std_dev: float) -> float:
    return random.gauss(0.0, std_dev)


def _clamp01(v: float) -> float:
    return max(0.0, min(1.0, v))


def _clamp_pos(v: float, eps: float = 0.05) -> float:
    return max(eps, v)


# ── Spec mutation: drift / splice / prune / transition ─────────────────────


def _drift_parameters(params: dict[str, float], std: float) -> dict[str, float]:
    out: dict[str, float] = {}
    for k, v in params.items():
        drifted = v + _gaussian(std) * (abs(v) + 0.05)
        out[k] = _clamp_pos(drifted) if k in POSITIVE_ONLY else drifted
    return out


def _splice_feature(spec: MetricSpec) -> MetricSpec:
    candidates = available_features_for_splice(spec)
    if not candidates:
        return spec
    kind = random.choice(candidates)
    defaults = FEATURE_PARAM_DEFAULTS[kind]
    return MetricSpec(
        base=spec.base,
        features=[*spec.features, Feature(kind=kind)],
        parameters={**spec.parameters, **defaults},
    )


def _prune_feature(spec: MetricSpec) -> MetricSpec:
    if not spec.features:
        return spec
    idx = random.randrange(len(spec.features))
    removed = spec.features[idx]
    removed_params = FEATURE_PARAM_DEFAULTS[removed.kind]
    new_params = {k: v for k, v in spec.parameters.items() if k not in removed_params}
    new_features = [f for i, f in enumerate(spec.features) if i != idx]
    return MetricSpec(base=spec.base, features=new_features, parameters=new_params)


def _transition_base(spec: MetricSpec) -> MetricSpec:
    M = spec.parameters.get("M", 1.0)
    if spec.base.kind == "schwarzschild":
        return MetricSpec(
            base=KerrBase(kind="kerr"),
            features=[],
            parameters={"M": M, "a": 0.40},
        )
    return MetricSpec(
        base=SchwarzschildBase(kind="schwarzschild"),
        features=[],
        parameters={"M": M},
    )


def _mutate_spec(spec: MetricSpec, std: float, reroll_rate: float) -> MetricSpec:
    out = MetricSpec(
        base=spec.base,
        features=spec.features,
        parameters=_drift_parameters(spec.parameters, std),
    )
    if random.random() < reroll_rate * 0.45:
        out = _splice_feature(out)
    if random.random() < reroll_rate * 0.30:
        out = _prune_feature(out)
    if random.random() < reroll_rate * 0.10:
        out = _transition_base(out)
    return out


# ── View / phenotype mutation ──────────────────────────────────────────────


def _mutate_view(v: ViewConfig, std: float) -> ViewConfig:
    return ViewConfig(
        inclination=_clamp01(v.inclination + _gaussian(std)),
        diskBrightness=_clamp01(v.diskBrightness + _gaussian(std)),
        diskRadius=_clamp01(v.diskRadius + _gaussian(std)),
        jetStrength=_clamp01(v.jetStrength + _gaussian(std)),
    )


def _mutate_phenotype(p: Phenotype, std: float, reroll_rate: float) -> Phenotype:
    return Phenotype(
        palette=random.choice(PALETTE_NAMES) if random.random() < reroll_rate else p.palette,
        jetMorph=random.choice(JET_MORPH_NAMES) if random.random() < reroll_rate else p.jetMorph,
        starSeed=random.randint(0, 999) if random.random() < reroll_rate else p.starSeed,
        diskTurbulence=_clamp01(p.diskTurbulence + _gaussian(std)),
    )


# ── Crossover ──────────────────────────────────────────────────────────────


def _cross_specs(a: MetricSpec, b: MetricSpec) -> MetricSpec:
    # Different bases: inherit one wholesale (can't usefully merge spaces).
    if a.base.kind != b.base.kind:
        return a if random.random() < 0.5 else b

    a_kinds = {f.kind for f in a.features}
    b_kinds = {f.kind for f in b.features}
    features: list[Feature] = []
    for kind in a_kinds | b_kinds:
        in_both = kind in a_kinds and kind in b_kinds
        if in_both or random.random() < 0.5:
            features.append(Feature(kind=kind))

    # Mix parameter values when both parents have the key, else inherit.
    parameters: dict[str, float] = {}
    for k in set(a.parameters) | set(b.parameters):
        if k in a.parameters and k in b.parameters:
            parameters[k] = a.parameters[k] if random.random() < 0.5 else b.parameters[k]
        elif k in a.parameters:
            parameters[k] = a.parameters[k]
        else:
            parameters[k] = b.parameters[k]

    # Filter to what the resulting (base + features) actually requires; fill
    # missing keys with defaults (a child's feature set may be a superset of
    # either parent's, so a required param may not be in `parameters`).
    required: dict[str, float] = {}
    if a.base.kind == "kerr":
        required["M"] = 1.0
        required["a"] = 0.4
    elif a.base.kind == "schwarzschild":
        required["M"] = 1.0
    for f in features:
        for k, default in FEATURE_PARAM_DEFAULTS[f.kind].items():
            required[k] = default

    filtered = {k: parameters.get(k, fallback) for k, fallback in required.items()}
    return MetricSpec(base=a.base, features=features, parameters=filtered)


def _crossover(a: Genome, b: Genome) -> Genome:
    view = ViewConfig(
        inclination=a.view.inclination if random.random() < 0.5 else b.view.inclination,
        diskBrightness=(
            a.view.diskBrightness if random.random() < 0.5 else b.view.diskBrightness
        ),
        diskRadius=a.view.diskRadius if random.random() < 0.5 else b.view.diskRadius,
        jetStrength=a.view.jetStrength if random.random() < 0.5 else b.view.jetStrength,
    )
    phenotype = Phenotype(
        palette=a.phenotype.palette if random.random() < 0.5 else b.phenotype.palette,
        jetMorph=a.phenotype.jetMorph if random.random() < 0.5 else b.phenotype.jetMorph,
        starSeed=a.phenotype.starSeed if random.random() < 0.5 else b.phenotype.starSeed,
        diskTurbulence=(
            a.phenotype.diskTurbulence
            if random.random() < 0.5
            else b.phenotype.diskTurbulence
        ),
    )
    base_name = a.name.split("-")[0]
    return _build_child(_cross_specs(a.spec, b.spec), view, phenotype, base_name)


# ── Top-level: build_child / mutate / breed_generation ─────────────────────


def _build_child(
    spec: MetricSpec, view: ViewConfig, phenotype: Phenotype, base_name: str
) -> Genome:
    new_id = uuid4()
    return Genome(
        id=new_id,
        name=f"{base_name}-{str(new_id)[-3:]}",
        spec=spec,
        view=view,
        phenotype=phenotype,
    )


def _mutate(g: Genome, std: float, reroll_rate: float) -> Genome:
    base_name = g.name.split("-")[0]
    return _build_child(
        _mutate_spec(g.spec, std, reroll_rate),
        _mutate_view(g.view, std),
        _mutate_phenotype(g.phenotype, std, reroll_rate),
        base_name,
    )


def breed_generation(
    parents: list[Genome], strength: float = 0.5, target_count: int = 6
) -> list[Genome]:
    """Produce `target_count` offspring from one or more parents.

    `strength` ∈ [0, 1] dilates Gaussian σ and reroll/splice/prune
    probabilities. With strength=0, offspring are near-identical to parents
    (only new id/name; numeric drift is zero, reroll probability is zero).
    """
    if not parents:
        raise ValueError("breed_generation requires at least 1 parent")

    s = max(0.0, min(1.0, strength))
    std = s * 0.45
    reroll_rate = s * 0.85

    if len(parents) == 1:
        return [_mutate(parents[0], std, reroll_rate) for _ in range(target_count)]

    offspring: list[Genome] = []
    for _ in range(target_count):
        idx_a = random.randrange(len(parents))
        idx_b = random.randrange(len(parents) - 1)
        if idx_b >= idx_a:
            idx_b += 1
        # Crossover already mixes from two parents; soften the post-mutation.
        child = _mutate(
            _crossover(parents[idx_a], parents[idx_b]),
            std * 0.5,
            reroll_rate * 0.5,
        )
        offspring.append(child)
    return offspring
