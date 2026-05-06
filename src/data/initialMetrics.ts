import type { Metric } from '../types/metric'
import { add, cos, div, mul, num, neg, param, pow, r, sin, sqrt, sub, theta, X, Y, Z } from '../utils/ast'

// ── Schwarzschild (spherical form) ──────────────────────────────────────────
//
// ds² = -(1 - 2M/r) dt² + dr²/(1 - 2M/r) + r² dθ² + r² sin²θ dφ²
//
// Used for LaTeX display — clean physics notation. The integrator works in
// Cartesian, so for actually rendering use schwarzschildCartesian below.
export function schwarzschild(M: number): Metric {
  const M_sym = param('M')
  const f = sub(num(1), div(mul(num(2), M_sym), r))   // 1 - 2M/r
  return {
    signature: '(-,+,+,+)',
    frame:     'spherical',
    parameters: { M },
    components: {
      '00': neg(f),                                                // g_tt
      '11': div(num(1), f),                                        // g_rr
      '22': pow(r, num(2)),                                        // g_θθ
      '33': mul(pow(r, num(2)), pow(sin(theta), num(2))),          // g_φφ
    },
  }
}

// ── Schwarzschild (Cartesian / isotropic-like form) ──────────────────────────
//
// Same geometry as schwarzschild() above, but components written as functions
// of (X, Y, Z). The Cartesian form is non-singular at the spin axis (no polar
// coordinate singularity). The integrator uses this form.
//
// With r = √(X² + Y² + Z²), n_i = x_i/r, A = 1 − 2M/r, B = 1/A:
//   g_tt = -A
//   g_ij = δ_ij + (B − 1) n_i n_j   (i,j ∈ {X, Y, Z})
//
// All time-spatial off-diagonals (g_tX, g_tY, g_tZ) are zero.
export function schwarzschildCartesian(M: number): Metric {
  const M_sym = param('M')
  // r² = X² + Y² + Z²
  const r2 = add(add(pow(X, num(2)), pow(Y, num(2))), pow(Z, num(2)))
  const r_expr = sqrt(r2)
  // A = 1 - 2M/r
  const A = sub(num(1), div(mul(num(2), M_sym), r_expr))
  // B = 1/A
  const B = div(num(1), A)
  // (B - 1)/r²  — the coefficient of x_i x_j in the spatial metric
  const k = div(sub(B, num(1)), r2)

  // Spatial diagonals: g_ii = 1 + k · x_i²
  const g_XX = add(num(1), mul(k, pow(X, num(2))))
  const g_YY = add(num(1), mul(k, pow(Y, num(2))))
  const g_ZZ = add(num(1), mul(k, pow(Z, num(2))))

  // Spatial off-diagonals: g_ij = k · x_i · x_j  (i ≠ j)
  const g_XY = mul(k, mul(X, Y))
  const g_XZ = mul(k, mul(X, Z))
  const g_YZ = mul(k, mul(Y, Z))

  return {
    signature: '(-,+,+,+)',
    frame:     'cartesian',
    parameters: { M },
    components: {
      // Index map for cartesian frame: 0=t, 1=X, 2=Y, 3=Z.
      '00': neg(A),     // g_tt
      '11': g_XX,       // g_XX
      '12': g_XY,       // g_XY
      '13': g_XZ,       // g_XZ
      '22': g_YY,       // g_YY
      '23': g_YZ,       // g_YZ
      '33': g_ZZ,       // g_ZZ
      // off-diagonals 01, 02, 03 (g_tX, g_tY, g_tZ) are zero — omitted.
    },
  }
}

// ── Kerr (Kerr-Schild Cartesian form) ───────────────────────────────────────
//
// Spinning black hole, Cartesian coordinates with spin axis along Y (matching
// our disk-in-y=0-plane convention). The Kerr-Schild form is globally
// regular outside the ring singularity — there's no coordinate singularity
// at the horizons or the spin axis, only the genuine ring at r=0, θ=π/2.
//
//   g_μν = η_μν + f l_μ l_ν,  η = diag(-1, +1, +1, +1)
//   f    = 2 M r³ / (r⁴ + a² Y²)
//   l_t  = 1
//   l_X  = (r X + a Z) / (r² + a²)
//   l_Y  = Y / r
//   l_Z  = (r Z - a X) / (r² + a²)
//
// where the Kerr "areal" radius r is determined implicitly from Cartesian by
//   r² = ( (R² - a²) + √( (R² - a²)² + 4 a² Y² ) ) / 2,  R² = X² + Y² + Z²
//
// The vector l_μ is null with respect to both η and g, which is what makes
// the Kerr-Schild decomposition work.
export function kerrSchild(M: number, a: number): Metric {
  const M_sym = param('M')
  const a_sym = param('a')

  const Y2  = pow(Y, num(2))
  const Z2  = pow(Z, num(2))
  const X2  = pow(X, num(2))
  const a2  = pow(a_sym, num(2))
  const R2  = add(add(X2, Y2), Z2)

  // r² = ((R² - a²) + √((R² - a²)² + 4 a² Y²)) / 2
  const Rmin    = sub(R2, a2)
  const inside  = add(pow(Rmin, num(2)), mul(num(4), mul(a2, Y2)))
  const r2_expr = div(add(Rmin, sqrt(inside)), num(2))
  const r_expr  = sqrt(r2_expr)

  // f = 2 M r³ / (r⁴ + a² Y²)
  const r3      = mul(r2_expr, r_expr)
  const r4      = mul(r2_expr, r2_expr)
  const f_num   = mul(num(2), mul(M_sym, r3))
  const f_den   = add(r4, mul(a2, Y2))
  const f       = div(f_num, f_den)

  // l_μ components
  const r2_a2   = add(r2_expr, a2)
  const lX      = div(add(mul(r_expr, X), mul(a_sym, Z)), r2_a2)
  const lY      = div(Y, r_expr)
  const lZ      = div(sub(mul(r_expr, Z), mul(a_sym, X)), r2_a2)
  // l_t = 1, so f · l_t · l_t = f and f · l_t · l_i = f · l_i.

  // Cartesian metric components (symmetric):
  //   g_tt = -1 + f
  //   g_ti = f · l_i
  //   g_ij = δ_ij + f · l_i · l_j
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

  return {
    signature: '(-,+,+,+)',
    frame:     'cartesian',
    parameters: { M, a },
    components: {
      '00': g_tt,
      '01': g_tX,
      '02': g_tY,
      '03': g_tZ,
      '11': g_XX,
      '12': g_XY,
      '13': g_XZ,
      '22': g_YY,
      '23': g_YZ,
      '33': g_ZZ,
    },
  }
}

// ── Kerr (Boyer-Lindquist spherical form) ───────────────────────────────────
//
// Used for LaTeX display only (the integrator uses kerrSchild above). Cleaner
// notation showing the rotation explicitly via g_tφ.
//
//   ds² = -(1 - 2Mr/Σ) dt² - (4Mar sin²θ / Σ) dt dφ
//        + (Σ/Δ) dr² + Σ dθ² + ((r²+a²)² - Δ a² sin²θ)/Σ · sin²θ dφ²
//   Σ   = r² + a² cos²θ
//   Δ   = r² - 2Mr + a²
export function kerrBoyerLindquist(M: number, a: number): Metric {
  const M_sym = param('M')
  const a_sym = param('a')

  const r2     = pow(r, num(2))
  const a2     = pow(a_sym, num(2))
  const sin2   = pow(sin(theta), num(2))
  const cos2   = pow(cos(theta), num(2))

  // Σ = r² + a² cos²θ
  const Sigma  = add(r2, mul(a2, cos2))
  // Δ = r² - 2Mr + a²
  const Delta  = add(sub(r2, mul(num(2), mul(M_sym, r))), a2)

  // g_tt = -(1 - 2Mr/Σ)
  const tworm  = mul(num(2), mul(M_sym, r))
  const g_tt   = neg(sub(num(1), div(tworm, Sigma)))

  // g_tφ = -2 M a r sin²θ / Σ
  const g_tphi = neg(div(mul(num(2), mul(M_sym, mul(a_sym, mul(r, sin2)))), Sigma))

  // g_rr = Σ / Δ
  const g_rr   = div(Sigma, Delta)

  // g_θθ = Σ
  const g_thth = Sigma

  // g_φφ = ((r²+a²)² - Δ a² sin²θ) / Σ · sin²θ
  const r2_a2  = add(r2, a2)
  const A_kerr = sub(pow(r2_a2, num(2)), mul(Delta, mul(a2, sin2)))
  const g_phph = mul(div(A_kerr, Sigma), sin2)

  return {
    signature: '(-,+,+,+)',
    frame:     'spherical',
    parameters: { M, a },
    components: {
      '00': g_tt,
      '03': g_tphi,
      '11': g_rr,
      '22': g_thth,
      '33': g_phph,
    },
  }
}
