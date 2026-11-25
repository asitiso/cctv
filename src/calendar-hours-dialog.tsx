import { useEffect, useRef, useState } from 'react'
import { applyCalendarDateHours, applyCalendarHours, calendarDateHours, calendarHours } from './calendar-roster.ts'
import type { CalendarHours } from './calendar-roster.ts'
import { koreaClock } from './schedule.ts'
import type { RosterBook } from './schedule.ts'

type Props = {
  book: RosterBook
  close: () => void
  apply: (book: RosterBook) => void
}

const blankHours = { start: '', end: '' }
const dateLabel = new Intl.DateTimeFormat('ko-KR', { timeZone: 'UTC', month: 'long', day: 'numeric', weekday: 'short' })

export function CalendarHoursDialog({ book, close, apply }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [hours, setHours] = useState(() => calendarHours(book))
  const [byDate, setByDate] = useState(false)
  const dates = [...new Set(book.rows.map(row => row.date))].sort()
  const [date, setDate] = useState(() => {
    const today = koreaClock().date
    return dates.find(day => day >= today) ?? dates[0]
  })
  const [dateHours, setDateHours] = useState(() => calendarDateHours(book, date))
  const [error, setError] = useState('')
  const month = book.calendarMonth!.split('-')
  const names = byDate ? book.rows.filter(row => row.date === date).map(row => row.name) : book.names
  const savedHours = byDate ? calendarHours(book) : null

  useEffect(() => { dialog.current?.showModal() }, [])

  function update(name: string, field: keyof CalendarHours, value: string) {
    const setCurrent = byDate ? setDateHours : setHours
    setCurrent(previous => new Map(previous).set(name, { ...(previous.get(name) ?? blankHours), [field]: value }))
    setError('')
  }

  function selectDate(next: string) {
    setDate(next)
    setDateHours(calendarDateHours(book, next))
    setError('')
  }

  function resetDateHours(name: string) {
    setDateHours(previous => {
      const next = new Map(previous)
      next.delete(name)
      return next
    })
    setError('')
  }

  function submit() {
    try {
      apply(byDate ? applyCalendarDateHours(book, date, dateHours) : applyCalendarHours(book, hours))
    } catch (error) {
      setError(error instanceof Error ? error.message : '근무시간을 적용할 수 없습니다.')
    }
  }

  return <dialog ref={dialog} className="staffing-dialog calendar-hours-dialog" aria-labelledby="calendar-hours-title" onClose={close}>
    <form onSubmit={event => { event.preventDefault(); submit() }}>
      <header className="staffing-header">
        <div>
          <h2 id="calendar-hours-title">달력 근무시간 설정</h2>
          <p>{month[0]}년 {Number(month[1])}월 근무표</p>
        </div>
        <button className="staffing-close" type="button" aria-label="닫기" onClick={() => dialog.current?.close()}>×</button>
      </header>
      <div className="calendar-hours-choice" role="group" aria-label="근무시간 적용 범위">
        <button type="button" aria-pressed={!byDate} onClick={() => { setByDate(false); setError('') }}>기본 시간</button>
        <button type="button" aria-pressed={byDate} onClick={() => { setByDate(true); setError('') }}>날짜별 예외</button>
      </div>
      {byDate ? <>
        <div className="calendar-date-field">
          <label className="schedule-label" htmlFor="calendar-hours-date">근무 날짜</label>
          <select id="calendar-hours-date" value={date} onChange={event => selectDate(event.currentTarget.value)}>
            {dates.map(day => <option key={day} value={day}>
              {dateLabel.format(new Date(day + 'T00:00:00Z'))}
              {book.calendarOverrides?.some(row => row.date === day) ? ' · 예외 있음' : ''}
            </option>)}
          </select>
        </div>
        <p className="schedule-help">시간이 달라지는 직원만 입력하세요. 두 칸을 비워두면 기본 시간이 적용됩니다.</p>
      </> : <p className="schedule-help">이 달에 이름이 적힌 날짜에 적용합니다. 두 칸을 비워두면 근무 예정으로 표시됩니다.</p>}
      <table className="calendar-hours-table">
        <thead><tr><th scope="col">직원</th><th scope="col">출근</th><th scope="col">퇴근</th></tr></thead>
        <tbody>{names.map(name => {
          const row = (byDate ? dateHours : hours).get(name) ?? blankHours
          const standard = savedHours?.get(name)
          return <tr key={name}>
            <th scope="row">
              {name}
              {byDate && <small>{standard ? '기본 ' + standard.start + '–' + standard.end : '기본 시간 없음'}</small>}
              {byDate && (row.start || row.end) && <button className="calendar-reset-time" type="button"
                aria-label={name + (standard ? ' 기본 시간으로' : ' 시간 지우기')} onClick={() => resetDateHours(name)}>
                {standard ? '기본 시간으로' : '시간 지우기'}
              </button>}
            </th>
            <td><input type="time" aria-label={name + ' 출근 시간'} value={row.start}
              onChange={event => update(name, 'start', event.currentTarget.value)} /></td>
            <td><input type="time" aria-label={name + ' 퇴근 시간'} value={row.end}
              onChange={event => update(name, 'end', event.currentTarget.value)} /></td>
          </tr>
        })}</tbody>
      </table>
      {error && <p className="schedule-error" role="alert">{error}</p>}
      <footer className="staffing-footer">
        <button type="button" className="staffing-reset" onClick={() => dialog.current?.close()}>취소</button>
        <button type="submit" className="staffing-apply">{byDate ? '선택한 날에 적용' : '이 달에 적용'}</button>
      </footer>
    </form>
  </dialog>
}
