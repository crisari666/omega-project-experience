import type { ExperiencePlayerData, PublishedManifest } from "./types"

function resolveResource(apiBaseUrl: string, resourcePath: string): string {
  if (resourcePath.startsWith("http://") || resourcePath.startsWith("https://")) {
    return resourcePath
  }
  const origin = new URL(apiBaseUrl).origin
  return `${origin}${resourcePath.startsWith("/") ? "" : "/"}${resourcePath}`
}

/**
 * Loads the published experience and the public lot map.
 */
export async function loadPublishedExperience(params: {
  apiBaseUrl: string
  projectId: string
}): Promise<ExperiencePlayerData> {
  const base = params.apiBaseUrl.replace(/\/$/, "")
  const manifestResponse = await fetch(
    `${base}/projects/${params.projectId}/experience/public`
  )
  if (!manifestResponse.ok) {
    throw new Error("Published experience was not found")
  }
  const manifest = (await manifestResponse.json()) as PublishedManifest
  let lots: GeoJSON.FeatureCollection | null = null
  if (manifest.resources?.lots) {
    const lotsResponse = await fetch(
      resolveResource(base, manifest.resources.lots)
    )
    if (lotsResponse.ok) {
      const body = (await lotsResponse.json()) as {
        geojson?: GeoJSON.FeatureCollection
      }
      lots = body.geojson ?? null
    }
  }
  return {
    projectId: manifest.projectId,
    apiOrigin: new URL(base).origin,
    map: manifest.map,
    layers: {
      lots: manifest.layers.lots,
      locations: manifest.layers.locations,
      models3D: manifest.layers.models3D
    },
    amenityCategories: manifest.amenityCategories ?? [],
    locations: manifest.locations ?? [],
    assets: manifest.assets ?? [],
    lots,
    projectCenter: {
      longitude: manifest.map.initialCamera.longitude,
      latitude: manifest.map.initialCamera.latitude
    },
    scenes: [...(manifest.scenes ?? [])]
      .sort(
        (a, b) =>
          ((a as { sortOrder?: number }).sortOrder ?? 0) -
          ((b as { sortOrder?: number }).sortOrder ?? 0)
      )
      .map((scene) => ({
        id: scene.id,
        title: scene.title,
        camera: scene.camera,
        durationMs: scene.durationMs
      }))
  }
}

export function resolveMediaUrl(apiOrigin: string, url: string | null): string {
  if (!url) return ""
  if (url.startsWith("http://") || url.startsWith("https://")) return url
  if (url.startsWith("/")) return `${apiOrigin}${url}`
  return url
}
