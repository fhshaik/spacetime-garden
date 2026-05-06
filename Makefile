.PHONY: help dev dev-detached down clean logs ps psql migrate \
        test test-genome test-breeding test-gallery test-frontend \
        lint lint-genome lint-breeding lint-gallery lint-frontend \
        build frontend-dev

# Default goal — typing `make` shows the target list.
.DEFAULT_GOAL := help

help: ## Show this help.
	@grep -E '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk -F':.*## ' '{printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}'

# ── Local dev orchestration ────────────────────────────────────────────────

dev: ## Start postgres + 3 services (foreground; Ctrl-C to stop).
	docker compose up --build

dev-detached: ## Start postgres + 3 services in the background.
	docker compose up --build -d

down: ## Stop everything; keep the postgres volume.
	docker compose down

clean: ## Stop everything AND drop the postgres volume.
	docker compose down -v

logs: ## Tail logs for all services.
	docker compose logs -f

ps: ## Show service status.
	docker compose ps

psql: ## Open a psql shell against the dev database.
	docker compose exec postgres psql -U garden -d garden

migrate: ## Re-run alembic upgrade head against the dev database.
	docker compose run --rm migrate

# ── Frontend ───────────────────────────────────────────────────────────────

frontend-dev: ## Vite dev server with /api/* proxied to compose backends.
	cd frontend && npm install && npm run dev

# ── Tests ──────────────────────────────────────────────────────────────────

test: test-genome test-breeding test-gallery ## Run all backend tests.

test-genome: ## genome-service tests.
	cd services/genome-service && uv run pytest

test-breeding: ## breeding-service tests.
	cd services/breeding-service && uv run pytest

test-gallery: ## gallery-service tests.
	cd services/gallery-service && uv run pytest

test-frontend: ## frontend type-check + build (no Vitest yet).
	cd frontend && npm run build

# ── Lint ───────────────────────────────────────────────────────────────────

lint: lint-genome lint-breeding lint-gallery ## Lint all backend services.

lint-genome:
	cd services/genome-service && uv run ruff check .

lint-breeding:
	cd services/breeding-service && uv run ruff check .

lint-gallery:
	cd services/gallery-service && uv run ruff check .

lint-frontend:
	cd frontend && npx tsc -b

# ── Image builds ───────────────────────────────────────────────────────────

build: ## Build all 4 container images.
	docker compose --profile frontend build
