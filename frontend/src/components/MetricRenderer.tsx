import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import type { MetricGenome } from '../types/genome'
import { JET_MORPH_CODE, PALETTES } from '../data/palettes'
import { metricToGLSL } from '../utils/glsl'

const RENDER_SIZE  = 72
const DISPLAY_SIZE = 220
// Upscale ratio is intentional — preserves the pixelated aesthetic when
// callers ask for a larger display size without bumping shader cost.
const RENDER_PER_DISPLAY_PX = RENDER_SIZE / DISPLAY_SIZE

// Loop length: animation frequencies are integer multiples of 2π/LOOP_SECONDS
// so the recorded WebM closes seamlessly.
const LOOP_SECONDS   = 4.0
const RECORD_OVERLAP = 0.25

// Hamiltonian integrator parameters.
// Path budget = MAX_STEPS × average(dl). Needs to cover at minimum:
//   inbound (~30 affine units) + grazing photon-ring orbit (~20) + outbound (~80)
//   ≈ 130 affine units. With dl ranging 0.04..1.5 (avg ~0.7), 240 steps gives
//   ~170 affine units of headroom per ray.
const MAX_STEPS = 240
const R_CAM     = 28.0
const R_ESCAPE  = 80.0

function pickRecorderMime(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4',
  ]
  for (const m of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m
    } catch {
      // ignore
    }
  }
  return ''
}

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

// ─── Build fragment shader from a per-genome compiled metric block ───────────
//
// The compiled metric block declares one `uniform float u_<param>` per metric
// parameter and defines the five non-zero components plus their ∂/∂r and ∂/∂θ
// partials. The integrator below uses those to evolve null geodesics in the
// stationary axisymmetric Hamiltonian framework: state is (t, r, θ, φ, p_r, p_θ),
// with E = −p_t and L = p_φ conserved.
function buildFragmentShader(metricGLSL: string): string {
  return /* glsl */ `
    precision highp float;

    varying vec2 vUv;

    uniform float u_time;
    uniform float u_inclination;
    uniform float u_diskBrightness;
    uniform float u_diskRadius;
    uniform float u_jetStrength;
    uniform float u_loopSeconds;
    uniform vec3  u_pHot;
    uniform vec3  u_pMid;
    uniform vec3  u_pCool;
    uniform int   u_jetMorph;
    uniform float u_diskTurb;
    uniform vec2  u_seedOff;

    // ── Compiled metric (per-genome) ─────────────────────────────────────────
${metricGLSL}

    #define PI 3.14159265358979

    // ── Hash, value noise, FBM ───────────────────────────────────────────────
    float hash(vec2 p) {
      p += u_seedOff;
      p = fract(p * vec2(127.1, 311.7));
      p += dot(p, p + 19.19);
      return fract(p.x * p.y);
    }

    float valueNoise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      vec2 u = f * f * (3.0 - 2.0 * f);
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
    }

    float fbm(vec2 p) {
      float v = 0.0;
      float a = 0.5;
      for (int i = 0; i < 5; i++) {
        v += a * valueNoise(p);
        p *= 2.03;
        a *= 0.52;
      }
      return v;
    }

    // ── Sky: nebula + multi-layer stars ──────────────────────────────────────
    vec3 nebula(vec2 sky_uv, float band) {
      vec2 p   = sky_uv * 4.0;
      float n1 = fbm(p);
      float n2 = fbm(p * 2.1 + vec2(7.3, 13.1));
      float n3 = fbm(p * 0.55 + vec2(-3.7, 5.2));

      vec3 col = vec3(0.018, 0.010, 0.045);
      col = mix(col, vec3(0.18, 0.05, 0.36), smoothstep(0.38, 0.78, n3));
      col = mix(col, vec3(0.10, 0.28, 0.78), smoothstep(0.50, 0.85, n2) * 0.55);
      col = mix(col, vec3(0.78, 0.16, 0.48), smoothstep(0.55, 0.88, n1) * 0.65);
      col = mix(col, vec3(1.00, 0.55, 0.18), smoothstep(0.80, 1.00, n2 * n1) * 0.55);

      col *= 1.0 + 1.4 * band * smoothstep(0.45, 0.9, n1);
      return col;
    }

    vec3 starLayer(vec2 uv, float scale, float emptyFrac, vec3 tint, float intensityMul) {
      vec2 grid_uv = uv * vec2(scale * 2.0, scale);
      vec2 cell    = floor(grid_uv);
      vec2 local   = fract(grid_uv);
      float h      = hash(cell + 11.0);
      float starMask = step(emptyFrac, h);
      vec2 sp = vec2(hash(cell + 13.0), hash(cell + 27.0));
      float d = length(local - sp);
      float intensity = h * smoothstep(0.10, 0.0, d) * intensityMul;
      vec3 starCol = mix(tint, vec3(1.0, 0.97, 0.92), hash(cell + 41.0));

      float n_cycles = 1.0 + floor(hash(cell + 7.0) * 4.0);
      float phase    = h * 6.2831853;
      float twinkle  = 0.55 + 0.45 * sin(2.0 * PI * n_cycles * u_time / u_loopSeconds + phase);

      return starCol * intensity * twinkle * starMask;
    }

    vec3 sampleStars(vec3 dir) {
      vec2 sky_uv = vec2(
        atan(dir.z, dir.x) / (2.0 * PI) + 0.5,
        asin(clamp(dir.y, -1.0, 1.0)) / PI + 0.5
      );

      float band = 1.0 - smoothstep(0.0, 0.50, abs(dir.y));

      vec3 col = nebula(sky_uv, band) * 0.55;
      col += starLayer(sky_uv, 80.0, 0.20, vec3(0.65, 0.80, 1.00), 0.55);
      col += starLayer(sky_uv, 40.0, 0.55, vec3(1.00, 0.95, 0.80), 0.90);
      col += starLayer(sky_uv, 20.0, 0.72, vec3(1.00, 0.78, 0.55), 1.60);

      return col;
    }

    // ── Disk emission, parameterized directly by (r, phi) at the equator ────
    vec3 sampleDisk(float r, float phi_in, float r_isco, float r_outer, float omega) {
      if (r < r_isco || r > r_outer) return vec3(0.0);

      float phase = phi_in - omega * u_time;
      float t_rad = (r - r_isco) / (r_outer - r_isco);

      vec3 col = mix(u_pHot, u_pMid, smoothstep(0.0, 0.45, t_rad));
      col      = mix(col,    u_pCool, smoothstep(0.50, 1.0, t_rad));

      float radial = pow(r_isco / max(r, r_isco), 1.5);

      vec2 mat_uv = vec2(r * cos(phase), r * sin(phase));
      float turb1 = fbm(mat_uv * 0.7);
      float turb2 = fbm(mat_uv * 2.4 + vec2(11.3, 5.7));

      float angular = sin(2.0 * phase + 1.2) * 0.45
                    + sin(3.0 * phase - 0.4) * 0.30
                    + sin(5.0 * phase + 2.1) * 0.20;

      float blob = exp(-pow((cos(phase) - 1.0) * 3.0, 2.0))
                 * exp(-pow((r - r_isco * 1.3) / (r_isco * 0.4), 2.0));

      float texture = 0.55
                    + 0.50 * u_diskTurb * turb1
                    + 0.30 * u_diskTurb * (turb2 - 0.5)
                    + 0.18 * angular
                    + 1.40 * blob;
      texture = clamp(texture, 0.0, 3.0);

      float bright = u_diskBrightness * (0.4 + u_diskBrightness * 1.1);
      return col * radial * texture * bright;
    }

    // ── 4D Cartesian Hamiltonian helpers ──────────────────────────────────
    //
    // For an arbitrary 4D Cartesian metric g_μν(t, X, Y, Z), Hamilton's
    // equations for null geodesics with affine parameter λ are:
    //
    //   dx^μ/dλ = g^μν p_ν
    //   dp_α/dλ = (1/2) ∂_α g_μν p^μ p^ν       (using p^μ = dx^μ/dλ)
    //
    // ∂_t g_μν = 0 for stationary metrics → p_t is conserved (= -E).
    //
    // The metric ASTs produce 10 g-components and 30 partials; we wrap them
    // into mat4s for clean tensor algebra in the shader.

    mat4 metric_at(float t, float X, float Y, float Z) {
      float gtt = g_tt(t, X, Y, Z);
      float gtX = g_tX(t, X, Y, Z);
      float gtY = g_tY(t, X, Y, Z);
      float gtZ = g_tZ(t, X, Y, Z);
      float gXX = g_XX(t, X, Y, Z);
      float gXY = g_XY(t, X, Y, Z);
      float gXZ = g_XZ(t, X, Y, Z);
      float gYY = g_YY(t, X, Y, Z);
      float gYZ = g_YZ(t, X, Y, Z);
      float gZZ = g_ZZ(t, X, Y, Z);
      return mat4(
        vec4(gtt, gtX, gtY, gtZ),
        vec4(gtX, gXX, gXY, gXZ),
        vec4(gtY, gXY, gYY, gYZ),
        vec4(gtZ, gXZ, gYZ, gZZ)
      );
    }

    mat4 metric_dX(float t, float X, float Y, float Z) {
      float gtt = g_tt_dX(t, X, Y, Z);
      float gtX = g_tX_dX(t, X, Y, Z);
      float gtY = g_tY_dX(t, X, Y, Z);
      float gtZ = g_tZ_dX(t, X, Y, Z);
      float gXX = g_XX_dX(t, X, Y, Z);
      float gXY = g_XY_dX(t, X, Y, Z);
      float gXZ = g_XZ_dX(t, X, Y, Z);
      float gYY = g_YY_dX(t, X, Y, Z);
      float gYZ = g_YZ_dX(t, X, Y, Z);
      float gZZ = g_ZZ_dX(t, X, Y, Z);
      return mat4(
        vec4(gtt, gtX, gtY, gtZ),
        vec4(gtX, gXX, gXY, gXZ),
        vec4(gtY, gXY, gYY, gYZ),
        vec4(gtZ, gXZ, gYZ, gZZ)
      );
    }

    mat4 metric_dY(float t, float X, float Y, float Z) {
      float gtt = g_tt_dY(t, X, Y, Z);
      float gtX = g_tX_dY(t, X, Y, Z);
      float gtY = g_tY_dY(t, X, Y, Z);
      float gtZ = g_tZ_dY(t, X, Y, Z);
      float gXX = g_XX_dY(t, X, Y, Z);
      float gXY = g_XY_dY(t, X, Y, Z);
      float gXZ = g_XZ_dY(t, X, Y, Z);
      float gYY = g_YY_dY(t, X, Y, Z);
      float gYZ = g_YZ_dY(t, X, Y, Z);
      float gZZ = g_ZZ_dY(t, X, Y, Z);
      return mat4(
        vec4(gtt, gtX, gtY, gtZ),
        vec4(gtX, gXX, gXY, gXZ),
        vec4(gtY, gXY, gYY, gYZ),
        vec4(gtZ, gXZ, gYZ, gZZ)
      );
    }

    mat4 metric_dZ(float t, float X, float Y, float Z) {
      float gtt = g_tt_dZ(t, X, Y, Z);
      float gtX = g_tX_dZ(t, X, Y, Z);
      float gtY = g_tY_dZ(t, X, Y, Z);
      float gtZ = g_tZ_dZ(t, X, Y, Z);
      float gXX = g_XX_dZ(t, X, Y, Z);
      float gXY = g_XY_dZ(t, X, Y, Z);
      float gXZ = g_XZ_dZ(t, X, Y, Z);
      float gYY = g_YY_dZ(t, X, Y, Z);
      float gYZ = g_YZ_dZ(t, X, Y, Z);
      float gZZ = g_ZZ_dZ(t, X, Y, Z);
      return mat4(
        vec4(gtt, gtX, gtY, gtZ),
        vec4(gtX, gXX, gXY, gXZ),
        vec4(gtY, gXY, gYY, gYZ),
        vec4(gtZ, gXZ, gYZ, gZZ)
      );
    }

    // Closed-form 4×4 matrix inverse via cofactors. WebGL 1 (GLSL ES 1.00)
    // doesn't have inverse() built in. ~80 ops; fine vs the per-step total.
    mat4 inverse4(mat4 m) {
      float a00 = m[0][0], a01 = m[0][1], a02 = m[0][2], a03 = m[0][3];
      float a10 = m[1][0], a11 = m[1][1], a12 = m[1][2], a13 = m[1][3];
      float a20 = m[2][0], a21 = m[2][1], a22 = m[2][2], a23 = m[2][3];
      float a30 = m[3][0], a31 = m[3][1], a32 = m[3][2], a33 = m[3][3];

      float b00 = a00 * a11 - a01 * a10;
      float b01 = a00 * a12 - a02 * a10;
      float b02 = a00 * a13 - a03 * a10;
      float b03 = a01 * a12 - a02 * a11;
      float b04 = a01 * a13 - a03 * a11;
      float b05 = a02 * a13 - a03 * a12;
      float b06 = a20 * a31 - a21 * a30;
      float b07 = a20 * a32 - a22 * a30;
      float b08 = a20 * a33 - a23 * a30;
      float b09 = a21 * a32 - a22 * a31;
      float b10 = a21 * a33 - a23 * a31;
      float b11 = a22 * a33 - a23 * a32;

      float det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
      float invDet = 1.0 / det;

      return mat4(
        (a11 * b11 - a12 * b10 + a13 * b09) * invDet,
        (a02 * b10 - a01 * b11 - a03 * b09) * invDet,
        (a31 * b05 - a32 * b04 + a33 * b03) * invDet,
        (a22 * b04 - a21 * b05 - a23 * b03) * invDet,
        (a12 * b08 - a10 * b11 - a13 * b07) * invDet,
        (a00 * b11 - a02 * b08 + a03 * b07) * invDet,
        (a32 * b02 - a30 * b05 - a33 * b01) * invDet,
        (a20 * b05 - a22 * b02 + a23 * b01) * invDet,
        (a10 * b10 - a11 * b08 + a13 * b06) * invDet,
        (a01 * b08 - a00 * b10 - a03 * b06) * invDet,
        (a30 * b04 - a31 * b02 + a33 * b00) * invDet,
        (a21 * b02 - a20 * b04 - a23 * b00) * invDet,
        (a11 * b07 - a10 * b09 - a12 * b06) * invDet,
        (a00 * b09 - a01 * b07 + a02 * b06) * invDet,
        (a31 * b01 - a30 * b03 - a32 * b00) * invDet,
        (a20 * b03 - a21 * b01 + a22 * b00) * invDet
      );
    }

    void main() {
      vec2 uv = (vUv - 0.5) * 2.0;
      float fov = 0.45;

      // ── Camera placement in 3D Cartesian ─────────────────────────────────
      float th_cam = mix(0.20, PI * 0.5 + 0.05, u_inclination);
      float az     = 0.06 * sin(2.0 * PI * u_time / u_loopSeconds);
      float ph_cam = az;
      float r_cam  = ${R_CAM.toFixed(1)};

      vec3 x_cam = vec3(
        r_cam * sin(th_cam) * cos(ph_cam),
        r_cam * cos(th_cam),
        r_cam * sin(th_cam) * sin(ph_cam)
      );
      vec3 n_cam = x_cam / r_cam;

      // Local orthonormal frame: ẑ = -n̂ (toward BH), ŷ chosen by Gram-Schmidt
      // on the world +Y direction so image-up tracks the spin axis as much
      // as it can; x̂ completes the right-handed triple.
      vec3 z_local = -n_cam;
      vec3 y_world = vec3(0.0, 1.0, 0.0);
      vec3 y_local = normalize(y_world - dot(y_world, n_cam) * n_cam);
      vec3 x_local = cross(y_local, z_local);

      // Pixel direction in the observer's metric-orthonormal local frame.
      vec3 d_local = normalize(vec3(uv.x * fov, uv.y * fov, 1.0));

      // ── Tetrad → coord momentum ──────────────────────────────────────────
      // We construct an initial 4-momentum at the camera assuming the metric
      // is "diagonal-time" there (g_tμ = 0 for spatial μ). For Kerr-Schild
      // this isn't exactly true even at infinity, but we sit at r=28 in
      // metrics that are asymptotically flat — the off-diagonals are tiny
      // and the static-observer approximation introduces negligible error.
      mat4 g_cam     = metric_at(0.0, x_cam.x, x_cam.y, x_cam.z);
      float gtt_cam  = g_cam[0][0];
      float gXX_cam  = g_cam[1][1];
      float invSqrtA = 1.0 / sqrt(-gtt_cam);

      // Perpendicular tetrad vectors at infinity have unit metric length;
      // the radial direction has metric length √(g_nn) where g_nn = n·g·n.
      // For Schwarzschild Cartesian g_nn = B; for general metrics use the
      // measured value.
      float gnn_cam = dot(n_cam, vec3(g_cam[1][1] * n_cam.x + g_cam[1][2] * n_cam.y + g_cam[1][3] * n_cam.z,
                                      g_cam[1][2] * n_cam.x + g_cam[2][2] * n_cam.y + g_cam[2][3] * n_cam.z,
                                      g_cam[1][3] * n_cam.x + g_cam[2][3] * n_cam.y + g_cam[3][3] * n_cam.z));
      float invSqrtNN = 1.0 / sqrt(gnn_cam);

      vec3 D_world = d_local.x * x_local
                  + d_local.y * y_local
                  + d_local.z * z_local * invSqrtNN;

      // Energy normalization: scale so E = -p_t = 1 (conserved).
      vec3 p_contra = invSqrtA * D_world;

      // Covariant spatial momentum p_i = g_ij p^j (3×3 spatial sub-block).
      vec3 p_cov = vec3(
        g_cam[1][1] * p_contra.x + g_cam[1][2] * p_contra.y + g_cam[1][3] * p_contra.z,
        g_cam[1][2] * p_contra.x + g_cam[2][2] * p_contra.y + g_cam[2][3] * p_contra.z,
        g_cam[1][3] * p_contra.x + g_cam[2][3] * p_contra.y + g_cam[3][3] * p_contra.z
      );
      float E = 1.0;

      // ── Integration state ────────────────────────────────────────────────
      // p4 = (p_t, p_X, p_Y, p_Z) covariant.
      vec3 x = x_cam;
      vec4 p4 = vec4(-E, p_cov);

      vec3 color    = vec3(0.0);
      bool escaped  = false;
      bool hit_disk = false;

      float r_isco  = 6.0 * u_M;
      float r_outer = r_isco + 2.0 + 6.0 * u_diskRadius;

      float omega    = 2.0 * PI / u_loopSeconds;
      float jet_rate = 4.0 * PI / u_loopSeconds;

      for (int i = 0; i < ${MAX_STEPS}; i++) {
        float r = length(x);

        // Build metric and inverse at current position.
        mat4 g     = metric_at(0.0, x.x, x.y, x.z);
        mat4 g_inv = inverse4(g);

        // Termination: g_tt approaching 0 (horizon for Schwarzschild-class)
        // or escaped to infinity.
        if (-g[0][0] < 0.005) break;
        if (r > ${R_ESCAPE.toFixed(1)}) { escaped = true; break; }

        // Hamilton's equations in 4D:
        //   dx^μ/dλ = g^μν p_ν       — contravariant velocity
        //   dp_α/dλ = (1/2) ∂_α g_μν p^μ p^ν     (using p^μ = dx^μ/dλ)
        vec4 dx4 = g_inv * p4;

        mat4 dgX = metric_dX(0.0, x.x, x.y, x.z);
        mat4 dgY = metric_dY(0.0, x.x, x.y, x.z);
        mat4 dgZ = metric_dZ(0.0, x.x, x.y, x.z);

        float dpX = 0.5 * dot(dx4, dgX * dx4);
        float dpY = 0.5 * dot(dx4, dgY * dx4);
        float dpZ = 0.5 * dot(dx4, dgZ * dx4);

        float dl = clamp(r * 0.15, 0.04, 1.50);

        vec3 x_prev = x;
        x += dx4.yzw * dl;
        // p_t conserved (stationary metric); update spatial p only.
        p4.y += dpX * dl;
        p4.z += dpY * dl;
        p4.w += dpZ * dl;

        // Disk crossing: y = 0 plane (equatorial plane = disk plane).
        if (x_prev.y * x.y < 0.0) {
          float frac = x_prev.y / (x_prev.y - x.y);
          vec3  hit  = mix(x_prev, x, frac);
          float r_hit  = length(hit.xz);
          float ph_hit = atan(hit.z, hit.x);
          if (r_hit > r_isco && r_hit < r_outer) {
            color += sampleDisk(r_hit, ph_hit, r_isco, r_outer, omega);
            hit_disk = true;
            break;
          }
        }

        // Volumetric jet sample — Cartesian directly, no coord conversion.
        if (u_jetMorph != 0 && u_jetStrength > 0.01) {
          float r_perp = length(x.xz);
          float jet_radius = (0.55 + 0.55 * u_jetStrength) * max(u_M, 0.5);
          float y_lo = 2.0 * u_M * 0.9;
          float y_hi = max(7.5, 10.0 * u_M);
          float ay = (u_jetMorph == 2) ? x.y : abs(x.y);
          bool in_axis = ay > y_lo && ay < y_hi;
          if (r_perp < jet_radius && in_axis) {
            float radial_fall = 1.0 - r_perp / jet_radius;
            float axial_fall  = 1.0 - (ay - y_lo) / (y_hi - y_lo);
            float pulse       = 0.5 + 0.5 * sin(ay * 3.0 - u_time * jet_rate);
            float density     = radial_fall * radial_fall * axial_fall * pulse;
            if (u_jetMorph == 3) {
              float phi_local   = atan(x.z, x.x);
              float helix_phase = phi_local * 3.0 - x.y * 1.4;
              float helix_mod   = 0.30 + 0.70 * pow(0.5 + 0.5 * sin(helix_phase), 2.0);
              density *= helix_mod;
            }
            vec3 jet_col = mix(vec3(1.0), vec3(0.4, 0.85, 1.0), 1.0 - radial_fall);
            color += jet_col * density * u_jetStrength * 0.03 * dl;
          }
        }
      }

      if (escaped && !hit_disk) {
        // Far from BH the coord position is a good approximation of the
        // ray's asymptotic direction. (Velocity dx/dλ → p as B → 1.)
        color += sampleStars(normalize(x));
      }

      // Tone map (Reinhard) + gamma 2.2.
      color = color / (color + vec3(1.0));
      color = pow(max(color, vec3(0.0)), vec3(1.0 / 2.2));

      gl_FragColor = vec4(color, 1.0);
    }
  `
}

interface Props {
  genome: MetricGenome
  displaySize?: number
}

export function MetricRenderer({ genome, displaySize = DISPLAY_SIZE }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const [videoUrl, setVideoUrl] = useState<string | null>(null)
  const renderSize = Math.max(32, Math.round(displaySize * RENDER_PER_DISPLAY_PX))

  useEffect(() => {
    setVideoUrl(null)

    const el = mountRef.current
    if (!el) return

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, preserveDrawingBuffer: false })
    renderer.setPixelRatio(1)
    renderer.setSize(renderSize, renderSize, false)

    const canvas = renderer.domElement
    canvas.style.width  = `${displaySize}px`
    canvas.style.height = `${displaySize}px`
    canvas.style.imageRendering = 'pixelated'
    el.appendChild(canvas)

    const scene  = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
    camera.position.z = 1

    // ── Compile metric → fragment shader ────────────────────────────────────
    const compiled = metricToGLSL(genome.metric)
    const fragmentShader = buildFragmentShader(compiled.glsl)

    const palette = PALETTES[genome.phenotype.palette]
    const seed = genome.phenotype.starSeed
    const seedOff = new THREE.Vector2(seed * 0.137, seed * 0.293)

    const uniforms: { [k: string]: THREE.IUniform } = {
      u_time:           { value: 0.0 },
      u_inclination:    { value: genome.view.inclination },
      u_diskBrightness: { value: genome.view.diskBrightness },
      u_diskRadius:     { value: genome.view.diskRadius },
      u_jetStrength:    { value: genome.view.jetStrength },
      u_loopSeconds:    { value: LOOP_SECONDS },
      u_pHot:           { value: new THREE.Vector3(...palette.hot) },
      u_pMid:           { value: new THREE.Vector3(...palette.mid) },
      u_pCool:          { value: new THREE.Vector3(...palette.cool) },
      u_jetMorph:       { value: JET_MORPH_CODE[genome.phenotype.jetMorph] },
      u_diskTurb:       { value: genome.phenotype.diskTurbulence },
      u_seedOff:        { value: seedOff },
    }
    // One uniform per metric parameter, declared by the compiled metric block.
    for (const p of compiled.parameterNames) {
      uniforms[`u_${p}`] = { value: genome.metric.parameters[p] }
    }

    const geometry = new THREE.PlaneGeometry(2, 2)
    const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms })
    scene.add(new THREE.Mesh(geometry, material))

    let animId = 0
    let stopTimer: ReturnType<typeof setTimeout> | undefined
    let recorder: MediaRecorder | undefined
    let cleanedUp = false

    const startTime = performance.now()
    const animate = () => {
      animId = requestAnimationFrame(animate)
      material.uniforms.u_time.value = (performance.now() - startTime) / 1000
      renderer.render(scene, camera)
    }
    animate()

    const cleanupGL = () => {
      if (cleanedUp) return
      cleanedUp = true
      cancelAnimationFrame(animId)
      try { material.dispose() } catch { /* ignore */ }
      try { geometry.dispose() } catch { /* ignore */ }
      try { renderer.dispose() } catch { /* ignore */ }
      if (el.contains(canvas)) el.removeChild(canvas)
    }

    const mime = pickRecorderMime()
    const captureFn = (canvas as HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream }).captureStream
    if (mime && typeof captureFn === 'function') {
      try {
        const stream = captureFn.call(canvas, 30)
        recorder = new MediaRecorder(stream, { mimeType: mime })
        const chunks: Blob[] = []
        recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data) }
        recorder.onstop = () => {
          if (chunks.length === 0) return
          const blob = new Blob(chunks, { type: mime })
          const url  = URL.createObjectURL(blob)
          setVideoUrl(url)
          cleanupGL()
        }
        recorder.start()
        stopTimer = setTimeout(() => {
          if (recorder && recorder.state !== 'inactive') recorder.stop()
        }, (LOOP_SECONDS + RECORD_OVERLAP) * 1000)
      } catch {
        recorder = undefined
      }
    }

    return () => {
      if (stopTimer) clearTimeout(stopTimer)
      if (recorder && recorder.state !== 'inactive') {
        try { recorder.stop() } catch { /* ignore */ }
      }
      cleanupGL()
    }
  }, [genome, displaySize, renderSize])

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl)
    }
  }, [videoUrl])

  return (
    <div
      style={{ width: displaySize, height: displaySize }}
      className="rounded overflow-hidden bg-black relative"
    >
      <div
        ref={mountRef}
        style={{
          width: displaySize,
          height: displaySize,
          display: videoUrl ? 'none' : 'block',
        }}
      />
      {videoUrl && (
        <video
          src={videoUrl}
          autoPlay
          loop
          muted
          playsInline
          width={displaySize}
          height={displaySize}
          style={{
            width: displaySize,
            height: displaySize,
            imageRendering: 'pixelated',
            display: 'block',
          }}
        />
      )}
    </div>
  )
}
