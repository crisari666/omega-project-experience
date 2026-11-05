import React from "react"
import type { AmenitySelectPayload } from "./types"
import { resolveMediaUrl } from "./load-published"

type Props = {
  amenity: AmenitySelectPayload
  apiOrigin: string
  projectCenter: { longitude: number; latitude: number } | null
  onClose: () => void
}

function directionsUrl(
  amenity: AmenitySelectPayload,
  projectCenter: { longitude: number; latitude: number } | null
): string | null {
  if (!amenity.lngLat) return null
  const destination = `${amenity.lngLat.latitude},${amenity.lngLat.longitude}`
  const origin = projectCenter
    ? `&origin=${projectCenter.latitude},${projectCenter.longitude}`
    : ""
  return `https://www.google.com/maps/dir/?api=1${origin}&destination=${destination}`
}

export function AmenityDetail({
  amenity,
  apiOrigin,
  projectCenter,
  onClose
}: Props) {
  const gallery = amenity.gallery.map((url) => resolveMediaUrl(apiOrigin, url))
  const directions = directionsUrl(amenity, projectCenter)
  return (
    <article
      style={{
        height: "100%",
        overflow: "auto",
        background: "#0b1220",
        color: "#e2e8f0",
        padding: 24
      }}
    >
      <button
        type="button"
        onClick={onClose}
        style={{
          border: "1px solid #334155",
          background: "transparent",
          color: "#e2e8f0",
          borderRadius: 8,
          padding: "6px 10px",
          cursor: "pointer"
        }}
      >
        Close
      </button>
      <p style={{ margin: "16px 0 4px", color: "#38bdf8", letterSpacing: "0.08em", fontSize: 12 }}>
        {amenity.categoryLabel || amenity.categoryKey}
      </p>
      <h2 style={{ margin: 0, fontSize: 32, fontWeight: 560 }}>{amenity.name}</h2>
      {amenity.distanceMeters != null && (
        <p style={{ color: "#94a3b8" }}>
          {Math.round(amenity.distanceMeters)} m from the project
          {amenity.estimatedTravelMinutes != null
            ? ` · ${amenity.estimatedTravelMinutes} min`
            : ""}
        </p>
      )}
      {gallery.length > 0 && (
        <div style={{ display: "grid", gap: 8, marginTop: 16 }}>
          <img
            src={gallery[0]}
            alt=""
            style={{ width: "100%", height: 240, objectFit: "cover", borderRadius: 12 }}
          />
          {gallery.length > 1 && (
            <div style={{ display: "flex", gap: 8, overflowX: "auto" }}>
              {gallery.slice(1).map((url) => (
                <img
                  key={url}
                  src={url}
                  alt=""
                  style={{ width: 88, height: 72, objectFit: "cover", borderRadius: 8 }}
                />
              ))}
            </div>
          )}
        </div>
      )}
      <p style={{ lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{amenity.description}</p>
      {directions && (
        <a href={directions} target="_blank" rel="noreferrer" style={{ color: "#38bdf8" }}>
          Directions from the project
        </a>
      )}
    </article>
  )
}
