import { staffKey } from './data.ts'
import type { DataSource } from './data.ts'
import type { DutyOverride } from './simulation.ts'

const storageKey = 'pharmacy-cctv:board-duty:v1:'

export function readBoardDuty(date: string, data: DataSource): DutyOverride[] {
  try {
    const record = JSON.parse(localStorage.getItem(storageKey + data.source) ?? 'null')
    if (record?.date !== date || !Array.isArray(record.staff)) return []
    const ids = new Map(data.people.map(person => [staffKey(person, data.source), person.id]))
    const duties = new Map<string, DutyOverride[1]>()
    for (const entry of record.staff) {
      if (!Array.isArray(entry)) continue
      const [key, duty] = entry
      const id = ids.get(key)
      if (id && (duty === 'off' || duty === 'working')) duties.set(id, duty)
    }
    return [...duties]
  } catch {
    return []
  }
}

export function saveBoardDuty(date: string, data: DataSource, duties: readonly DutyOverride[]) {
  try {
    const keys = new Map(data.people.map(person => [person.id, staffKey(person, data.source)]))
    const staff = duties.map(([id, duty]) => [keys.get(id), duty])
    localStorage.setItem(storageKey + data.source, JSON.stringify({ date, staff }))
  } catch {
    // Today's board still updates when browser storage is disabled.
  }
}
