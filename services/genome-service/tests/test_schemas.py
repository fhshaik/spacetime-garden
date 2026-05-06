"""
Schema round-trip tests — assert the Pydantic models accept exactly the
JSON shape produced by frontend/src/types/spec.ts and frontend/src/types/genome.ts.
If these break, the wire format diverged and the frontend can't talk to us.
"""

import pytest
from pydantic import ValidationError

from app.schemas import GenomeIn, MetricSpec, Phenotype, ViewConfig


def test_schwarzschild_spec_round_trip() -> None:
    raw = {
        "base": {"kind": "schwarzschild"},
        "features": [{"kind": "charge"}],
        "parameters": {"M": 1.0, "Q": 0.55},
    }
    spec = MetricSpec.model_validate(raw)
    assert spec.base.kind == "schwarzschild"
    assert spec.features[0].kind == "charge"
    assert spec.model_dump() == raw


def test_kerr_spec_round_trip() -> None:
    raw = {
        "base": {"kind": "kerr"},
        "features": [],
        "parameters": {"M": 1.6, "a": 0.7},
    }
    spec = MetricSpec.model_validate(raw)
    assert spec.base.kind == "kerr"
    assert spec.model_dump() == raw


def test_invalid_base_kind_rejected() -> None:
    with pytest.raises(ValidationError):
        MetricSpec.model_validate({"base": {"kind": "minkowski"}, "features": [], "parameters": {}})


def test_view_config_camelcase_keys() -> None:
    raw = {"inclination": 0.5, "diskBrightness": 0.8, "diskRadius": 0.5, "jetStrength": 0.2}
    view = ViewConfig.model_validate(raw)
    assert view.diskBrightness == 0.8
    assert view.model_dump() == raw


def test_phenotype_camelcase_keys() -> None:
    raw = {"palette": "plasma", "jetMorph": "twin", "starSeed": 17, "diskTurbulence": 0.7}
    phen = Phenotype.model_validate(raw)
    assert phen.jetMorph == "twin"
    assert phen.model_dump() == raw


def test_genome_in_full_payload() -> None:
    raw = {
        "name": "Schwarzschild",
        "spec": {"base": {"kind": "schwarzschild"}, "features": [], "parameters": {"M": 1.0}},
        "view": {
            "inclination": 0.55,
            "diskBrightness": 0.6,
            "diskRadius": 0.5,
            "jetStrength": 0.1,
        },
        "phenotype": {
            "palette": "plasma",
            "jetMorph": "twin",
            "starSeed": 17,
            "diskTurbulence": 0.7,
        },
    }
    genome = GenomeIn.model_validate(raw)
    assert genome.name == "Schwarzschild"
    assert genome.owner is None
