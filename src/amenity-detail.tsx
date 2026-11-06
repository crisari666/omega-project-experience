import React, { useEffect, useState } from "react"
import type { AmenitySelectPayload } from "./types"
import { resolveMediaUrl } from "./load-published"

type Props = {
  amenity: AmenitySelectPayload
  apiOrigin: string
  projectCenter: { longitude: number; latitude: number } | null
  googleMapsApiKey?: string
  onClose: () => void
}

const RUST = "#C4532A"

function bearingDegrees(
  origin: { longitude: number; latitude: number },
  target: { longitude: number; latitude: number }
): number {
  const originLat = (origin.latitude * Math.PI) / 180
  const targetLat = (target.latitude * Math.PI) / 180
  const deltaLng = ((target.longitude - origin.longitude) * Math.PI) / 180
  const y = Math.sin(deltaLng) * Math.cos(targetLat)
  const x =
    Math.cos(originLat) * Math.sin(targetLat) -
    Math.sin(originLat) * Math.cos(targetLat) * Math.cos(deltaLng)
  return (Math.atan2(y, x) * 180) / Math.PI
}

function streetViewHeading(
  amenity: AmenitySelectPayload,
  projectCenter: { longitude: number; latitude: number } | null
): number {
  if (!amenity.lngLat || !projectCenter) return 0
  const heading = bearingDegrees(projectCenter, amenity.lngLat)
  return (heading + 360) % 360
}

function streetViewUrl(params: {
  amenity: AmenitySelectPayload
  projectCenter: { longitude: number; latitude: number } | null
  googleMapsApiKey?: string
}): string | null {
  const point = params.amenity.lngLat
  if (!point || params.amenity.category !== "town") return null
  const heading = Math.round(streetViewHeading(params.amenity, params.projectCenter))
  const location = `${point.latitude},${point.longitude}`
  const key = params.googleMapsApiKey?.trim() ?? ""
  if (key) {
    return `https://www.google.com/maps/embed/v1/streetview?key=${encodeURIComponent(key)}&location=${location}&heading=${heading}&pitch=0&fov=80`
  }
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${location}&heading=${heading}&pitch=0&fov=80`
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
  googleMapsApiKey,
  onClose
}: Props) {
  const gallery = amenity.gallery
    .map((url) => resolveMediaUrl(apiOrigin, url))
    .filter((url) => url.length > 0)
  const [activeIndex, setActiveIndex] = useState(0)
  const directions = directionsUrl(amenity, projectCenter)
  const streetView = streetViewUrl({ amenity, projectCenter, googleMapsApiKey })
  const streetViewEmbedded = Boolean(googleMapsApiKey?.trim()) && Boolean(streetView)
  const category = amenity.categoryLabel || amenity.categoryKey
  const hero = gallery[activeIndex] ?? gallery[0]
  const hasSeveral = gallery.length > 1
  const showPhoto = (delta: number) => {
    setActiveIndex((current) => (current + delta + gallery.length) % gallery.length)
  }
  useEffect(() => {
    setActiveIndex(0)
  }, [amenity.id])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])
  return (
    <article
      style={sheetStyle}
      onKeyDown={(event) => {
        if (!hasSeveral) return
        const target = event.target
        if (
          target instanceof HTMLInputElement ||
          target instanceof HTMLTextAreaElement ||
          (target instanceof HTMLElement && target.isContentEditable)
        ) {
          return
        }
        if (event.key === "ArrowLeft") {
          event.preventDefault()
          showPhoto(-1)
        }
        if (event.key === "ArrowRight") {
          event.preventDefault()
          showPhoto(1)
        }
      }}
    >
      <button
        type="button"
        aria-label="Close amenity"
        autoFocus
        onClick={onClose}
        onFocus={showFocusRing}
        onBlur={hideFocusRing}
        style={closeStyle}
      >
        <CloseIcon />
      </button>
      {hero && (
        <div style={heroFrameStyle}>
          <img src={hero} alt="" style={heroStyle} />
          {hasSeveral && (
            <>
              <button
                type="button"
                aria-label="Previous photo"
                onClick={() => showPhoto(-1)}
                onFocus={showFocusRing}
                onBlur={hideFocusRing}
                style={{ ...arrowStyle, left: 8 }}
              >
                <ArrowIcon direction="left" />
              </button>
              <button
                type="button"
                aria-label="Next photo"
                onClick={() => showPhoto(1)}
                onFocus={showFocusRing}
                onBlur={hideFocusRing}
                style={{ ...arrowStyle, right: 8 }}
              >
                <ArrowIcon direction="right" />
              </button>
              <div style={dotsStyle}>
                {gallery.map((url, index) => (
                  <button
                    key={`${url}-${index}`}
                    type="button"
                    aria-label={`Photo ${index + 1}`}
                    aria-pressed={index === activeIndex}
                    onClick={() => setActiveIndex(index)}
                    onFocus={showFocusRing}
                    onBlur={hideFocusRing}
                    style={dotHitStyle}
                  >
                    <span aria-hidden style={dotMarkStyle(index === activeIndex)} />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
      <div style={copyStyle}>
        {category && <p style={categoryStyle}>{category}</p>}
        <h2 style={titleStyle}>{amenity.name}</h2>
        {streetView && streetViewEmbedded && (
          <iframe
            title="Street View"
            src={streetView}
            style={streetViewFrameStyle}
            loading="lazy"
            referrerPolicy="no-referrer-when-downgrade"
            allowFullScreen
          />
        )}
        {streetView && !streetViewEmbedded && (
          <a href={streetView} target="_blank" rel="noreferrer" style={directionsStyle}>
            Street View
          </a>
        )}
        {amenity.subtitle && <p style={subtitleStyle}>{amenity.subtitle}</p>}
        {(amenity.distanceMeters != null || amenity.estimatedTravelMinutes != null) && (
          <p style={metaStyle}>
            {amenity.distanceMeters != null
              ? `${Math.round(amenity.distanceMeters)} m from the project`
              : ""}
            {amenity.distanceMeters != null && amenity.estimatedTravelMinutes != null
              ? " · "
              : ""}
            {amenity.estimatedTravelMinutes != null
              ? `${amenity.estimatedTravelMinutes} min`
              : ""}
          </p>
        )}
        {amenity.description && <p style={bodyStyle}>{amenity.description}</p>}
        {directions && (
          <a href={directions} target="_blank" rel="noreferrer" style={directionsStyle}>
            Directions from the project
          </a>
        )}
      </div>
    </article>
  )
}

function showFocusRing(event: React.FocusEvent<HTMLButtonElement>): void {
  event.currentTarget.style.boxShadow = "0 0 0 2px #f8fafc"
}

function hideFocusRing(event: React.FocusEvent<HTMLButtonElement>): void {
  event.currentTarget.style.boxShadow = "none"
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" stroke="#f8fafc" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function ArrowIcon({ direction }: { direction: "left" | "right" }) {
  const path = direction === "left" ? "M14 6L8 12l6 6" : "M10 6l6 6-6 6"
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d={path} stroke="#f8fafc" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

const sheetStyle: React.CSSProperties = {
  position: "relative",
  height: "100%",
  overflow: "auto",
  color: "#f8fafc",
  background:
    "linear-gradient(165deg, rgba(14,14,16,0.78) 0%, rgba(14,14,16,0.58) 100%)",
  backdropFilter: "blur(8px)",
  WebkitBackdropFilter: "blur(8px)"
}

const closeStyle: React.CSSProperties = {
  position: "absolute",
  top: 12,
  right: 12,
  zIndex: 1,
  width: 44,
  height: 44,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.2)",
  background: "rgba(12,12,14,0.55)",
  cursor: "pointer"
}

const heroFrameStyle: React.CSSProperties = {
  position: "relative"
}

const heroStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  height: 220,
  objectFit: "cover"
}

const arrowStyle: React.CSSProperties = {
  position: "absolute",
  top: "50%",
  transform: "translateY(-50%)",
  width: 44,
  height: 44,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.2)",
  background: "rgba(12,12,14,0.55)",
  cursor: "pointer"
}

const dotsStyle: React.CSSProperties = {
  position: "absolute",
  left: 0,
  right: 0,
  bottom: 10,
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  gap: 6
}

const dotHitStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  padding: 0,
  border: 0,
  borderRadius: 999,
  background: "transparent",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer"
}

function dotMarkStyle(active: boolean): React.CSSProperties {
  return {
    width: active ? 18 : 8,
    height: 8,
    borderRadius: 999,
    background: active ? RUST : "rgba(255,255,255,0.72)"
  }
}

const copyStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 8,
  padding: "16px 18px 20px"
}

const categoryStyle: React.CSSProperties = {
  margin: 0,
  color: "#F0C2A8",
  letterSpacing: "0.08em",
  fontSize: 12,
  fontWeight: 700,
  textTransform: "uppercase"
}

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 28,
  lineHeight: 1.15,
  fontWeight: 650
}

const subtitleStyle: React.CSSProperties = {
  margin: 0,
  color: "#e7e5e4",
  fontSize: 16,
  lineHeight: 1.35
}

const metaStyle: React.CSSProperties = {
  margin: 0,
  color: "#d6d3d1",
  fontSize: 13
}

const bodyStyle: React.CSSProperties = {
  margin: "4px 0 0",
  lineHeight: 1.55,
  whiteSpace: "pre-wrap",
  color: "#f5f5f4"
}

const streetViewFrameStyle: React.CSSProperties = {
  width: "100%",
  height: 220,
  border: 0,
  borderRadius: 12,
  background: "#111"
}

const directionsStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: 44,
  marginTop: 8,
  padding: "0 16px",
  borderRadius: 10,
  background: RUST,
  color: "#fff",
  fontWeight: 650,
  textDecoration: "none"
}
