import { dateFrom, delimitedRows, timeFrom, timeText } from './schedule.ts'
import type { Shift } from './data.ts'
import type { RosterBook, RosterRow } from './schedule.ts'

export type CalendarHours = { start: string; end: string }

const weekdays = [...'일월화수목금토']
const quietDays = new Set(['-', '–', '—', '휴무', '휴점', '공휴일', '휴일', '약국휴무', '없음'])
const dayMs = 86_400_000

export function isCalendarRoster(text: string) {
  const firstLine = text.split('\n').find(line => line.trim())
  if (!firstLine) return false
  try {
    const header = delimitedRows(firstLine)[0]?.cells ?? []
    return header.slice(7).every(cell => !cell) && weekdays.every((day, index) => {
      const heading = header[index]?.normalize('NFKC').replace(/\s*\([^)]*\)$/, '').trim()
      return heading === day || heading === day + '요일'
    })
  } catch {
    return false
  }
}

export function parseCalendarRoster(text: string, month: string, capacity: number): RosterBook {
  if (!/^\d{4}-\d{2}$/.test(month) || !dateFrom(month + '-01')) throw new Error('달력의 연도와 월을 선택하세요.')
  if (!isCalendarRoster(text)) throw new Error('요일 머리글과 한 달 전체를 복사해 주세요.')
  const [, ...weeks] = delimitedRows(text)
  const first = new Date(month + '-01T00:00:00Z')
  const next = new Date(first)
  next.setUTCMonth(next.getUTCMonth() + 1)
  const days = (next.getTime() - first.getTime()) / dayMs
  const firstColumn = first.getUTCDay()
  const names = new Set<string>()
  const rows: RosterRow[] = []

  for (let day = 1; day <= days; day++) {
    const position = firstColumn + day - 1
    const week = weeks[Math.floor(position / weekdays.length)]
    const slot = week?.cells[position % weekdays.length]?.normalize('NFKC') ?? ''
    const entry = slot.match(/^(\d{1,2})\s*(?:일(?:\s+|$))?\s*([\s\S]*)$/)
    if (!entry || Number(entry[1]) !== day)
      throw new Error(day + '일의 날짜 배치가 선택한 달과 맞지 않습니다. 달력을 한 달 전체 복사해 주세요.')

    const date = month + '-' + String(day).padStart(2, '0')
    const planned = new Set<string>()
    for (const part of entry[2].split(/[,;\n]/)) {
      const name = part.trim().replace(/\s+/g, ' ')
      if (!name || quietDays.has(name)) continue
      if (!/^\p{L}[\p{L}\p{M} .·'’-]*$/u.test(name))
        throw new Error(day + '일 칸에 직원 이름만 적고 쉼표로 구분해 주세요.')
      if (planned.has(name)) throw new Error(day + '일에 같은 직원 이름이 중복됩니다.')
      planned.add(name)
      names.add(name)
      rows.push({ date, name })
    }
  }

  if (!names.size) throw new Error('선택한 달에 가져올 직원 이름이 없습니다.')
  if (names.size > capacity) throw new Error('현재 캐릭터 수는 ' + capacity + '명입니다. 근무표의 직원 수를 확인하세요.')
  return { rows, names: [...names], calendarMonth: month }
}

export function calendarHours(book: RosterBook) {
  const hours = new Map<string, CalendarHours>()
  for (const { name, shift } of book.rows) {
    if (!shift || hours.has(name)) continue
    hours.set(name, { start: timeText(shift.start), end: timeText(shift.end % 1440) })
  }
  return hours
}

function readHours(names: Iterable<string>, hours: ReadonlyMap<string, CalendarHours>) {
  const shifts = new Map<string, Shift>()
  for (const name of names) {
    const row = hours.get(name)
    if (!row || (!row.start && !row.end)) continue
    const start = timeFrom(row.start)
    const end = timeFrom(row.end)
    if (start === undefined || end === undefined) throw new Error(name + '의 출근과 퇴근 시간을 모두 입력해 주세요.')
    if (start === end) throw new Error(name + '의 출근과 퇴근 시간이 같습니다.')
    shifts.set(name, { start, end })
  }
  return shifts
}

export function applyCalendarHours(book: RosterBook, hours: ReadonlyMap<string, CalendarHours>): RosterBook {
  if (!book.calendarMonth) throw new Error('달력형 근무표를 먼저 가져오세요.')
  const shifts = readHours(book.names, hours)
  return { ...book, rows: book.rows.map(row => ({ ...row, shift: shifts.get(row.name) })) }
}

export function calendarDateHours(book: RosterBook, date: string) {
  return new Map((book.calendarOverrides ?? []).filter(row => row.date === date)
    .map(({ name, shift }) => [name, { start: timeText(shift.start), end: timeText(shift.end % 1440) }]))
}

export function applyCalendarDateHours(book: RosterBook, date: string, hours: ReadonlyMap<string, CalendarHours>): RosterBook {
  const names = new Set(book.rows.filter(row => row.date === date).map(row => row.name))
  if (!book.calendarMonth || !names.size) throw new Error('달력에서 예정자가 있는 날짜를 선택하세요.')
  const shifts = readHours(names, hours)
  const calendarOverrides = [
    ...(book.calendarOverrides ?? []).filter(row => row.date !== date),
    ...Array.from(shifts, ([name, shift]) => ({ date, name, shift })),
  ]
  return { ...book, calendarOverrides }
}
