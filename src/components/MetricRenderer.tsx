import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import type { MetricGenome } from '../types/genome'

const CANVAS_SIZE = 220

// ─── Vertex Shader ───────────────────────────────────────────────────────────
const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

// ─── Fragment Shader ─────────────────────────────────────────────────────────
const fragmentShader = /* glsl */ `
  precision highp float;

  varying vec2 vUv;

  uniform float u_time;
  uniform float u_mass;
  uniform float u_spin;
  uniform float u_charge;
  uniform float u_accretion;
  uniform float u_jetStrength;
  uniform float u_lensing;

  #define PI  3.14159265358979
  #define TAU 6.28318530717959

  // ── Utility ────────────────────────────────────────────────────────────────

  float hash(vec2 p) {
    p = fract(p * vec2(127.1, 311.7));
    p += dot(p, p + 19.19);
    return fract(p.x * p.y);
  }

  vec2 hash2(vec2 p) {
    return vec2(hash(p), hash(p + vec2(31.41, 59.26)));
  }

  // Convert hue (0–1) to RGB (saturation=1, value=1)
  vec3 hue2rgb(float h) {
    h = mod(h, 1.0);
    vec3 rgb = abs(fract(h + vec3(0.0, 2.0/3.0, 1.0/3.0)) * 6.0 - 3.0) - 1.0;
    return clamp(rgb, 0.0, 1.0);
  }

  // ── 1. Star Field ──────────────────────────────────────────────────────────
  //  Tiled cell noise — each cell contains one star at a random position.
  vec3 starField(vec2 uv) {
    vec2 cell  = floor(uv * 30.0);
    vec2 local = fract(uv * 30.0);
    vec2 pos   = hash2(cell);
    float dist = length(local - pos);
    float brightness = hash(cell + 0.5);
    float mask = smoothstep(0.07, 0.0, dist) * brightness * brightness;
    float twinkle = 0.65 + 0.35 * sin(u_time * (0.4 + brightness) + brightness * 53.7);
    return vec3(mask * twinkle * 0.55);
  }

  // ── 2. Gravitational Lensing ───────────────────────────────────────────────
  //  Weak-field deflection: rays bent toward origin by lensing / (r + softening).
  vec2 applyLensing(vec2 uv) {
    float r = length(uv);
    if (r < 0.001) return uv;
    float deflection = u_lensing * 0.32 / (r + 0.14);
    return uv - normalize(uv) * deflection * r;
  }

  // ── 3. Event Horizon ──────────────────────────────────────────────────────
  //  Solid black disk. Radius scales with u_mass.
  float horizonMask(float r) {
    float r_h = 0.08 + u_mass * 0.22;
    return 1.0 - smoothstep(r_h - 0.005, r_h + 0.005, r);
  }

  // ── 4. Ergosphere / Photon-Sphere Glow ─────────────────────────────────────
  //  Thin rim just outside the horizon. Hue shifts from cyan (charge=0)
  //  through magenta to orange-red (charge=1).
  vec3 ergosphereGlow(float r) {
    float r_h     = 0.08 + u_mass * 0.22;
    float r_photo = r_h * 1.55;
    float rim = smoothstep(r_h,        r_photo,       r)
              * smoothstep(r_photo * 1.7, r_photo,    r);
    float hue = 0.52 - u_charge * 0.44;   // 0.52 ≈ cyan,  0.08 ≈ orange
    vec3 col  = hue2rgb(hue);
    return rim * col * (0.5 + u_charge * 0.7) * 2.8;
  }

  // ── 5. Accretion Disk ──────────────────────────────────────────────────────
  //  Emission ring from ISCO (3 × r_h) to outer edge.
  //  Disk inclination is simulated by foreshortening the y-axis with cos(spin).
  //  Doppler boosting: approaching side (sin of azimuth + rotation) is brighter.
  //  Temperature gradient: inner = white-blue, outer = deep orange.
  vec3 accretionDisk(vec2 uv) {
    float r_h    = 0.08 + u_mass * 0.22;
    float r_isco = r_h * 3.0;

    // Tilt disk by spin: shrink y-extent to simulate inclination
    float incl    = u_spin * 0.68;           // 0 = face-on, max ≈ 39°
    float cosIncl = cos(incl);
    vec2  wuv     = vec2(uv.x, uv.y / (cosIncl + 0.001));

    float r     = length(wuv);
    float theta = atan(wuv.y, wuv.x);

    float r_outer = r_isco + 0.30 * u_accretion;

    float inner = smoothstep(r_isco - 0.012, r_isco + 0.018, r);
    float outer = smoothstep(r_outer + 0.025, r_outer - 0.01, r);
    float mask  = inner * outer;

    if (mask < 0.001) return vec3(0.0);

    // Radial brightness: peaks at ISCO, falls off as ~1/r^2.5
    float radial = pow(r_isco / max(r, r_isco), 2.5);

    // Doppler: approaching side brightens, receding side dims
    float rotAng = u_time * 0.75 * (0.3 + u_spin * 0.7);
    float doppler = 0.5 + 0.5 * sin(theta - rotAng);

    // Temperature color
    float t       = clamp((r - r_isco) / (r_outer - r_isco + 0.001), 0.0, 1.0);
    vec3 hotCol   = vec3(0.88, 0.94, 1.00);   // white-blue (inner/hot)
    vec3 coolCol  = vec3(1.00, 0.32, 0.04);   // deep orange (outer/cool)
    vec3 diskCol  = mix(hotCol, coolCol, pow(t, 0.55));

    float bright = u_accretion * (0.6 + u_accretion * 1.4);
    return diskCol * mask * radial * doppler * bright;
  }

  // ── 6. Polar Jets ──────────────────────────────────────────────────────────
  //  Two vertical light columns above and below the horizon.
  //  A traveling-wave pulse animates them, with a soft flicker.
  vec3 polarJets(vec2 uv) {
    if (u_jetStrength < 0.01) return vec3(0.0);

    float r_h  = 0.08 + u_mass * 0.22;
    float absY = abs(uv.y);
    float absX = abs(uv.x);

    // Confinement to the polar axis (narrow cone)
    float onAxis  = smoothstep(0.12, 0.0, absX / (absY * 0.22 + r_h * 0.45));

    // Jet runs from the horizon edge outward
    float jetBase = smoothstep(r_h * 0.85, r_h * 1.15, absY);
    float jetFade = smoothstep(0.92, 0.55, absY);

    // Traveling-wave pulse along the jet axis
    float pulse   = 0.55 + 0.45 * sin(absY * 20.0 - u_time * 5.0);
    float flicker = 0.82 + 0.18 * sin(u_time * 8.1 + absY * 6.3);

    float jetMask = onAxis * jetBase * jetFade * pulse * flicker;

    // Core is white, edges fade to electric cyan
    float edge   = clamp(absX / (r_h * 0.55 + 0.001), 0.0, 1.0);
    vec3  jetCol = mix(vec3(1.0, 1.0, 1.0), vec3(0.25, 0.85, 1.0), edge);

    return jetCol * jetMask * u_jetStrength * 2.8;
  }

  // ── Main ───────────────────────────────────────────────────────────────────
  void main() {
    // Center UVs in [-1, 1]
    vec2 uv = (vUv - 0.5) * 2.0;

    // 1. Star field on pre-lens UV so distant stars appear to bend
    vec3 color = starField(uv * 1.75 + vec2(u_time * 0.008, 0.0));

    // 2. Apply gravitational lensing warp
    vec2 luv = applyLensing(uv);
    float r  = length(luv);

    // 3. Accretion disk (behind horizon)
    color += accretionDisk(luv);

    // 4. Ergosphere glow
    color += ergosphereGlow(r);

    // 5. Event horizon — black disk applied as mask
    float hMask = horizonMask(r);
    color = mix(color, vec3(0.0), hMask);

    // 6. Polar jets on straight (un-lensed) UV, masked to not paint inside horizon
    color += polarJets(uv) * (1.0 - hMask);

    // 7. Tone mapping (Reinhard) then gamma 2.2
    color = color / (color + vec3(1.0));
    color = pow(max(color, vec3(0.0)), vec3(1.0 / 2.2));

    gl_FragColor = vec4(color, 1.0);
  }
`

// ─── Component ───────────────────────────────────────────────────────────────

interface Props {
  genome: MetricGenome
}

interface ThreeRefs {
  renderer: THREE.WebGLRenderer
  material: THREE.ShaderMaterial
  animId: number
}

export function MetricRenderer({ genome }: Props) {
  const mountRef = useRef<HTMLDivElement>(null)
  const threeRef = useRef<ThreeRefs | null>(null)

  // ── Scene initialisation (runs once per mount) ──────────────────────────
  useEffect(() => {
    const el = mountRef.current
    if (!el) return

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false })
    renderer.setSize(CANVAS_SIZE, CANVAS_SIZE)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    el.appendChild(renderer.domElement)

    const scene  = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 10)
    camera.position.z = 1

    const geometry = new THREE.PlaneGeometry(2, 2)
    const uniforms: { [key: string]: THREE.IUniform } = {
      u_time:        { value: 0.0 },
      u_mass:        { value: genome.mass },
      u_spin:        { value: genome.spin },
      u_charge:      { value: genome.charge },
      u_accretion:   { value: genome.accretion },
      u_jetStrength: { value: genome.jetStrength },
      u_lensing:     { value: genome.lensing },
    }
    const material = new THREE.ShaderMaterial({ vertexShader, fragmentShader, uniforms })
    scene.add(new THREE.Mesh(geometry, material))

    const startTime = performance.now()

    const animate = () => {
      threeRef.current!.animId = requestAnimationFrame(animate)
      material.uniforms.u_time.value = (performance.now() - startTime) / 1000
      renderer.render(scene, camera)
    }

    threeRef.current = { renderer, material, animId: requestAnimationFrame(animate) }

    return () => {
      cancelAnimationFrame(threeRef.current!.animId)
      renderer.dispose()
      geometry.dispose()
      material.dispose()
      if (el.contains(renderer.domElement)) el.removeChild(renderer.domElement)
      threeRef.current = null
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Uniform updates when genome props change (no scene rebuild) ──────────
  useEffect(() => {
    const refs = threeRef.current
    if (!refs) return
    const u = refs.material.uniforms
    u.u_mass.value        = genome.mass
    u.u_spin.value        = genome.spin
    u.u_charge.value      = genome.charge
    u.u_accretion.value   = genome.accretion
    u.u_jetStrength.value = genome.jetStrength
    u.u_lensing.value     = genome.lensing
  }, [genome.mass, genome.spin, genome.charge, genome.accretion, genome.jetStrength, genome.lensing])

  return (
    <div
      ref={mountRef}
      style={{ width: CANVAS_SIZE, height: CANVAS_SIZE }}
      className="rounded overflow-hidden"
    />
  )
}
