import type { Coord, Expr } from '../types/metric'
import {
  add, cos, div, mul, neg, num, pow, sin, sub,
} from './ast'

// ─── Simplification ──────────────────────────────────────────────────────────
//
// Keeps generated GLSL compact. Algebraic identities only — no numeric
// folding past trivial cases. Run once before differentiation, then again
// after to clean up the derivative's zero-multiplications.

export function simplify(e: Expr): Expr {
  switch (e.kind) {
    case 'num':
    case 'param':
    case 'var':
      return e
    case 'add': {
      const a = simplify(e.a), b = simplify(e.b)
      if (isZero(a)) return b
      if (isZero(b)) return a
      if (a.kind === 'num' && b.kind === 'num') return num(a.value + b.value)
      return add(a, b)
    }
    case 'sub': {
      const a = simplify(e.a), b = simplify(e.b)
      if (isZero(b)) return a
      if (isZero(a)) return simplify(neg(b))
      if (a.kind === 'num' && b.kind === 'num') return num(a.value - b.value)
      return sub(a, b)
    }
    case 'mul': {
      const a = simplify(e.a), b = simplify(e.b)
      if (isZero(a) || isZero(b)) return num(0)
      if (isOne(a)) return b
      if (isOne(b)) return a
      if (a.kind === 'num' && b.kind === 'num') return num(a.value * b.value)
      return mul(a, b)
    }
    case 'div': {
      const a = simplify(e.a), b = simplify(e.b)
      if (isZero(a)) return num(0)
      if (isOne(b)) return a
      if (a.kind === 'num' && b.kind === 'num' && b.value !== 0)
        return num(a.value / b.value)
      return div(a, b)
    }
    case 'neg': {
      const a = simplify(e.a)
      if (isZero(a)) return num(0)
      if (a.kind === 'num') return num(-a.value)
      if (a.kind === 'neg') return a.a
      return neg(a)
    }
    case 'pow': {
      const a = simplify(e.a), b = simplify(e.b)
      if (isZero(b)) return num(1)
      if (isOne(b)) return a
      if (isZero(a)) return num(0)
      return pow(a, b)
    }
    case 'sin': {
      const a = simplify(e.a)
      if (isZero(a)) return num(0)
      return sin(a)
    }
    case 'cos': {
      const a = simplify(e.a)
      if (isZero(a)) return num(1)
      return cos(a)
    }
    case 'sqrt': {
      const a = simplify(e.a)
      if (isZero(a)) return num(0)
      if (isOne(a)) return num(1)
      return { kind: 'sqrt', a }
    }
    case 'exp': {
      const a = simplify(e.a)
      if (isZero(a)) return num(1)              // e^0 = 1
      return { kind: 'exp', a }
    }
  }
}

function isZero(e: Expr): boolean {
  return e.kind === 'num' && e.value === 0
}

function isOne(e: Expr): boolean {
  return e.kind === 'num' && e.value === 1
}

// ─── Differentiation ─────────────────────────────────────────────────────────
//
// Symbolic ∂expr / ∂coord. We only differentiate w.r.t. coordinate variables
// (t, r, θ, φ), never w.r.t. parameters, so params are constants here.
// Powers are handled only when the exponent is a numeric literal — that
// covers all current basis terms (r², sin²θ, etc.).

export function differentiate(e: Expr, c: Coord): Expr {
  switch (e.kind) {
    case 'num':
    case 'param':
      return num(0)
    case 'var':
      return e.name === c ? num(1) : num(0)
    case 'add':
      return add(differentiate(e.a, c), differentiate(e.b, c))
    case 'sub':
      return sub(differentiate(e.a, c), differentiate(e.b, c))
    case 'mul':
      // Product rule.
      return add(
        mul(differentiate(e.a, c), e.b),
        mul(e.a, differentiate(e.b, c)),
      )
    case 'div': {
      // Quotient rule: (a'b - ab') / b².
      const numerator = sub(
        mul(differentiate(e.a, c), e.b),
        mul(e.a, differentiate(e.b, c)),
      )
      return div(numerator, pow(e.b, num(2)))
    }
    case 'neg':
      return neg(differentiate(e.a, c))
    case 'pow': {
      if (e.b.kind !== 'num') {
        throw new Error('differentiate: only numeric-literal exponents are supported')
      }
      // d/dx (a^n) = n · a^(n-1) · a'
      const n = e.b.value
      return mul(
        num(n),
        mul(pow(e.a, num(n - 1)), differentiate(e.a, c)),
      )
    }
    case 'sin':
      // d/dx sin(u) = cos(u) · u'
      return mul(cos(e.a), differentiate(e.a, c))
    case 'cos':
      // d/dx cos(u) = -sin(u) · u'
      return mul(neg(sin(e.a)), differentiate(e.a, c))
    case 'sqrt':
      // d/dx √u = u' / (2 √u)
      return div(differentiate(e.a, c), mul(num(2), { kind: 'sqrt', a: e.a }))
    case 'exp':
      // d/dx e^u = e^u · u'
      return mul({ kind: 'exp', a: e.a }, differentiate(e.a, c))
  }
}

// ─── Substitution ────────────────────────────────────────────────────────────
//
// Replace every occurrence of a coordinate variable in `expr` with `replacement`.
// Used by the spec compiler to rewrite A(r), B(r) — written naturally in
// spherical coords — into Cartesian form via `r → √(X²+Y²+Z²)`.

export function substitute(expr: Expr, varName: Coord, replacement: Expr): Expr {
  switch (expr.kind) {
    case 'var':
      return expr.name === varName ? replacement : expr
    case 'num':
    case 'param':
      return expr
    case 'add': return add(substitute(expr.a, varName, replacement), substitute(expr.b, varName, replacement))
    case 'sub': return sub(substitute(expr.a, varName, replacement), substitute(expr.b, varName, replacement))
    case 'mul': return mul(substitute(expr.a, varName, replacement), substitute(expr.b, varName, replacement))
    case 'div': return div(substitute(expr.a, varName, replacement), substitute(expr.b, varName, replacement))
    case 'pow': return pow(substitute(expr.a, varName, replacement), substitute(expr.b, varName, replacement))
    case 'neg': return neg(substitute(expr.a, varName, replacement))
    case 'sin': return sin(substitute(expr.a, varName, replacement))
    case 'cos': return cos(substitute(expr.a, varName, replacement))
    case 'sqrt': return { kind: 'sqrt', a: substitute(expr.a, varName, replacement) }
    case 'exp':  return { kind: 'exp',  a: substitute(expr.a, varName, replacement) }
  }
}
