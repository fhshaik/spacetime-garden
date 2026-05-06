# GitHub Actions

Three workflows implement the rubric's CI/CD requirement:

```
                push (PR)        push to main             push tag v*.*.*
                    │                  │                         │
                    ▼                  ▼                         ▼
              ┌──────────┐       ┌──────────┐              ┌──────────┐
              │   CI     │       │   CI     │              │   CI     │
              │ test only│       │test+push │              │test+push │
              └──────────┘       └──────────┘              └──────────┘
                                       │                         │
                                  workflow_run               on tag push
                                  (success only)           + await-ci poll
                                       │                         │
                                       ▼                         ▼
                                ┌─────────────┐          ┌─────────────┐
                                │ Promote UAT │          │ Promote PROD│
                                │ bump uat    │          │ bump prod   │
                                │ values.yaml │          │ values.yaml │
                                └─────────────┘          └─────────────┘
                                       │                         │
                                       └──────────┬──────────────┘
                                                  ▼
                                       ┌──────────────────────┐
                                       │    infra repo        │
                                       │  (Argo CD watches    │
                                       │   gitops/envs/...)   │
                                       └──────────────────────┘
```

## Required GitHub configuration

These workflows reference variables and secrets — set them in
**Settings → Secrets and variables → Actions** before merging code:

### Repository variables
| Name | Example | Purpose |
|---|---|---|
| `AWS_REGION` | `us-east-1` | ECR push target. |
| `AWS_ROLE_ARN` | `arn:aws:iam::123456789012:role/garden-ci-ecr-push` | OIDC role to assume. Created by Terraform in the infra repo with `sts:AssumeRoleWithWebIdentity` trust on the GitHub OIDC provider, scoped to this repo. |
| `INFRA_REPO` | `fhshaik/spacetime-garden-infra` | The infra repo to bump. `owner/name` form. |

### Repository secrets
| Name | Purpose |
|---|---|
| `INFRA_REPO_TOKEN` | Fine-grained PAT (or GitHub App token) with **contents: write** on the infra repo only. The promotion workflows clone, edit `gitops/envs/{uat,prod}/values.yaml`, and push to `main`. |

`GITHUB_TOKEN` is provided automatically and is sufficient for the
`await-ci` step in promote-prod (it just needs to read its own repo's run
status).

## Why three files instead of one

Conceptual separation makes failure modes clearer in the Actions UI:
- **CI** = "does this code work?" — runs on every PR.
- **Promote UAT** = "the `main` build passed CI, advance UAT." — auto.
- **Promote Prod** = "a release tag was cut, advance Prod." — auto.

Each workflow has one job to do; if UAT promotion fails it doesn't
obscure CI status, and vice versa.

## Race-condition handling

- **UAT** uses `workflow_run`, which only fires after CI's conclusion is
  known. The `head_sha` in the trigger payload is the same SHA whose
  images CI pushed to ECR — no possibility of bumping to a tag that
  doesn't exist yet.
- **Prod** can't use `workflow_run` because that trigger's `branches:`
  filter does not match tag pushes. Instead, the workflow polls the
  Actions API (`gh run list --commit $SHA`) until the CI run on the
  tag's commit succeeds, then proceeds. Times out after 30 minutes.

## Image tag scheme

All images are tagged with the full commit SHA (`${{ github.sha }}`).
The infra repo configures ECR repos with `image_tag_mutability =
"IMMUTABLE"` so the same tag can never be repointed at a different
build — Argo CD therefore reconciles deterministically against the SHA
in `values.yaml`.

## What the infra repo's `values.yaml` is expected to look like

Each service is a top-level key with an `image` block:

```yaml
genome-service:
  image:
    repository: 123456789012.dkr.ecr.us-east-1.amazonaws.com/genome-service
    tag: <SHA>
breeding-service:
  image:
    repository: 123456789012.dkr.ecr.us-east-1.amazonaws.com/breeding-service
    tag: <SHA>
gallery-service:
  image:
    repository: 123456789012.dkr.ecr.us-east-1.amazonaws.com/gallery-service
    tag: <SHA>
frontend:
  image:
    repository: 123456789012.dkr.ecr.us-east-1.amazonaws.com/frontend
    tag: <SHA>
```

The promotion workflows only ever touch `<service>.image.tag` — the
repository URLs and other values are owned by the infra repo.
