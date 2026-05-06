# Spacetime Garden — DevOps Final Project Plan

**Course:** Production-Ready DevOps Orchestration
**Due:** Sunday 2026-05-10, 11:59 PM
**Today:** 2026-05-05 (Tuesday) → **5 days, including 1 buffer day**
**Presentation:** 8 minutes, narrated live

> **Reality check.** A full implementation of the rubric is ~2–3 weeks of work. This plan is sequenced so we have a *fully demoable* slice by Day 3, then layer rubric items on top in priority-by-points order. Every phase has a "minimum viable deliverable" and a "stretch" — we cut stretch first if behind.

---

## 1. Architecture at a glance

**Frontend:** Existing React + Vite + Three.js + Tailwind app in this repo (`spacetime-garden`). Already visually distinctive — leverages the WOW factor for free.

**Backend (3 microservices, Python FastAPI):**

| Service | Responsibility | Why it's a real service (not a fake split) |
|---|---|---|
| `genome-service` | CRUD for persisted genomes. Save / load / list named designs per user. | Write-heavy, transactional. Owns the `genomes` table. |
| `breeding-service` | Stateless compute. Takes parent genomes + mutation strength → returns offspring. Port of `src/utils/genetics.ts`. | CPU-bound, horizontally scalable. No DB. Perfect canary subject (analyzable RPS/latency). |
| `gallery-service` | Public read-only gallery + like counts. Caches hot results. | Read-heavy, eventually-consistent. Demonstrates a different scaling profile than the other two. |

The split is *justified* (the rubric rewards a clear architectural narrative): one write-heavy CRUD, one stateless compute, one read-heavy social — three distinct scaling/reliability concerns to talk about during the canary demo.

**Database:** AWS RDS PostgreSQL 16, single-AZ in dev, multi-AZ in prod-tier. Schema owned by `genome-service` via Alembic migrations.

**Cluster:** EKS 1.30, 2× managed node groups (general + spot for batch).

**Custom DNS / TLS:** Route53-registered domain (TBD, e.g., `spacetimegarden.dev`). ACM cert + AWS Load Balancer Controller (ALB ingress). External-DNS automates record creation.

```
                 ┌───────────────────────────────────────────────────┐
                 │  Internet                                          │
                 └────────────┬──────────────────────────────────────┘
                              │ HTTPS (ACM cert)
                       ┌──────┴───────┐
                       │     ALB      │  ← AWS Load Balancer Controller
                       └──────┬───────┘
                              │
       ┌──────────────┬───────┴────────┬────────────────────┐
       │              │                │                    │
  /  (frontend)  /api/genomes    /api/breed         /api/gallery
       │              │                │                    │
  ┌────▼────┐   ┌─────▼────────┐  ┌───▼─────────┐  ┌────────▼────────┐
  │ web (nginx)│ │genome-service│ │breeding-svc │  │gallery-service  │
  │  (React)   │ │  FastAPI     │ │  FastAPI    │  │  FastAPI        │
  └────────────┘ └──────┬───────┘  └─────────────┘  └────────┬────────┘
                        │                                     │
                        └────────────┬────────────────────────┘
                                     │
                              ┌──────▼───────┐
                              │  RDS Postgres│
                              └──────────────┘

   In-cluster:  Argo CD · Argo Rollouts · Prometheus · Loki · Grafana · Promtail · cert-manager · external-dns
```

---

## 2. Tech stack (locked decisions)

| Layer | Choice | Why |
|---|---|---|
| IaC | **Terraform** (modules: vpc, eks, rds, iam, dns, addons) | Required by rubric. Remote state in S3 + DynamoDB lock. |
| Cluster | **EKS 1.30** | Required (no AWS-managed-only services for observability). |
| App runtime | **Python 3.12 + FastAPI**, uvicorn behind gunicorn | One language → faster to debug live during chaos defense. |
| DB migrations | **Alembic** (owned by genome-service) | Best-in-class Python migration tool — clean schema-change demo. |
| Frontend | **React 18 + Vite** (existing) + nginx container | Reuse what we have. |
| CI | **GitHub Actions** | Already on GitHub. |
| CD | **Argo CD** (app-of-apps pattern) | True GitOps narrative. Manifests in `gitops/` repo (or `gitops/` folder). |
| Rollouts | **Argo Rollouts — Canary** with Prometheus analysis | Required: justify strategy. Canary's progressive % steps look great on stream. |
| Ingress | **AWS Load Balancer Controller** + ALB | Native, cheap, supports weighted routing for canary. |
| TLS | **AWS Certificate Manager** + cert-manager (for in-cluster certs if needed) | ACM is free + auto-renewed. |
| DNS | **Route53** + external-dns | Buy domain on Day 0. |
| Metrics | **kube-prometheus-stack** (Prometheus + node-exporter + kube-state-metrics + Grafana) | Self-hosted, in-cluster, single Helm chart. |
| Logs | **Loki + Promtail** | Lightweight, integrates into the same Grafana. |
| Alerts | **Alertmanager → SMTP (Gmail app password) + Slack webhook** | Email is required; Slack is bonus. |
| Grafana auth | **GitHub OAuth** | Easiest to set up; org-restricted. |
| Secrets | **AWS Secrets Manager** + External Secrets Operator | No secrets in git. RDS password, GitHub OAuth client secret, SMTP password live here. |

---

## 3. Repo layout

We'll keep this monorepo for speed (one PR can touch app + IaC + manifests) but with a clean structure:

```
spacetime-garden/
├── frontend/                 # existing React app (move src/ → frontend/src/)
│   └── Dockerfile
├── services/
│   ├── genome-service/
│   │   ├── app/              # FastAPI app
│   │   ├── alembic/          # migrations
│   │   ├── tests/
│   │   └── Dockerfile
│   ├── breeding-service/
│   └── gallery-service/
├── infra/
│   └── terraform/
│       ├── envs/
│       │   ├── dev/
│       │   ├── uat/
│       │   └── prod/
│       └── modules/
│           ├── vpc/
│           ├── eks/
│           ├── rds/
│           ├── dns/
│           └── cluster-addons/   # AWS LB Controller, external-dns, cert-manager, ESO
├── gitops/
│   ├── apps/                 # Argo CD Application manifests (app-of-apps)
│   ├── platform/             # Helm charts: prom-stack, loki, argo-rollouts, argo-cd bootstrap
│   └── envs/
│       ├── dev/values.yaml
│       ├── uat/values.yaml
│       └── prod/values.yaml
├── .github/workflows/
│   ├── ci.yaml               # build + test + image push on every push
│   ├── promote-uat.yaml      # triggered by RC tags / PR merges
│   └── promote-prod.yaml     # triggered by v* release tags
└── PLAN.md                   # this file
```

---

## 4. Day-by-day execution plan

### **Day 0 — Tue 2026-05-05 (today, evening)**
*Goal: unblock everything that has external wait time.*

- [ ] **Buy domain in Route53** (e.g., `spacetimegarden.dev`). NS propagation can take hours. **Do this first.**
- [ ] Create AWS account / confirm access. Set up `aws` CLI + named profile.
- [ ] Create S3 bucket + DynamoDB table for Terraform remote state.
- [ ] Create GitHub OAuth App for Grafana (callback URL TBD — placeholder OK).
- [ ] Decide on Gmail account + app password for SMTP alerts.
- [ ] Scaffold the repo layout above (move `src/` → `frontend/src/`, create empty `services/*/`).

**Deliverable:** Domain registered, Terraform state backend live, repo restructured.

---

### **Day 1 — Wed 2026-05-06: Infra (Terraform Day 1)**
*Goal: clean `terraform apply` of the whole platform from zero.*

- [ ] `modules/vpc` — 3 AZs, public + private subnets, NAT gateway (single NAT for cost).
- [ ] `modules/eks` — managed node group (3× t3.medium on-demand), OIDC provider, IRSA.
- [ ] `modules/rds` — Postgres 16, db.t3.micro for dev, encrypted, in private subnet, password in Secrets Manager.
- [ ] `modules/dns` — Route53 zone reference, ACM cert (DNS validation).
- [ ] `modules/cluster-addons` — installed via Helm provider:
  - aws-load-balancer-controller (with IRSA)
  - external-dns (with IRSA)
  - cert-manager
  - external-secrets-operator
  - argo-cd (bootstrap)
  - argo-rollouts
  - kube-prometheus-stack
  - loki + promtail
- [ ] `envs/dev/main.tf` wires modules together. Same pattern duplicated to `uat/` and `prod/` (different sizing only).

**Demo angle:** record a silent screen capture of `terraform apply` start-to-finish for the presentation video (the rubric allows silent video for long-running ops).

**Deliverable:** `kubectl get nodes` works on dev. Argo CD UI reachable via port-forward.

---

### **Day 2 — Thu 2026-05-07: App + CI**
*Goal: 3 services + frontend running on EKS via Argo CD, end-to-end.*

- [ ] **genome-service** (FastAPI):
  - Endpoints: `POST /genomes`, `GET /genomes`, `GET /genomes/{id}`, `DELETE /genomes/{id}`.
  - SQLAlchemy + Alembic, initial migration (`genomes` table: id, name, spec_json, view_json, phenotype_json, owner, created_at).
  - `/healthz` and `/metrics` (prometheus_client).
- [ ] **breeding-service** (FastAPI):
  - `POST /breed` body: `{parents: [genome...], mutation_strength: float}` → `{offspring: [genome...]}`.
  - Port `src/utils/genetics.ts` → `breeding/genetics.py`. Pure function, no DB.
  - `/healthz`, `/metrics`.
- [ ] **gallery-service** (FastAPI):
  - `GET /gallery`, `POST /gallery/{id}/like`. Reads from same RDS; in-process LRU cache for hot list.
  - `/healthz`, `/metrics`.
- [ ] **Frontend wiring:** add a thin API client. Replace `breedGeneration()` call with `POST /api/breed`. Add "Save" button → genome-service. Add a Gallery tab.
- [ ] **Dockerfiles** — multi-stage, distroless or python:3.12-slim base, non-root user.
- [ ] **GitHub Actions `ci.yaml`** — on every push: lint, pytest, build image with `${{ github.sha }}` tag, push to ECR, run a script that bumps `gitops/envs/dev/values.yaml` with the new tag.
- [ ] **Argo CD Applications** — one per service, watching `gitops/envs/dev/`. Auto-sync enabled for dev.
- [ ] **Ingress** — single ALB, path-based routing (`/`, `/api/genomes`, `/api/breed`, `/api/gallery`). external-dns creates `dev.spacetimegarden.dev`.
- [ ] **TLS** — ACM cert attached to ALB, HTTPS-only.

**Deliverable:** `https://dev.spacetimegarden.dev` loads the app, breeding works through the API, genomes persist in RDS.

---

### **Day 3 — Fri 2026-05-08: GitOps promotion + Canary**
*Goal: full Dev → UAT → Prod pipeline with the right triggers and zero-downtime rollouts.*

- [ ] **Argo Rollouts** — convert each Deployment to a Rollout with canary strategy:
  ```yaml
  strategy:
    canary:
      steps: [{setWeight: 10}, {pause: {duration: 60}}, {setWeight: 50}, {pause: {duration: 60}}, {setWeight: 100}]
      analysis:
        templates: [{templateName: success-rate}]   # checks Prometheus 5xx rate
  ```
- [ ] **AnalysisTemplate** — Prometheus query: `sum(rate(http_requests_total{status=~"5.."}[2m])) / sum(rate(http_requests_total[2m])) < 0.01`. Fails the rollout if breached.
- [ ] **Promotion workflows:**
  - `promote-uat.yaml` — triggers on Conventional Commits matching `^(feat|fix|perf)(\(.+\))?: .* \[RC\d+\]$` **OR** PR merge to `main`. Bumps `gitops/envs/uat/values.yaml`.
  - `promote-prod.yaml` — triggers on tag push matching `v*.*.*`. Bumps `gitops/envs/prod/values.yaml`.
- [ ] Argo CD Applications for `uat` and `prod` watching their respective folders. **Manual sync** for prod (sync window: tag-driven only — never click-deploy).
- [ ] **PodDisruptionBudgets** on every service (`minAvailable: 1`).
- [ ] **HPA** on breeding-service (CPU 70%) — gives a visible scale-out story.
- [ ] **Zero-downtime test:** run `hey -z 5m -c 50 https://uat.spacetimegarden.dev/api/breed` while pushing a new RC tag. Expect 0 5xx.

**Deliverable:** push a Conventional Commit → it lands in UAT automatically. Tag `v0.1.0` → it lands in prod automatically. Both with canary analysis gating.

---

### **Day 4 — Sat 2026-05-09: Day-2 scenarios + Observability + Chaos prep**

#### Day-2 #1: OS/Security patching (AMI rotation)
- [ ] Configure managed node group with `release_version` pinned via Terraform variable.
- [ ] **Demo flow:** bump variable → `terraform apply` → EKS rolling-replaces nodes. PDBs + Rollouts ensure zero downtime.
- [ ] Have `kubectl get nodes -w` and `hey` running side-by-side during the demo to prove no dropped requests.

#### Day-2 #2: RDS schema change
- [ ] Strategy: **expand-migrate-contract** (the only safe pattern for zero-downtime schema changes — talk about this in the presentation).
- [ ] **Demo flow:**
  1. Add nullable column `tags TEXT[]` via Alembic migration. Deploy. (Old code ignores the column — no break.)
  2. Deploy code that writes to `tags`.
  3. Backfill existing rows.
  4. Future migration would mark NOT NULL (we'll narrate this; not run it live to save time).
- [ ] **Where the migration runs:** Kubernetes Job in `genome-service` Helm chart, with `helm.sh/hook: pre-install,pre-upgrade` annotation. Alembic runs to head before the new pods start.

#### Observability finalization
- [ ] **Grafana dashboards:**
  - "Cluster Overview" — CPU/Memory/Disk per node (kube-prometheus-stack ships this).
  - "Service Golden Signals" — RPS, latency p50/p95/p99, error rate per service.
  - "Logs" — Loki panel filtered by service label.
- [ ] **Grafana GitHub OAuth** — config via Helm values, `auth.github.allowed_organizations` set, `disable_login_form: true` (no username/password, per rubric).
- [ ] Grafana exposed via its own ALB hostname `grafana.spacetimegarden.dev` with ACM cert.
- [ ] **Alerts (Alertmanager):**
  - Node CPU > 85% for 5m → email + Slack
  - Node memory > 85% for 5m → email + Slack
  - Node disk > 80% → email + Slack
  - Any service 5xx rate > 1% for 2m → email + Slack
  - Pod CrashLoopBackOff → email + Slack
- [ ] **SMTP via Gmail app password** stored in Secrets Manager → ESO → Alertmanager Secret.

#### Chaos defense rehearsal
Pre-build muscle memory for these failure types so live diagnosis is fast:

| Failure | Telltale signal | Recovery |
|---|---|---|
| Pod CrashLoopBackOff | Loki: `kubectl logs` panel shows traceback | `kubectl rollout undo` or fix env var |
| RDS connection storm | Prom: `pg_stat_activity` panel + service 5xx | Check secret rotation, restart pods |
| OOMKilled | Prom: container memory at limit, then restart count++ | Bump memory limit |
| ALB 5xx flood | Grafana: ALB target 5xx + service shows healthy | Pod readiness probe misconfigured |
| Node NotReady | Prom: node-exporter dropped, alert fires | `kubectl drain` + replace |

Print a **1-page chaos cheatsheet** to have on the desk during the demo.

**Deliverable:** all rubric items hit. Two narrated screen-captures pre-recorded (Day-1 provisioning, AMI rotation).

---

### **Day 5 — Sun 2026-05-10: Polish + presentation**

- [ ] Re-run end-to-end smoke: code change → CI → dev → RC tag → UAT → release tag → Prod, all green.
- [ ] Record any video segments (silent), narrate-test them out loud against an 8-minute timer.
- [ ] Prepare the **8-minute script** (see §6).
- [ ] Submit self-graded comments per rubric category.

---

## 5. Rubric coverage matrix

| Rubric item | Weight | Where it's covered | Evidence shown in demo |
|---|---|---|---|
| All resources via Terraform, clean state | 20% | Day 1 | `terraform state list` walk-through; show S3 backend |
| 3+ microservices, SSL+DNS, zero downtime | 15% | Day 2, 3 | `https://spacetimegarden.dev`, padlock, `hey` showing 0 5xx during rollout |
| CI/CD: Conventional Commits → UAT, tags → Prod | 15% | Day 3 | Live commit & tag during demo |
| Day-2: AMI rotation | 10% | Day 4 | Pre-recorded silent video + live narration |
| Day-2: Schema change | 10% | Day 4 | Live `alembic upgrade head` via Helm hook |
| Observability + GitHub OAuth Grafana + multi-svc logs + email alerts | 15% | Day 4 | Grafana login flow, Loki query across services, fire a test alert |
| Presentation + chaos defense | 15% | Day 5 | Live narration; instructor's chaos scenario |

---

## 6. 8-minute presentation outline (Hero's Journey arc)

1. **(0:30) The Setup** — show the live app on `spacetimegarden.dev`. Breed a generation. "Looks simple, but everything you'll see in the next 7 minutes is what it takes to run this in production."
2. **(1:00) The Architecture** — one slide: the diagram from §1. Justify the 3-service split (write/compute/read).
3. **(1:30) Terraform Day 1** — silent video of `terraform apply` (sped 8×), narrated. Highlight: state in S3, IRSA, no ClickOps.
4. **(1:30) Git-driven promotion** — live commit with `feat: ... [RC1]`, watch GH Action → Argo CD → canary in UAT. Show analysis template *failing* a deploy by killing a pod mid-rollout to prove the gate works.
5. **(1:00) Day-2 schema change** — live: Alembic migration applies via Helm pre-upgrade hook before pods cut over.
6. **(1:00) Day-2 AMI rotation** — silent video, narrated. `hey` graph shows zero 5xx through the rotation.
7. **(0:30) Observability** — flip to Grafana (GitHub login), show cluster + golden-signals + Loki. Fire a test alert → email arrives.
8. **(1:00) Chaos defense** — instructor's scenario, live diagnosis.

**Soft-skills checklist (rubric):** eye contact at the camera between slides; pauses *before* big claims, not after; replace "um/like" with silence; one strong "So What?" line per section ("This means a 3 AM AMI CVE is a `terraform apply` away, not an outage.").

---

## 7. WOW-factor candidates (pick 1–2 if time allows)

1. **PR Preview Environments.** Each PR spins up an isolated namespace + ephemeral subdomain (`pr-42.spacetimegarden.dev`). Argo CD ApplicationSet + PR generator. ~3 hrs.
2. **Progressive delivery with real metric analysis.** Already in the plan — but make it *visibly fail* during the demo by intentionally regressing latency.
3. **Cost dashboard.** `kubecost` or a custom Grafana panel that shows $ per service. Cheap to add, instructor-pleasing. ~1 hr.
4. **Chaos Mesh in-cluster.** Pre-installed; let the instructor pick a chaos type from a menu. ~2 hrs. Risky but very memorable.
5. **OpenTelemetry traces in Grafana Tempo.** Shows a request flowing frontend → breeding-service. ~3 hrs. Strong but adds complexity.

**Recommendation:** do #2 + #3. Both are low-risk and high-perceived-effort.

---

## 8. Risk register

| Risk | Likelihood | Mitigation |
|---|---|---|
| Domain NS not propagated by demo time | Medium | Buy on Day 0; have nip.io fallback for the demo |
| ACM cert validation stuck | Low | DNS validation via Route53 is usually <1 min |
| EKS cluster blows AWS free tier | High | Use t3.medium nodes, single NAT, db.t3.micro; tear down between sessions |
| GitHub OAuth callback misconfig | Medium | Test in dev environment first |
| Live chaos scenario unfamiliar | High | Rehearse the 5 most common (§4 chaos table); keep cheatsheet on desk |
| Time blowout on app code | High | Cap each service at endpoints listed; ship "ugly but working" |
| Argo Rollouts analysis template flaky | Medium | Test with synthetic traffic on Day 3, not Day 5 |

---

## 9. Things I am explicitly NOT doing (scope discipline)

- Multi-region. (Single region us-east-1.)
- Service mesh (Istio/Linkerd). Adds 4+ hrs for marginal rubric benefit.
- mTLS between services. Network policies are enough.
- Auth/authorization on the app itself. (Genomes are public; gallery is anonymous.)
- Blue/Green *and* Canary. Picked Canary; one strategy, one narrative.
- Backups beyond RDS automatic snapshots (mentioned, not demoed).

---

## 10. Open questions / decisions for the next pass

1. **Domain name.** Need to pick + buy today. Suggestions: `spacetimegarden.dev`, `genome.garden`, `singularity.show`.
2. **AWS region.** Defaulting to `us-east-1` (cheapest, broadest service coverage). Confirm.
3. **GitHub org for OAuth allow-list.** Personal account or a class org?
4. **Slack workspace** for alerts, or email-only?
5. **Cost ceiling.** Estimated ~$5–15/day during active dev. Acceptable?
6. **Buffer day usage** if we finish early: which WOW item? (Recommendation: PR previews — most impressive per hour.)

---

*Next step: review this draft, mark sections to expand or cut, and resolve the open questions in §10. Once §10 is locked, Day 0 work starts.*
