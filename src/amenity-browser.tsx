import React, { useMemo } from "react"
import { categoryMarkerColor } from "./amenity-marker-color"
import { resolveMediaUrl } from "./load-published"
import type { AmenityCategory, PublicAmenity } from "./types"

type Props = {
  categories: readonly AmenityCategory[]
  locations: readonly PublicAmenity[]
  apiOrigin: string
  openKey: string | null
  onOpenChange: (key: string | null) => void
  selectedId: string | null
  hoveredId: string | null
  onHover: (id: string) => void
  onLeave: () => void
  onSelect: (amenity: PublicAmenity) => void
}

const RUST = "#C4532A"

export function AmenityBrowser({
  categories,
  locations,
  apiOrigin,
  openKey,
  onOpenChange,
  selectedId,
  hoveredId,
  onHover,
  onLeave,
  onSelect
}: Props) {
  const chips = useMemo(() => buildChips(categories, locations), [categories, locations])
  const openLocations = locations.filter(
    (location) => (location.categoryKey || "other") === openKey
  )
  return (
    <aside style={panelStyle}>
      <div style={gridStyle}>
        {chips.map((chip) => {
          const open = chip.key === openKey
          return (
            <button
              key={chip.key}
              type="button"
              aria-expanded={open}
              aria-label={chip.label}
              onClick={() => onOpenChange(open ? null : chip.key)}
              onFocus={(event) => {
                event.currentTarget.style.boxShadow = "0 0 0 2px #f8fafc"
              }}
              onBlur={(event) => {
                event.currentTarget.style.boxShadow = "none"
              }}
              style={chipStyle(open)}
            >
              <span
                aria-hidden
                style={{ ...swatchStyle, background: categoryMarkerColor(categories, chip.key) }}
              />
              <span style={chipLabelStyle}>{chip.label}</span>
            </button>
          )
        })}
      </div>
      {openKey && (
        <div style={amenityListStyle} onMouseLeave={onLeave}>
          {openLocations.map((amenity) => {
            const imageUrl = coverUrl(apiOrigin, amenity)
            const line = amenity.panoramaAssetId
              ? amenity.description
              : amenity.subtitle || amenity.categoryLabel || amenity.categoryKey
            const selected = selectedId === amenity.id
            const hovered = hoveredId === amenity.id
            return (
              <button
                key={amenity.id}
                type="button"
                onMouseEnter={() => onHover(amenity.id)}
                onClick={() => onSelect(amenity)}
                style={amenityRowStyle(selected, hovered)}
              >
                {imageUrl ? (
                  <img src={imageUrl} alt="" style={thumbStyle} />
                ) : (
                  <span style={thumbStyle} />
                )}
                <span style={copyStyle}>
                  <strong style={titleStyle}>{amenity.name}</strong>
                  {line && <span style={subtitleStyle(selected)}>{line}</span>}
                </span>
              </button>
            )
          })}
        </div>
      )}
    </aside>
  )
}

function buildChips(
  categories: readonly AmenityCategory[],
  locations: readonly PublicAmenity[]
): { key: string; label: string }[] {
  const counts = new Map<string, number>()
  for (const location of locations) {
    const key = location.categoryKey || "other"
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  const catalog = [...categories]
    .sort((left, right) => left.sortOrder - right.sortOrder)
    .filter((row) => (counts.get(row.key) ?? 0) > 0)
    .map((row) => ({ key: row.key, label: row.label }))
  const known = new Set(catalog.map((row) => row.key))
  const orphans = [...counts.keys()]
    .filter((key) => !known.has(key))
    .map((key) => {
      const sample = locations.find((row) => (row.categoryKey || "other") === key)
      return { key, label: sample?.categoryLabel || key }
    })
  return [...catalog, ...orphans]
}

function coverUrl(apiOrigin: string, amenity: PublicAmenity): string | null {
  const raw = amenity.media.cover ?? amenity.media.gallery[0] ?? null
  const url = resolveMediaUrl(apiOrigin, raw)
  return url || null
}

const panelStyle: React.CSSProperties = {
  position: "absolute",
  top: 16,
  left: 16,
  width: "min(360px, calc(100vw - 32px))",
  maxHeight: "calc(100% - 88px)",
  overflow: "auto",
  zIndex: 2,
  display: "flex",
  flexDirection: "column",
  gap: 4
}

const gridStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 4,
  maxWidth: 220
}

function chipStyle(open: boolean): React.CSSProperties {
  return {
    minHeight: 28,
    maxWidth: "100%",
    width: "fit-content",
    display: "flex",
    alignItems: "center",
    gap: 4,
    padding: "3px 7px",
    borderRadius: 8,
    border: "1px solid rgba(255,255,255,0.08)",
    background: open ? RUST : "#161616",
    color: "#f8fafc",
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    textAlign: "left",
    cursor: "pointer"
  }
}

const swatchStyle: React.CSSProperties = {
  width: 8,
  height: 8,
  borderRadius: "50%",
  flexShrink: 0
}

const chipLabelStyle: React.CSSProperties = {
  minWidth: 0,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap"
}

const amenityListStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  borderRadius: 14,
  overflow: "hidden",
  background: "#111111",
  border: "1px solid rgba(255,255,255,0.08)"
}

function amenityRowStyle(selected: boolean, hovered: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 6,
    width: "100%",
    padding: "12px 14px",
    border: 0,
    borderBottom: "1px solid rgba(255,255,255,0.06)",
    background: selected ? RUST : hovered ? "rgba(196,83,42,0.35)" : "#161616",
    color: "#f8fafc",
    textAlign: "left",
    cursor: "pointer"
  }
}

const thumbStyle: React.CSSProperties = {
  width: 28,
  height: 28,
  borderRadius: "50%",
  objectFit: "cover",
  flexShrink: 0,
  background: "#2a2a2a"
}

const copyStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  minWidth: 0
}

const titleStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 500,
  lineHeight: 1.25
}

function subtitleStyle(selected: boolean): React.CSSProperties {
  return {
    fontSize: 11,
    color: selected ? "rgba(255,255,255,0.86)" : "#d6d3d1",
    lineHeight: 1.3
  }
}
