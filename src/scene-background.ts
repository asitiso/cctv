export const backgrounds = {
  santa: { label: '산타의 집', image: 'santa-interior' },
  pharmacy: { label: '약국', image: 'pharmacy-interior' },
} as const

export type BackgroundId = keyof typeof backgrounds
export const defaultBackground: BackgroundId = 'santa'
const storageKey = 'pharmacy-cctv:background:v1'

export function isBackgroundId(value: unknown): value is BackgroundId {
  return typeof value === 'string' && Object.hasOwn(backgrounds, value)
}

export function readBackground(): BackgroundId {
  try {
    const saved = localStorage.getItem(storageKey)
    if (isBackgroundId(saved)) return saved
  } catch {
    // The scene still opens when browser storage is unavailable.
  }
  return defaultBackground
}

export function saveBackground(background: BackgroundId) {
  try {
    localStorage.setItem(storageKey, background)
  } catch {
    // The current tab keeps the selection without browser storage.
  }
}
