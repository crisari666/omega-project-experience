# @omega/project-experience

Mapbox player for a published Omega project. The host shows the map, amenities, and scene playback. Lot purchase stays in the host.

The player includes Map Options (3D view, satellite, travel times) in the browser. Those choices are not saved on the project. Travel times use the same `mapboxAccessToken`.

## Install

The host must already depend on `react`, `react-dom`, `mapbox-gl`, and `three`.

```bash
yarn add github:crisari666/omega-project-experience
```

Pass the host's own Mapbox token. This package does not include one.

## Use

```tsx
import { ProjectExperience } from "@omega/project-experience"
import "mapbox-gl/dist/mapbox-gl.css"

export function ProjectMap() {
  return (
    <ProjectExperience
      projectId="PROJECT_ID"
      apiBaseUrl="https://example.com/rag"
      mapboxAccessToken={import.meta.env.VITE_MAPBOX_ACCESS_TOKEN}
      onLotClick={(lot) => {
        console.log(lot.lotId, lot.status, lot.price)
      }}
      onAmenitySelect={(amenity) => {
        console.log(amenity.name, amenity.source)
      }}
    />
  )
}
```

`apiBaseUrl` is the public RAG origin, without a trailing slash. The player loads `GET {apiBaseUrl}/projects/{projectId}/experience/public`.

| Prop | Role |
| --- | --- |
| `projectId` | Published project id |
| `apiBaseUrl` | Public RAG base. Omit when `data` is passed |
| `mapboxAccessToken` | Host Mapbox token |
| `data` | In-memory experience. Skips the public fetch |
| `onLotClick` | Lot polygon click. No checkout UI |
| `onAmenitySelect` | Amenity picked from the map or the list (`source`) |
| `markerMotion` | `"pulse"` (default) or `"none"` |
| `amenitiesVisible` | Initial amenities list visibility |
| `navigationVisible` | Initial directions list visibility |
| `activeSceneId` | Scene to fly to |
| `scenePlaying` | Play that scene while true |
