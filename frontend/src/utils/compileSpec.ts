import type { Expr, Metric } from '../types/metric'
import type { Feature, MetricSpec } from '../types/spec'
import {
  add, cos, div, exp, mul, neg, num, param, pow, r, sin, sqrt, sub, theta, X, Y, Z,
} from './ast'
import { substitute } from './diff'

// ─── Schwarzschild lineage ───────────────────────────────────────────────────
//
// We build A(r) in two passes:
//  1. Pick the "mass term" — by default -2M/r, but Hayward / Bardeen replace it
//     with a regularized form that vanishes at r → 0 (no central singularity).
//  2. Apply every additive feature on top of A.
// Each feature contributes a closed-form modifier to A(r); none modify the
// angular components, so the spatial Cartesian metric is uniquely determined
// by A and B = 1/A.

function schwarzschildMassTerm(features: Feature[]): Expr {
  const M_sym = param('M')
  const haywardFeat = features.find((f) => f.kind === 'hayward')
  const bardeenFeat = features.find((f) => f.kind === 'bardeen')

  if (haywardFeat) {
    // Hayward regular BH: -2Mr² / (r³ + 2Mℓ³). Approaches Schwarzschild far
    // from origin; at r → 0 the term vanishes → no singularity.
    const ell = param('ell')
    const numer = mul(num(2), mul(M_sym, pow(r, num(2))))
    const denom = add(pow(r, num(3)), mul(num(2), mul(M_sym, pow(ell, num(3)))))
    return neg(div(numer, denom))
  }
  if (bardeenFeat) {
    // Bardeen regular BH: -2Mr² / (r² + e²)^(3/2).
    const eb = param('eb')
    const numer = mul(num(2), mul(M_sym, pow(r, num(2))))
    const denom = pow(add(pow(r, num(2)), pow(eb, num(2))), num(1.5))
    return neg(div(numer, denom))
  }
  // Standard Schwarzschild mass term.
  return neg(div(mul(num(2), M_sym), r))
}

function applySchwarzschildAdditive(A: Expr, feat: Feature): Expr {
  switch (feat.kind) {
    case 'charge':
      // +Q²/r²   → Reissner–Nordström
      return add(A, div(pow(param('Q'), num(2)), pow(r, num(2))))
    case 'cosmological':
      // -Λr²/3   → de Sitter / anti-de Sitter
      return sub(A, div(mul(param('Lambda'), pow(r, num(2))), num(3)))
    case 'antiCharge':
      // -Qa²/r²   → repulsive ("anti-charge") radial term
      return sub(A, div(pow(param('Qa'), num(2)), pow(r, num(2))))
    case 'order3':
      // +c3/r³   → 3rd-order radial correction
      return add(A, div(param('c3'), pow(r, num(3))))
    case 'order4':
      // +c4/r⁴
      return add(A, div(param('c4'), pow(r, num(4))))
    case 'yukawa':
      // +c·e^(-r/L)/r   → modified-gravity exponential falloff
      return add(A, div(mul(param('cy'), exp(neg(div(r, param('Ly'))))), r))
    case 'hayward':
    case 'bardeen':
      // Mass-term features handled in schwarzschildMassTerm() — A unchanged here.
      return A
  }
}

function compileSchwarzschildLineage(spec: MetricSpec): { metric: Metric; displayMetric: Metric } {
  let A_sph: Expr = add(num(1), schwarzschildMassTerm(spec.features))
  for (const feat of spec.features) {
    A_sph = applySchwarzschildAdditive(A_sph, feat)
  }
  const B_sph: Expr = div(num(1), A_sph)

  const displayMetric: Metric = {
    signature: '(-,+,+,+)',
    frame:     'spherical',
    parameters: { ...spec.parameters },
    components: {
      '00': neg(A_sph),
      '11': B_sph,
      '22': pow(r, num(2)),
      '33': mul(pow(r, num(2)), pow(sin(theta), num(2))),
    },
  }

  // Cartesian compute form: substitute r → √(X²+Y²+Z²) in A.
  const r2_cart = add(add(pow(X, num(2)), pow(Y, num(2))), pow(Z, num(2)))
  const r_cart  = sqrt(r2_cart)
  const A_cart  = substitute(A_sph, 'r', r_cart)
  const B_cart  = div(num(1), A_cart)
  const k       = div(sub(B_cart, num(1)), r2_cart)

  const metric: Metric = {
    signature: '(-,+,+,+)',
    frame:     'cartesian',
    parameters: { ...spec.parameters },
    components: {
      '00': neg(A_cart),
      '11': add(num(1), mul(k, pow(X, num(2)))),
      '12': mul(k, mul(X, Y)),
      '13': mul(k, mul(X, Z)),
      '22': add(num(1), mul(k, pow(Y, num(2)))),
      '23': mul(k, mul(Y, Z)),
      '33': add(num(1), mul(k, pow(Z, num(2)))),
    },
  }
  return { metric, displayMetric }
}

// ─── Kerr lineage ────────────────────────────────────────────────────────────
//
// Kerr (and Kerr-Newman when the charge feature is present) in Kerr-Schild
// Cartesian coords. Spin axis along Y to match our disk-in-y=0-plane convention.
//
// Plain Kerr: f = 2Mr³ / (r⁴ + a²Y²)
// Kerr-Newman: f = (2Mr - Q²) · r² / (r⁴ + a²Y²)
//   l_μ unchanged; Δ in BL form picks up +Q²: Δ = r² - 2Mr + a² + Q²

function kerrFamilyCartesian(hasCharge: boolean): Metric {
  const M_sym = param('M')
  const a_sym = param('a')

  const Y2  = pow(Y, num(2))
  const Z2  = pow(Z, num(2))
  const X2  = pow(X, num(2))
  const a2  = pow(a_sym, num(2))
  const R2  = add(add(X2, Y2), Z2)

  // Kerr's "areal" r determined implicitly from Cartesian.
  const Rmin    = sub(R2, a2)
  const inside  = add(pow(Rmin, num(2)), mul(num(4), mul(a2, Y2)))
  const r2_expr = div(add(Rmin, sqrt(inside)), num(2))
  const r_expr  = sqrt(r2_expr)

  // f = (2Mr [- Q²]) · r² / (r⁴ + a²Y²)  — Q² term enabled by `hasCharge`.
  const r4    = mul(r2_expr, r2_expr)
  const f_den = add(r4, mul(a2, Y2))
  const tworm = mul(num(2), mul(M_sym, r_expr))
  const top   = hasCharge ? sub(tworm, pow(param('Q'), num(2))) : tworm
  const f     = div(mul(top, r2_expr), f_den)

  // l_μ components.
  const r2_a2 = add(r2_expr, a2)
  const lX = div(add(mul(r_expr, X), mul(a_sym, Z)), r2_a2)
  const lY = div(Y, r_expr)
  const lZ = div(sub(mul(r_expr, Z), mul(a_sym, X)), r2_a2)

  const g_tt = sub(f, num(1))
  const g_tX = mul(f, lX)
  const g_tY = mul(f, lY)
  const g_tZ = mul(f, lZ)
  const g_XX = add(num(1), mul(f, mul(lX, lX)))
  const g_XY = mul(f, mul(lX, lY))
  const g_XZ = mul(f, mul(lX, lZ))
  const g_YY = add(num(1), mul(f, mul(lY, lY)))
  const g_YZ = mul(f, mul(lY, lZ))
  const g_ZZ = add(num(1), mul(f, mul(lZ, lZ)))

  const params: Record<string, number> = {}
  return {
    signature: '(-,+,+,+)',
    frame:     'cartesian',
    parameters: params,                     // filled in by caller
    components: {
      '00': g_tt, '01': g_tX, '02': g_tY, '03': g_tZ,
      '11': g_XX, '12': g_XY, '13': g_XZ,
      '22': g_YY, '23': g_YZ,
      '33': g_ZZ,
    },
  }
}

function kerrFamilyBoyerLindquist(hasCharge: boolean): Metric {
  const M_sym = param('M')
  const a_sym = param('a')

  const r2     = pow(r, num(2))
  const a2     = pow(a_sym, num(2))
  const sin2   = pow(sin(theta), num(2))
  const cos2   = pow(cos(theta), num(2))

  const Sigma  = add(r2, mul(a2, cos2))
  // Δ = r² - 2Mr + a² (+ Q² if KN)
  const tworm  = mul(num(2), mul(M_sym, r))
  const Delta_base = add(sub(r2, tworm), a2)
  const Delta  = hasCharge ? add(Delta_base, pow(param('Q'), num(2))) : Delta_base

  // (2Mr - Q²) replaces 2Mr throughout for KN.
  const top    = hasCharge ? sub(tworm, pow(param('Q'), num(2))) : tworm

  const g_tt   = neg(sub(num(1), div(top, Sigma)))
  const g_tphi = neg(div(mul(top, mul(a_sym, sin2)), Sigma))
  const g_rr   = div(Sigma, Delta)
  const g_thth = Sigma
  const r2_a2  = add(r2, a2)
  const A_kerr = sub(pow(r2_a2, num(2)), mul(Delta, mul(a2, sin2)))
  const g_phph = mul(div(A_kerr, Sigma), sin2)

  return {
    signature: '(-,+,+,+)',
    frame:     'spherical',
    parameters: {},
    components: { '00': g_tt, '03': g_tphi, '11': g_rr, '22': g_thth, '33': g_phph },
  }
}

function compileKerrLineage(spec: MetricSpec): { metric: Metric; displayMetric: Metric } {
  const hasCharge = spec.features.some((f) => f.kind === 'charge')
  const metric        = { ...kerrFamilyCartesian(hasCharge),       parameters: { ...spec.parameters } }
  const displayMetric = { ...kerrFamilyBoyerLindquist(hasCharge),  parameters: { ...spec.parameters } }
  return { metric, displayMetric }
}

// ─── Top-level dispatch ──────────────────────────────────────────────────────

export function compileSpec(spec: MetricSpec): { metric: Metric; displayMetric: Metric } {
  switch (spec.base.kind) {
    case 'schwarzschild': return compileSchwarzschildLineage(spec)
    case 'kerr':          return compileKerrLineage(spec)
  }
}
