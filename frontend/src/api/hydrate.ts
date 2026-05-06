/**
 * Bridge between the API wire format and the renderer's MetricGenome.
 *
 * The server returns only the JSON-able recipe (spec + view + phenotype).
 * The Three.js shader and KaTeX panel both consume the *compiled* AST
 * (`metric` for cartesian shader, `displayMetric` for spherical/BL LaTeX).
 * Compiling is heavy, lossy to serialize, and only useful client-side —
 * so we run compileSpec here on every server response before storing.
 */

import type { MetricGenome } from '../types/genome'
import { compileSpec } from '../utils/compileSpec'
import type { ServerGenome } from './client'

export function hydrate(server: ServerGenome): MetricGenome {
  const compiled = compileSpec(server.spec)
  return {
    id: server.id,
    name: server.name,
    spec: server.spec,
    metric: compiled.metric,
    displayMetric: compiled.displayMetric,
    view: server.view,
    phenotype: server.phenotype,
  }
}
