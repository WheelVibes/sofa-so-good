export function formatMeters(metres: number): string {
  return `${metres.toFixed(2)} m`
}

export function formatRoomSize(width: number, depth: number, area: number): string {
  return `${width.toFixed(2)} × ${depth.toFixed(2)} m · ${area.toFixed(1)} m²`
}
