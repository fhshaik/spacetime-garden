export interface MetricGenome {
  id: string
  name: string
  mass: number        // 0–1: event horizon radius
  spin: number        // 0–1: disk warp / frame dragging
  charge: number      // 0–1: ergosphere hue (cyan→orange)
  accretion: number   // 0–1: disk brightness & width
  jetStrength: number // 0–1: polar jet intensity
  lensing: number     // 0–1: gravitational lensing distortion
}
