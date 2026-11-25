import { useState } from 'react'
import { isCalendarRoster, parseCalendarRoster } from './calendar-roster.ts'
import { TableDialog } from './table-dialog.tsx'
import { dateFrom, koreaClock, parseRoster, timeText } from './schedule.ts'
import type { CalendarOverride, RosterBook, RosterRow } from './schedule.ts'

const storageKey = 'pharmacy-cctv:roster:v1'

export function readRoster(capacity: number): RosterBook | null {
  try {
    const saved = localStorage.getItem(storageKey)
    if (!saved) return null
    if (!saved.startsWith('{')) return parseRoster(saved, koreaClock().date, capacity)
    const { csv, calendarMonth, overrideCsv } = JSON.parse(saved)
    if (typeof csv !== 'string' || typeof calendarMonth !== 'string' ||
      !/^\d{4}-\d{2}$/.test(calendarMonth) || !dateFrom(calendarMonth + '-01')) return null
    const book = parseRoster(csv, undefined, capacity)
    if (book.rows.some(row => row.shift === null || !row.date.startsWith(calendarMonth + '-'))) return null
    const calendarOverrides: CalendarOverride[] = []
    if (overrideCsv !== undefined) {
      if (typeof overrideCsv !== 'string') return null
      const rows = parseRoster(overrideCsv, undefined, capacity).rows
      const planned = new Set(book.rows.map(({ date, name }) => date + ':' + name))
      for (const { date, name, shift } of rows) {
        if (!shift || !planned.has(date + ':' + name)) return null
        calendarOverrides.push({ date, name, shift })
      }
    }
    return { ...book, calendarMonth, calendarOverrides }
  } catch {
    return null
  }
}

function rosterCsv(rows: readonly RosterRow[]) {
  const lines = rows.map(({ date, name, shift }) => [
    date, '"' + name.replaceAll('"', '""') + '"',
    shift ? timeText(shift.start) : '', shift ? timeText(shift.end) : '', shift === null ? '휴무' : '',
  ].join(','))
  return ['날짜,이름,출근,퇴근,상태', ...lines].join('\n')
}

export function saveRoster(value: RosterBook | null) {
  try {
    if (!value) {
      localStorage.removeItem(storageKey)
      return
    }
    const csv = rosterCsv(value.rows)
    const overrideCsv = value.calendarOverrides?.length ? rosterCsv(value.calendarOverrides) : undefined
    localStorage.setItem(storageKey, value.calendarMonth ? JSON.stringify({ csv, calendarMonth: value.calendarMonth, overrideCsv }) : csv)
  } catch {
    // The current board remains available when the browser disables storage.
  }
}

type Props = {
  capacity: number
  current: RosterBook | null
  close: () => void
  apply: (value: RosterBook | null) => void
  openWork: () => void
  openFeed: () => void
  openHours: () => void
}

export function ScheduleDialog({ capacity, current, close, apply, openWork, openFeed, openHours }: Props) {
  const [calendarMonth, setCalendarMonth] = useState('')
  const workAvailable = current && (!current.calendarMonth || current.calendarOverrides?.length || current.rows.some(row => row.shift))
  return <TableDialog
    title={current ? '근무표 관리' : '근무표 가져오기'}
    hint="CSV를 열거나 엑셀·구글 시트에서 복사한 표를 붙여넣으세요."
    label="근무표 내용"
    placeholder={'이름,출근,퇴근,상태\n김한나,09:00,18:00,\n박별,,,휴무'}
    help={<>시간이 있는 표는 <strong>이름 · 출근 · 퇴근</strong> 열을 사용합니다. 날짜 열이 없으면 오늘 근무표로 읽습니다.
      달력형 근무표는 <strong>일~토 요일 머리글과 한 달 전체</strong>를 복사하세요.</>}
    fields={text => isCalendarRoster(text) && <div className="calendar-fields">
      <label className="schedule-label" htmlFor="calendar-month">달력의 연도와 월</label>
      <input className="calendar-month" id="calendar-month" type="month" value={calendarMonth}
        aria-describedby="calendar-help" onChange={event => setCalendarMonth(event.currentTarget.value)} />
      <p className="schedule-help" id="calendar-help">날짜별 이름은 근무 예정으로 표시합니다. 현재 인원은 출퇴근 시간이 있어야 계산할 수 있습니다.</p>
    </div>}
    actions={<>
      <button className="staffing-reset" type="button" onClick={openFeed}>내부 시스템 연동</button>
      {current ? <>
        {current.calendarMonth && <button className="staffing-reset" type="button" onClick={openHours}>근무시간 설정</button>}
        {workAvailable && <button className="staffing-reset" type="button" onClick={openWork}>업무 상태 가져오기</button>}
        <button className="staffing-reset" type="button" onClick={() => apply(null)}>시뮬레이션으로 돌아가기</button>
      </> : <button className="staffing-reset" type="button" onClick={close}>취소</button>}
    </>}
    close={close} apply={text => apply(isCalendarRoster(text) ? parseCalendarRoster(text, calendarMonth, capacity)
      : parseRoster(text, koreaClock().date, capacity))}
  />
}
