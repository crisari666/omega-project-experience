import type { AmenityCategory } from "./types"

const FALLBACK_COLORS = [
  "#38BDF8",
  "#F59E0B",
  "#22C55E",
  "#F43F5E",
  "#A78BFA",
  "#14B8A6"
] as const

function hashKey(key: string): number {
  let hash = 0
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0
  }
  return hash
}

export function categoryMarkerColor(
  categories: readonly AmenityCategory[],
  categoryKey: string
): string {
  const chosen = categories.find((row) => row.key === categoryKey)?.color ?? ""
  if (/^#[0-9A-Fa-f]{6}$/.test(chosen)) return chosen.toUpperCase()
  return FALLBACK_COLORS[hashKey(categoryKey || "other") % FALLBACK_COLORS.length]
}
