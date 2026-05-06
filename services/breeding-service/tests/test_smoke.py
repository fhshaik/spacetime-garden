from fastapi.testclient import TestClient

from app.main import app


def test_healthz_returns_ok() -> None:
    with TestClient(app) as client:
        response = client.get("/healthz")
        assert response.status_code == 200
        assert response.json() == {"status": "ok"}


def test_metrics_endpoint_exposed() -> None:
    with TestClient(app) as client:
        response = client.get("/metrics")
        assert response.status_code == 200
        assert b"# HELP" in response.content or b"# TYPE" in response.content


def test_breed_endpoint_returns_offspring() -> None:
    payload = {
        "parents": [
            {
                "name": "Schwarzschild",
                "spec": {
                    "base": {"kind": "schwarzschild"},
                    "features": [],
                    "parameters": {"M": 1.0},
                },
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
        ],
        "strength": 0.5,
        "target_count": 4,
    }
    with TestClient(app) as client:
        response = client.post("/breed", json=payload)
        assert response.status_code == 200
        body = response.json()
        assert "offspring" in body
        assert len(body["offspring"]) == 4
        for child in body["offspring"]:
            assert child["id"] is not None
            assert child["name"].startswith("Schwarzschild-")
            # full Genome shape preserved on the wire
            assert child["spec"]["base"]["kind"] in ("schwarzschild", "kerr")
            assert "diskBrightness" in child["view"]


def test_breed_rejects_empty_parents() -> None:
    with TestClient(app) as client:
        response = client.post("/breed", json={"parents": [], "strength": 0.5})
        # min_length=1 on the Pydantic field — Pydantic returns 422
        assert response.status_code == 422


def test_breed_rejects_invalid_strength() -> None:
    payload = {
        "parents": [_minimal_parent()],
        "strength": 5.0,  # out of [0, 1]
        "target_count": 4,
    }
    with TestClient(app) as client:
        response = client.post("/breed", json=payload)
        assert response.status_code == 422


def _minimal_parent() -> dict:
    return {
        "name": "P",
        "spec": {"base": {"kind": "schwarzschild"}, "features": [], "parameters": {"M": 1.0}},
        "view": {
            "inclination": 0.5,
            "diskBrightness": 0.5,
            "diskRadius": 0.5,
            "jetStrength": 0.1,
        },
        "phenotype": {
            "palette": "plasma",
            "jetMorph": "twin",
            "starSeed": 1,
            "diskTurbulence": 0.5,
        },
    }
