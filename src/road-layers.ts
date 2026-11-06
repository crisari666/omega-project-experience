import type { ExpressionSpecification, Map, AnyLayer } from "mapbox-gl"
import type { RoadsStyle } from "./types"

const ROAD_SOURCE_LAYERS = new Set(["road", "road_label"])
const ROAD_ID_PREFIXES = ["road-", "bridge-", "tunnel-", "ferry-", "road "] as const
const DEFAULT_ROADS_STYLE: RoadsStyle = {
  color: "#38bdf8",
  width: 3,
  opacity: 0.95
}

function isRoadLayer(layer: AnyLayer): boolean {
  const sourceLayer =
    "source-layer" in layer && typeof layer["source-layer"] === "string"
      ? layer["source-layer"]
      : ""
  if (ROAD_SOURCE_LAYERS.has(sourceLayer)) return true
  const id = layer.id.toLowerCase()
  return ROAD_ID_PREFIXES.some((prefix) => id.startsWith(prefix))
}

function listRoadLayers(map: Map): AnyLayer[] {
  const style = map.getStyle()
  if (!style?.layers) return []
  return style.layers.filter(isRoadLayer)
}

function resolveRoadsStyle(style?: Partial<RoadsStyle> | null): RoadsStyle {
  return {
    color: style?.color?.trim() || DEFAULT_ROADS_STYLE.color,
    width:
      typeof style?.width === "number" && style.width >= 1
        ? style.width
        : DEFAULT_ROADS_STYLE.width,
    opacity:
      typeof style?.opacity === "number" && style.opacity >= 0.2
        ? style.opacity
        : DEFAULT_ROADS_STYLE.opacity
  }
}

export type RoadLineStyle = "solid" | "double" | "dashed"

export function resolveRoadLine(line: string | undefined): RoadLineStyle {
  if (line === "double" || line === "dashed") return line
  return "solid"
}

const ROAD_DASH: number[] = [2, 1.5]

function isCasingLayer(layer: AnyLayer): boolean {
  return layer.id.toLowerCase().includes("casing")
}

function clearRoadDash(map: Map, layerId: string): void {
  try {
    map.setPaintProperty(layerId, "line-dasharray", null as unknown as number[])
  } catch {
    try {
      map.setPaintProperty(layerId, "line-dasharray", [1, 0])
    } catch {
      // This layer does not accept a dash.
    }
  }
}

/**
 * Solid hides the casing. Double keeps today's outline. Dashed is one broken line.
 */
export function applyRoadLineStyle(
  map: Map,
  lineStyle: RoadLineStyle,
  roadsVisible: boolean
): void {
  if (!roadsVisible) return
  for (const layer of listRoadLayers(map)) {
    if (layer.type !== "line" || !map.getLayer(layer.id)) continue
    const casing = isCasingLayer(layer)
    if (lineStyle === "double") {
      map.setLayoutProperty(layer.id, "visibility", "visible")
      clearRoadDash(map, layer.id)
      continue
    }
    if (casing) {
      map.setLayoutProperty(layer.id, "visibility", "none")
      continue
    }
    map.setLayoutProperty(layer.id, "visibility", "visible")
    try {
      map.setPaintProperty(layer.id, "line-gap-width", 0)
    } catch {
      // Fill lines often have no gap.
    }
    if (lineStyle === "dashed") {
      try {
        map.setPaintProperty(layer.id, "line-dasharray", ROAD_DASH)
      } catch {
        // This layer does not accept a dash.
      }
      continue
    }
    clearRoadDash(map, layer.id)
  }
}

function buildLineWidth(baseWidth: number): ExpressionSpecification {
  const at10 = Math.max(0.8, baseWidth * 0.45)
  const at14 = baseWidth
  const at18 = Math.min(18, baseWidth * 2.2)
  return ["interpolate", ["linear"], ["zoom"], 10, at10, 14, at14, 18, at18]
}

/**
 * Paint basemap roads from the published style, then show or hide them.
 */
export function applyRoadLayers(
  map: Map,
  roadsVisible: boolean,
  roadsStyle?: Partial<RoadsStyle> | null
): void {
  const style = resolveRoadsStyle(roadsStyle)
  const lineWidth = buildLineWidth(style.width)
  const visibility = roadsVisible ? "visible" : "none"
  for (const layer of listRoadLayers(map)) {
    if (!map.getLayer(layer.id)) continue
    map.setLayoutProperty(layer.id, "visibility", visibility)
    if (layer.type !== "line") continue
    try {
      map.setPaintProperty(layer.id, "line-color", style.color)
      map.setPaintProperty(layer.id, "line-width", lineWidth)
      map.setPaintProperty(layer.id, "line-opacity", style.opacity)
    } catch {
      // Some road layers do not accept every line paint property.
    }
  }
}
