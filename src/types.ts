export type ExperienceCamera = {
  longitude: number
  latitude: number
  zoom: number
  pitch: number
  bearing: number
}

export type AmenityCategory = {
  key: string
  label: string
  sortOrder: number
}

export type AmenityMedia = {
  cover: string | null
  gallery: readonly string[]
  video: string | null
}

export type PublicAmenity = {
  id: string
  name: string
  description: string
  categoryKey: string
  categoryLabel: string
  geometry: {
    type: "Point" | "LineString" | "Polygon"
    coordinates: unknown
  }
  distanceMeters: number | null
  estimatedTravelMinutes: number | null
  media: AmenityMedia
}

export type PublicAsset = {
  id: string
  name: string
  type: string
  url: string
  position: {
    longitude: number
    latitude: number
    altitude: number | null
  }
  transform: {
    rotation: readonly number[]
    scale: number
  }
}

export type PublicScene = {
  id: string
  title: string
  camera: ExperienceCamera
  durationMs: number
}

export type ExperiencePlayerData = {
  projectId: string
  apiOrigin: string
  map: {
    style: string
    terrain: boolean
    terrainExaggeration: number
    buildings3D: boolean
    fog: boolean
    initialCamera: ExperienceCamera
  }
  layers: {
    lots: boolean
    locations: boolean
    models3D: boolean
  }
  amenityCategories: readonly AmenityCategory[]
  locations: readonly PublicAmenity[]
  assets: readonly PublicAsset[]
  lots: GeoJSON.FeatureCollection | null
  projectCenter: { longitude: number; latitude: number } | null
  scenes: readonly PublicScene[]
}

export type LotClickPayload = {
  lotId: string | null
  number: string
  stageKey: string
  status: string | null
  area: number | null
  price: number | null
  lngLat: { longitude: number; latitude: number }
}

export type AmenitySelectSource = "map" | "list"

export type AmenitySelectPayload = {
  id: string
  name: string
  categoryKey: string
  categoryLabel: string
  description: string
  gallery: readonly string[]
  distanceMeters: number | null
  estimatedTravelMinutes: number | null
  lngLat: { longitude: number; latitude: number } | null
  source: AmenitySelectSource
}

export type PublishedManifest = {
  projectId: string
  map: ExperiencePlayerData["map"]
  layers: {
    lots: boolean
    roads: boolean
    locations: boolean
    assets: boolean
    models3D: boolean
  }
  amenityCategories?: readonly AmenityCategory[]
  resources: { lots: string }
  locations: readonly PublicAmenity[]
  assets: readonly PublicAsset[]
  scenes?: readonly PublicScene[]
}
