import assert from 'node:assert/strict'
import { test } from 'node:test'
import { demo } from './data.ts'
import { createRosterData, parseRoster } from './schedule.ts'
import { createSimulation } from './simulation.ts'
import { parseWork, workAssignments } from './work-status.ts'

test('확인된 업무가 시작되면 해당 공간으로 이동하고 종료 시각부터 미확인으로 돌아간다', () => {
  const date = '2026-11-24'
  const roster = parseRoster('이름,출근,퇴근,상태\n김한나,09:00,18:00,\n박별,,,휴무', date, 16)
  const work = parseWork('이름,업무,시작,종료\n김한나,조제 중,10:00,10:20\n박별,계산 중,10:00,10:20', date, roster.names)
  const source = createRosterData(roster, demo, { date, minute: 599 })
  const simulation = createSimulation(source)
  simulation.setAssignments(workAssignments(work, source.people, date))
  assert.equal(simulation.actors[0].activity, 'unknown')
  assert.equal(simulation.actors[0].zone, 'standby')

  simulation.syncClock(600)
  simulation.step(400)
  assert.ok(simulation.actors[0].moving)
  assert.equal(simulation.actors[0].target, 'dispense')
  simulation.step(15_000)
  assert.equal(simulation.actors[0].activity, 'dispense')
  assert.equal(simulation.actors[0].zone, 'dispense')
  assert.equal(simulation.actors[1].activity, 'dayoff')

  simulation.syncClock(620)
  assert.equal(simulation.actors[0].activity, 'unknown')
  simulation.step(15_000)
  assert.equal(simulation.actors[0].zone, 'standby')
})

test('시간 구간이 겹치거나 근무표 직원과 맞지 않는 업무를 가져오지 않는다', () => {
  const date = '2026-11-24'
  const header = '날짜,이름,업무,시작,종료\n'
  assert.throws(() => parseWork(header + '2026-11-24,김한나,조제,10:00,11:00\n2026-11-24,김한나,시럽,10:30,11:30', date, ['김한나']), /3행.*겹/)
  assert.throws(() => parseWork(header + '2026-11-24,박별,조제,10:00,10:20', date, ['김한나']), /2행.*직원/)
  assert.throws(() => parseWork(header + '2026-11-24,김한나,기타업무,10:00,10:20', date, ['김한나']), /2행.*업무/)
})

test('자정 뒤 업무는 구간의 남은 시간만 표시하고 다른 날은 사용할 수 없다', () => {
  const date = '2026-11-24'
  const roster = parseRoster('날짜,이름,출근,퇴근\n2026-11-24,김한나,22:00,02:00', date, 16)
  const work = parseWork('날짜\t이름\t업무\t시작\t종료\n2026-11-24\t김한나\t재고 확인 중\t23:40\t00:35', date, roster.names)
  const source = createRosterData(roster, demo, { date: '2026-11-25', minute: 20 })
  const assignments = workAssignments(work, source.people, '2026-11-25')
  const simulation = createSimulation({ ...source, assignments })
  assert.equal(simulation.actors[0].activity, 'inventory')
  simulation.syncClock(35)
  assert.equal(simulation.actors[0].activity, 'unknown')
  const next = createRosterData(roster, demo, { date: '2026-11-26', minute: 20 })
  assert.deepEqual(workAssignments(work, next.people, '2026-11-26'), {})
})
