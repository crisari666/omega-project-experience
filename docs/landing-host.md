# Landing host guide

Mount `@omega/project-experience` as the map stage. Design the page around it. Do not redraw the map, the amenity list, Map Options, or the place sheet.

Package: `github:crisari666/omega-project-experience`. Peers: React 18, `mapbox-gl` ^3, `three` ^0.170. Import `mapbox-gl/dist/mapbox-gl.css`.

## Mount

The player root is `position: relative; width: 100%; height: 100%`. Give the stage a real height (the viewport, or a sized section). It does not size itself.

```tsx
import { ProjectExperience } from "@omega/project-experience"
import "mapbox-gl/dist/mapbox-gl.css"

export function ProjectStage({ projectId }: { projectId: string }) {
  return (
    <div style={{ height: "100vh" }}>
      <ProjectExperience
        projectId={projectId}
        apiBaseUrl="https://example.com/rag"
        mapboxAccessToken={import.meta.env.VITE_MAPBOX_ACCESS_TOKEN}
        googleMapsApiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY}
        locale="es"
        onLotClick={(lot) => {
          // Open the landing lot sheet. The player does not.
        }}
      />
    </div>
  )
}
```

`apiBaseUrl` is the public RAG origin, with no trailing slash. The player loads `GET {apiBaseUrl}/projects/{projectId}/experience/public`, then the lots GeoJSON at `resources.lots`. That GET is the published snapshot. Unsaved studio edits are not in it.

Pass `googleMapsApiKey` so a town place embeds Street View. Without a key, the same place shows an external Street View link.

`locale="es"` translates Map Options only. The Amenities and Navigation buttons, the place sheet, and the 360 viewer stay English. `labels` can override Map Options copy for another language. It does not translate the rest.

`data` skips the public fetch. Use it only for an in-memory preview. A landing page passes `projectId` and `apiBaseUrl`.

One Mapbox map. Do not mount a second map next to this stage.

## Already inside the player

These sit on top of the map. Leave them.

- **Lots.** Polygons fill by status. Available uses the published `map.availableLotColor`, or `#15803d` when that value is missing. Sold is `#64748b`, reserved is `#b45309`, anything else is `#1e293b`. A click calls `onLotClick`. There is no purchase sheet.
- **Amenities.** Category chips stay on the map. Every amenity dot always pulses; opening a category only opens that list. Hover or click flies the camera between the project and that place and, when a driving line was published, draws it. The halo pulses unless `markerMotion="none"` or the user prefers reduced motion. There are no Amenities or Navigation buttons.
- **Place sheet.** Gallery, name, description, distance from the project, and “Directions from the project”. A town place adds Street View. A linked 360 photo opens a panorama with lot outlines. Desktop: a left sheet. Mobile (under 720px): a bottom sheet at 72% height. Escape or the scrim closes it.
- **Map Options** (top right). Recenter, 3D pitch, satellite, and a travel-time ring (walk, bike, or drive, in minutes). These choices stay in the browser. They are not saved on the project. The travel ring uses the same Mapbox token.
- **Scenes.** `activeSceneId` plus `scenePlaying={true}` flies to that scene’s camera. `durationMs` is the time spent traveling into the scene, not a dwell time. The last scene back to the first keeps the tour’s turn direction. The package draws no play bar and no scene title.

## What the landing page designs

- The page frame: project name and the stage.
- A scene tour control. Load scenes first, then set `activeSceneId` and `scenePlaying`. There is no published flag for hiding titles, so the page chooses whether to show `scene.title`.

```tsx
import { loadPublishedExperience } from "@omega/project-experience"

const experience = await loadPublishedExperience({
  apiBaseUrl: "https://example.com/rag",
  projectId
})
// experience.scenes: { id, title, camera, durationMs }[]
```

`loadPublishedExperience` throws `"Published experience was not found"` when the public GET is not ok. Publish the project before the landing can load it.

- A lot sheet opened from `onLotClick`. Show number, stage, status, area, and price, then the next step (inquire or reserve). Checkout is not in the package.
- Do not add a second amenity list, a route-color control, or another satellite toggle. `onAmenitySelect` is for a side effect (analytics, a deeper page). The place sheet already opens inside the player.
- On a phone, keep headers, tabs, and sticky bars off Map Options and the category chips.

Match the player: dark surface, copper `#E07A3D` and `#C4532A`, text `#f8fafc`.

## Props

| Prop | Role |
| --- | --- |
| `projectId` | Published project id |
| `apiBaseUrl` | Public RAG origin. Omit when `data` is passed |
| `mapboxAccessToken` | Host Mapbox token. Required |
| `googleMapsApiKey` | Embeds Street View for `category === "town"` |
| `data` | In-memory experience. Skips the public fetch |
| `onLotClick` | Lot polygon click |
| `onAmenitySelect` | Place picked from the map or a list. `source` is `"map"` or `"list"` |
| `markerMotion` | `"pulse"` (default) or `"none"` |
| `locale` | Map Options language. `"en"` (default) or `"es"` |
| `labels` | Partial Map Options copy. Overrides `locale` |
| `amenitiesVisible` | Initial Amenities panel. Default on |
| `navigationVisible` | Initial Navigation list. Default off |
| `activeSceneId` | Scene to fly to |
| `scenePlaying` | Fly while `true` |

## Lot click

```ts
type LotClickPayload = {
  lotId: string | null
  number: string
  stageKey: string
  status: string | null
  area: number | null
  price: number | null
  lngLat: { longitude: number; latitude: number }
}
```

## Amenity select

```ts
type AmenitySelectPayload = {
  id: string
  name: string
  category: string
  categoryKey: string
  categoryLabel: string
  description: string
  subtitle?: string
  gallery: readonly string[]
  distanceMeters: number | null
  estimatedTravelMinutes: number | null
  lngLat: { longitude: number; latitude: number } | null
  source: "map" | "list"
}
```
