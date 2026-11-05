import React, { useEffect, useMemo, useRef, useState } from "react"
import mapboxgl, { type GeoJSONSource, type Map, type MapMouseEvent } from "mapbox-gl"
import "mapbox-gl/dist/mapbox-gl.css"
import { AmenityDetail } from "./amenity-detail"
import {
  MapOptions,
  type TravelMinutes,
  type TravelProfile
} from "./map-options"
import { loadPublishedExperience, resolveMediaUrl } from "./load-published"
import { playCameraMotion } from "./play-camera-motion"
import {
  ensureStudioGlbLayer,
  type StudioGlbCustomLayer,
  type StudioGlbPlacement
} from "./glb-layer"
import type {
  AmenitySelectPayload,
  AmenitySelectSource,
  ExperiencePlayerData,
  LotClickPayload,
  PublicAmenity
} from "./types"

const LOT_SOURCE = "experience-lots"
const LOT_LAYER = "experience-lots-fill"
const AMENITY_SOURCE = "experience-amenities"
const AMENITY_LAYER = "experience-amenities-point"
const AMENITY_HALO_LAYER = "experience-amenities-halo"
const PULSE_DURATION_MS = 1800
const HALO_START_RADIUS = 8
const HALO_GROWTH = 16
const HALO_PEAK_OPACITY = 0.38
const ISO_SOURCE = "experience-isochrone"
const ISO_LAYER = "experience-isochrone-fill"
const SATELLITE_STYLE = "mapbox://styles/mapbox/satellite-streets-v12"
const STREETS_STYLE = "mapbox://styles/mapbox/streets-v12"
const EMPTY_COLLECTION: GeoJSON.FeatureCollection = {
  type: "FeatureCollection",
  features: []
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
  data?: ExperiencePlayerData
  amenitiesVisible?: boolean
  navigationVisible?: boolean
  onLotClick?: (lot: LotClickPayload) => void
  onAmenitySelect?: (amenity: AmenitySelectPayload) => void
  activeSceneId?: string | null
  scenePlaying?: boolean
  /** Pulse is the client default. Pass "none" to keep the dots still. */
  markerMotion?: "pulse" | "none"
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
    categoryKey: amenity.categoryKey,
    categoryLabel: amenity.categoryLabel,
    description: amenity.description,
    gallery,
    distanceMeters: amenity.distanceMeters,
    estimatedTravelMinutes: amenity.estimatedTravelMinutes,
    lngLat: representativePoint(amenity.geometry),
    source
  }
}

function mountExperienceLayers(
  map: Map,
  snap: OverlaySnap,
  glbRef: { current: StudioGlbCustomLayer | null }
): void {
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
        "fill-color": [
          "match",
          ["get", "status"],
          "available",
          "#15803d",
          "sold",
          "#64748b",
          "reserved",
          "#b45309",
          "#1e293b"
        ],
        "fill-opacity": 0.55
      }
    })
  }
  if (!map.getSource(AMENITY_SOURCE)) {
    map.addSource(AMENITY_SOURCE, { type: "geojson", data: snap.amenities })
  }
  const amenityVisibility = snap.showAmenities ? "visible" : "none"
  if (!map.getLayer(AMENITY_HALO_LAYER)) {
    map.addLayer({
      id: AMENITY_HALO_LAYER,
      type: "circle",
      source: AMENITY_SOURCE,
      layout: { visibility: amenityVisibility },
      paint: {
        "circle-radius": HALO_START_RADIUS + HALO_GROWTH * 0.45,
        "circle-color": "#38bdf8",
        "circle-opacity": 0.22,
        "circle-stroke-width": 0
      }
    })
  }
  if (!map.getLayer(AMENITY_LAYER)) {
    map.addLayer({
      id: AMENITY_LAYER,
      type: "circle",
      source: AMENITY_SOURCE,
      layout: { visibility: amenityVisibility },
      paint: {
        "circle-radius": 8,
        "circle-color": "#38bdf8",
        "circle-stroke-width": 2,
        "circle-stroke-color": "#0f172a"
      }
    })
  }
  const placements: StudioGlbPlacement[] = experience.assets
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
      ]
    }))
  if (experience.layers.models3D && placements.length > 0) {
    const layer = ensureStudioGlbLayer(map, glbRef.current)
    glbRef.current = layer
    void layer.syncPlacements(placements)
  }
  if (map.getLayer(ISO_LAYER) && map.getLayer(LOT_LAYER)) {
    map.moveLayer(ISO_LAYER, LOT_LAYER)
  }
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
}

function amenityCollection(locations: readonly PublicAmenity[]): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: locations
      .map((location) => {
        const point = representativePoint(location.geometry)
        if (!point) return null
        return {
          type: "Feature" as const,
          id: location.id,
          properties: { id: location.id, name: location.name },
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
  data,
  amenitiesVisible,
  navigationVisible,
  onLotClick,
  onAmenitySelect,
  activeSceneId = null,
  scenePlaying = false,
  markerMotion = "pulse"
}: ProjectExperienceProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<Map | null>(null)
  const glbRef = useRef<StudioGlbCustomLayer | null>(null)
  const [loaded, setLoaded] = useState<ExperiencePlayerData | null>(data ?? null)
  const [error, setError] = useState<string | null>(null)
  const [mapReady, setMapReady] = useState(0)
  const [showAmenities, setShowAmenities] = useState(amenitiesVisible ?? true)
  const [showNavigation, setShowNavigation] = useState(navigationVisible ?? false)
  const [selected, setSelected] = useState<AmenitySelectPayload | null>(null)
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
  onLotClickRef.current = onLotClick
  onAmenitySelectRef.current = onAmenitySelect

  useEffect(() => {
    if (amenitiesVisible !== undefined) setShowAmenities(amenitiesVisible)
  }, [amenitiesVisible])

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

  const amenities = useMemo(
    () => amenityCollection(loaded?.locations ?? []),
    [loaded?.locations]
  )
  const overlayRef = useRef<OverlaySnap>({
    experience: loaded,
    amenities,
    showAmenities,
    travelGeojson
  })
  overlayRef.current = { experience: loaded, amenities, showAmenities, travelGeojson }

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

  const selectAmenity = (amenity: PublicAmenity, source: AmenitySelectSource) => {
    const payload = toAmenityPayload(amenity, source)
    setSelected(payload)
    setShowAmenities(true)
    onAmenitySelectRef.current?.(payload)
    const map = mapRef.current
    if (map && payload.lngLat) {
      map.flyTo({
        center: [payload.lngLat.longitude, payload.lngLat.latitude],
        zoom: Math.max(map.getZoom(), 16),
        duration: 700
      })
    }
  }

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
    map.on("style.load", () => {
      glbRef.current = null
      mountExperienceLayers(map, overlayRef.current, glbRef)
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
        const amenity = experience.locations.find(
          (row) => row.id === String(amenityHit.properties?.id)
        )
        if (amenity) selectAmenity(amenity, "map")
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
      map.remove()
      mapRef.current = null
      glbRef.current = null
    }
    // Map is created once per loaded experience identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded, mapboxAccessToken])

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
    const visibility = showAmenities ? "visible" : "none"
    ;[AMENITY_LAYER, AMENITY_HALO_LAYER].forEach((layerId) => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, "visibility", visibility)
      }
    })
  }, [amenities, showAmenities])

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
          HALO_START_RADIUS + HALO_GROWTH * 0.45
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
  const split = detailOpen && !isMobile

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", display: "flex", minHeight: 0 }}>
      <div style={{ position: "relative", flex: split ? "0 0 50%" : "1 1 auto", minWidth: 0 }}>
        <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />
        <MapOptions
          projectCenter={loaded?.projectCenter ?? null}
          pitchOn={pitchOn}
          satelliteOn={satelliteOn}
          travelOn={travelOn}
          profile={travelProfile}
          minutes={travelMinutes}
          travelError={travelError}
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
        <div style={{ position: "absolute", top: 16, left: 16, display: "flex", gap: 8, zIndex: 2 }}>
          <button type="button" onClick={() => setShowAmenities((value) => !value)} style={buttonStyle(showAmenities)}>
            Amenities
          </button>
          <button type="button" onClick={() => setShowNavigation((value) => !value)} style={buttonStyle(showNavigation)}>
            Navigation
          </button>
        </div>
        {showAmenities && (
          <aside style={listStyle}>
            {(loaded?.locations ?? []).map((amenity) => (
              <button
                key={amenity.id}
                type="button"
                onClick={() => selectAmenity(amenity, "list")}
                style={rowStyle(selected?.id === amenity.id)}
              >
                <strong>{amenity.name}</strong>
                <span style={{ display: "block", color: "#94a3b8", fontSize: 12 }}>
                  {amenity.categoryLabel || amenity.categoryKey}
                </span>
              </button>
            ))}
          </aside>
        )}
        {showNavigation && (
          <aside style={{ ...listStyle, left: showAmenities ? 236 : 16 }}>
            {(loaded?.locations ?? []).map((amenity) => {
              const payload = toAmenityPayload(amenity, "list")
              const href = payload.lngLat
                ? `https://www.google.com/maps/dir/?api=1${
                    loaded?.projectCenter
                      ? `&origin=${loaded.projectCenter.latitude},${loaded.projectCenter.longitude}`
                      : ""
                  }&destination=${payload.lngLat.latitude},${payload.lngLat.longitude}`
                : undefined
              return (
                <a key={amenity.id} href={href} target="_blank" rel="noreferrer" style={rowStyle(false)}>
                  {amenity.name}
                </a>
              )
            })}
          </aside>
        )}
        {error && (
          <p style={{ position: "absolute", bottom: 16, left: 16, color: "#fecaca" }}>{error}</p>
        )}
      </div>
      {split && selected && loaded && (
        <div style={{ flex: "0 0 50%", minWidth: 0 }}>
          <AmenityDetail
            amenity={selected}
            apiOrigin={loaded.apiOrigin}
            projectCenter={loaded.projectCenter}
            onClose={() => setSelected(null)}
          />
        </div>
      )}
      {detailOpen && isMobile && selected && loaded && (
        <div
          style={{
            position: "absolute",
            left: 16,
            right: 16,
            bottom: 16,
            maxHeight: "70%",
            zIndex: 3,
            borderRadius: 16,
            overflow: "hidden",
            boxShadow: "0 16px 40px rgba(0,0,0,0.35)"
          }}
        >
          <AmenityDetail
            amenity={selected}
            apiOrigin={loaded.apiOrigin}
            projectCenter={loaded.projectCenter}
            onClose={() => setSelected(null)}
          />
        </div>
      )}
    </div>
  )
}

function buttonStyle(active: boolean): React.CSSProperties {
  return {
    border: "1px solid #334155",
    background: active ? "#0f172a" : "rgba(15,23,42,0.72)",
    color: "#f8fafc",
    borderRadius: 999,
    padding: "8px 14px",
    cursor: "pointer"
  }
}

const listStyle: React.CSSProperties = {
  position: "absolute",
  top: 64,
  left: 16,
  width: 210,
  maxHeight: "calc(100% - 88px)",
  overflow: "auto",
  background: "rgba(11,18,32,0.92)",
  border: "1px solid #1e293b",
  borderRadius: 12,
  padding: 8,
  zIndex: 2
}

function rowStyle(active: boolean): React.CSSProperties {
  return {
    display: "block",
    width: "100%",
    textAlign: "left",
    border: 0,
    background: active ? "rgba(56,189,248,0.16)" : "transparent",
    color: "#e2e8f0",
    borderRadius: 8,
    padding: "8px 10px",
    cursor: "pointer",
    textDecoration: "none",
    marginBottom: 4
  }
}
