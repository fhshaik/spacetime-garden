import type { CompKey, Expr, Metric } from '../types/metric'

const COORD_LATEX: Record<string, string> = {
  t:     't',
  r:     'r',
  theta: '\\theta',
  phi:   '\\phi',
  X:     'X',
  Y:     'Y',
  Z:     'Z',
}

const SPHERICAL_COORDS_BY_INDEX = ['t', 'r', 'theta', 'phi']
const CARTESIAN_COORDS_BY_INDEX = ['t', 'X',  'Y',     'Z']

// Operator precedence — only used to decide when to wrap in \left( \right).
// Higher binds tighter. Atoms get a sentinel high value.
const PREC_ADD = 1
const PREC_MUL = 2
const PREC_NEG = 3
const PREC_POW = 5
const PREC_ATOM = 100

function precedence(e: Expr): number {
  switch (e.kind) {
    case 'add': case 'sub': return PREC_ADD
    case 'mul':             return PREC_MUL
    case 'neg':             return PREC_NEG
    case 'pow':             return PREC_POW
    // div renders as \frac (self-grouping), so atom-level for parent.
    default:                return PREC_ATOM
  }
}

export function exprToLatex(e: Expr, parentPrec = 0): string {
  const p = precedence(e)
  const wrap = (s: string) => p < parentPrec ? `\\left(${s}\\right)` : s
  switch (e.kind) {
    case 'num':   return formatNum(e.value)
    case 'param': return e.name
    case 'var':   return COORD_LATEX[e.name] ?? e.name
    case 'add':   return wrap(`${exprToLatex(e.a, PREC_ADD)} + ${exprToLatex(e.b, PREC_ADD)}`)
    case 'sub':   return wrap(`${exprToLatex(e.a, PREC_ADD)} - ${exprToLatex(e.b, PREC_ADD + 1)}`)
    case 'mul':   return wrap(`${exprToLatex(e.a, PREC_MUL)} \\, ${exprToLatex(e.b, PREC_MUL)}`)
    case 'div':   return `\\frac{${exprToLatex(e.a, 0)}}{${exprToLatex(e.b, 0)}}`
    case 'neg':   return wrap(`-${exprToLatex(e.a, PREC_NEG + 1)}`)
    case 'pow':   return `${exprToLatex(e.a, PREC_POW + 1)}^{${exprToLatex(e.b, 0)}}`
    case 'sin':   return `\\sin\\left(${exprToLatex(e.a, 0)}\\right)`
    case 'cos':   return `\\cos\\left(${exprToLatex(e.a, 0)}\\right)`
    case 'sqrt':  return `\\sqrt{${exprToLatex(e.a, 0)}}`
    case 'exp':   return `e^{${exprToLatex(e.a, 0)}}`
  }
}

function formatNum(v: number): string {
  if (Number.isInteger(v)) return String(v)
  return (Math.round(v * 1000) / 1000).toString()
}

// ds² = Σ_{i ≤ j} (2 if i≠j else 1) g_ij dx^i dx^j
export function metricToLatex(m: Metric): string {
  const coords = m.frame === 'cartesian' ? CARTESIAN_COORDS_BY_INDEX : SPHERICAL_COORDS_BY_INDEX
  const keys = (Object.keys(m.components) as CompKey[]).sort()
  const terms: string[] = []
  for (const key of keys) {
    const expr = m.components[key]
    if (!expr) continue
    const i = parseInt(key[0], 10)
    const j = parseInt(key[1], 10)
    const xi = COORD_LATEX[coords[i]]
    const xj = COORD_LATEX[coords[j]]
    const factor = i === j ? '' : '2 \\,'
    const diff   = i === j ? `\\, d${xi}^2` : `\\, d${xi}\\, d${xj}`

    // Wrap multi-token coefficients for visual clarity, but \frac and atoms
    // are self-grouping.
    const isAtom    = expr.kind === 'num' || expr.kind === 'param' || expr.kind === 'var'
    const isFrac    = expr.kind === 'div'
    const inner     = exprToLatex(expr, 0)
    const coeff     = isAtom || isFrac ? inner : `\\left(${inner}\\right)`

    terms.push(`${factor}${coeff}${diff}`)
  }
  return `ds^2 = ${terms.join(' + ')}`
}
