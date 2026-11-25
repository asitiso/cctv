import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyAppearances, applyDisplayNames, chooseAppearance, chooseDisplayName } from './appearance.ts'
import { demo, staffKey, staffName } from './data.ts'
import { createRosterData, parseRoster } from './schedule.ts'
import { createSimulation } from './simulation.ts'

test('사용 중인 외형을 선택하면 두 외형만 서로 바뀌고 직원 이름, 역할과 자리를 유지한다', () => {
  const base = demo.people
  const choice = chooseAppearance({}, 'simulation', base, 'seoyeon', 'staff-6')
  const people = applyAppearances(base, 'simulation', choice)
  const first = people.find(person => person.id === 'seoyeon')!
  const other = people.find(person => person.id === 'yuna')!

  assert.deepEqual([first.name, first.role, first.home, first.color], [base[0].name, base[0].role, base[0].home, base[0].color])
  assert.equal(first.sprite, 'staff-6')
  assert.deepEqual(first.restArt, base.find(person => person.id === 'yuna')?.restArt)
  assert.equal(other.sprite, 'staff-1')
  assert.equal(other.restArt, undefined)
  assert.equal(new Set(people.map(person => person.sprite)).size, base.length)

  const restored = chooseAppearance(choice, 'simulation', people, 'seoyeon', 'staff-1')
  assert.deepEqual(applyAppearances(base, 'simulation', restored).map(person => person.sprite), base.map(person => person.sprite))
})

test('파일 근무표가 다시 정렬되어도 이름에 해당하는 외형을 발견하고 시뮬레이션 외형과 섞지 않는다', () => {
  const date = '2026-11-24'
  const csv = '이름,출근,퇴근\n'
  const first = parseRoster(csv + '김한나,09:00,18:00\n박별,09:00,18:00', date, 16)
  const second = parseRoster(csv + '박별,09:00,18:00\n김한나,09:00,18:00', date, 16)
  const source = createRosterData(first, demo, { date, minute: 600 })
  const choice = chooseAppearance({}, 'connected', source.people, source.people[0].id, 'staff-14')
  const reordered = createRosterData(second, demo, { date, minute: 600 })

  const people = applyAppearances(reordered.people, 'connected', choice)
  assert.equal(people.find(person => person.name === '김한나')?.sprite, 'staff-14')
  assert.equal(people.find(person => person.name === '박별')?.sprite, 'staff-1')
  assert.equal(applyAppearances(demo.people, 'simulation', choice)[0].sprite, 'staff-1')
})

test('외형을 저장해도 시계와 캐릭터의 업무 위치가 유지되고 나중에 다시 배치해도 외형이 남는다', () => {
  const board = createSimulation(demo)
  board.step(16_700)
  const motion = board.actors.find(actor => actor.person.id === 'junho')!
  assert.ok(motion.moving)
  const prior = { x: motion.x, y: motion.y, minute: board.minute, time: board.time, activity: motion.activity }
  const choice = chooseAppearance({}, 'simulation', demo.people, 'junho', 'staff-14')
  board.setAppearances(applyAppearances(demo.people, 'simulation', choice))
  assert.deepEqual({ x: motion.x, y: motion.y, minute: board.minute, time: board.time, activity: motion.activity }, prior)
  assert.equal(motion.person.sprite, 'staff-14')
  board.setStaffing(['junho'])
  assert.equal(board.actors.find(actor => actor.person.id === 'junho')?.person.sprite, 'staff-14')
})

test('표시 이름은 근무표의 원본 이름과 연결 키를 보존하며 기본 이름으로 복원할 수 있다', () => {
  const date = '2026-11-24'
  const source = createRosterData(parseRoster('이름,출근,퇴근\n김한나,09:00,18:00\n박별,09:00,18:00', date, 16), demo,
    { date, minute: 600 })
  const [person] = source.people
  const names = chooseDisplayName({}, 'connected', source.people, person.id, '   한나  약사  ')
  const [renamed] = applyDisplayNames(source.people, 'connected', names)
  assert.equal(staffName(renamed), '한나 약사')
  assert.equal(renamed.name, '김한나')
  assert.equal(staffKey(renamed, 'connected'), staffKey(person, 'connected'))
  assert.throws(() => chooseDisplayName(names, 'connected', source.people, person.id, '박별'), /다른 직원/)

  const swapped = chooseAppearance({}, 'connected', [renamed, source.people[1]], person.id, 'staff-17')
  const board = createSimulation(source)
  board.setAppearances(applyDisplayNames(applyAppearances(source.people, 'connected', swapped), 'connected', names))
  assert.equal(staffName(board.actors[0].person), '한나 약사')
  assert.equal(board.actors[0].person.sprite, 'staff-17')
  const restored = chooseDisplayName(names, 'connected', source.people, person.id, '')
  board.setAppearances(applyDisplayNames(source.people, 'connected', restored))
  assert.equal(staffName(board.actors[0].person), '김한나')
})
