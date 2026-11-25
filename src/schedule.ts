import type { DataSource, Person, Shift } from './data.ts'

export type RosterRow = { date: string; name: string; shift?: Shift | null }
export type CalendarOverride = { date: string; name: string; shift: Shift }
export type RosterBook = { rows: RosterRow[]; names: string[]; calendarMonth?: string; calendarOverrides?: CalendarOverride[] }
export type KoreaClock = { date: string; minute: number }

const koreaFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

export function koreaClock(now = new Date()): KoreaClock {
  const parts = Object.fromEntries(koreaFormatter.formatToParts(now).map(({ type, value }) => [type, value]))
  return { date: parts.year + '-' + parts.month + '-' + parts.day, minute: Number(parts.hour) * 60 + Number(parts.minute) }
}

export function dateFrom(text: string) {
  const match = text.match(/^(\d{4})\s*[-./년]\s*(\d{1,2})\s*[-./월]\s*(\d{1,2})\s*[.일]?$/)
  if (!match) return undefined
  const [, year, month, day] = match
  const normalized = year + '-' + month.padStart(2, '0') + '-' + day.padStart(2, '0')
  const time = new Date(normalized + 'T00:00:00Z')
  return Number.isFinite(time.getTime()) && time.toISOString().slice(0, 10) === normalized ? normalized : undefined
}

export function timeFrom(text: string, end = false) {
  const match = text.match(/^(?:(오전|오후|am|pm)\s*)?(\d{1,2}):(\d{2})(?::([0-5]\d))?$/i)
  if (!match) return undefined
  const [, marker, hours, minutes, seconds] = match
  const hour = Number(hours)
  const minute = Number(minutes)
  if (minute > 59) return undefined
  if (!marker) {
    if (hour < 24) return hour * 60 + minute
    if (end && hour === 24 && minute === 0 && Number(seconds ?? 0) === 0) return 1440
    return undefined
  }
  if (hour < 1 || hour > 12) return undefined
  return (hour % 12 + (marker === '오후' || marker.toLowerCase() === 'pm' ? 12 : 0)) * 60 + minute
}

export function timeText(minute: number) {
  return String(Math.floor(minute / 60)).padStart(2, '0') + ':' + String(minute % 60).padStart(2, '0')
}

export function delimitedRows(raw: string) {
  const text = raw.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  const header = text.split('\n').find(line => line.trim()) ?? ''
  const delimiter = header.includes('\t') ? '\t' : ','
  let value = ''
  let cells: string[] = []
  let line = 1
  let startLine = 1
  let quoted = false
  let completedQuote = false
  const records: { line: number; cells: string[] }[] = []
  const finishCell = () => {
    cells.push(value.trim())
    value = ''
    completedQuote = false
  }
  for (let index = 0; index < text.length; index++) {
    const character = text[index]
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        value += '"'
        index++
      } else if (character === '"') {
        quoted = false
        completedQuote = true
      } else {
        value += character
      }
    } else if (character === '"' && value === '' && !completedQuote) {
      quoted = true
    } else if (character === delimiter) {
      finishCell()
    } else if (character === '\n') {
      finishCell()
      if (cells.some(Boolean)) records.push({ line: startLine, cells })
      cells = []
      startLine = line + 1
    } else if (completedQuote ? character.trim() : character === '"') {
      throw new Error(line + '행의 따옴표 형식을 확인하세요.')
    } else {
      value += character
    }
    if (character === '\n') line++
  }
  if (quoted) throw new Error(startLine + '행의 따옴표가 닫히지 않았습니다.')
  finishCell()
  if (cells.some(Boolean)) records.push({ line: startLine, cells })
  return records
}

export function parseRoster(text: string, fallbackDate: string | undefined, capacity: number): RosterBook {
  const [header, ...records] = delimitedRows(text)
  const normalized = (header?.cells ?? []).map(cell => cell.normalize('NFKC').replace(/\s/g, ''))
  const indexOf = (...labels: string[]) => normalized.findIndex(cell => labels.includes(cell))
  const columns = {
    name: indexOf('이름', '직원명', '성명'),
    start: indexOf('출근', '출근시간', '근무시작', '시작'),
    end: indexOf('퇴근', '퇴근시간', '근무종료', '종료'),
    date: indexOf('날짜', '근무일', '일자'),
    status: indexOf('상태', '근무상태'),
  }
  if (columns.name < 0 || columns.start < 0 || columns.end < 0)
    throw new Error('첫 행에 이름, 출근, 퇴근 열을 넣어 주세요.')
  if (!records.length) throw new Error('가져올 직원 행이 없습니다.')

  const names = new Set<string>()
  const seen = new Set<string>()
  const rows = records.map(({ line, cells }): RosterRow => {
    const name = cells[columns.name]?.normalize('NFKC')
    const date = columns.date < 0 ? fallbackDate : dateFrom(cells[columns.date] ?? '')
    if (!name || /[\r\n\t]/.test(name)) throw new Error(line + '행의 직원 이름을 확인하세요.')
    if (!date) throw new Error(line + '행의 날짜를 확인하세요.')
    const key = JSON.stringify([date, name])
    if (seen.has(key)) throw new Error(line + '행의 직원과 날짜가 중복됩니다.')
    seen.add(key)
    names.add(name)

    const startText = cells[columns.start] ?? ''
    const endText = cells[columns.end] ?? ''
    const status = (cells[columns.status] ?? '').toLowerCase()
    if (['휴무', '휴가', 'off'].includes(status)) {
      if (startText || endText) throw new Error(line + '행은 휴무와 근무 시간이 함께 적혀 있습니다.')
      return { date, name, shift: null }
    }
    if (!startText && !endText) return { date, name }
    const start = timeFrom(startText)
    const end = timeFrom(endText, true)
    if (start === undefined) throw new Error(line + '행의 출근 시간을 확인하세요.')
    if (end === undefined || end === start) throw new Error(line + '행의 퇴근 시간을 확인하세요.')
    return { date, name, shift: { start, end } }
  })
  if (names.size > capacity) throw new Error('현재 캐릭터 수는 ' + capacity + '명입니다. 근무표의 직원 수를 확인하세요.')
  return { rows, names: [...names] }
}

function rosterPeople(names: string[], templates: readonly Person[]) {
  const reserved = new Set(templates.filter(person => names.includes(person.name)).map(person => person.id))
  const spare = templates.filter(person => !reserved.has(person.id))
  return names.map((name, index): Person => {
    const template = templates.find(person => person.name === name) ?? spare.shift()!
    return { ...template, id: 'roster-' + index, role: '직원', name }
  })
}

export function createRosterData(book: RosterBook, demo: DataSource, clock: KoreaClock): DataSource {
  const people = rosterPeople(book.names, demo.people)
  const yesterday = new Date(Date.parse(clock.date + 'T00:00:00Z') - 86_400_000).toISOString().slice(0, 10)
  function shiftsFor(date: string) {
    const rows = new Map(book.rows.filter(row => row.date === date).map(row => [row.name, row.shift]))
    for (const override of book.calendarOverrides ?? []) {
      if (override.date === date && rows.has(override.name)) rows.set(override.name, override.shift)
    }
    return rows
  }
  const todayRows = shiftsFor(clock.date)
  const priorRows = shiftsFor(yesterday)
  const shifts: Record<string, Shift | null | undefined> = {}
  const carryUntil: Record<string, number> = {}
  for (const { id, name } of people) {
    const today = todayRows.get(name)
    const prior = priorRows.get(name)
    const carry = prior && prior.end < prior.start ? prior.end : 0
    if (carry) carryUntil[id] = carry
    shifts[id] = today && today.end < today.start ? { start: today.start, end: 1440 }
      : today === undefined && carry && !(book.calendarMonth && todayRows.has(name)) ? { start: 0, end: carry } : today
  }
  const calendar = book.calendarMonth ? {
    inMonth: clock.date.slice(0, 7) === book.calendarMonth,
    planned: people.filter(person => todayRows.has(person.name)).map(person => person.id),
  } : undefined
  return { source: 'connected', initialMinute: clock.minute, millisecondsPerMinute: 60_000, people, shifts, carryUntil, calendar, assignments: {} }
}
