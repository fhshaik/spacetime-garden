import type { CompKey, Coord, Expr, Metric } from '../types/metric'
import { differentiate, simplify } from './diff'

// ─── AST → GLSL expression string ────────────────────────────────────────────
//
// Parameters are emitted as uniforms (e.g. `u_M`) so a parameter drift
// updates uniform values without recompiling the shader. AST structure
// changes (Phase 2 splice/prune) DO require recompile.

const COORD_GLSL: Record<string, string> = {
  t:     't',
  r:     'r',
  theta: 'theta',
  phi:   'phi',
  X:     'X',
  Y:     'Y',
  Z:     'Z',
}

export function exprToGLSL(e: Expr): string {
  switch (e.kind) {
    case 'num':   return formatGLSLNum(e.value)
    case 'param': return `u_${e.name}`
    case 'var':   return COORD_GLSL[e.name] ?? e.name
    case 'add':   return `(${exprToGLSL(e.a)} + ${exprToGLSL(e.b)})`
    case 'sub':   return `(${exprToGLSL(e.a)} - ${exprToGLSL(e.b)})`
    case 'mul':   return `(${exprToGLSL(e.a)} * ${exprToGLSL(e.b)})`
    case 'div':   return `(${exprToGLSL(e.a)} / ${exprToGLSL(e.b)})`
    case 'neg':   return `(-${exprToGLSL(e.a)})`
    case 'pow':
      // Specialize integer powers ≤ 4 into unrolled mul — `pow()` is much
      // slower and `pow(x, y)` of negative x is undefined in GLSL.
      if (e.b.kind === 'num' && Number.isInteger(e.b.value) && e.b.value >= 0 && e.b.value <= 4) {
        return powInt(exprToGLSL(e.a), e.b.value)
      }
      return `pow(${exprToGLSL(e.a)}, ${exprToGLSL(e.b)})`
    case 'sin':   return `sin(${exprToGLSL(e.a)})`
    case 'cos':   return `cos(${exprToGLSL(e.a)})`
    case 'sqrt':  return `sqrt(${exprToGLSL(e.a)})`
    case 'exp':   return `exp(${exprToGLSL(e.a)})`
  }
}

function powInt(base: string, n: number): string {
  if (n === 0) return '1.0'
  if (n === 1) return base
  if (n === 2) return `(${base} * ${base})`
  // n ≥ 3: temp via repeated multiply, but avoid blowing up source size.
  let out = base
  for (let i = 1; i < n; i++) out = `(${out} * ${base})`
  return out
}

function formatGLSLNum(v: number): string {
  if (Number.isInteger(v)) return v.toFixed(1)
  return v.toString()
}

// ─── Metric → injected GLSL block ────────────────────────────────────────────
//
// For 'spherical' frame: emits five g_xx(t,r,θ,φ) functions plus ∂/∂r and ∂/∂θ.
// For 'cartesian' frame: emits ten g_μν(t,X,Y,Z) functions plus ∂/∂X, ∂/∂Y, ∂/∂Z.
// In both cases ∂_t partials are zero (stationary metrics) and we skip them.

export interface CompiledMetric {
  glsl:           string
  parameterNames: string[]
}

interface ComponentSpec {
  key:        CompKey
  fn:         string
  signature:  string                // e.g. "float t, float r, float theta, float phi"
  partials:   { name: string; coord: Coord }[]   // _dr, _dth, etc.
}

const SPHERICAL_SIG = 'float t, float r, float theta, float phi'
const CARTESIAN_SIG = 'float t, float X, float Y, float Z'

const SPHERICAL_COMPONENTS: ComponentSpec[] = [
  { key: '00', fn: 'g_tt',   signature: SPHERICAL_SIG, partials: [{ name: 'dr', coord: 'r' }, { name: 'dth', coord: 'theta' }] },
  { key: '11', fn: 'g_rr',   signature: SPHERICAL_SIG, partials: [{ name: 'dr', coord: 'r' }, { name: 'dth', coord: 'theta' }] },
  { key: '22', fn: 'g_thth', signature: SPHERICAL_SIG, partials: [{ name: 'dr', coord: 'r' }, { name: 'dth', coord: 'theta' }] },
  { key: '33', fn: 'g_phph', signature: SPHERICAL_SIG, partials: [{ name: 'dr', coord: 'r' }, { name: 'dth', coord: 'theta' }] },
  { key: '03', fn: 'g_tph',  signature: SPHERICAL_SIG, partials: [{ name: 'dr', coord: 'r' }, { name: 'dth', coord: 'theta' }] },
]

// 4D Cartesian: 10 unique components by symmetry.
// Index map: 0=t, 1=X, 2=Y, 3=Z.
const CARTESIAN_COMPONENTS: ComponentSpec[] = [
  { key: '00', fn: 'g_tt', signature: CARTESIAN_SIG, partials: cartesianPartials() },
  { key: '01', fn: 'g_tX', signature: CARTESIAN_SIG, partials: cartesianPartials() },
  { key: '02', fn: 'g_tY', signature: CARTESIAN_SIG, partials: cartesianPartials() },
  { key: '03', fn: 'g_tZ', signature: CARTESIAN_SIG, partials: cartesianPartials() },
  { key: '11', fn: 'g_XX', signature: CARTESIAN_SIG, partials: cartesianPartials() },
  { key: '12', fn: 'g_XY', signature: CARTESIAN_SIG, partials: cartesianPartials() },
  { key: '13', fn: 'g_XZ', signature: CARTESIAN_SIG, partials: cartesianPartials() },
  { key: '22', fn: 'g_YY', signature: CARTESIAN_SIG, partials: cartesianPartials() },
  { key: '23', fn: 'g_YZ', signature: CARTESIAN_SIG, partials: cartesianPartials() },
  { key: '33', fn: 'g_ZZ', signature: CARTESIAN_SIG, partials: cartesianPartials() },
]

function cartesianPartials(): { name: string; coord: Coord }[] {
  return [
    { name: 'dX', coord: 'X' },
    { name: 'dY', coord: 'Y' },
    { name: 'dZ', coord: 'Z' },
  ]
}

export function metricToGLSL(m: Metric): CompiledMetric {
  const lines: string[] = []

  // Uniform declarations for every parameter.
  const paramNames = Object.keys(m.parameters)
  for (const p of paramNames) {
    lines.push(`uniform float u_${p};`)
  }
  lines.push('')

  const components = m.frame === 'cartesian' ? CARTESIAN_COMPONENTS : SPHERICAL_COMPONENTS

  for (const spec of components) {
    const expr  = m.components[spec.key] ?? ({ kind: 'num', value: 0 } as Expr)
    const value = simplify(expr)

    lines.push(`float ${spec.fn}(${spec.signature}) {`)
    lines.push(`  return ${exprToGLSL(value)};`)
    lines.push(`}`)

    for (const { name, coord } of spec.partials) {
      const partial = simplify(differentiate(value, coord))
      lines.push(`float ${spec.fn}_${name}(${spec.signature}) {`)
      lines.push(`  return ${exprToGLSL(partial)};`)
      lines.push(`}`)
    }
    lines.push('')
  }

  return { glsl: lines.join('\n'), parameterNames: paramNames }
}
