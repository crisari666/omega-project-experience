export const MAP_OPTION_LOCALES = ["en", "es"] as const

export type MapOptionLocale = (typeof MAP_OPTION_LOCALES)[number]

export type MapOptionLabels = {
  readonly mapOptions: string
  readonly recenter: string
  readonly close: string
  readonly view3d: string
  readonly satellite: string
  readonly travelTimes: string
  readonly walking: string
  readonly cycling: string
  readonly driving: string
  readonly minutesSuffix: string
  readonly minutesAria: string
  readonly travelError: string
}

export const MAP_OPTION_LABELS: Record<MapOptionLocale, MapOptionLabels> = {
  en: {
    mapOptions: "Map Options",
    recenter: "Recenter on project",
    close: "Close map options",
    view3d: "3D Map View",
    satellite: "Satellite View",
    travelTimes: "Show Travel Times",
    walking: "Walk",
    cycling: "Bike",
    driving: "Drive",
    minutesSuffix: "MIN",
    minutesAria: "{count} minutes",
    travelError: "Travel times are unavailable"
  },
  es: {
    mapOptions: "Opciones del mapa",
    recenter: "Centrar en el proyecto",
    close: "Cerrar opciones del mapa",
    view3d: "Vista 3D",
    satellite: "Vista satélite",
    travelTimes: "Mostrar tiempos de viaje",
    walking: "A pie",
    cycling: "Bici",
    driving: "Auto",
    minutesSuffix: "MIN",
    minutesAria: "{count} minutos",
    travelError: "Los tiempos de viaje no están disponibles"
  }
}

/**
 * Pick the package catalog for `locale`, then apply host overrides from component init.
 */
export function resolveMapOptionLabels(
  locale: MapOptionLocale = "en",
  labels?: Partial<MapOptionLabels>
): MapOptionLabels {
  const base = MAP_OPTION_LABELS[locale] ?? MAP_OPTION_LABELS.en
  return { ...base, ...labels }
}

export function formatMinutesAria(template: string, count: number): string {
  return template.replace("{count}", String(count))
}
