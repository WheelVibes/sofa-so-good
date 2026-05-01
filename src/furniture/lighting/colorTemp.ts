/**
 * Convert a black-body temperature in Kelvin to a linear-RGB triplet in [0,1].
 * Approximation derived from Tanner Helland's curve fit; output domain clamped.
 */
export function kelvinToRGB(kelvin: number): [number, number, number] {
  const k = Math.max(1000, Math.min(40000, kelvin)) / 100;
  let r: number, g: number, b: number;
  if (k <= 66) {
    r = 255;
    g = 99.4708025861 * Math.log(k) - 161.1195681661;
    b = k <= 19 ? 0 : 138.5177312231 * Math.log(k - 10) - 305.0447927307;
  } else {
    r = 329.698727446 * Math.pow(k - 60, -0.1332047592);
    g = 288.1221695283 * Math.pow(k - 60, -0.0755148492);
    b = 255;
  }
  const clamp = (v: number) => Math.max(0, Math.min(255, v)) / 255;
  return [clamp(r), clamp(g), clamp(b)];
}
