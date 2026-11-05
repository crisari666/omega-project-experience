import React from "react"

type Props = {
  name: string
  category: string
  imageUrl: string | null
}

export function AmenityHoverCard({ name, category, imageUrl }: Props) {
  return (
    <article style={cardStyle}>
      {imageUrl && (
        <img src={imageUrl} alt="" style={imageStyle} />
      )}
      <div style={copyStyle}>
        <strong style={nameStyle}>{name}</strong>
        {category && <span style={categoryStyle}>{category}</span>}
      </div>
    </article>
  )
}

const cardStyle: React.CSSProperties = {
  width: 220,
  overflow: "hidden",
  borderRadius: 12,
  background: "#111111",
  color: "#f8fafc",
  boxShadow: "0 16px 40px rgba(0,0,0,0.4)",
  pointerEvents: "none"
}

const imageStyle: React.CSSProperties = {
  display: "block",
  width: "100%",
  height: 112,
  objectFit: "cover"
}

const copyStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 2,
  padding: "10px 12px 12px"
}

const nameStyle: React.CSSProperties = {
  fontSize: 15,
  fontWeight: 650,
  lineHeight: 1.25
}

const categoryStyle: React.CSSProperties = {
  fontSize: 13,
  color: "#d6d3d1"
}
