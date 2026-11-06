import React, { useEffect, useState } from "react"
import { formatMinutesAria, type MapOptionLabels } from "./map-option-labels"

export type TravelProfile = "walking" | "cycling" | "driving"
export type TravelMinutes = 10 | 20 | 30

type Props = {
  labels: MapOptionLabels
  projectCenter: { longitude: number; latitude: number } | null
  pitchOn: boolean
  satelliteOn: boolean
  travelOn: boolean
  profile: TravelProfile
  minutes: TravelMinutes
  travelError: string | null
  onRecenter: () => void
  onPitchChange: (on: boolean) => void
  onSatelliteChange: (on: boolean) => void
  onTravelChange: (on: boolean) => void
  onProfileChange: (profile: TravelProfile) => void
  onMinutesChange: (minutes: TravelMinutes) => void
}

const COPPER = "#E07A3D"
const INK = "#121417"

export function MapOptions({
  labels,
  projectCenter,
  pitchOn,
  satelliteOn,
  travelOn,
  profile,
  minutes,
  travelError,
  onRecenter,
  onPitchChange,
  onSatelliteChange,
  onTravelChange,
  onProfileChange,
  onMinutesChange
}: Props) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false)
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open])
  return (
    <div style={clusterStyle}>
      {projectCenter && (
        <button type="button" aria-label={labels.recenter} onClick={onRecenter} style={iconButtonStyle}>
          <CrosshairIcon />
        </button>
      )}
      <button
        type="button"
        aria-expanded={open}
        aria-controls="experience-map-options"
        onClick={() => setOpen((value) => !value)}
        style={optionsButtonStyle(open)}
      >
        <MapFoldIcon />
        {labels.mapOptions}
      </button>
      {open && (
        <div id="experience-map-options" role="dialog" aria-label={labels.mapOptions} style={panelStyle}>
          <button type="button" aria-label={labels.close} onClick={() => setOpen(false)} style={closeStyle}>
            <CloseIcon />
          </button>
          <div style={panelScrollStyle}>
          <ToggleRow label={labels.view3d} checked={pitchOn} onChange={onPitchChange} />
          <ToggleRow label={labels.satellite} checked={satelliteOn} onChange={onSatelliteChange} />
          <div style={ruleStyle} />
          <ToggleRow
            label={labels.travelTimes}
            checked={travelOn}
            disabled={!projectCenter}
            onChange={onTravelChange}
          />
          <div style={groupStyle(travelOn && Boolean(projectCenter))} aria-disabled={!travelOn || !projectCenter}>
            <div style={segmentRowStyle}>
              <SegmentButton
                label={labels.walking}
                active={profile === "walking"}
                disabled={!travelOn}
                onClick={() => onProfileChange("walking")}
              >
                <WalkIcon />
                <span>{labels.walking}</span>
              </SegmentButton>
              <SegmentButton
                label={labels.cycling}
                active={profile === "cycling"}
                disabled={!travelOn}
                onClick={() => onProfileChange("cycling")}
              >
                <BikeIcon />
                <span>{labels.cycling}</span>
              </SegmentButton>
              <SegmentButton
                label={labels.driving}
                active={profile === "driving"}
                disabled={!travelOn}
                onClick={() => onProfileChange("driving")}
              >
                <CarIcon />
                <span>{labels.driving}</span>
              </SegmentButton>
            </div>
            <div style={segmentRowStyle}>
              {([10, 20, 30] as const).map((value) => (
                <SegmentButton
                  key={value}
                  label={formatMinutesAria(labels.minutesAria, value)}
                  active={minutes === value}
                  disabled={!travelOn}
                  onClick={() => onMinutesChange(value)}
                >
                  {value} {labels.minutesSuffix}
                </SegmentButton>
              ))}
            </div>
          </div>
          {travelError && (
            <p role="alert" style={alertStyle}>
              {travelError}
            </p>
          )}
          </div>
        </div>
      )}
    </div>
  )
}

function ToggleRow({
  label,
  checked,
  disabled = false,
  onChange
}: {
  label: string
  checked: boolean
  disabled?: boolean
  onChange: (on: boolean) => void
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      style={toggleRowStyle(disabled)}
    >
      <span style={trackStyle(checked, disabled)} aria-hidden>
        <span style={knobStyle(checked)} />
      </span>
      <span style={toggleLabelStyle(checked)}>{label}</span>
    </button>
  )
}

function SegmentButton({
  label,
  active,
  disabled,
  onClick,
  children
}: {
  label: string
  active: boolean
  disabled: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      style={segmentStyle(active)}
    >
      {children}
    </button>
  )
}

function CrosshairIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="4" stroke="#fff" strokeWidth="1.8" />
      <path d="M12 2v4M12 18v4M2 12h4M18 12h4" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function MapFoldIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M8 4l-5 2v14l5-2 8 2 5-2V4l-5 2-8-2z" stroke={COPPER} strokeWidth="1.7" />
      <path d="M8 4v14M16 6v14" stroke={COPPER} strokeWidth="1.7" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M6 6l12 12M18 6L6 18" stroke="#d6d3d1" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  )
}

function WalkIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="13" cy="4.5" r="1.6" fill={COPPER} />
      <path d="M10 21l2-6 2 2 3 4M12 15l-2-3 3-2 3 2" stroke={COPPER} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function BikeIcon() {
  return (
    <svg width="20" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="6" cy="16" r="3" stroke={COPPER} strokeWidth="1.6" />
      <circle cx="18" cy="16" r="3" stroke={COPPER} strokeWidth="1.6" />
      <path d="M6 16l4-7h4l4 7M10 9l3 7" stroke={COPPER} strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  )
}

function CarIcon() {
  return (
    <svg width="20" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path d="M4 14l2-5h12l2 5" stroke={COPPER} strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M5 14h14v4H5z" stroke={COPPER} strokeWidth="1.6" />
      <circle cx="8" cy="18" r="1.2" fill={COPPER} />
      <circle cx="16" cy="18" r="1.2" fill={COPPER} />
    </svg>
  )
}

const clusterStyle: React.CSSProperties = {
  position: "absolute",
  top: 16,
  right: 16,
  zIndex: 3,
  display: "flex",
  alignItems: "flex-start",
  gap: 8
}

const iconButtonStyle: React.CSSProperties = {
  width: 42,
  height: 42,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: 10,
  border: "1px solid rgba(255,255,255,0.16)",
  background: INK,
  cursor: "pointer"
}

function optionsButtonStyle(open: boolean): React.CSSProperties {
  return {
    height: 42,
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "0 14px",
    borderRadius: 10,
    border: "1px solid rgba(255,255,255,0.16)",
    background: INK,
    color: COPPER,
    fontSize: 15,
    fontWeight: 600,
    letterSpacing: "0.01em",
    cursor: "pointer",
    boxShadow: open ? "0 0 0 1px rgba(224,122,61,0.45)" : "none",
    transition: "box-shadow 200ms ease"
  }
}

const panelStyle: React.CSSProperties = {
  position: "absolute",
  top: 50,
  right: 0,
  width: "min(280px, calc(100vw - 32px))",
  maxHeight: "calc(100vh - 90px)",
  display: "flex",
  flexDirection: "column",
  padding: "36px 0 8px",
  borderRadius: 12,
  background: "#1c1c1f",
  color: COPPER,
  boxShadow: "0 16px 40px rgba(0,0,0,0.35)",
  border: "1px solid rgba(255,255,255,0.08)"
}

const panelScrollStyle: React.CSSProperties = {
  overflowY: "auto",
  padding: "0 16px 8px"
}

const closeStyle: React.CSSProperties = {
  position: "absolute",
  top: 8,
  right: 8,
  width: 28,
  height: 28,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: 0,
  background: "transparent",
  cursor: "pointer"
}

function toggleRowStyle(disabled: boolean): React.CSSProperties {
  return {
    width: "100%",
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "8px 4px",
    border: 0,
    background: "transparent",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.45 : 1
  }
}

function trackStyle(checked: boolean, disabled: boolean): React.CSSProperties {
  return {
    width: 42,
    height: 24,
    borderRadius: 999,
    background: checked && !disabled ? COPPER : "#3f3f46",
    position: "relative",
    flexShrink: 0,
    transition: "background 200ms ease"
  }
}

function knobStyle(checked: boolean): React.CSSProperties {
  return {
    position: "absolute",
    top: 3,
    left: checked ? 21 : 3,
    width: 18,
    height: 18,
    borderRadius: 999,
    background: "#f5f5f4",
    transition: "left 200ms ease"
  }
}

function toggleLabelStyle(checked: boolean): React.CSSProperties {
  return {
    color: checked ? COPPER : "#d6d3d1",
    fontSize: 18,
    fontWeight: 600
  }
}

const ruleStyle: React.CSSProperties = {
  height: 1,
  margin: "8px 4px",
  background: "rgba(255,255,255,0.12)"
}

function groupStyle(enabled: boolean): React.CSSProperties {
  return {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginTop: 8,
    opacity: enabled ? 1 : 0.4,
    pointerEvents: enabled ? "auto" : "none"
  }
}

const segmentRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr 1fr",
  gap: 8
}

function segmentStyle(active: boolean): React.CSSProperties {
  return {
    minHeight: 40,
    display: "inline-flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    padding: "6px 4px",
    borderRadius: 8,
    border: `1px solid ${active ? COPPER : "rgba(224,122,61,0.35)"}`,
    background: active ? "rgba(224,122,61,0.16)" : "transparent",
    color: COPPER,
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    transition: "background 200ms ease, border-color 200ms ease"
  }
}

const alertStyle: React.CSSProperties = {
  margin: "10px 4px 0",
  color: "#fecaca",
  fontSize: 13
}
