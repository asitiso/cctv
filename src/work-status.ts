import { activities, displayOnlyActivities } from './data.ts'
import type { Activity, Assignment, DataSource, Person } from './data.ts'
import { dateFrom, delimitedRows, koreaClock, timeFrom } from './schedule.ts'

type WorkActivity = Exclude<Activity, (typeof displayOnlyActivities)[number]>
export type WorkPeriod = { date: string; name: string; activity: WorkActivity; start: number; end: number }

const dayMinutes = 1440
const dayMillis = 86_400_000
const storageKey = 'pharmacy-cctv:work:v1'
const labels = new Map<string, WorkActivity>()

for (const [key, { label }] of Object.entries(activities)) {
  if (displayOnlyActivities.some(activity => activity === key)) continue
  labels.set(key, key as WorkActivity)
  labels.set(label, key as WorkActivity)
  labels.set(label.replace(/\s/g, ''), key as WorkActivity)
  if (label.endsWith(' 중')) labels.set(label.slice(0, -2).replace(/\s/g, ''), key as WorkActivity)
}
for (const [label, key] of Object.entries({
  조제: 'dispense', 처방전확인: 'prescription', 포장: 'pack', 시럽: 'syrup',
  계산: 'checkout', 상담: 'counsel', 복약지도: 'guidance', 재고정리: 'stock',
  재고확인: 'inventory', 발주: 'office', 휴식: 'coffee', 식사: 'lunch', 미확인: 'unknown',
} as const)) labels.set(label, key)

function activityFrom(text: string) {
  const clean = text.trim().normalize('NFKC').toLowerCase()
  return labels.get(clean) ?? labels.get(clean.replace(/\s/g, ''))
}

export function parseWork(text: string, fallbackDate: string | undefined, knownNames: readonly string[]): WorkPeriod[] {
  const [header, ...records] = delimitedRows(text)
  const keys = (header?.cells ?? []).map(cell => cell.normalize('NFKC').replace(/\s/g, ''))
  const indexOf = (...aliases: string[]) => keys.findIndex(key => aliases.includes(key))
  const columns = {
    name: indexOf('이름', '직원명', '성명'),
    date: indexOf('날짜', '근무일', '일자'),
    activity: indexOf('업무', '업무상태', '상태'),
    start: indexOf('시작', '시작시간', '시작시각', '업무시작'),
    end: indexOf('종료', '종료시간', '종료시각', '업무종료'),
  }
  if (columns.name < 0 || columns.activity < 0 || columns.start < 0 || columns.end < 0)
    throw new Error('첫 행에 이름, 업무, 시작, 종료 열을 넣어 주세요.')
  if (!records.length) throw new Error('가져올 업무 행이 없습니다.')

  const names = new Set(knownNames)
  const parsed = records.map(({ line, cells }) => {
    const name = cells[columns.name]?.normalize('NFKC')
    const date = columns.date < 0 ? fallbackDate : dateFrom(cells[columns.date] ?? '')
    const activity = activityFrom(cells[columns.activity] ?? '')
    const start = timeFrom(cells[columns.start] ?? '')
    const end = timeFrom(cells[columns.end] ?? '', true)
    if (!name || !names.has(name)) throw new Error(line + '행의 직원을 근무표에서 찾을 수 없습니다.')
    if (!date) throw new Error(line + '행의 날짜를 확인하세요.')
    if (!activity) throw new Error(line + '행의 업무가 지원되는 상태인지 확인하세요.')
    if (start === undefined) throw new Error(line + '행의 시작 시간을 확인하세요.')
    if (end === undefined || end === start) throw new Error(line + '행의 종료 시간을 확인하세요.')
    const absoluteStart = Date.parse(date + 'T00:00:00Z') / 60_000 + start
    const length = end > start ? end - start : end + dayMinutes - start
    const period: WorkPeriod = { date, name, activity, start, end }
    return { line, period, absoluteStart, absoluteEnd: absoluteStart + length }
  }).sort((a, b) => a.absoluteStart - b.absoluteStart)

  const lastByName = new Map<string, number>()
  for (const { line, period, absoluteStart, absoluteEnd } of parsed) {
    if ((lastByName.get(period.name) ?? -Infinity) > absoluteStart)
      throw new Error(line + '행이 같은 직원의 다른 업무 시간과 겹칩니다.')
    lastByName.set(period.name, absoluteEnd)
  }
  return parsed.map(row => row.period)
}

export function workAssignments(work: readonly WorkPeriod[], people: readonly Person[], date: string): DataSource['assignments'] {
  const currentDay = Date.parse(date + 'T00:00:00Z')
  const ids = new Map(people.map(person => [person.name, person.id]))
  const assignments: Record<string, Assignment[]> = {}
  for (const entry of work) {
    const id = ids.get(entry.name)
    if (id === undefined) continue
    const dayOffset = (Date.parse(entry.date + 'T00:00:00Z') - currentDay) / dayMillis
    if (dayOffset < -1 || dayOffset > 0) continue
    const at = Math.max(0, dayOffset * dayMinutes + entry.start)
    const until = Math.min(dayMinutes, dayOffset * dayMinutes + entry.end + (entry.end < entry.start ? dayMinutes : 0))
    if (until <= at) continue
    const staff = (assignments[id] ??= [])
    staff.push({ at, until, activity: entry.activity })
  }
  return assignments
}

function timeText(minute: number) {
  return String(Math.floor(minute / 60)).padStart(2, '0') + ':' + String(minute % 60).padStart(2, '0')
}

export function readWork(names: readonly string[], key = storageKey): WorkPeriod[] {
  try {
    const saved = localStorage.getItem(key)
    return saved ? parseWork(saved, koreaClock().date, names) : []
  } catch {
    return []
  }
}

export function saveWork(work: readonly WorkPeriod[], key = storageKey) {
  try {
    if (work.length === 0) {
      localStorage.removeItem(key)
      return
    }
    const lines = work.map(({ date, name, activity, start, end }) =>
      [date, '"' + name.replaceAll('"', '""') + '"', activity, timeText(start), timeText(end)].join(','))
    localStorage.setItem(key, ['날짜,이름,업무,시작,종료', ...lines].join('\n'))
  } catch {
    // Keep the imported statuses active when browser storage is disabled.
  }
}
