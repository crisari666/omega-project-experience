import mapboxgl, { type GeoJSONSource, type Map } from "mapbox-gl"
import type { PlaceRoute } from "./types"

export const ROUTE_SOURCE = "experience-route"
export const ROUTE_TRACK_LAYER = "experience-route-track"
export const ROUTE_LINE_LAYER = "experience-route-line"

export const DEFAULT_ROUTE_COLOR = "#e07a3d"
const ROUTE_COLOR = /^#[0-9a-fA-F]{6}$/
const ROUTE_PAINT_MS = 1400
const FRAME_MAX_ZOOM = 17
const FRAME_ZOOM_STEPS = 12

export const EMPTY_ROUTE: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: []
}

/**
 * Adds the route track and the copper stroke under the amenity dots.
 */
const routeSourcesWithMetrics = new WeakSet<Map>()

function sourceUsesLineMetrics(map: Map): boolean {
  if (routeSourcesWithMetrics.has(map)) return true
  const source = map.getSource(ROUTE_SOURCE) as { lineMetrics?: boolean } | undefined
  return source?.lineMetrics === true
}

function setRouteTrim(map: Map, trim: readonly [number, number]): boolean {
  if (!map.getLayer(ROUTE_LINE_LAYER)) return false
  try {
    map.setPaintProperty(ROUTE_LINE_LAYER, "line-trim-offset", [...trim])
    return true
  } catch {
    try {
      map.setPaintProperty(ROUTE_LINE_LAYER, "line-trim-offset", [1, 1])
    } catch {
      // The stroke stays fully visible when trim is unsupported.
    }
    return false
  }
}

export function ensureRouteLayers(map: Map): void {
  if (map.getSource(ROUTE_SOURCE) && !sourceUsesLineMetrics(map)) {
    if (map.getLayer(ROUTE_LINE_LAYER)) map.removeLayer(ROUTE_LINE_LAYER)
    if (map.getLayer(ROUTE_TRACK_LAYER)) map.removeLayer(ROUTE_TRACK_LAYER)
    map.removeSource(ROUTE_SOURCE)
    routeSourcesWithMetrics.delete(map)
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
        "line-trim-offset": [1, 1]
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

export type FramePadding = {
  readonly top: number
  readonly right: number
  readonly bottom: number
  readonly left: number
}

type FrameTarget = {
  project: { longitude: number; latitude: number } | null
  place: { longitude: number; latitude: number }
  route: PlaceRoute | null | undefined
}

type FrameTransform = {
  width: number
  height: number
  center: mapboxgl.LngLat
  zoom: number
  pitch: number
  bearing: number
  project: (lnglat: mapboxgl.LngLat) => { x: number; y: number }
  clone: () => FrameTransform
}

function readTransform(map: Map): FrameTransform {
  return (map as Map & { transform: FrameTransform }).transform
}

function framePoints(target: FrameTarget): mapboxgl.LngLat[] {
  const points: mapboxgl.LngLat[] = []
  const add = (longitude: number, latitude: number): void => {
    if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return
    points.push(new mapboxgl.LngLat(longitude, latitude))
  }
  if (target.project) add(target.project.longitude, target.project.latitude)
  add(target.place.longitude, target.place.latitude)
  return points
}

function pointsInsideWindow(
  transform: FrameTransform,
  points: readonly mapboxgl.LngLat[],
  padding: FramePadding
): boolean {
  const right = transform.width - padding.right
  const bottom = transform.height - padding.bottom
  if (right <= padding.left || bottom <= padding.top) return false
  return points.every((point) => {
    const pixel = transform.project(point)
    return (
      Number.isFinite(pixel.x) &&
      Number.isFinite(pixel.y) &&
      pixel.x >= padding.left &&
      pixel.x <= right &&
      pixel.y >= padding.top &&
      pixel.y <= bottom
    )
  })
}

function tightenFrameZoom(input: {
  map: Map
  center: mapboxgl.LngLat
  zoom: number
  pitch: number
  bearing: number
  padding: FramePadding
  points: readonly mapboxgl.LngLat[]
}): number {
  const transform = readTransform(input.map).clone()
  transform.pitch = input.pitch
  transform.bearing = input.bearing
  transform.center = input.center
  transform.zoom = input.zoom
  if (!pointsInsideWindow(transform, input.points, input.padding)) return input.zoom
  let low = input.zoom
  let high = FRAME_MAX_ZOOM
  let best = input.zoom
  for (let step = 0; step < FRAME_ZOOM_STEPS; step += 1) {
    const mid = (low + high) / 2
    transform.zoom = mid
    if (pointsInsideWindow(transform, input.points, input.padding)) {
      best = mid
      low = mid
    } else {
      high = mid
    }
  }
  return best
}

/**
 * Fits the project and the amenity into the open map window.
 * Leaves the zoom unchanged when both are already on screen.
 */
export function frameProjectAndPlace(params: {
  map: Map
  project: { longitude: number; latitude: number } | null
  place: { longitude: number; latitude: number }
  route: PlaceRoute | null | undefined
  padding: FramePadding
  reducedMotion: boolean
}): boolean {
  const points = framePoints(params)
  if (pointsInsideWindow(readTransform(params.map), points, params.padding)) {
    return false
  }
  const bounds = new mapboxgl.LngLatBounds()
  for (const point of points) bounds.extend(point)
  const pitch = params.map.getPitch()
  const bearing = params.map.getBearing()
  const camera = params.map.cameraForBounds(bounds, {
    padding: params.padding,
    pitch,
    bearing,
    maxZoom: FRAME_MAX_ZOOM
  })
  if (!camera?.center || camera.zoom == null) return false
  const center = mapboxgl.LngLat.convert(camera.center)
  const zoom = tightenFrameZoom({
    map: params.map,
    center,
    zoom: camera.zoom,
    pitch,
    bearing,
    padding: params.padding,
    points
  })
  params.map.easeTo({
    center,
    zoom,
    pitch,
    bearing,
    duration: params.reducedMotion ? 0 : 700
  })
  return true
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
    setRouteTrim(params.map, [1, 1])
    return
  }
  const startedAt = performance.now()
  const tick = (now: number): void => {
    if (params.signal.aborted || !params.map.getLayer(ROUTE_LINE_LAYER)) return
    const progress = Math.min(1, (now - startedAt) / ROUTE_PAINT_MS)
    const painted = setRouteTrim(params.map, [progress, 1])
    if (!painted) return
    if (progress < 1) requestAnimationFrame(tick)
  }
  if (!setRouteTrim(params.map, [0, 1])) return
  requestAnimationFrame(tick)
}

export function clearRouteLine(map: Map): void {
  const source = map.getSource(ROUTE_SOURCE) as GeoJSONSource | undefined
  source?.setData(EMPTY_ROUTE)
}
