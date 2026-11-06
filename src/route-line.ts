import mapboxgl, { type GeoJSONSource, type Map } from "mapbox-gl"
import type { PlaceRoute } from "./types"

export const ROUTE_SOURCE = "experience-route"
export const ROUTE_TRACK_LAYER = "experience-route-track"
export const ROUTE_LINE_LAYER = "experience-route-line"

export const DEFAULT_ROUTE_COLOR = "#e07a3d"
const ROUTE_COLOR = /^#[0-9a-fA-F]{6}$/
const ROUTE_PAINT_MS = 1400
const FRAME_PADDING = 80
const FRAME_MAX_ZOOM = 15

export const EMPTY_ROUTE: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: []
}

/**
 * Adds the route track and the copper stroke under the amenity dots.
 */
const routeSourcesWithMetrics = new WeakSet<Map>()

export function ensureRouteLayers(map: Map): void {
  if (map.getSource(ROUTE_SOURCE) && !routeSourcesWithMetrics.has(map)) {
    if (map.getLayer(ROUTE_LINE_LAYER)) map.removeLayer(ROUTE_LINE_LAYER)
    if (map.getLayer(ROUTE_TRACK_LAYER)) map.removeLayer(ROUTE_TRACK_LAYER)
    map.removeSource(ROUTE_SOURCE)
  }
  if (!map.getSource(ROUTE_SOURCE)) {
    map.addSource(ROUTE_SOURCE, {
      type: "geojson",
      data: EMPTY_ROUTE,
      lineMetrics: true
    })
    routeSourcesWithMetrics.add(map)
  }
  if (!map.getLayer(ROUTE_TRACK_LAYER)) {
    map.addLayer({
      id: ROUTE_TRACK_LAYER,
      type: "line",
      source: ROUTE_SOURCE,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": DEFAULT_ROUTE_COLOR,
        "line-width": 4,
        "line-opacity": 0.28
      }
    })
  }
  if (!map.getLayer(ROUTE_LINE_LAYER)) {
    map.addLayer({
      id: ROUTE_LINE_LAYER,
      type: "line",
      source: ROUTE_SOURCE,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": DEFAULT_ROUTE_COLOR,
        "line-width": 4,
        "line-opacity": 1,
        "line-trim-offset": [0, 1]
      }
    })
  }
}

export function routeCollection(
  route: PlaceRoute | null | undefined
): GeoJSON.FeatureCollection {
  const coordinates = route?.geometry?.coordinates
  if (!coordinates || coordinates.length < 2) return EMPTY_ROUTE
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: coordinates.map((pair) => [Number(pair[0]), Number(pair[1])])
        }
      }
    ]
  }
}

/**
 * Paints the project-to-place line with the place's color and line type.
 */
export function applyRouteAppearance(
  map: Map,
  color: string | undefined,
  line: string | undefined
): void {
  const next = color && ROUTE_COLOR.test(color.trim()) ? color.trim() : DEFAULT_ROUTE_COLOR
  const style = line === "double" || line === "dashed" ? line : "solid"
  for (const layerId of [ROUTE_TRACK_LAYER, ROUTE_LINE_LAYER]) {
    if (!map.getLayer(layerId)) continue
    map.setPaintProperty(layerId, "line-color", next)
  }
  if (map.getLayer(ROUTE_TRACK_LAYER)) {
    map.setLayoutProperty(
      ROUTE_TRACK_LAYER,
      "visibility",
      style === "double" ? "visible" : "none"
    )
    if (style === "double") {
      map.setPaintProperty(ROUTE_TRACK_LAYER, "line-width", 10)
      map.setPaintProperty(ROUTE_TRACK_LAYER, "line-opacity", 0.45)
    }
  }
  if (!map.getLayer(ROUTE_LINE_LAYER)) return
  try {
    map.setPaintProperty(
      ROUTE_LINE_LAYER,
      "line-dasharray",
      (style === "dashed" ? [2, 1.5] : null) as unknown as number[]
    )
  } catch {
    if (style === "dashed") return
    try {
      map.setPaintProperty(ROUTE_LINE_LAYER, "line-dasharray", [1, 0])
    } catch {
      // This layer does not accept a dash.
    }
  }
}

/**
 * Fits the project and the place, including the road bends, and flattens the camera.
 */
export function frameProjectAndPlace(params: {
  map: Map
  project: { longitude: number; latitude: number } | null
  place: { longitude: number; latitude: number }
  route: PlaceRoute | null | undefined
  reducedMotion: boolean
}): void {
  const bounds = new mapboxgl.LngLatBounds()
  if (params.project) {
    bounds.extend([params.project.longitude, params.project.latitude])
  }
  bounds.extend([params.place.longitude, params.place.latitude])
  for (const pair of params.route?.geometry.coordinates ?? []) {
    if (pair.length < 2) continue
    bounds.extend([Number(pair[0]), Number(pair[1])])
  }
  params.map.fitBounds(bounds, {
    padding: FRAME_PADDING,
    maxZoom: FRAME_MAX_ZOOM,
    pitch: 0,
    duration: params.reducedMotion ? 0 : 700
  })
}

/**
 * Paints the copper stroke from the project toward the place.
 */
export function paintRouteLine(params: {
  map: Map
  collection: GeoJSON.FeatureCollection
  reducedMotion: boolean
  signal: AbortSignal
}): void {
  const source = params.map.getSource(ROUTE_SOURCE) as GeoJSONSource | undefined
  source?.setData(params.collection)
  if (!params.map.getLayer(ROUTE_LINE_LAYER)) return
  const showFull =
    params.reducedMotion || params.collection.features.length === 0
  if (showFull) {
    params.map.setPaintProperty(ROUTE_LINE_LAYER, "line-trim-offset", [1, 1])
    return
  }
  const startedAt = performance.now()
  const tick = (now: number): void => {
    if (params.signal.aborted || !params.map.getLayer(ROUTE_LINE_LAYER)) return
    const progress = Math.min(1, (now - startedAt) / ROUTE_PAINT_MS)
    params.map.setPaintProperty(ROUTE_LINE_LAYER, "line-trim-offset", [progress, 1])
    if (progress < 1) requestAnimationFrame(tick)
  }
  params.map.setPaintProperty(ROUTE_LINE_LAYER, "line-trim-offset", [0, 1])
  requestAnimationFrame(tick)
}

export function clearRouteLine(map: Map): void {
  const source = map.getSource(ROUTE_SOURCE) as GeoJSONSource | undefined
  source?.setData(EMPTY_ROUTE)
}
