import assert from 'node:assert/strict'
import { test } from 'node:test'
import { demo } from './data.ts'
import { createSimulation } from './simulation.ts'
import { createRosterData, koreaClock, parseRoster } from './schedule.ts'
import { applyCalendarDateHours, applyCalendarHours, calendarDateHours, calendarHours, isCalendarRoster, parseCalendarRoster } from './calendar-roster.ts'

const calendar = [
  '일 (Sun)\t월 (Mon)\t화 (Tue)\t수 (Wed)\t목 (Thu)\t금 (Fri)\t토 (Sat)',
  '1\t2가온, 다온\t3가온\t4다온\t5\t6\t7',
  '8\t9가온\t10\t11\t12\t13\t14',
  '15\t16\t17\t18\t19\t20\t21',
  '22\t23\t24\t25가온, 다온\t26가온\t27휴무\t28',
  '29\t30\t1이월가\t2이월나\t3\t4\t5',
].join('\n')

test('엑셀에서 붙여넣은 표는 휴무와 미확인을 구분하고 실제 업무를 배정하지 않는다', () => {
  const book = parseRoster('이름\t출근\t퇴근\t상태\n김한나\t오전 9:00\t오후 6:00\t\n박별\t\t\t휴무\n정유리\t\t\t', '2026-11-24', 16)
  const source = createRosterData(book, demo, { date: '2026-11-24', minute: 609 })
  const board = createSimulation(source)
  assert.deepEqual(board.actors.map(actor => [actor.person.name, actor.duty, actor.activity, actor.present]), [
    ['김한나', 'working', 'unknown', true],
    ['박별', 'off', 'dayoff', true],
    ['정유리', 'unconfirmed', 'unknown', false],
  ])
  assert.deepEqual(source.assignments, {})
  assert.equal(board.actors[0].zone, 'standby')
  board.syncClock(1080)
  assert.equal(board.actors[0].duty, 'departed')
  board.step(65_000)
  assert.equal(board.minute, 1080)
})

test('날짜별 CSV는 자정을 넘긴 근무를 다음 날 이어서 표시하고 그날 휴무 기록도 보존한다', () => {
  const book = parseRoster('\uFEFF날짜,직원명,출근,퇴근,상태\r\n2026. 11. 24.,김한나,22:00,02:00,\r\n2026/11/25,김한나,,,휴무\r\n2026-11-25,"박,별",09:00,18:00,', '2026-11-24', 16)
  const board = createSimulation(createRosterData(book, demo, { date: '2026-11-25', minute: 70 }))
  assert.equal(board.actors[0].duty, 'working')
  assert.equal(board.actors[1].person.name, '박,별')
  assert.equal(board.actors[1].duty, 'before')
  board.syncClock(120)
  assert.equal(board.actors[0].duty, 'off')
  const missing = createSimulation(createRosterData(book, demo, { date: '2026-11-27', minute: 600 }))
  assert.ok(missing.actors.every(actor => actor.duty === 'unconfirmed' && !actor.present))
})

test('중복 직원 날짜, 잘못된 시각 및 존재하지 않는 날짜는 가져오기 전에 발견한다', () => {
  assert.throws(() => parseRoster('이름,출근,퇴근\n김한나,09:00,17:00\n김한나,10:00,18:00', '2026-11-24', 16), /3행.*중복/)
  assert.throws(() => parseRoster('이름,출근,퇴근\n김한나,29:00,18:00', '2026-11-24', 16), /2행.*출근/)
  assert.throws(() => parseRoster('날짜,이름,출근,퇴근\n2026-02-31,김한나,09:00,18:00', '2026-11-24', 16), /2행.*날짜/)
  assert.deepEqual(koreaClock(new Date('2026-11-24T15:06:00Z')), { date: '2026-11-25', minute: 6 })
})

test('달력의 오늘 명단을 시각과 실제 업무가 없는 근무 예정으로 읽는다', () => {
  assert.ok(isCalendarRoster(calendar))
  assert.ok(!isCalendarRoster('이름\t출근\t퇴근'))
  const book = parseCalendarRoster(calendar, '2026-11', 16)
  assert.equal(book.calendarMonth, '2026-11')
  assert.deepEqual(book.names, ['가온', '다온'])
  const source = createRosterData(book, demo, { date: '2026-11-25', minute: 600 })
  assert.deepEqual(source.calendar, { inMonth: true, planned: ['roster-0', 'roster-1'] })
  assert.ok(createSimulation(source).actors.every(actor => actor.duty === 'unconfirmed' && !actor.present))
  assert.deepEqual(createRosterData(book, demo, { date: '2026-11-27', minute: 600 }).calendar, { inMonth: true, planned: [] })
  assert.deepEqual(createRosterData(book, demo, { date: '2026-12-01', minute: 600 }).calendar, { inMonth: false, planned: [] })
})

test('달력은 선택한 월의 날짜 배치와 일치해야 하며 근무 시간이나 직원 수를 추측하지 않는다', () => {
  assert.throws(() => parseCalendarRoster(calendar, '', 16), /연도와 월/)
  assert.throws(() => parseCalendarRoster(calendar, '2026-12', 16), /날짜 배치/)
  assert.throws(() => parseCalendarRoster(calendar.replace('9가온', '9가온 09:00'), '2026-11', 16), /9일/)
  assert.throws(() => parseCalendarRoster(calendar.replace('9가온', '9가온, 가온'), '2026-11', 16), /9일.*중복/)
  assert.throws(() => parseCalendarRoster(calendar, '2026-11', 1), /1명/)
})

test('직원별 설정 시간은 달력에 이미 등록된 날짜에만 적용되며 미입력 직원은 예정으로 남는다', () => {
  const book = parseCalendarRoster(calendar, '2026-11', 16)
  const updated = applyCalendarHours(book, new Map([['가온', { start: '09:00', end: '18:00' }]]))
  assert.deepEqual(updated.rows.map(row => [row.date, row.name]), book.rows.map(row => [row.date, row.name]))
  assert.deepEqual(calendarHours(updated).get('가온'), { start: '09:00', end: '18:00' })
  assert.equal(calendarHours(updated).has('다온'), false)
  const board = createSimulation(createRosterData(updated, demo, { date: '2026-11-25', minute: 600 }))
  assert.deepEqual(board.actors.map(actor => [actor.duty, actor.activity]), [['working', 'unknown'], ['unconfirmed', 'unknown']])
  const cleared = applyCalendarHours(updated, new Map())
  assert.equal(calendarHours(cleared).size, 0)
  assert.ok(book.rows.every(row => row.shift === undefined))
})

test('달력 근무시간은 두 칸을 검증하고 자정 넘김을 기존 근무표와 똑같이 처리한다', () => {
  const book = parseCalendarRoster(calendar, '2026-11', 16)
  assert.throws(() => applyCalendarHours(book, new Map([['가온', { start: '09:00', end: '' }]])), /가온.*출근.*퇴근/)
  assert.throws(() => applyCalendarHours(book, new Map([['가온', { start: '09:00', end: '09:00' }]])), /가온.*같/)
  const updated = applyCalendarHours(book, new Map([['가온', { start: '22:00', end: '02:00' }]]))
  const board = createSimulation(createRosterData(updated, demo, { date: '2026-11-27', minute: 60 }))
  assert.equal(board.actors[0].duty, 'working')
  board.syncClock(120)
  assert.equal(board.actors[0].duty, 'departed')
})

test('특정 날짜의 시간은 기본 시간보다 우선하고 비우면 기본 시간으로 돌아간다', () => {
  const calendarBook = parseCalendarRoster(calendar, '2026-11', 16)
  const base = applyCalendarHours(calendarBook, new Map([['가온', { start: '09:00', end: '18:00' }]]))
  const dated = applyCalendarDateHours(base, '2026-11-25', new Map([['가온', { start: '13:00', end: '18:00' }]]))
  const snapshot = (book: typeof dated, date: string) => createSimulation(createRosterData(book, demo, { date, minute: 660 })).actors[0]
  assert.equal(snapshot(dated, '2026-11-25').duty, 'before')
  assert.equal(snapshot(dated, '2026-11-26').duty, 'working')
  assert.equal(calendarHours(dated).get('가온')?.start, '09:00')
  assert.equal(calendarDateHours(dated, '2026-11-25').get('가온')?.start, '13:00')
  const changedBase = applyCalendarHours(dated, new Map([['가온', { start: '10:00', end: '17:00' }]]))
  assert.equal(snapshot(changedBase, '2026-11-25').duty, 'before')
  const restored = applyCalendarDateHours(changedBase, '2026-11-25', new Map())
  assert.equal(snapshot(restored, '2026-11-25').duty, 'working')
})

test('날짜별 시간은 예정일만 바꾸고 자정이 지나 시간이 없는 예정일은 다시 미확인으로 표시한다', () => {
  const base = parseCalendarRoster(calendar, '2026-11', 16)
  const hours = new Map([['가온', { start: '22:00', end: '02:00' }]])
  assert.throws(() => applyCalendarDateHours(base, '2026-11-27', hours), /예정자/)
  assert.throws(() => applyCalendarDateHours(base, '2026-11-25', new Map([['가온', { start: '', end: '02:00' }]])), /가온/)
  const dated = applyCalendarDateHours(base, '2026-11-25', hours)
  const board = createSimulation(createRosterData(dated, demo, { date: '2026-11-26', minute: 60 }))
  assert.equal(board.actors[0].duty, 'working')
  board.syncClock(120)
  assert.equal(board.actors[0].duty, 'unconfirmed')
})
