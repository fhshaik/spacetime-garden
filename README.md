# Spacetime Garden

> A black hole genome breeder turned into a production-ready DevOps demo.
> See [`PLAN.md`](./PLAN.md) for the full project plan and rubric coverage.

## Architecture

```
                       Internet (HTTPS, ACM cert)
                              │
                       ┌──────┴───────┐
                       │     ALB      │   ← path-based routing strips /api/
                       └──────┬───────┘
                              │
   ┌─────────────┬────────────┼────────────────────┐
   │             │            │                    │
 /  (SPA)   /api/genomes  /api/breed         /api/gallery
   │             │            │                    │
┌──┴────┐  ┌─────┴────────┐  ┌┴────────────┐  ┌────┴────────────┐
│ nginx │  │genome-service│  │breeding-svc │  │gallery-service  │
│ React │  │  FastAPI     │  │  FastAPI    │  │  FastAPI        │
└───────┘  └──────┬───────┘  └─────────────┘  └────────┬────────┘
                  │                                     │
                  └────────────┬────────────────────────┘
                               │
                        ┌──────┴───────┐
                        │  RDS Postgres│
                        └──────────────┘
```

| Service             | Port (host)  | Stack                       | Owns                  |
|---------------------|:---:|---------------------------------------|------------------------|
| `frontend`          | 8080 (or 5173 in vite dev) | React 18 + Vite + Three.js + KaTeX | UI & Three.js render |
| `genome-service`    | 8001 | FastAPI + SQLAlchemy + Alembic     | `genomes` table |
| `breeding-service`  | 8002 | FastAPI (stateless)                | Genetics algorithm |
| `gallery-service`   | 8003 | FastAPI + read-mostly Postgres     | `gallery_likes` (read of `genomes`) |
| `postgres`          | 5432 | Postgres 16 (RDS in prod)          | DB |

The split is deliberate: write-heavy CRUD vs stateless compute vs
read-heavy social — three distinct scaling profiles to talk about during
the canary-rollout demo.

## Repo layout

```
spacetime-garden/                   # ← this repo (application code)
├── frontend/                       # React + Vite + Three.js
├── services/
│   ├── genome-service/             # CRUD; owns DB schema (Alembic)
│   ├── breeding-service/           # Genetics port of frontend/src/utils/genetics.ts
│   └── gallery-service/            # Read-heavy gallery + likes
├── docker-compose.yml              # Local dev stack
├── Makefile                        # `make help` to list targets
├── PLAN.md                         # The DevOps plan
└── .github/workflows/              # CI (build, test, push to ECR) + GitOps promotion
```

Infra (Terraform, Argo CD manifests, Helm values) lives in a **separate
repo** — see `PLAN.md` §3.

## Quickstart (local)

```sh
make dev               # postgres + 3 services up; alembic migrations run
make frontend-dev      # in another terminal — vite proxy forwards /api/*
# Open http://localhost:5173
```

Stop and clean:
```sh
make down              # stop containers, keep DB volume
make clean             # stop AND drop the postgres volume
```

Useful targets:
```sh
make help              # list all targets
make test              # pytest across all 3 services
make psql              # open a psql shell on the dev DB
make migrate           # re-run alembic upgrade head
```

## Wire format

The API boundary is `MetricSpec` — the JSON-able recipe (base + features +
parameters). The compiled `Metric` AST stays client-side (in
`frontend/src/utils/compileSpec.ts`) since it's only consumed by the
Three.js shader and KaTeX renderer. Keeping the compiler client-side
keeps the wire payload tiny and the breeding service language-portable.

After every API response that returns a `MetricSpec`, the frontend runs
`compileSpec` locally to fill in `metric` and `displayMetric` before
rendering.

## Migrations

`genome-service` owns the entire Alembic version graph — even the
`gallery_likes` table consumed by `gallery-service`. Single-owner
migrations avoid version-graph collisions when multiple services share
a database.

```sh
cd services/genome-service
DATABASE_URL=postgresql+asyncpg://garden:garden@localhost/garden \
  uv run alembic revision -m "add foo column" --autogenerate
```

In production the `migrate` compose service becomes an Argo CD `PreSync`
Job (manifest lives in the infra repo) — same image, same
`alembic upgrade head` command.
