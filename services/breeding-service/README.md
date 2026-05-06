# breeding-service

Stateless service that takes parent genomes and a mutation strength, returns
offspring. Pure compute — no DB. Horizontally scalable.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST`   | `/breed`     | Body `{parents, strength, target_count?}` → `{offspring: Genome[]}`. |
| `GET`    | `/healthz`   | Liveness. |
| `GET`    | `/metrics`   | Prometheus exposition. |

No `/readyz`: this service has no external dependencies.

## Architectural note

This service operates on `MetricSpec` (the JSON-able recipe). It does **not**
compile the spec to a renderable `Metric` AST — that's done client-side by
`frontend/src/utils/compileSpec.ts`. Keeping the compiler client-side keeps
the wire format tiny and the service stateless and language-portable.

## Local dev

```sh
uv sync
uv run uvicorn app.main:app --reload --port 8002
```

## Genetics port

Python translation of `frontend/src/utils/genetics.ts`. Property tests
(see `tests/test_genetics.py`) lock in the structural invariants — exact
equivalence between TS Math.random() and Python random isn't possible
(different RNGs), but the algorithm's *behavior* is.
