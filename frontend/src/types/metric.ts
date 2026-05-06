// Coordinate variable names allowed inside metric expressions.
// Spherical coords (t, r, θ, φ) are the natural way to write GR metrics by
// hand; Cartesian (t, X, Y, Z) avoids polar coordinate singularities and is
// what the integrator actually uses. A Metric declares which frame its
// component ASTs are written in via the `frame` field.
export type Coord = 't' | 'r' | 'theta' | 'phi' | 'X' | 'Y' | 'Z'

// Symbolic expression tree for metric components.
// JSON-shaped from day one so a Python tool can produce/consume it via plain JSON.
export type Expr =
  | { kind: 'num';   value: number }
  | { kind: 'param'; name: string }
  | { kind: 'var';   name: Coord }
  | { kind: 'add';   a: Expr; b: Expr }
  | { kind: 'sub';   a: Expr; b: Expr }
  | { kind: 'mul';   a: Expr; b: Expr }
  | { kind: 'div';   a: Expr; b: Expr }
  | { kind: 'neg';   a: Expr }
  | { kind: 'pow';   a: Expr; b: Expr }
  | { kind: 'sin';   a: Expr }
  | { kind: 'cos';   a: Expr }
  | { kind: 'sqrt';  a: Expr }
  | { kind: 'exp';   a: Expr }

// Component key "ij" with i ≤ j ∈ {0,1,2,3} → (t, r, θ, φ).
// Symmetry implied: g_ji = g_ij. Only non-zero components stored.
export type CompKey =
  | '00' | '01' | '02' | '03'
  | '11' | '12' | '13'
  | '22' | '23'
  | '33'

// 'spherical' frame: components are functions of (t, r, θ, φ) with the standard
//   ds² = g_tt dt² + 2 g_tφ dt dφ + g_rr dr² + g_θθ dθ² + g_φφ dφ² ansatz.
// 'cartesian' frame: components are functions of (t, X, Y, Z) — the integrator's
//   native frame, pole-singularity-free, supports Kerr-Schild and any 4D metric.
export type Frame = 'spherical' | 'cartesian'

export interface Metric {
  signature: '(-,+,+,+)'
  frame: Frame
  parameters: Record<string, number>
  components: Partial<Record<CompKey, Expr>>
}
