"""
Spec metadata (defaults, splice rules, palette/jet enumerations).
Mirrors frontend/src/types/spec.ts and frontend/src/data/palettes.ts —
keep in sync with those.
"""

from typing import get_args

from app.schemas import FeatureKind, JetMorph, MetricSpec, Palette

FEATURE_PARAM_DEFAULTS: dict[FeatureKind, dict[str, float]] = {
    "charge":       {"Q":      0.20},
    "cosmological": {"Lambda": 0.005},
    "antiCharge":   {"Qa":     0.20},
    "order3":       {"c3":     0.30},
    "order4":       {"c4":     0.30},
    "yukawa":       {"cy":     0.30, "Ly": 4.0},
    "hayward":      {"ell":    0.50},
    "bardeen":      {"eb":     0.50},
}

# Hayward and Bardeen are mutually exclusive (both replace the mass term).
_BASE_FEATURES: dict[str, list[FeatureKind]] = {
    "schwarzschild": [
        "charge", "cosmological", "antiCharge",
        "order3", "order4", "yukawa", "hayward", "bardeen",
    ],
    "kerr": ["charge"],
}

PALETTE_NAMES: tuple[Palette, ...] = get_args(Palette)
JET_MORPH_NAMES: tuple[JetMorph, ...] = get_args(JetMorph)


def available_features_for_splice(spec: MetricSpec) -> list[FeatureKind]:
    """Feature kinds eligible to splice into this spec, excluding ones already
    present and respecting Hayward↔Bardeen exclusivity."""
    present = {f.kind for f in spec.features}
    base_kinds = _BASE_FEATURES[spec.base.kind]
    candidates = [k for k in base_kinds if k not in present]
    if "hayward" in present:
        candidates = [k for k in candidates if k != "bardeen"]
    if "bardeen" in present:
        candidates = [k for k in candidates if k != "hayward"]
    return candidates
