export type CameraMotionTarget = {
  longitude: number
  latitude: number
  zoom: number
  pitch: number
  bearing: number
}

export type TourTurn = 1 | -1

type MotionMap = {
  getCenter: () => { lng: number; lat: number }
  getZoom: () => number
  getPitch: () => number
  getBearing: () => number
  jumpTo: (options: {
    center: [number, number]
    zoom: number
    pitch: number
    bearing: number
  }) => void
}

export type CameraMotionParams = {
  map: MotionMap
  camera: CameraMotionTarget
  durationMs: number
  /** Playlist bearings in play order. The first hop sets the turn direction. */
  bearings: readonly number[]
  /** Overrides the playlist turn. Previous skips pass the opposite turn. */
  turn?: TourTurn
  signal: AbortSignal
}

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches
}

function shortestDelta(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180
}

/** Clockwise when the first scene hop increases bearing, otherwise counter-clockwise. */
export function tourTurnFromBearings(bearings: readonly number[]): TourTurn {
  if (bearings.length < 2) return 1
  const delta = shortestDelta(bearings[0], bearings[1])
  if (delta === 0) return 1
  return delta > 0 ? 1 : -1
}

/** Target bearing that keeps turning the same way, including the wrap back to the first scene. */
export function bearingAlongTurn(
  from: number,
  to: number,
  turn: TourTurn
): number {
  const wrapped = ((to - from) % 360 + 360) % 360
  if (wrapped === 0) return from
  if (turn >= 0) return from + wrapped
  return from - (360 - wrapped)
}

function lerp(from: number, to: number, progress: number): number {
  return from + (to - from) * progress
}

/**
 * Moves the live camera to a saved scene.
 * Bearing follows the tour direction, so the last scene continues into the first
 * instead of taking Mapbox's shortest turn back.
 */
export function playCameraMotion(params: CameraMotionParams): Promise<void> {
  const turn = params.turn ?? tourTurnFromBearings(params.bearings)
  const fromCenter = params.map.getCenter()
  const fromZoom = params.map.getZoom()
  const fromPitch = params.map.getPitch()
  const fromBearing = params.map.getBearing()
  const toBearing = bearingAlongTurn(fromBearing, params.camera.bearing, turn)
  const duration = Math.max(0, params.durationMs)
  if (duration === 0 || prefersReducedMotion()) {
    params.map.jumpTo({
      center: [params.camera.longitude, params.camera.latitude],
      zoom: params.camera.zoom,
      pitch: params.camera.pitch,
      bearing: params.camera.bearing
    })
    return Promise.resolve()
  }
  const startedAt = performance.now()
  return new Promise((resolve) => {
    const step = (now: number) => {
      if (params.signal.aborted) {
        resolve()
        return
      }
      const progress = Math.min(1, (now - startedAt) / duration)
      params.map.jumpTo({
        center: [
          lerp(fromCenter.lng, params.camera.longitude, progress),
          lerp(fromCenter.lat, params.camera.latitude, progress)
        ],
        zoom: lerp(fromZoom, params.camera.zoom, progress),
        pitch: lerp(fromPitch, params.camera.pitch, progress),
        bearing: lerp(fromBearing, toBearing, progress)
      })
      if (progress >= 1) {
        resolve()
        return
      }
      requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  })
}
