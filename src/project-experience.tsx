import React, { useEffect, useMemo, useRef, useState } from "react"
import mapboxgl, { type GeoJSONSource, type Map, type MapMouseEvent } from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import { AmenityDetail } from "./amenity-detail"
import { categoryMarkerColor } from "./amenity-marker-color"
import { applyRoadLayers, applyRoadLineStyle, resolveRoadLine } from "./road-layers"
import { AmenityBrowser } from "./amenity-browser"
import { AmenityHoverCard } from "./amenity-hover-card"
import { PanoramaViewer } from "./panorama-viewer"
import {
  MapOptions,
  type TravelMinutes,
  type TravelProfile
} from "./map-options"
import {
  resolveMapOptionLabels,
  type MapOptionLabels,
  type MapOptionLocale
} from "./map-option-labels"
import { loadPublishedExperience, resolveMediaUrl } from "./load-published"
import { playCameraMotion } from "./play-camera-motion"
import {
  clearRouteLine,
  applyRouteAppearance,
  ensureRouteLayers,
  frameProjectAndPlace,
  paintRouteLine,
  routeCollection
} from "./route-line"
import {
  STUDIO_GLB_LAYER_ID,
  ensureStudioGlbLayer,
  type StudioGlbCustomLayer,
  type StudioGlbPlacement
} from "./glb-layer"
import type {
  AmenityCategory,
  AmenitySelectPayload,
  AmenitySelectSource,
  ExperiencePlayerData,
  LotClickPayload,
  PublicAmenity,
  PublicAsset
} from "./types"

const LOT_SOURCE = "experience-lots"
const LOT_LAYER = "experience-lots-fill"
const AMENITY_SOURCE = "experience-amenities"
const AMENITY_LAYER = "experience-amenities-point"
const AMENITY_HALO_LAYER = "experience-amenities-halo"
const SOURCE_HIT_PX = 28
const PULSE_DURATION_MS = 1100
const HALO_START_RADIUS = 8
const HALO_GROWTH = 14
const DOT_RADIUS = 6
const DOT_HOVER_RADIUS = 10
const HALO_PEAK_OPACITY = 0.85
const ISO_SOURCE = "experience-isochrone"
const ISO_LAYER = "experience-isochrone-fill"
const SATELLITE_STYLE = "mapbox://styles/mapbox/satellite-streets-v12"
const STREETS_STYLE = "mapbox://styles/mapbox/streets-v12"
const DEFAULT_AVAILABLE_LOT_COLOR = "#15803d"
const AVAILABLE_LOT_COLOR = /^#[0-9A-Fa-f]{6}$/

function resolveAvailableLotColor(value: string | undefined): string {
  const trimmed = value?.trim() ?? ""
  return AVAILABLE_LOT_COLOR.test(trimmed) ? trimmed : DEFAULT_AVAILABLE_LOT_COLOR
}

function lotFillColor(available: string): mapboxgl.ExpressionSpecification {
  return [
    "match",
    ["get", "status"],
    "available",
    available,
    "sold",
    "#E11D48",
    "reserved",
    "#b45309",
    "#1e293b"
  ]
}

const EMPTY_COLLECTION: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: []
}

const FRAME_EDGE = 72
const LIST_COVER_LEFT = 392
const DETAIL_COVER_LEFT = 452
const MOBILE_DETAIL_BOTTOM_RATIO = 0.4

type RouteFrameCover = "detail" | "list" | "none"

function routeFramePadding(
  map: Map,
  cover: RouteFrameCover,
  isMobile: boolean
): { top: number; right: number; bottom: number; left: number } {
  const width = map.getContainer().clientWidth
  const height = map.getContainer().clientHeight
  if (cover === "detail" && isMobile) {
    return {
      top: FRAME_EDGE,
      right: FRAME_EDGE,
      bottom: Math.max(FRAME_EDGE, Math.round(height * MOBILE_DETAIL_BOTTOM_RATIO)),
      left: FRAME_EDGE
    }
  }
  if (cover === "detail") {
    return {
      top: FRAME_EDGE,
      right: FRAME_EDGE,
      bottom: FRAME_EDGE,
      left: Math.max(FRAME_EDGE, Math.min(DETAIL_COVER_LEFT, width - 48))
    }
  }
  if (cover === "list") {
    const panelLeft = Math.min(LIST_COVER_LEFT, Math.floor(width * 0.45))
    return {
      top: FRAME_EDGE,
      right: FRAME_EDGE,
      bottom: FRAME_EDGE,
      left: Math.max(FRAME_EDGE, panelLeft)
    }
  }
  return {
    top: FRAME_EDGE,
    right: FRAME_EDGE,
    bottom: FRAME_EDGE,
    left: FRAME_EDGE
  }
}

type OverlaySnap = {
  experience: ExperiencePlayerData | null
  amenities: GeoJSON.FeatureCollection
  showAmenities: boolean
  travelGeojson: GeoJSON.FeatureCollection | null
}

export type ProjectExperienceProps = {
  projectId: string
  apiBaseUrl?: string
  mapboxAccessToken: string
  /** Google Maps Embed API key. Town places use it for the Street View frame. */
  googleMapsApiKey?: string
  data?: ExperiencePlayerData
  amenitiesVisible?: boolean
  navigationVisible?: boolean
  onLotClick?: (lot: LotClickPayload) => void
  onAmenitySelect?: (amenity: AmenitySelectPayload) => void
  activeSceneId?: string | null
  scenePlaying?: boolean
  /** Pulse is the client default. Pass "none" to keep the dots still. */
  markerMotion?: "pulse" | "none"
  /** Built-in Map Options copy. Default `en`. */
  locale?: MapOptionLocale
  /** Overrides any label from `locale`. Use this for a language the package does not ship. */
  labels?: Partial<MapOptionLabels>
}

function representativePoint(
  geometry: PublicAmenity["geometry"]
): { longitude: number; latitude: number } | null {
  if (geometry.type === "Point" && Array.isArray(geometry.coordinates)) {
    const pair = geometry.coordinates as number[]
    return { longitude: Number(pair[0]), latitude: Number(pair[1]) }
  }
  const ring =
    geometry.type === "LineString"
      ? (geometry.coordinates as number[][])
      : geometry.type === "Polygon"
        ? ((geometry.coordinates as number[][][])[0] ?? [])
        : []
  if (ring.length === 0) return null
  const mid = ring[Math.floor(ring.length / 2)]
  return { longitude: Number(mid[0]), latitude: Number(mid[1]) }
}

function nearestLinkedPlace(
  map: Map,
  point: { x: number; y: number },
  places: readonly PublicAmenity[],
  assets: readonly PublicAsset[]
): PublicAmenity | null {
  let best: { place: PublicAmenity; distance: number } | null = null
  for (const place of places) {
    const target = linkedHitTarget(place, assets)
    if (!target) continue
    const projected = map.project([target.longitude, target.latitude])
    const distance = Math.hypot(projected.x - point.x, projected.y - point.y)
    if (distance > SOURCE_HIT_PX) continue
    if (!best || distance < best.distance) best = { place, distance }
  }
  return best?.place ?? null
}

function linkedHitTarget(
  place: PublicAmenity,
  assets: readonly PublicAsset[]
): { longitude: number; latitude: number } | null {
  if (place.linkedResourceId) {
    const point = representativePoint(place.geometry)
    if (
      !point ||
      !Number.isFinite(point.longitude) ||
      !Number.isFinite(point.latitude)
    ) {
      return null
    }
    return point
  }
  if (!place.linkedAssetId) return null
  const asset = assets.find((row) => row.id === place.linkedAssetId)
  if (!asset) return null
  return {
    longitude: asset.position.longitude,
    latitude: asset.position.latitude
  }
}

function toAmenityPayload(
  amenity: PublicAmenity,
  source: AmenitySelectSource
): AmenitySelectPayload {
  const gallery = [
    ...(amenity.media.cover ? [amenity.media.cover] : []),
    ...amenity.media.gallery
  ].filter((url, index, all) => all.indexOf(url) === index)
  return {
    id: amenity.id,
    name: amenity.name,
    category: amenity.category ?? "",
    categoryKey: amenity.categoryKey,
    categoryLabel: amenity.categoryLabel,
    description: amenity.description,
    subtitle: amenity.subtitle,
    gallery,
    distanceMeters: amenity.distanceMeters,
    estimatedTravelMinutes: amenity.estimatedTravelMinutes,
    lngLat: representativePoint(amenity.geometry),
    source
  }
}

function modelPlacementKey(experience: ExperiencePlayerData | null): string {
  if (!experience?.layers.models3D) return ""
  return experience.assets
    .filter((asset) => asset.type === "model_3d" && asset.url)
    .map((asset) =>
      [
        asset.id,
        experience.apiOrigin,
        asset.url,
        asset.position.longitude,
        asset.position.latitude,
        asset.position.altitude ?? 0,
        asset.transform.scale || 1,
        asset.transform.rotation[0] ?? 0,
        asset.transform.rotation[1] ?? 0,
        asset.transform.rotation[2] ?? 0
      ].join(":")
    )
    .join("|")
}

function collectModelPlacements(
  experience: ExperiencePlayerData
): StudioGlbPlacement[] {
  return experience.assets
    .filter((asset) => asset.type === "model_3d" && asset.url)
    .map((asset) => ({
      id: asset.id,
      url: resolveMediaUrl(experience.apiOrigin, asset.url),
      longitude: asset.position.longitude,
      latitude: asset.position.latitude,
      altitude: asset.position.altitude ?? 0,
      scale: asset.transform.scale || 1,
      rotation: [
        asset.transform.rotation[0] ?? 0,
        asset.transform.rotation[1] ?? 0,
        asset.transform.rotation[2] ?? 0
      ] as [number, number, number]
    }))
    .filter((placement) => placement.url.length > 0)
}

function syncExperienceModels(
  map: Map,
  snap: OverlaySnap,
  glbRef: { current: StudioGlbCustomLayer | null }
): void {
  const experience = snap.experience
  if (!experience) return
  const placements = experience.layers.models3D
    ? collectModelPlacements(experience)
    : []
  if (placements.length === 0) {
    const layer = glbRef.current
    if (!layer || !map.getLayer(STUDIO_GLB_LAYER_ID)) return
    layer.setVisible(false)
    void layer.syncPlacements([])
    return
  }
  const layer = ensureStudioGlbLayer(map, glbRef.current)
  glbRef.current = layer
  layer.setVisible(true)
  void layer.syncPlacements(placements).then(() => {
    try {
      if (map.getLayer(STUDIO_GLB_LAYER_ID)) {
        map.moveLayer(STUDIO_GLB_LAYER_ID)
      }
      map.triggerRepaint()
    } catch {
      // The style can reload before the model finishes loading.
    }
  })
}

function mountExperienceLayers(map: Map, snap: OverlaySnap): void {
  const experience = snap.experience
  if (!experience) return
  if (experience.map.terrain) {
    if (!map.getSource("mapbox-dem")) {
      map.addSource("mapbox-dem", {
        type: "raster-dem",
        url: "mapbox://mapbox.mapbox-terrain-dem-v1",
        tileSize: 512,
        maxzoom: 14
      })
    }
    map.setTerrain({
      source: "mapbox-dem",
      exaggeration: experience.map.terrainExaggeration || 1
    })
  }
  if (!map.getSource(ISO_SOURCE)) {
    map.addSource(ISO_SOURCE, {
      type: "geojson",
      data: snap.travelGeojson ?? EMPTY_COLLECTION
    })
  } else {
    ;(map.getSource(ISO_SOURCE) as GeoJSONSource).setData(
      snap.travelGeojson ?? EMPTY_COLLECTION
    )
  }
  if (!map.getLayer(ISO_LAYER)) {
    map.addLayer(
      {
        id: ISO_LAYER,
        type: "fill",
        source: ISO_SOURCE,
        paint: {
          "fill-color": "#E07A3D",
          "fill-opacity": 0.28,
          "fill-outline-color": "#C4632A"
        }
      },
      map.getLayer(LOT_LAYER) ? LOT_LAYER : undefined
    )
  }
  if (!map.getSource(LOT_SOURCE)) {
    map.addSource(LOT_SOURCE, {
      type: "geojson",
      data: experience.lots ?? EMPTY_COLLECTION
    })
  }
  if (!map.getLayer(LOT_LAYER)) {
    map.addLayer({
      id: LOT_LAYER,
      type: "fill",
      source: LOT_SOURCE,
      layout: { visibility: experience.layers.lots ? "visible" : "none" },
      paint: {
        "fill-color": lotFillColor(
          resolveAvailableLotColor(experience.map.availableLotColor)
        ),
        "fill-opacity": 0.55
      }
    })
  }
  ensureRouteLayers(map)
  if (!map.getSource(AMENITY_SOURCE)) {
    map.addSource(AMENITY_SOURCE, { type: "geojson", data: snap.amenities })
  }
  const amenityVisibility = {
    visibility: (snap.showAmenities ? "visible" : "none") as "visible" | "none"
  }
  const roundMarker = {
    "circle-pitch-alignment": "viewport" as const,
    "circle-pitch-scale": "viewport" as const,
    "circle-blur": 0.15,
    "circle-stroke-width": 0
  }
  if (!map.getLayer(AMENITY_HALO_LAYER)) {
    map.addLayer({
      id: AMENITY_HALO_LAYER,
      type: "circle",
      source: AMENITY_SOURCE,
      layout: amenityVisibility,
      paint: {
        ...roundMarker,
        "circle-radius": HALO_START_RADIUS,
        "circle-color": ["coalesce", ["get", "color"], "#38BDF8"],
        "circle-opacity": 0.22
      }
    })
  }
  if (!map.getLayer(AMENITY_LAYER)) {
    map.addLayer({
      id: AMENITY_LAYER,
      type: "circle",
      source: AMENITY_SOURCE,
      layout: amenityVisibility,
      paint: {
        ...roundMarker,
        "circle-radius": [
          "case",
          ["boolean", ["feature-state", "hover"], false],
          DOT_HOVER_RADIUS,
          DOT_RADIUS
        ],
        "circle-opacity": 1,
        "circle-color": [
          "case",
          ["boolean", ["feature-state", "hover"], false],
          "#E07A3D",
          ["coalesce", ["get", "color"], "#38BDF8"]
        ]
      }
    })
  }
  if (map.getLayer(ISO_LAYER) && map.getLayer(LOT_LAYER)) {
    map.moveLayer(ISO_LAYER, LOT_LAYER)
  }
  const roadsVisible = experience.layers.roads !== false
  applyRoadLayers(map, roadsVisible, experience.map.roadsStyle)
  applyRoadLineStyle(
    map,
    resolveRoadLine(experience.map.roadsStyle?.line),
    roadsVisible
  )
}

function lotBounds(
  collection: GeoJSON.FeatureCollection | null
): mapboxgl.LngLatBounds | null {
  if (!collection?.features.length) return null
  const bounds = new mapboxgl.LngLatBounds()
  let found = false
  const visit = (value: unknown): void => {
    if (!Array.isArray(value) || value.length === 0) return
    if (typeof value[0] === "number" && typeof value[1] === "number") {
      const longitude = value[0]
      const latitude = value[1]
      if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) return
      bounds.extend([longitude, latitude])
      found = true
      return
    }
    for (const child of value) visit(child)
  }
  for (const feature of collection.features) {
    const geometry = feature.geometry as { coordinates?: unknown } | null
    visit(geometry?.coordinates)
  }
  return found ? bounds : null
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
}

function amenityCollection(
  locations: readonly PublicAmenity[],
  categories: readonly AmenityCategory[]
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: locations
      .map((location) => {
        const point = representativePoint(location.geometry)
        if (!point) return null
        const categoryKey = location.categoryKey || "other"
        return {
          type: "Feature" as const,
          id: location.id,
          properties: {
            id: location.id,
            name: location.name,
            categoryKey,
            color: categoryMarkerColor(categories, categoryKey)
          },
          geometry: {
            type: "Point" as const,
            coordinates: [point.longitude, point.latitude]
          }
        }
      })
      .filter((feature): feature is NonNullable<typeof feature> => feature !== null)
  }
}

export function ProjectExperience({
  projectId,
  apiBaseUrl,
  mapboxAccessToken,
  googleMapsApiKey,
  data,
  amenitiesVisible,
  navigationVisible,
  onLotClick,
  onAmenitySelect,
  activeSceneId = null,
  scenePlaying = false,
  markerMotion = "pulse",
  locale = "en",
  labels
}: ProjectExperienceProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<Map | null>(null)
  const pendingPanoramaReveal = useRef<(() => void) | null>(null)
  const openPanoramaRef = useRef<(asset: PublicAsset) => void>(() => undefined)
  const amenityRowsRef = useRef<readonly PublicAmenity[]>([])
  const assetRowsRef = useRef<readonly PublicAsset[]>([])
  const selectAmenityRef = useRef<
    (amenity: PublicAmenity, source: AmenitySelectSource) => void
  >(() => undefined)
  const glbRef = useRef<StudioGlbCustomLayer | null>(null)
  const routeAbortRef = useRef<AbortController | null>(null)
  const routeAmenityIdRef = useRef<string | null>(null)
  const showPlaceRouteRef = useRef<
    (amenity: PublicAmenity, moveCamera: boolean, cover?: "detail" | "list") => void
  >(() => undefined)
  const [loaded, setLoaded] = useState<ExperiencePlayerData | null>(data ?? null)
  const [error, setError] = useState<string | null>(null)
  const [mapReady, setMapReady] = useState(0)
  const [showAmenities, setShowAmenities] = useState(amenitiesVisible ?? true)
  const [showNavigation, setShowNavigation] = useState(navigationVisible ?? false)
  const [selected, setSelected] = useState<AmenitySelectPayload | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [openCategoryKey, setOpenCategoryKey] = useState<string | null>(null)
  const [openPanorama, setOpenPanorama] = useState<PublicAsset | null>(null)
  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number } | null>(null)
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth < 900 : false
  )
  const [pitchOn, setPitchOn] = useState(false)
  const [satelliteOn, setSatelliteOn] = useState(false)
  const [travelOn, setTravelOn] = useState(false)
  const [travelProfile, setTravelProfile] = useState<TravelProfile>("walking")
  const [travelMinutes, setTravelMinutes] = useState<TravelMinutes>(10)
  const [travelGeojson, setTravelGeojson] = useState<GeoJSON.FeatureCollection | null>(
    null
  )
  const [travelError, setTravelError] = useState<string | null>(null)
  const onLotClickRef = useRef(onLotClick)
  const onAmenitySelectRef = useRef(onAmenitySelect)
  const listHoverRef = useRef(false)
  const hoveredIdRef = useRef<string | null>(null)
  const cameraMovingRef = useRef(false)
  const flightTokenRef = useRef(0)
  const showAmenitiesRef = useRef(showAmenities)
  showAmenitiesRef.current = showAmenities
  onLotClickRef.current = onLotClick
  onAmenitySelectRef.current = onAmenitySelect

  useEffect(() => {
    if (amenitiesVisible !== undefined) setShowAmenities(amenitiesVisible)
  }, [amenitiesVisible])

  useEffect(() => {
    const map = mapRef.current
    const experience = loaded
    if (!map?.isStyleLoaded() || !experience) return
    const lotSource = map.getSource(LOT_SOURCE) as GeoJSONSource | undefined
    lotSource?.setData(experience.lots ?? EMPTY_COLLECTION)
    if (map.getLayer(LOT_LAYER)) {
      map.setLayoutProperty(
        LOT_LAYER,
        "visibility",
        experience.layers.lots ? "visible" : "none"
      )
      map.setPaintProperty(
        LOT_LAYER,
        "fill-color",
        lotFillColor(resolveAvailableLotColor(experience.map.availableLotColor))
      )
    }
    const roadsVisible = experience.layers.roads !== false
    applyRoadLayers(map, roadsVisible, experience.map.roadsStyle)
    applyRoadLineStyle(map, resolveRoadLine(experience.map.roadsStyle?.line), roadsVisible)
  }, [mapReady, loaded])

  useEffect(() => {
    if (navigationVisible !== undefined) setShowNavigation(navigationVisible)
  }, [navigationVisible])

  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth < 900)
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  useEffect(() => {
    if (data) {
      setLoaded(data)
      setError(null)
      return
    }
    if (!apiBaseUrl) return
    let cancelled = false
    void loadPublishedExperience({ apiBaseUrl, projectId })
      .then((next) => {
        if (!cancelled) setLoaded(next)
      })
      .catch(() => {
        if (!cancelled) setError("Published experience was not found")
      })
    return () => {
      cancelled = true
    }
  }, [apiBaseUrl, data, projectId])

  const amenityRows = loaded?.locations ?? []
  const assetRows = loaded?.assets ?? []
  const amenityCategories = loaded?.amenityCategories ?? []
  const amenities = useMemo(
    () => amenityCollection(amenityRows, amenityCategories),
    [amenityCategories, amenityRows]
  )
  amenityRowsRef.current = amenityRows
  assetRowsRef.current = assetRows
  const optionLabels = useMemo(
    () => resolveMapOptionLabels(locale, labels),
    [labels, locale]
  )
  const overlayRef = useRef<OverlaySnap>({
    experience: loaded,
    amenities,
    showAmenities,
    travelGeojson
  })
  overlayRef.current = { experience: loaded, amenities, showAmenities, travelGeojson }
  const modelKey = modelPlacementKey(loaded)

  useEffect(() => {
    const longitude = loaded?.projectCenter?.longitude
    const latitude = loaded?.projectCenter?.latitude
    if (!travelOn || longitude == null || latitude == null || !mapboxAccessToken) {
      setTravelGeojson(null)
      setTravelError(null)
      return
    }
    const controller = new AbortController()
    const url =
      `https://api.mapbox.com/isochrone/v1/mapbox/${travelProfile}/` +
      `${longitude},${latitude}?contours_minutes=${travelMinutes}` +
      `&polygons=true&access_token=${encodeURIComponent(mapboxAccessToken)}`
    void fetch(url, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Isochrone request failed")
        return (await response.json()) as GeoJSON.FeatureCollection
      })
      .then((collection) => {
        setTravelGeojson(collection)
        setTravelError(null)
      })
      .catch((err: unknown) => {
        if (err instanceof Error && err.name === "AbortError") return
        setTravelGeojson(null)
        setTravelError("Travel times are unavailable")
      })
    return () => controller.abort()
  }, [
    travelOn,
    travelProfile,
    travelMinutes,
    loaded?.projectCenter?.longitude,
    loaded?.projectCenter?.latitude,
    mapboxAccessToken
  ])

  useEffect(() => {
    const source = mapRef.current?.getSource(ISO_SOURCE) as GeoJSONSource | undefined
    source?.setData(travelGeojson ?? EMPTY_COLLECTION)
  }, [travelGeojson, mapReady])

  useEffect(() => {
    if (!loaded) return
    setPitchOn(loaded.map.initialCamera.pitch > 20)
    setSatelliteOn(loaded.map.style.includes("satellite"))
    setTravelOn(false)
  }, [loaded?.projectId])

  const openPanoramaAsset = (asset: PublicAsset) => {
    const map = mapRef.current
    const reveal = () => {
      pendingPanoramaReveal.current = null
      setOpenPanorama(asset)
    }
    if (!map || prefersReducedMotion()) {
      reveal()
      return
    }
    const center = map.getCenter()
    const alreadyThere =
      map.getZoom() >= 18 &&
      Math.abs(center.lng - asset.position.longitude) < 0.00002 &&
      Math.abs(center.lat - asset.position.latitude) < 0.00002
    if (alreadyThere) {
      reveal()
      return
    }
    if (pendingPanoramaReveal.current) {
      map.off("moveend", pendingPanoramaReveal.current)
    }
    pendingPanoramaReveal.current = reveal
    map.once("moveend", reveal)
    map.flyTo({
      center: [asset.position.longitude, asset.position.latitude],
      zoom: Math.max(map.getZoom(), 18),
      pitch: map.getPitch(),
      duration: 700
    })
  }
  openPanoramaRef.current = openPanoramaAsset
  const showPlaceRoute = (
    amenity: PublicAmenity,
    moveCamera: boolean,
    requestedCover: "detail" | "list" = "list"
  ): void => {
    const map = mapRef.current
    if (!map) return
    routeAmenityIdRef.current = amenity.id
    if (!map.isStyleLoaded()) return
    ensureRouteLayers(map)
    applyRouteAppearance(map, amenity.routeColor, amenity.routeLine)
    const place = representativePoint(amenity.geometry)
    const reducedMotion = prefersReducedMotion()
    if (moveCamera && place) {
      const cover: RouteFrameCover =
        requestedCover === "detail" || selected != null
          ? "detail"
          : showAmenities
            ? "list"
            : "none"
      const moved = frameProjectAndPlace({
        map,
        project: loaded?.projectCenter ?? null,
        place,
        route: amenity.route,
        padding: routeFramePadding(map, cover, isMobile),
        reducedMotion
      })
      if (moved) {
        flightTokenRef.current += 1
        const flightToken = flightTokenRef.current
        cameraMovingRef.current = true
        const finishFlight = (): void => {
          if (flightTokenRef.current !== flightToken) return
          cameraMovingRef.current = false
        }
        map.once("moveend", finishFlight)
        window.setTimeout(finishFlight, reducedMotion ? 0 : 800)
      }
    }
    routeAbortRef.current?.abort()
    const controller = new AbortController()
    routeAbortRef.current = controller
    if (!amenity.route) {
      clearRouteLine(map)
      return
    }
    paintRouteLine({
      map,
      collection: routeCollection(amenity.route),
      reducedMotion,
      signal: controller.signal
    })
  }
  showPlaceRouteRef.current = showPlaceRoute
  const restoreSelectedRoute = (): void => {
    const map = mapRef.current
    if (!map) return
    const selectedId = selected?.id
    const selectedAmenity = selectedId
      ? amenityRowsRef.current.find((row) => row.id === selectedId)
      : undefined
    if (selectedAmenity) {
      if (routeAmenityIdRef.current !== selectedAmenity.id) {
        showPlaceRoute(selectedAmenity, false)
      }
      return
    }
    routeAbortRef.current?.abort()
    routeAmenityIdRef.current = null
    clearRouteLine(map)
  }
  const selectAmenity = (amenity: PublicAmenity, source: AmenitySelectSource) => {
    const panorama = (loaded?.assets ?? []).find(
      (asset) =>
        Boolean(amenity.panoramaAssetId) &&
        asset.id === amenity.panoramaAssetId &&
        asset.type === "panorama" &&
        asset.url
    )
    if (panorama) {
      openPanoramaAsset(panorama)
      return
    }
    const payload = toAmenityPayload(amenity, source)
    setSelected(payload)
    setShowAmenities(true)
    onAmenitySelectRef.current?.(payload)
    if (payload.lngLat) showPlaceRoute(amenity, true, "detail")
  }
  selectAmenityRef.current = selectAmenity

  useEffect(() => {
    const container = containerRef.current
    const experience = loaded
    if (!container || !experience || !mapboxAccessToken) return
    mapboxgl.accessToken = mapboxAccessToken
    const map = new mapboxgl.Map({
      container,
      style: experience.map.style,
      center: [
        experience.map.initialCamera.longitude,
        experience.map.initialCamera.latitude
      ],
      zoom: experience.map.initialCamera.zoom,
      pitch: experience.map.initialCamera.pitch,
      bearing: experience.map.initialCamera.bearing
    })
    map.addControl(new mapboxgl.NavigationControl({ visualizePitch: true }), "bottom-right")
    let hasFittedLots = false
    let removed = false
    let glbFrame = 0
    const paintModels = (): void => {
      if (removed) return
      syncExperienceModels(map, overlayRef.current, glbRef)
    }
    map.on("style.load", () => {
      glbRef.current = null
      mountExperienceLayers(map, overlayRef.current)
      paintModels()
      cancelAnimationFrame(glbFrame)
      glbFrame = requestAnimationFrame(paintModels)
      const activeRouteId = routeAmenityIdRef.current
      if (activeRouteId) {
        const activeAmenity = amenityRowsRef.current.find(
          (row) => row.id === activeRouteId
        )
        if (activeAmenity) showPlaceRouteRef.current(activeAmenity, true)
      }
      const activeHoverId = hoveredIdRef.current
      if (activeHoverId && map.getSource(AMENITY_SOURCE)) {
        map.setFeatureState(
          { source: AMENITY_SOURCE, id: activeHoverId },
          { hover: true }
        )
      }
      if (hasFittedLots || routeAmenityIdRef.current) return
      hasFittedLots = true
      const snap = overlayRef.current.experience
      const bounds = lotBounds(snap?.lots ?? null)
      if (!bounds || !snap) return
      const width = map.getContainer().clientWidth
      const panelLeft = Math.min(392, Math.floor(width * 0.45))
      map.fitBounds(bounds, {
        padding: {
          top: 72,
          right: 72,
          bottom: 72,
          left: showAmenitiesRef.current ? Math.max(72, panelLeft) : 72
        },
        maxZoom: 17,
        pitch: snap.map.initialCamera.pitch,
        bearing: snap.map.initialCamera.bearing,
        duration: prefersReducedMotion() ? 0 : 700
      })
    })
    map.on("mousemove", (event: MapMouseEvent) => {
      if (listHoverRef.current || !map.getLayer(AMENITY_LAYER)) return
      const hits = map.queryRenderedFeatures(event.point, {
        layers: [AMENITY_LAYER, AMENITY_HALO_LAYER].filter((id) =>
          Boolean(map.getLayer(id))
        )
      })
      const amenityHit = hits.find(
        (hit) =>
          hit.layer?.id === AMENITY_LAYER || hit.layer?.id === AMENITY_HALO_LAYER
      )
      const nextId = amenityHit?.properties?.id
        ? String(amenityHit.properties.id)
        : null
      if (!nextId && cameraMovingRef.current) {
        map.getCanvas().style.cursor = "pointer"
        return
      }
      map.getCanvas().style.cursor = nextId ? "pointer" : ""
      setHoveredId((current) => (current === nextId ? current : nextId))
    })
    map.on("mouseleave", () => {
      if (listHoverRef.current) return
      map.getCanvas().style.cursor = ""
      setHoveredId(null)
    })
    map.on("click", (event: MapMouseEvent) => {
      const hits = map.queryRenderedFeatures(event.point, {
        layers: [LOT_LAYER, AMENITY_LAYER, AMENITY_HALO_LAYER].filter((id) =>
          Boolean(map.getLayer(id))
        )
      })
      const amenityHit = hits.find(
        (hit) =>
          hit.layer?.id === AMENITY_LAYER || hit.layer?.id === AMENITY_HALO_LAYER
      )
      if (amenityHit?.properties?.id) {
        const amenity = amenityRowsRef.current.find(
          (row) => row.id === String(amenityHit.properties?.id)
        )
        if (amenity) selectAmenityRef.current(amenity, "map")
        return
      }
      const linkedPlace = nearestLinkedPlace(
        map,
        event.point,
        amenityRowsRef.current,
        assetRowsRef.current
      )
      if (linkedPlace) {
        selectAmenityRef.current(linkedPlace, "map")
        return
      }
      const lotHit = hits.find((hit) => hit.layer?.id === LOT_LAYER)
      if (!lotHit) return
      const properties = lotHit.properties ?? {}
      onLotClickRef.current?.({
        lotId: properties.lotId ? String(properties.lotId) : null,
        number: String(properties.lotNumber ?? properties.number ?? ""),
        stageKey: String(properties.stageKey ?? ""),
        status: properties.status ? String(properties.status) : null,
        area: properties.area != null ? Number(properties.area) : null,
        price: properties.price != null ? Number(properties.price) : null,
        lngLat: { longitude: event.lngLat.lng, latitude: event.lngLat.lat }
      })
    })
    mapRef.current = map
    setMapReady((value) => value + 1)
    return () => {
      removed = true
      cancelAnimationFrame(glbFrame)
      map.remove()
      mapRef.current = null
      glbRef.current = null
    }
    // Recreate the map only when the style URL or token changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded?.map.style, mapboxAccessToken])

  useEffect(() => {
    const map = mapRef.current
    if (!map?.isStyleLoaded()) return
    syncExperienceModels(map, overlayRef.current, glbRef)
  }, [modelKey, mapReady])

  useEffect(() => {
    const map = mapRef.current
    if (!map || !scenePlaying || !activeSceneId || !loaded) return
    const scenes = loaded.scenes ?? []
    const scene = scenes.find((row) => row.id === activeSceneId)
    if (!scene) return
    const controller = new AbortController()
    void playCameraMotion({
      map,
      camera: scene.camera,
      durationMs: scene.durationMs,
      bearings: scenes.map((row) => row.camera.bearing),
      signal: controller.signal
    })
    return () => controller.abort()
  }, [activeSceneId, loaded, mapReady, scenePlaying])

  useEffect(() => {
    const map = mapRef.current
    if (!map?.getSource(AMENITY_SOURCE)) return
    ;(map.getSource(AMENITY_SOURCE) as GeoJSONSource).setData(amenities)
    if (hoveredIdRef.current) {
      map.setFeatureState(
        { source: AMENITY_SOURCE, id: hoveredIdRef.current },
        { hover: true }
      )
    }
  }, [amenities])

  useEffect(() => {
    const map = mapRef.current
    if (!map?.getSource(AMENITY_SOURCE)) return
    const previous = hoveredIdRef.current
    if (previous && previous !== hoveredId) {
      map.setFeatureState({ source: AMENITY_SOURCE, id: previous }, { hover: false })
    }
    if (hoveredId) {
      map.setFeatureState({ source: AMENITY_SOURCE, id: hoveredId }, { hover: true })
    }
    hoveredIdRef.current = hoveredId
  }, [amenities, hoveredId, mapReady])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const visible = showAmenities ? "visible" : "none"
    ;[AMENITY_LAYER, AMENITY_HALO_LAYER].forEach((layerId) => {
      if (!map.getLayer(layerId)) return
      map.setFilter(layerId, null)
      map.setLayoutProperty(layerId, "visibility", visible)
    })
  }, [amenities, mapReady, showAmenities])

  const hoveredAmenity = amenityRows.find((row) => row.id === hoveredId) ?? null
  const hoveredLngLat = hoveredAmenity
    ? representativePoint(hoveredAmenity.geometry)
    : null
  const hoverLongitude = hoveredLngLat?.longitude
  const hoverLatitude = hoveredLngLat?.latitude

  useEffect(() => {
    const map = mapRef.current
    if (!map || hoverLongitude == null || hoverLatitude == null) {
      setHoverPoint(null)
      return
    }
    const place = () => {
      const projected = map.project([hoverLongitude, hoverLatitude])
      setHoverPoint({ x: projected.x, y: projected.y })
    }
    place()
    map.on("move", place)
    return () => {
      map.off("move", place)
    }
  }, [hoverLatitude, hoverLongitude, mapReady])

  useEffect(() => {
    if (!hoveredId || hoverLongitude == null || hoverLatitude == null) {
      restoreSelectedRoute()
      return
    }
    const amenity = amenityRowsRef.current.find((row) => row.id === hoveredId)
    if (!amenity) return
    showPlaceRouteRef.current(amenity, true, "list")
  }, [hoverLatitude, hoverLongitude, hoveredId])

  useEffect(() => {
    if (selected || hoveredIdRef.current) return
    const map = mapRef.current
    if (!map) return
    routeAbortRef.current?.abort()
    routeAmenityIdRef.current = null
    clearRouteLine(map)
  }, [selected])

  useEffect(() => {
    const map = mapRef.current
    if (!map) return
    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const holdStill = markerMotion === "none" || reducedMotion
    if (holdStill) {
      if (map.getLayer(AMENITY_HALO_LAYER)) {
        map.setPaintProperty(
          AMENITY_HALO_LAYER,
          "circle-radius",
          HALO_START_RADIUS
        )
        map.setPaintProperty(AMENITY_HALO_LAYER, "circle-opacity", 0.22)
      }
      return
    }
    const startedAt = performance.now()
    let frame = 0
    const tick = (now: number) => {
      if (map.getLayer(AMENITY_HALO_LAYER)) {
        const progress = ((now - startedAt) % PULSE_DURATION_MS) / PULSE_DURATION_MS
        map.setPaintProperty(
          AMENITY_HALO_LAYER,
          "circle-radius",
          HALO_START_RADIUS + progress * HALO_GROWTH
        )
        map.setPaintProperty(
          AMENITY_HALO_LAYER,
          "circle-opacity",
          HALO_PEAK_OPACITY * (1 - progress)
        )
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [mapReady, markerMotion])

  useEffect(() => {
    mapRef.current?.resize()
  }, [selected, isMobile])

  const detailOpen = Boolean(selected) && showAmenities

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", minHeight: 0 }}>
      <div style={{ position: "relative", flex: "1 1 auto", minWidth: 0 }}>
        <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
        {hoveredAmenity && hoverPoint && !detailOpen && (
          <div
            style={{
              position: "absolute",
              left: hoverPoint.x,
              top: hoverPoint.y,
              transform: "translate(-50%, calc(-100% - 14px))",
              zIndex: 4,
              pointerEvents: "none"
            }}
          >
            <AmenityHoverCard
              name={hoveredAmenity.name}
              category={
                hoveredAmenity.subtitle ||
                hoveredAmenity.categoryLabel ||
                hoveredAmenity.categoryKey
              }
              imageUrl={
                resolveMediaUrl(
                  loaded?.apiOrigin ?? "",
                  hoveredAmenity.media.cover ?? hoveredAmenity.media.gallery[0] ?? null
                ) || null
              }
            />
          </div>
        )}
        <MapOptions
          labels={optionLabels}
          projectCenter={loaded?.projectCenter ?? null}
          pitchOn={pitchOn}
          satelliteOn={satelliteOn}
          travelOn={travelOn}
          profile={travelProfile}
          minutes={travelMinutes}
          travelError={travelError ? optionLabels.travelError : null}
          onRecenter={() => {
            const map = mapRef.current
            const center = loaded?.projectCenter
            if (!map || !center) return
            map.flyTo({
              center: [center.longitude, center.latitude],
              zoom: Math.max(map.getZoom(), loaded?.map.initialCamera.zoom ?? 14),
              duration: prefersReducedMotion() ? 0 : 700
            })
          }}
          onPitchChange={(on) => {
            setPitchOn(on)
            mapRef.current?.easeTo({
              pitch: on ? 60 : 0,
              duration: prefersReducedMotion() ? 0 : 200
            })
          }}
          onSatelliteChange={(on) => {
            setSatelliteOn(on)
            const map = mapRef.current
            const published = loaded?.map.style
            if (!map || !published) return
            const offStyle = published.includes("satellite") ? STREETS_STYLE : published
            map.setStyle(on ? SATELLITE_STYLE : offStyle)
          }}
          onTravelChange={setTravelOn}
          onProfileChange={setTravelProfile}
          onMinutesChange={setTravelMinutes}
        />
        {showAmenities && (
          <AmenityBrowser
            categories={amenityCategories}
            locations={amenityRows}
            apiOrigin={loaded?.apiOrigin ?? ""}
            openKey={openCategoryKey}
            onOpenChange={setOpenCategoryKey}
            selectedId={selected?.id ?? null}
            hoveredId={hoveredId}
            onHover={(id) => {
              listHoverRef.current = true
              setHoveredId(id)
            }}
            onLeave={() => {
              listHoverRef.current = false
              setHoveredId(null)
            }}
            onSelect={(amenity) => selectAmenity(amenity, "list")}
          />
        )}
        {showNavigation && (
          <aside style={{ ...listStyle, left: showAmenities ? 384 : 16 }}>
            {amenityRows.map((amenity) => (
              <button
                key={amenity.id}
                type="button"
                onClick={() => selectAmenity(amenity, "list")}
                style={rowStyle(selected?.id === amenity.id, hoveredId === amenity.id)}
              >
                {amenity.name}
              </button>
            ))}
          </aside>
        )}
        {error && (
          <p style={{ position: "absolute", bottom: 16, left: 16, color: "#fecaca" }}>{error}</p>
        )}
        {detailOpen && selected && loaded && (
          <div
            role="presentation"
            onClick={() => setSelected(null)}
            style={{
              position: "absolute",
              inset: 0,
              zIndex: 5,
              background: isMobile
                ? "linear-gradient(to top, rgba(8,8,10,0.62) 0%, rgba(8,8,10,0.22) 48%, rgba(8,8,10,0) 100%)"
                : "linear-gradient(to right, rgba(8,8,10,0.5) 0%, rgba(8,8,10,0.16) 46%, rgba(8,8,10,0) 72%)"
            }}
          >
            <div
              role="dialog"
              aria-label={selected.name}
              onClick={(event) => event.stopPropagation()}
              style={{
                position: "absolute",
                left: isMobile ? 12 : 16,
                right: isMobile ? 12 : "auto",
                bottom: isMobile ? 12 : 16,
                top: isMobile ? "auto" : 16,
                width: isMobile ? "auto" : "min(420px, calc(100% - 32px))",
                maxHeight: isMobile ? "72%" : "none",
                borderRadius: 16,
                overflow: "hidden",
                border: "1px solid rgba(255,255,255,0.14)",
                boxShadow: "0 18px 48px rgba(0,0,0,0.35)"
              }}
            >
              <AmenityDetail
                amenity={selected}
                apiOrigin={loaded.apiOrigin}
                projectCenter={loaded.projectCenter}
                googleMapsApiKey={googleMapsApiKey}
                onClose={() => setSelected(null)}
              />
            </div>
          </div>
        )}
        {openPanorama && loaded && (
          <PanoramaViewer
            imageUrl={openPanorama.url}
            longitude={openPanorama.position.longitude}
            latitude={openPanorama.position.latitude}
            altitude={openPanorama.position.altitude}
            headingDegrees={openPanorama.transform.rotation[1] ?? 0}
            lots={loaded.lots}
            availableLotColor={resolveAvailableLotColor(loaded.map.availableLotColor)}
            onClose={() => setOpenPanorama(null)}
          />
        )}
      </div>
    </div>
  )
}

function buttonStyle(active: boolean): React.CSSProperties {
  return {
    border: "1px solid #334155",
    background: active ? "#0f172a" : "rgba(15,23,42,0.72)",
    color: "#f8fafc",
    borderRadius: 999,
    padding: "4px 10px",
    fontSize: 12,
    cursor: "pointer"
  }
}

const listStyle: React.CSSProperties = {
  position: "absolute",
  top: 52,
  left: 16,
  width: 210,
  maxHeight: "calc(100% - 88px)",
  overflow: "auto",
  background: "rgba(11,18,32,0.92)",
  border: "1px solid #1e293b",
  borderRadius: 12,
  padding: 6,
  zIndex: 2
}

function rowStyle(active: boolean, hovered: boolean): React.CSSProperties {
  return {
    display: "block",
    width: "100%",
    textAlign: "left",
    border: 0,
    background: hovered
      ? "rgba(224,122,61,0.22)"
      : active
        ? "rgba(56,189,248,0.16)"
        : "transparent",
    color: "#e2e8f0",
    borderRadius: 8,
    padding: "4px 8px",
    fontSize: 12,
    cursor: "pointer",
    textDecoration: "none",
    marginBottom: 2
  }
}
