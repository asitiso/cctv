import { demo, staffKey, staffName } from './data.ts'
import type { DataSource, Person } from './data.ts'

export type AppearancePreferences = Readonly<Record<string, string>>
export type AppearanceOption = Pick<Person, 'sprite' | 'restArt' | 'color'> & { label: string }
type Scope = DataSource['source']

const storageKey = 'pharmacy-cctv:appearance:v1'
const namesKey = 'pharmacy-cctv:staff-names:v1'
export const displayNameLimit = 24
const descriptions: Record<string, string> = {
  'staff-1': '민트 블라우스 가운',
  'staff-2': '안경과 갈색 조끼',
  'staff-3': '노랑 앞치마',
  'staff-4': '분홍 카디건',
  'staff-5': '데님 멜빵',
  'staff-6': '연보라 니트',
  'staff-7': '라일락 블라우스 가운',
  'staff-8': '파란 셔츠 가운',
  'staff-9': '세이지 앞치마',
  'staff-10': '청록 카디건',
  'staff-11': '살구 머리띠와 조끼',
  'staff-12': '올리브 후드',
  'staff-13': '금테 안경과 앞치마',
  'staff-14': '버터색 카디건',
  'staff-15': '푸른색 랩 셔츠',
  'staff-16': '자주색 앞치마',
}

export const appearanceOptions: readonly AppearanceOption[] = [
  { sprite: 'staff-17', color: '#7498a3', label: '여성 약사 · 금테 안경' },
  { sprite: 'staff-18', color: '#bc8c78', label: '여성 약사 · 살구색 블라우스' },
  { sprite: 'staff-19', color: '#7f9876', label: '여성 약사 · 올림머리' },
  ...demo.people.map(({ sprite, restArt, color, name }) => ({ sprite, restArt, color, label: descriptions[sprite] ?? name })),
]

export const appearanceAssets = appearanceOptions.flatMap(option => [option.sprite, ...Object.values(option.restArt ?? {})])
const bySprite = new Map(appearanceOptions.map(option => [option.sprite, option]))

export function applyAppearances(people: readonly Person[], scope: Scope, preferences: AppearancePreferences): Person[] {
  const assigned = new Map<string, AppearanceOption>()
  const used = new Set<string>()

  function reserve(person: Person, sprite: string | undefined) {
    const option = sprite ? bySprite.get(sprite) : undefined
    if (option && !used.has(option.sprite)) {
      assigned.set(person.id, option)
      used.add(option.sprite)
    }
  }

  // Reserve saved choices before allocating everyone else's default.
  for (const person of people) reserve(person, preferences[staffKey(person, scope)])
  for (const person of people) {
    if (!assigned.has(person.id)) reserve(person, person.sprite)
  }
  for (const person of people) {
    if (!assigned.has(person.id)) {
      reserve(person, appearanceOptions.find(option => !used.has(option.sprite))?.sprite)
    }
  }

  return people.map(person => {
    const option = assigned.get(person.id)
    return option ? { ...person, sprite: option.sprite, restArt: option.restArt } : person
  })
}

export function chooseAppearance(preferences: AppearancePreferences, scope: Scope, current: readonly Person[],
  personId: string, sprite: string): AppearancePreferences {
  const chosen = current.find(person => person.id === personId)
  if (!chosen || chosen.sprite === sprite || !bySprite.has(sprite)) return preferences
  const occupied = current.find(person => person.sprite === sprite)
  const next = { ...preferences, [staffKey(chosen, scope)]: sprite }
  if (occupied) next[staffKey(occupied, scope)] = chosen.sprite
  return next
}

export function readAppearances(): AppearancePreferences {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? 'null')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return Object.fromEntries(Object.entries(value).filter(([key, sprite]) =>
      (key.startsWith('demo:') || key.startsWith('roster:')) && typeof sprite === 'string' && bySprite.has(sprite)))
  } catch {
    return {}
  }
}

export function saveAppearances(preferences: AppearancePreferences) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(preferences))
  } catch {
    // Choices remain usable for this session when browser storage is disabled.
  }
}

export function cleanDisplayName(value: string) {
  return value.replace(/[\s]+/g, ' ').trim()
}

export function isValidDisplayName(name: string) {
  return name.length > 0 && name.length <= displayNameLimit && !/[\x00-\x1f\x7f]/u.test(name)
}

export function applyDisplayNames(people: readonly Person[], scope: Scope, names: AppearancePreferences): Person[] {
  return people.map(person => ({ ...person, displayName: names[staffKey(person, scope)] }))
}

export function chooseDisplayName(names: AppearancePreferences, scope: Scope, people: readonly Person[],
  id: string, input: string): AppearancePreferences {
  const person = people.find(item => item.id === id)
  if (!person) return names
  const name = cleanDisplayName(input)
  const key = staffKey(person, scope)
  if (!name || name === person.name) {
    if (!(key in names)) return names
    const next = { ...names }
    delete next[key]
    return next
  }
  if (!isValidDisplayName(name)) throw new Error('표시 이름은 24글자 이내로 입력하세요.')
  const used = applyDisplayNames(people, scope, names)
    .some(item => item.id !== id && (staffName(item) === name || item.name === name))
  if (used) throw new Error('다른 직원이 쓰는 이름입니다.')
  return names[key] === name ? names : { ...names, [key]: name }
}

export function readDisplayNames(): AppearancePreferences {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(namesKey) ?? 'null')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
    return Object.fromEntries(Object.entries(value).flatMap(([key, input]) => {
      if (typeof input !== 'string' || !(key.startsWith('demo:') || key.startsWith('roster:'))) return []
      const name = cleanDisplayName(input)
      return isValidDisplayName(name) ? [[key, name]] : []
    }))
  } catch {
    return {}
  }
}

export function saveDisplayNames(names: AppearancePreferences) {
  try {
    localStorage.setItem(namesKey, JSON.stringify(names))
  } catch {
    // The board can still display newly entered names for this session.
  }
}
