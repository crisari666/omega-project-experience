import React, { useEffect, useRef } from "react"
import * as THREE from "three"
const EARTH_RADIUS_M = 6378137
const DEFAULT_CAMERA_HEIGHT_M = 1.7
const SPHERE_RADIUS = 50
const DEGREES = Math.PI / 180

const LOT_COLORS: Record<string, string> = {
  available: "#15803d",
  sold: "#E11D48",
  reserved: "#b45309"
}

type Props = {
  imageUrl: string
  longitude: number
  latitude: number
  altitude: number | null
  headingDegrees: number
  lots: GeoJSON.FeatureCollection | null
  availableLotColor?: string
  onClose: () => void
}

export function PanoramaViewer({
  imageUrl,
  longitude,
  latitude,
  altitude,
  headingDegrees,
  lots,
  availableLotColor = "#15803d",
  onClose
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])
  useEffect(() => {
    const canvas = canvasRef.current
    const root = rootRef.current
    if (!canvas || !root) return
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 1000)
    camera.position.set(0, 0, 0)
    const geometry = new THREE.SphereGeometry(SPHERE_RADIUS, 64, 40)
    geometry.scale(-1, 1, 1)
    const texture = new THREE.TextureLoader().load(imageUrl)
    texture.colorSpace = THREE.SRGBColorSpace
    const sphere = new THREE.Mesh(
      geometry,
      new THREE.MeshBasicMaterial({ map: texture })
    )
    scene.add(sphere)
    const lotLines = buildLotLines({
      lots,
      originLongitude: longitude,
      originLatitude: latitude,
      cameraHeight: altitude ?? DEFAULT_CAMERA_HEIGHT_M,
      headingDegrees,
      availableLotColor
    })
    scene.add(lotLines)
    let yaw = 0
    let pitch = 0
    const look = new THREE.Vector3()
    const aim = () => {
      const cosPitch = Math.cos(pitch)
      look.set(Math.sin(yaw) * cosPitch, Math.sin(pitch), -Math.cos(yaw) * cosPitch)
      camera.lookAt(look)
    }
    aim()
    const resize = () => {
      const width = root.clientWidth
      const height = root.clientHeight
      renderer.setSize(width, height, false)
      camera.aspect = width / Math.max(height, 1)
      camera.updateProjectionMatrix()
    }
    resize()
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(root)
    let dragging = false
    let lastX = 0
    let lastY = 0
    const onPointerDown = (event: PointerEvent) => {
      dragging = true
      lastX = event.clientX
      lastY = event.clientY
      canvas.setPointerCapture(event.pointerId)
    }
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging) return
      yaw -= (event.clientX - lastX) * 0.005
      pitch = Math.max(
        -85 * DEGREES,
        Math.min(85 * DEGREES, pitch - (event.clientY - lastY) * 0.005)
      )
      lastX = event.clientX
      lastY = event.clientY
      aim()
    }
    const onPointerUp = (event: PointerEvent) => {
      dragging = false
      canvas.releasePointerCapture(event.pointerId)
    }
    canvas.addEventListener("pointerdown", onPointerDown)
    canvas.addEventListener("pointermove", onPointerMove)
    canvas.addEventListener("pointerup", onPointerUp)
    let frame = 0
    const tick = () => {
      renderer.render(scene, camera)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    if (!reduced) {
      root.style.opacity = "0"
      requestAnimationFrame(() => {
        root.style.opacity = "1"
      })
    }
    return () => {
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      canvas.removeEventListener("pointerdown", onPointerDown)
      canvas.removeEventListener("pointermove", onPointerMove)
      canvas.removeEventListener("pointerup", onPointerUp)
      geometry.dispose()
      texture.dispose()
      sphere.material.dispose()
      lotLines.traverse((node) => {
        const mesh = node as THREE.Line
        mesh.geometry?.dispose()
        const material = mesh.material
        if (Array.isArray(material)) material.forEach((item) => item.dispose())
        else material?.dispose()
      })
      renderer.dispose()
    }
  }, [altitude, availableLotColor, headingDegrees, imageUrl, latitude, longitude, lots])
  return (
    <div ref={rootRef} style={shellStyle}>
      <canvas ref={canvasRef} style={canvasStyle} />
      <button
        type="button"
        aria-label="Close 360 photo"
        autoFocus
        onClick={onClose}
        style={closeStyle}
      >
        Close
      </button>
    </div>
  )
}

function buildLotLines(input: {
  lots: GeoJSON.FeatureCollection | null
  originLongitude: number
  originLatitude: number
  cameraHeight: number
  headingDegrees: number
  availableLotColor: string
}): THREE.Group {
  const group = new THREE.Group()
  const features = input.lots?.features ?? []
  for (const feature of features) {
    const ring = exteriorRing(feature)
    if (ring.length < 2) continue
    const points = ring.map((pair) =>
      projectLotPoint({
        longitude: pair[0],
        latitude: pair[1],
        originLongitude: input.originLongitude,
        originLatitude: input.originLatitude,
        cameraHeight: input.cameraHeight,
        headingDegrees: input.headingDegrees
      })
    )
    const geometry = new THREE.BufferGeometry().setFromPoints(points)
    const status = String(feature.properties?.status ?? "")
    const material = new THREE.LineBasicMaterial({
      color:
        status === "available"
          ? input.availableLotColor
          : LOT_COLORS[status] ?? "#f8fafc"
    })
    group.add(new THREE.LineLoop(geometry, material))
  }
  return group
}

function exteriorRing(feature: GeoJSON.Feature): number[][] {
  const geometry = feature.geometry
  if (!geometry) return []
  if (geometry.type === "Polygon") {
    return (geometry.coordinates[0] as number[][]) ?? []
  }
  if (geometry.type === "MultiPolygon") {
    return (geometry.coordinates[0]?.[0] as number[][]) ?? []
  }
  return []
}

function projectLotPoint(input: {
  longitude: number
  latitude: number
  originLongitude: number
  originLatitude: number
  cameraHeight: number
  headingDegrees: number
}): THREE.Vector3 {
  const north =
    (input.latitude - input.originLatitude) * DEGREES * EARTH_RADIUS_M
  const east =
    (input.longitude - input.originLongitude) *
    DEGREES *
    EARTH_RADIUS_M *
    Math.cos(input.originLatitude * DEGREES)
  const horizontal = Math.hypot(east, north)
  const bearing = Math.atan2(east, north) - input.headingDegrees * DEGREES
  const elevation = Math.atan2(-input.cameraHeight, horizontal)
  const cosElevation = Math.cos(elevation)
  return new THREE.Vector3(
    Math.sin(bearing) * cosElevation,
    Math.sin(elevation),
    -Math.cos(bearing) * cosElevation
  ).multiplyScalar(SPHERE_RADIUS * 0.98)
}

const shellStyle: React.CSSProperties = {
  position: "absolute",
  inset: 0,
  zIndex: 8,
  background: "#0a0a0a",
  transition: "opacity 200ms ease"
}

const canvasStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  display: "block",
  cursor: "grab",
  touchAction: "none"
}

const closeStyle: React.CSSProperties = {
  position: "absolute",
  top: 16,
  right: 16,
  minHeight: 44,
  padding: "0 14px",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.24)",
  background: "rgba(12,12,14,0.72)",
  color: "#f8fafc",
  cursor: "pointer"
}
