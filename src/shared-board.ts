import { demo } from './data.ts'
import { koreaClock } from './schedule.ts'
import { placementZones } from './staff-placement.ts'
import type { WorkPlacement } from './staff-placement.ts'

const ids = demo.people.map(person => person.id)
const work = new Set<string>(placementZones.filter(zone => zone.activity !== 'dayoff').map(zone => zone.activity))
type Duty = 'off' | 'working'
type Work = { activity: WorkPlacement; until: number }
type Entries<T> = [string, T][]

export type SharedBoard = {
  revision: number
  date: string
  active: string[]
  staffing: string[] | null
  duties: Entries<Duty>
  work: Entries<Work>
  receipts: string[]
}

export type BoardChange = {
  id: string
  date: string
  active?: Entries<boolean>
  staffing?: string[] | null
  duties?: Entries<Duty | null>
  work?: Entries<WorkPlacement | null>
}
export type BoardEdit = Omit<BoardChange, 'id' | 'date'>
export type PublicBoard = Omit<SharedBoard, 'receipts'>

type Parsed<T> = T | undefined
const hasId = (value: unknown): value is string => typeof value === 'string' && ids.includes(value)
const dutyFrom = (value: unknown): Parsed<Duty | null> => value === 'off' || value === 'working' || value === null ? value : undefined
const workFrom = (value: unknown): Parsed<WorkPlacement | null> =>
  value === null || (typeof value === 'string' && work.has(value)) ? value as WorkPlacement | null : undefined

function entriesFrom<T>(value: unknown, parse: (item: unknown) => Parsed<T>): Parsed<Entries<T>> {
  if (!Array.isArray(value) || value.length > ids.length) return
  const result: Entries<T> = []
  for (const item of value) {
    if (!Array.isArray(item) || item.length !== 2 || !hasId(item[0])) return
    const typed = parse(item[1])
    if (typed === undefined || result.some(([id]) => id === item[0])) return
    result.push([item[0], typed])
  }
  return result
}

export function parseBoardChange(value: unknown): BoardChange | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const { id, date, active, duties, staffing, work: workEdit } = value as Record<string, unknown>
  if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id) || typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const next: BoardChange = { id, date }
  if (active !== undefined) {
    next.active = entriesFrom(active, item => typeof item === 'boolean' ? item : undefined)
    if (!next.active) return null
  }
  if (duties !== undefined) {
    next.duties = entriesFrom(duties, dutyFrom)
    if (!next.duties) return null
  }
  if (staffing !== undefined) {
    if (staffing !== null && (!Array.isArray(staffing) || staffing.length > ids.length || !staffing.every(hasId))) return null
    next.staffing = staffing === null ? null : [...new Set(staffing)]
  }
  if (workEdit !== undefined) {
    next.work = entriesFrom(workEdit, workFrom)
    if (!next.work) return null
  }
  return next.active?.length || next.duties?.length || next.staffing !== undefined || next.work?.length ? next : null
}

export function newSharedBoard(now: number): SharedBoard {
  return { revision: 0, date: koreaClock(new Date(now)).date, active: ids.slice(0, 10), staffing: null, duties: [], work: [], receipts: [] }
}

export function currentSharedBoard(board: SharedBoard, now: number): SharedBoard {
  const date = koreaClock(new Date(now)).date
  return board.date === date
    ? { ...board, work: board.work.filter(([, item]) => item.until > now) }
    : { ...board, date, duties: [], work: [] }
}

export function applyBoardChange(board: SharedBoard, change: BoardChange, now: number): SharedBoard {
  const current = currentSharedBoard(board, now)
  if (current.receipts.includes(change.id)) return current
  const active = new Set(current.active)
  for (const [id, visible] of change.active ?? []) {
    if (visible) active.add(id)
    else active.delete(id)
  }
  const duties = new Map(current.duties)
  const workState = new Map(current.work)
  if (change.date === current.date) {
    for (const [id, duty] of change.duties ?? []) {
      if (duty === null) duties.delete(id)
      else duties.set(id, duty)
    }
    for (const [id, activity] of change.work ?? []) {
      if (activity === null) workState.delete(id)
      else workState.set(id, { activity, until: now + 60_000 })
    }
  }
  const chosen = change.staffing === undefined ? current.staffing : change.staffing
  return {
    revision: current.revision + 1, date: current.date,
    active: ids.filter(id => active.has(id)), staffing: chosen && chosen.filter(id => active.has(id)),
    duties: [...duties], work: [...workState].filter(([id]) => active.has(id)),
    receipts: [...current.receipts.slice(-39), change.id],
  }
}
