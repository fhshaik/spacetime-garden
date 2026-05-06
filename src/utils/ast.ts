import type { Coord, Expr } from '../types/metric'

// Builders for constructing metric expression trees.

export const num      = (v: number): Expr => ({ kind: 'num',   value: v })
export const param    = (name: string): Expr => ({ kind: 'param', name })
export const variable = (name: Coord): Expr => ({ kind: 'var',   name })
export const add      = (a: Expr, b: Expr): Expr => ({ kind: 'add',  a, b })
export const sub      = (a: Expr, b: Expr): Expr => ({ kind: 'sub',  a, b })
export const mul      = (a: Expr, b: Expr): Expr => ({ kind: 'mul',  a, b })
export const div      = (a: Expr, b: Expr): Expr => ({ kind: 'div',  a, b })
export const neg      = (a: Expr): Expr => ({ kind: 'neg',  a })
export const pow      = (a: Expr, b: Expr): Expr => ({ kind: 'pow',  a, b })
export const sin      = (a: Expr): Expr => ({ kind: 'sin',  a })
export const cos      = (a: Expr): Expr => ({ kind: 'cos',  a })
export const sqrt     = (a: Expr): Expr => ({ kind: 'sqrt', a })
export const exp      = (a: Expr): Expr => ({ kind: 'exp',  a })

// Coordinate shortcuts.
export const t     = variable('t')
export const r     = variable('r')
export const theta = variable('theta')
export const phi   = variable('phi')
export const X     = variable('X')
export const Y     = variable('Y')
export const Z     = variable('Z')
