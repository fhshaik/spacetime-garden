/**
 * Typed client for the three backend services. Reads window.__ENV__.API_BASE
 * (set at runtime via /config.js in production, defaults to '' for vite dev
 * + relative paths against the proxy). One image, three deploy environments.
 */

import type { MetricGenome, Phenotype, ViewConfig } from '../types/genome'
import type { MetricSpec } from '../types/spec'

declare global {
  interface Window {
    __ENV__?: { API_BASE?: string }
  }
}

const API_BASE = window.__ENV__?.API_BASE ?? ''

// ── Wire types — the server's view of a genome ────────────────────────────

export interface ServerGenome {
  id: string
  name: string
  spec: MetricSpec
  view: ViewConfig
  phenotype: Phenotype
}

export interface GenomeCreate {
  name: string
  spec: MetricSpec
  view: ViewConfig
  phenotype: Phenotype
  owner?: string | null
}

export interface GalleryItem extends ServerGenome {
  like_count: number
}

export interface BreedResponse {
  offspring: ServerGenome[]
}

// ── Errors ────────────────────────────────────────────────────────────────

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly endpoint: string,
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const url = `${API_BASE}${path}`
  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    })
  } catch (cause) {
    // Network error / DNS failure / service down. Surface as ApiError so
    // call sites can show a unified toast.
    throw new ApiError(
      cause instanceof Error ? cause.message : 'network failure',
      0,
      path,
    )
  }

  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`
    try {
      const body = await response.json()
      if (typeof body?.detail === 'string') detail = body.detail
    } catch {
      // body wasn't JSON — keep statusText
    }
    throw new ApiError(detail, response.status, path)
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

// ── Public API surface ────────────────────────────────────────────────────

/**
 * For /breed: parents we send to the server. The server's Genome model has
 * `id: UUID | None` — frontend-local IDs (e.g. "g-0001") aren't UUIDs and
 * would fail validation, so we strip the id when forwarding parents.
 */
function toBreedParent(g: MetricGenome) {
  return { name: g.name, spec: g.spec, view: g.view, phenotype: g.phenotype }
}

export const api = {
  breed(parents: MetricGenome[], strength: number, target_count = 6) {
    return request<BreedResponse>('/api/breed', {
      method: 'POST',
      body: JSON.stringify({
        parents: parents.map(toBreedParent),
        strength,
        target_count,
      }),
    })
  },

  genomes: {
    create(payload: GenomeCreate) {
      return request<ServerGenome>('/api/genomes', {
        method: 'POST',
        body: JSON.stringify(payload),
      })
    },
    list(limit = 50, offset = 0) {
      return request<ServerGenome[]>(
        `/api/genomes?limit=${limit}&offset=${offset}`,
      )
    },
    get(id: string) {
      return request<ServerGenome>(`/api/genomes/${id}`)
    },
    delete(id: string) {
      return request<void>(`/api/genomes/${id}`, { method: 'DELETE' })
    },
  },

  gallery: {
    list(limit = 20) {
      return request<GalleryItem[]>(`/api/gallery?limit=${limit}`)
    },
    like(id: string) {
      return request<{ like_count: number }>(
        `/api/gallery/${id}/like`,
        { method: 'POST' },
      )
    },
  },
}
