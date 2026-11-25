import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSimulation, getDuty, resolveActivity } from './simulation.ts'
import { activities, demo } from './data.ts'
import { staffGreetings } from './staff-greetings.ts'
import { createMascots, mascotMessage, walkMascots } from './mascots.ts'
import { compoundingVisit, hasCheckoutBag } from './staff-personalities.ts'
import { actorAnchor, checkoutPose, coffeeBreakPose, consultationPose, cottageSeat, dispensingPose, guidancePose, lunchPose, packingPose, stockBoxPose, syrupPourPose, walkingPose } from './characters.ts'
import { isWalkable, isWalkableAt, project, stations, stockShelfSlot, WORLD_HEIGHT, WORLD_WIDTH } from './layout.ts'

test('근무표와 업무 지시를 따로 읽고, 확인되지 않은 실제 업무는 대기로 표시한다', () => {
  assert.equal(getDuty({ start: 540, end: 1080 }, 539), 'before')
  assert.equal(getDuty({ start: 540, end: 1080 }, 540), 'working')
  assert.equal(getDuty({ start: 540, end: 1080 }, 1080), 'departed')
  assert.equal(getDuty(null, 540), 'off')
  assert.equal(getDuty(undefined, 540), 'unconfirmed')
  assert.equal(resolveActivity('unconfirmed', 'syrup'), 'unknown')
  assert.equal(resolveActivity('working', undefined), 'unknown')
  assert.equal(resolveActivity('working', 'wander'), 'unknown')
  assert.equal(resolveActivity('off', 'syrup'), 'dayoff')
  assert.equal(resolveActivity('working', 'coffee'), 'coffee')
})

test('직접 옮긴 직원은 해당 업무 공간으로 걸어간다', () => {
  const board = createSimulation(demo)
  const employee = board.actors.find(({ person }) => person.id === 'seoyeon')!
  assert.equal(board.placeStaff(employee.person.id, 'checkout'), true)
  assert.equal(employee.target, 'checkout')
  assert.equal(employee.activity, 'dispense')
  assert.equal(employee.moving, true)
  board.step(12_000)
  assert.equal(employee.activity, 'checkout')
  assert.equal(employee.zone, 'checkout')
  board.step(30_000)
  assert.equal(employee.activity, 'checkout')
})

test('별장에 놓은 직원은 휴무가 되고 기존 휴무자도 약국으로 옮겨 근무할 수 있다', () => {
  const board = createSimulation(demo)
  const employee = board.actors[0]
  assert.equal(board.placeStaff(employee.person.id, 'dayoff'), true)
  assert.deepEqual([employee.duty, employee.activity, employee.zone, employee.present], ['off', 'dayoff', 'cottage', true])
  assert.equal(board.actors.filter(actor => actor.duty === 'off' && actor.present).length, 2)
  board.step(85_000)
  assert.equal(employee.duty, 'off')
  assert.equal(board.placeStaff('yuna', 'checkout'), true)
  assert.equal(board.actors.find(actor => actor.person.id === 'yuna')!.duty, 'working')
  assert.equal(board.placeStaff(employee.person.id, 'stock'), true)
  assert.deepEqual([employee.duty, employee.activity, employee.zone], ['working', 'stock', 'stock'])
  board.setDutyOverrides([])
  assert.equal(board.actors.find(actor => actor.person.id === 'yuna')!.duty, 'off')
})

test('강아지와 고양이는 통로를 산책하고 번갈아 응원한다', () => {
  const board = createSimulation(demo)
  assert.deepEqual(board.mascots.map(pet => pet.id), ['dog', 'cat'])
  const start = board.mascots.map(pet => [pet.x, pet.y])
  const messages = new Set<string>()
  for (let step = 0; step < 2800; step++) {
    board.step(25)
    const speaking = board.mascots.filter(pet => mascotMessage(pet, board.time))
    assert.ok(speaking.length <= 1)
    if (speaking[0]) messages.add(speaking[0].id)
    for (const pet of board.mascots) {
      assert.ok(isWalkableAt(pet.x, pet.y))
      for (const actor of [...board.actors.filter(actor => actor.present), ...board.mascots.filter(other => other !== pet)]) {
        assert.ok(Math.hypot(pet.x - actor.x, pet.y - actor.y) >= .49)
      }
    }
  }
  assert.notDeepEqual(board.mascots.map(pet => [pet.x, pet.y]), start)
  assert.deepEqual([...messages], ['dog', 'cat'])
  assert.equal(board.actors.length, 16)
})

test('정민은 휴게 공간에서 다른 직원보다 1.5배 자주 다과를 먹으며 체력을 회복한다', () => {
  const [first, second] = demo.people
  const people = [{ ...first, displayName: '정민' }, second]
  const assignments = {
    [first.id]: [{ at: 0, activity: 'coffee' as const }],
    [second.id]: [{ at: 0, activity: 'coffee' as const }],
  }
  const board = createSimulation({ ...demo, people, assignments })
  const [jeongmin, coworker] = board.actors
  assert.equal(jeongmin.zone, 'lounge')
  const beforeEating = jeongmin.stamina!.value
  board.step(4000)
  assert.equal(jeongmin.stamina!.bites, 1)
  assert.ok(jeongmin.stamina!.value > beforeEating)
  board.step(116_000)
  assert.deepEqual([jeongmin.stamina!.bites, coworker.stamina!.bites], [15, 10])
  assert.ok(jeongmin.stamina!.value <= 100)

  const connected = createSimulation({ ...demo, source: 'connected', people, assignments })
  connected.step(12_000)
  assert.ok(connected.actors.every(actor => actor.stamina === null))
})

test('실장님은 일을 살피고 휴게 공간의 직원에게 말한 뒤 간식을 다시 채운다', () => {
  const board = createSimulation(demo)
  const manager = board.actors[0]
  board.setAppearances(demo.people.map(person => person === demo.people[0] ? { ...person, displayName: '실장님' } : person))
  let supervised = false
  let reminded = false
  const visited = new Set()
  let previous = manager.activity
  const refills: number[] = []
  for (let i = 0; i < 13_600; i++) {
    board.step(25)
    assert.ok(isWalkableAt(manager.x, manager.y))
    supervised ||= board.actors.some(actor => actor !== manager && actor.workRate === 1.2 && actor.workTimeBonus > 0)
    reminded ||= Boolean(manager.remark)
    if (manager.activity === 'inspect' && !manager.moving) visited.add(manager.tile.join(','))
    if (manager.activity === 'refill' && !manager.moving && previous !== 'refill') refills.push(board.time)
    previous = manager.activity
    assert.ok(board.actors.filter(actor => actor.duty !== 'working' || actor.moving).every(actor => actor.workRate === 1))
  }
  assert.ok(supervised && reminded)
  assert.ok(visited.size >= 3)
  assert.ok(refills.length >= 2 && refills.length <= 3)
  assert.ok(refills[0] >= 70_000)
  assert.ok(refills.slice(1).every((time, index) => time - refills[index] >= 120_000))
})

test('정민은 간식 보충을 가끔 알아차리고 먹은 뒤 업무로 돌아가며 직접 배치를 따른다', t => {
  let roll = .39
  t.mock.method(Math, 'random', () => roll)
  const [first, second] = demo.people
  const people = demo.people.map(person => person === first ? { ...person, displayName: '실장님' }
    : person === second ? { ...person, displayName: '정민' } : person)
  const data = { ...demo, people, assignments: { ...demo.assignments, [second.id]: [{ at: 0, activity: 'dispense' as const }] } }
  for (const [chance, placed] of [[.39, false], [.4, false], [.39, true]] as const) {
    roll = chance
    const board = createSimulation(data)
    const [manager, jeongmin] = board.actors
    let noticed = false
    let wasRestocking = false
    for (let time = 25; time <= 105_000; time += 25) {
      if (time === 68_000 && placed) assert.ok(board.placeStaff(second.id, 'office'))
      board.step(25)
      wasRestocking ||= manager.target === 'refill'
      if (jeongmin.target === 'coffee') {
        assert.ok(wasRestocking)
        noticed = true
      }
      assert.ok(isWalkableAt(jeongmin.x, jeongmin.y))
    }
    assert.ok(wasRestocking)
    assert.equal(noticed, chance < .4 && !placed)
    assert.equal(jeongmin.stamina!.bites, noticed ? 1 : 0)
    assert.equal(jeongmin.activity, placed ? 'office' : 'dispense')
  }
})

test('국장님은 직원 세 명부터 분업을 지시하고 지원 업무로 보내며 공동 조제를 유지한다', () => {
  const names = ['국장님', '혜미', '혜빈']
  const people = demo.people.map((person, index) => names[index] ? { ...person, displayName: names[index] } : person)
  const selected = people.slice(0, 4).map(person => person.id)
  for (const location of ['office', 'dispense'] as const) {
    const assignments = { ...demo.assignments }
    for (const [index, person] of people.slice(0, 4).entries()) {
      assignments[person.id] = [{ at: 0, activity: index === 0 ? location : 'dispense' }]
    }
    const data = { ...demo, people, assignments }
    const smallerTeam = createSimulation(data, demo.initialMinute, selected.slice(0, 3))
    smallerTeam.step(5000)
    assert.equal(smallerTeam.actors[0].remark, null)

    const board = createSimulation(data, demo.initialMinute, selected)
    const [director, hyemi, hyebin, extra] = board.actors
    board.step(1000)
    assert.equal(director.remark, null)
    board.step(4000)
    const remark = director.remark ?? ''
    assert.match(remark, /두 분은 조제를 이어가고.*분업/)
    assert.equal(remark.startsWith('조제 공간, '), location === 'office')
    assert.ok([hyemi, hyebin].every(actor => actor.target === 'dispense' && actor.workAccuracy === .9))
    assert.equal(extra.target, 'counsel')
    for (let i = 0; i < 240; i++) {
      board.step(25)
      assert.ok(isWalkableAt(extra.x, extra.y))
      assert.ok([director, hyemi, hyebin].every(actor => Math.hypot(actor.x - extra.x, actor.y - extra.y) >= .33))
    }
    assert.equal(director.remark, null)
    assert.equal(extra.activity, 'counsel')
    assert.equal(extra.zone, 'counsel')
    board.step(16_000)
    assert.equal(extra.activity, 'counsel')
    assert.ok(board.placeStaff(extra.person.id, 'office'))
    assert.equal(extra.target, 'office')
    board.step(13_000)
    assert.equal(extra.activity, 'office')
    assert.equal(director.remark, null)
    assert.ok([hyemi, hyebin].every(actor => actor.target === 'dispense'))
  }
})

test('직접 모아둔 네 직원도 분업 지시 후 두 업무 공간에 나뉜다', () => {
  const people = demo.people.map((person, index) => index === 0 ? { ...person, displayName: '국장님' } : person)
  const selected = people.slice(0, 5).map(person => person.id)
  const board = createSimulation({ ...demo, people }, demo.initialMinute, selected)
  const workers = board.actors.slice(1, 5)
  board.setPlacementHeld(true)
  for (const worker of workers) assert.ok(board.placeStaff(worker.person.id, 'dispense'))
  board.step(15_000)
  assert.ok(workers.every(worker => worker.activity === 'dispense' && worker.target === 'dispense'))
  board.setPlacementHeld(false)
  board.step(3500)
  const relocated = workers.filter(worker => worker.target !== 'dispense')
  assert.equal(relocated.length, 2)
  assert.equal(new Set(relocated.map(worker => worker.target)).size, 2)
  assert.ok(relocated.some(worker => worker.moving && worker.remark?.includes('지원하러')))
  board.step(13_000)
  assert.ok(relocated.every(worker => !worker.moving && worker.activity === worker.target))
  assert.equal(workers.filter(worker => worker.zone === 'dispense').length, 2)
})

test('윤희의 작은 봉투는 실제 계산 자세에서만 보인다', () => {
  const board = createSimulation(demo)
  const cashier = board.actors.find(actor => actor.activity === 'checkout')!
  const yunhui = { ...cashier, person: { ...cashier.person, displayName: '윤희' } }
  assert.equal(hasCheckoutBag(cashier), false)
  assert.equal(hasCheckoutBag(yunhui), true)
  assert.equal(hasCheckoutBag({ ...yunhui, moving: true }), false)
  assert.equal(hasCheckoutBag({ ...yunhui, zone: 'lounge', activity: 'coffee', target: 'coffee' }), false)
})

test('혜미와 혜빈은 조제 자리를 두 배 자주 바꾸고 함께 있을 때만 협업 보정을 받는다', () => {
  const board = createSimulation(demo)
  board.setAppearances(demo.people.map((person, index) => index < 2
    ? { ...person, displayName: index === 0 ? '혜미' : '혜빈' } : person))
  const [hyemi, hyebin] = board.actors
  board.step(11_000)
  assert.ok([hyemi, hyebin].every(actor => actor.zone === 'dispense' && actor.workRate === 1.5 && actor.workAccuracy === .9))
  assert.notDeepEqual(compoundingVisit(0, 24_000), compoundingVisit(0, 0))
  assert.notDeepEqual(compoundingVisit(1, 24_000), compoundingVisit(1, 0))
  assert.equal(compoundingVisit(-1, 24_000), compoundingVisit(-1, 0))
  assert.notDeepEqual(compoundingVisit(-1, 48_000), compoundingVisit(-1, 0))
  assert.ok(board.placeStaff(hyebin.person.id, 'office'))
  board.step(12_000)
  assert.equal(hyebin.zone, 'office')
  assert.equal(hyemi.workRate, 1)
  assert.equal(hyemi.workAccuracy, .6)
})

test('코코는 윤희가 보일 때 70% 경계에서 따라가기와 산책을 고르고 안전 거리를 지킨다', () => {
  const board = createSimulation(demo)
  const first = board.actors[0]
  const yunhui = { ...first, person: { ...first.person, displayName: '윤희' } }
  const [dog, coco] = createMascots()
  const [otherDog, patrolCat] = createMascots()
  for (let time = 25; time <= 16_000; time += 25) {
    walkMascots([dog, coco], [yunhui], time, 25, () => .69)
    walkMascots([otherDog, patrolCat], [yunhui], time, 25, () => .70)
    assert.ok(isWalkableAt(coco.x, coco.y))
    assert.ok(Math.hypot(coco.x - yunhui.x, coco.y - yunhui.y) >= .49)
  }
  assert.equal(coco.following, yunhui.person.id)
  assert.equal(patrolCat.following, null)
  assert.ok(Math.hypot(coco.x - yunhui.x, coco.y - yunhui.y) <= 1.5)
  assert.ok(Math.hypot(patrolCat.x - yunhui.x, patrolCat.y - yunhui.y) > 2)
  yunhui.present = false
  for (let time = 16_025; time <= 17_000; time += 25) walkMascots([dog, coco], [yunhui], time, 25, () => 0)
  assert.equal(coco.following, null)
})

test('직접 배치 1분 뒤 직원들이 번갈아 둘러보고 새 수동 배치를 우선한다', () => {
  const board = createSimulation(demo)
  const employee = board.actors[0]
  assert.ok(board.placeStaff(employee.person.id, 'checkout'))
  board.step(59_975)
  assert.ok(board.isDirectlyPlaced(employee.person))
  assert.equal(board.freeWalking, false)
  board.step(25)
  assert.equal(board.freeWalking, true)
  assert.equal(board.isDirectlyPlaced(employee.person), false)
  assert.equal(employee.target, 'wander')
  assert.equal(employee.moving, true)
  const hikers = new Set<string>()
  for (let step = 0; step < 1800; step++) {
    board.step(25)
    const walking = board.actors.filter(actor => actor.target === 'wander')
    assert.ok(walking.length <= 1)
    for (const actor of walking) {
      assert.ok(isWalkableAt(actor.x, actor.y))
      hikers.add(actor.person.id)
    }
  }
  assert.ok(hikers.size > 1)
  assert.ok(board.placeStaff(employee.person.id, 'counsel'))
  assert.equal(board.freeWalking, false)
  assert.equal(employee.target, 'counsel')
})

test('직원을 잡고 있거나 새로 옮기는 동안에는 자동 배치가 다시 시작되지 않는다', () => {
  const board = createSimulation(demo)
  const [first, second] = board.actors
  assert.ok(board.placeStaff(first.person.id, 'checkout'))
  board.step(55_000)
  board.setPlacementHeld(true)
  board.step(65_000)
  assert.ok(board.isDirectlyPlaced(first.person))
  board.setPlacementHeld(false)
  board.step(55_000)
  assert.ok(board.placeStaff(second.person.id, 'office'))
  board.step(59_975)
  assert.ok(board.isDirectlyPlaced(first.person))
  assert.ok(board.isDirectlyPlaced(second.person))
  board.step(25)
  assert.equal(board.isDirectlyPlaced(first.person), false)
  assert.equal(board.isDirectlyPlaced(second.person), false)
})

test('시럽 담당의 업무는 이동이 끝난 후에만 새 배정으로 바뀐다', () => {
  const simulation = createSimulation(demo)
  const employee = simulation.actors.find(actor => actor.person.id === 'junho')!
  assert.equal(String(employee.activity), 'syrup')
  let walking = false
  let arrived = false
  for (let step = 0; step < 1200; step++) {
    simulation.step(50)
    if (employee.target === 'office' && employee.moving) {
      walking = true
      assert.equal(String(employee.activity), 'syrup')
    }
    if (employee.activity === 'office') arrived = true
  }
  assert.ok(walking)
  assert.ok(arrived)
})

test('걸음은 서서히 시작하고 도착한 뒤 발을 내리며 정지한다', () => {
  const board = createSimulation(demo)
  const actor = board.actors.find(person => person.person.id === 'junho')!
  while (!actor.moving && board.time < 25_000) board.step(25)
  assert.ok(actor.moving)
  const starting = walkingPose(actor, board.time, false)
  assert.ok(starting.weight > 0 && starting.weight < .25)
  board.step(175)
  assert.equal(walkingPose(actor, board.time, false).weight, 1)
  assert.equal(walkingPose(actor, board.time, true).weight, 0)
  while (actor.moving && board.time < 36_000) board.step(25)
  assert.equal(actor.activity, 'office')
  const stopping = walkingPose(actor, board.time, false)
  assert.ok(stopping.weight > .25 && stopping.weight < 1)
  board.step(200)
  assert.equal(walkingPose(actor, board.time, false).weight, 0)
})

test('방향 전환은 이전 모습에서 시작하고 폭을 잠깐 줄인 뒤 새 방향에 도달한다', () => {
  const board = createSimulation(demo)
  let observed = false
  for (let step = 0; step < 2400; step++) {
    const previous = board.actors.map(actor => actor.facing)
    board.step(25)
    const actor = board.actors.find((person, index) => person.moving && person.facing !== previous[index])
    if (!actor) continue
    const time = board.time
    assert.equal(walkingPose(actor, time, false).facing, -actor.facing)
    assert.ok(walkingPose(actor, time + 95, false).width < .87)
    assert.equal(walkingPose(actor, time + 200, false).facing, actor.facing)
    assert.equal(walkingPose(actor, time + 200, false).width, 1)
    assert.equal(walkingPose(actor, time, true).facing, actor.facing)
    observed = true
    break
  }
  assert.ok(observed)
})

test('휴무 별장의 벤치 독서는 소파와 해먹 자리와 분리되고 정원을 걸은 뒤 벤치로 돌아온다', () => {
  const board = createSimulation(demo)
  const reader = board.actors.find(actor => actor.person.id === 'taeho')!
  const resting = board.actors.find(actor => actor.person.id === 'yuna')!
  assert.equal(cottageSeat(reader), 'bench')
  assert.equal(cottageSeat(resting), 'sofa')
  assert.ok(isWalkable(reader.tile))
  assert.ok(actorAnchor(reader, 0).top > actorAnchor(resting, 0).top)

  board.step(20_300)
  assert.ok(reader.moving)
  assert.equal(cottageSeat(reader), null)
  board.step(9_700)
  assert.equal(reader.activity, 'dayoff')
  assert.equal(cottageSeat(reader), null)
  assert.equal(cottageSeat(resting), 'hammock')
  board.step(21_000)
  assert.equal(cottageSeat(reader), 'bench')
  assert.notDeepEqual(reader.tile, resting.tile)
})

test('시럽을 따르는 동안 병 입구가 컵 위에 있고 병과 컵의 액체 높이가 함께 바뀐다', () => {
  const resting = syrupPourPose(0)
  const lifted = syrupPourPose(.3)
  const pouring = syrupPourPose(.55)
  const finished = syrupPourPose(.78)
  const lowered = syrupPourPose(.99)
  assert.ok(lifted.bottle.y < resting.bottle.y - 15)
  assert.equal(resting.flow, 0)
  assert.equal(lifted.flow, 0)
  assert.ok(pouring.flow > .9)
  assert.ok(pouring.mouth.y < pouring.rim.y - 6)
  assert.ok(Math.abs(pouring.mouth.x - pouring.rim.x) < 3)
  assert.ok(pouring.cupLevel > resting.cupLevel)
  assert.ok(pouring.bottleLevel < resting.bottleLevel)
  assert.ok(finished.cupLevel > pouring.cupLevel)
  assert.equal(finished.flow, 0)
  assert.ok(lowered.bottle.y > finished.bottle.y)
  assert.equal(lowered.flow, 0)
  assert.equal(lowered.cupOpacity, 0)
})

test('조제 동작은 약병을 들어 라벨을 살핀 뒤 원래 높이로 내린다', () => {
  const ready = dispensingPose(.12)
  const checking = dispensingPose(.52)
  const lowered = dispensingPose(.96)
  assert.ok(checking.y < ready.y - 10)
  assert.ok(checking.angle > ready.angle)
  assert.ok(checking.checking > .9)
  assert.equal(lowered.checking, 0)
  assert.ok(lowered.y > checking.y + 12)
  assert.ok(lowered.opacity < checking.opacity)
})

test('포장지는 접힌 뒤에만 옆으로 옮겨지고 손 위치는 포장지를 따라간다', () => {
  const opened = packingPose(.24)
  const folding = packingPose(.44)
  const pressed = packingPose(.61)
  const placed = packingPose(.88)
  assert.equal(opened.seal, 0)
  assert.ok(folding.seal > 0 && folding.seal < 1)
  assert.equal(pressed.seal, 1)
  assert.equal(placed.seal, 1)
  assert.ok(pressed.near.x - pressed.packet.x > opened.near.x - opened.packet.x)
  assert.ok(placed.packet.x > pressed.packet.x + 10)
  assert.ok(placed.packet.y > pressed.packet.y + 8)
  assert.ok(Math.abs(placed.far.x - placed.packet.x) < 9)
  assert.equal(packingPose(1).opacity, 0)
})

test('계산 동작은 서로 다른 키를 눌러 입력하고 마지막 키를 누른 뒤 고개를 끄덕인다', () => {
  assert.equal(activities.checkout.pose, 'checkout')
  assert.equal(activities.office.pose, 'type')
  const before = checkoutPose(.19)
  const first = checkoutPose(.24)
  const second = checkoutPose(.4)
  const submit = checkoutPose(.57)
  const confirmed = checkoutPose(.77)
  assert.equal(before.activeKey, -1)
  assert.deepEqual([first.activeKey, second.activeKey, submit.activeKey], [0, 1, 5])
  assert.ok(first.finger.y > before.finger.y + 4)
  assert.ok(second.finger.x > first.finger.x + 4)
  assert.equal(submit.confirmation, 0)
  assert.equal(submit.nod, 0)
  assert.ok(confirmed.confirmation > .9)
  assert.ok(confirmed.nod > .9)
  assert.equal(confirmed.activeKey, -1)
  assert.ok(confirmed.finger.x < submit.finger.x - 12)
  assert.equal(checkoutPose(1).confirmation, 0)
})

test('상담은 설명하는 손짓을 내린 뒤 듣는 자세로 전환한다', () => {
  assert.equal(activities.counsel.pose, 'talk')
  assert.equal(activities.guidance.pose, 'guidance')
  const ready = consultationPose(.02)
  const explains = consultationPose(.33)
  const listens = consultationPose(.76)
  assert.ok(explains.hand.x > ready.hand.x + 12)
  assert.ok(explains.hand.y < ready.hand.y - 15)
  assert.equal(explains.nod, 0)
  assert.ok(listens.hand.y > explains.hand.y + 15)
  assert.ok(listens.nod > .8)
})

test('복약지도는 안내지를 든 채 위에서 아래로 항목을 짚는다', () => {
  const first = guidancePose(.28)
  const last = guidancePose(.66)
  const after = guidancePose(.99)
  assert.equal(first.row, 0)
  assert.equal(last.row, 2)
  assert.equal(first.leaflet.y, last.leaflet.y)
  assert.ok(last.finger.y > first.finger.y + 7)
  assert.ok(first.reach > .95)
  assert.ok(last.reach > .95)
  assert.ok(after.leaflet.y > last.leaflet.y + 8)
  assert.equal(after.reach, 0)
})

test('재고 상자는 손에 든 높이에서 선반에 맞춰 올린 뒤 손을 뗀다', () => {
  const shelf = { x: 32, y: -78 }
  const carried = stockBoxPose(0, shelf)
  const lifting = stockBoxPose(.39, shelf)
  const placed = stockBoxPose(.69, shelf)
  const released = stockBoxPose(.86, shelf)
  const reset = stockBoxPose(1, shelf)
  assert.ok(lifting.box.y < carried.box.y - 12)
  assert.equal(placed.box.x, shelf.x)
  assert.equal(placed.box.y, shelf.y)
  assert.ok(placed.box.width < carried.box.width)
  assert.ok(released.near.y > placed.near.y + 25)
  assert.equal(released.box.y, shelf.y)
  assert.equal(reset.box.opacity, 0)
  assert.equal(reset.nextOpacity, 1)
})

test('재고 근무 자리는 가까운 쪽 선반 칸에 대응한다', () => {
  const slots = stations.stock.map(tile => stockShelfSlot(tile))
  assert.equal(new Set(slots.map(slot => slot?.x)).size, stations.stock.length)
  assert.ok(slots.every(slot => slot && slot.x > 849 && slot.x < 993 && slot.y >= 452 && slot.y <= 474))
  assert.equal(stockShelfSlot(stations.lounge[0]), undefined)
})

test('휴식 동작은 잔을 입가에 가져간 뒤 내리고 두 손으로 기지개를 켠다', () => {
  const held = coffeeBreakPose(.12)
  const sipping = coffeeBreakPose(.36)
  const lowered = coffeeBreakPose(.61)
  const stretching = coffeeBreakPose(.84)
  assert.ok(sipping.mug.y < held.mug.y - 13)
  assert.ok(sipping.mug.angle < -.2)
  assert.equal(sipping.mugOpacity, 1)
  assert.equal(sipping.stretch, 0)
  assert.ok(lowered.mug.y > sipping.mug.y + 17)
  assert.equal(stretching.mugOpacity, 0)
  assert.equal(stretching.stretch, 1)
  assert.ok(stretching.near.x < -20 && stretching.far.x > 20)
  assert.ok(stretching.near.y < -65 && stretching.far.y < -65)
  assert.deepEqual(coffeeBreakPose(0).near, coffeeBreakPose(1).near)
})

test('식사 동작은 한 손으로 그릇을 받치며 숟가락을 그릇과 입가 사이로 움직인다', () => {
  const scoop = lunchPose(.18)
  const tasting = lunchPose(.53)
  const returning = lunchPose(.72)
  const ready = lunchPose(.94)
  assert.ok(Math.abs(scoop.spoon.x - scoop.bowl.x) < 4)
  assert.ok(Math.abs(scoop.spoon.y - (scoop.bowl.y - 6)) < 2)
  assert.ok(tasting.spoon.y < scoop.spoon.y - 16)
  assert.ok(tasting.food > .8 && tasting.nod > .8)
  assert.equal(returning.food, 0)
  assert.ok(returning.spoon.y > tasting.spoon.y)
  assert.deepEqual(tasting.support, scoop.support)
  assert.equal(ready.spoon.y, scoop.spoon.y)
  assert.ok(Math.hypot(tasting.hand.x - tasting.spoon.x, tasting.hand.y - tasting.spoon.y) < 10)
})

test('가까운 두 직원은 한 사람의 손인사 뒤에 상대가 끄덕이고 다음 동작으로 돌아간다', () => {
  const [first, second] = createSimulation(demo).actors
  const reader = { ...first, x: 5, y: 8, activity: 'prescription', target: 'prescription', moving: false } as const
  const colleague = { ...second, x: 6, y: 8, activity: 'syrup', target: 'syrup', moving: false } as const
  const together = [reader, colleague]
  const start = 25_600 - 1500
  const wave = staffGreetings(together, start + 500)
  assert.ok(wave.get(reader.index)!.wave > .95)
  assert.equal(wave.get(colleague.index)!.nod, 0)
  assert.equal(wave.get(colleague.index)!.direction, -1)
  const reply = staffGreetings(together, start + 1125)
  assert.ok(reply.get(colleague.index)!.nod > .95)
  assert.equal(reply.get(colleague.index)!.wave, 0)
  assert.equal(reply.get(reader.index)!.partnerId, colleague.person.id)
  assert.equal(staffGreetings(together, start + 1700).size, 0)
  assert.equal(staffGreetings([reader, { ...colleague, moving: true }], start + 500).size, 0)
  assert.equal(staffGreetings([reader, { ...colleague, x: 10 }], start + 500).size, 0)
})

test('서로 손이 필요한 작업 중이면 손인사를 시작하지 않고 한 직원에게 가장 가까운 상대만 연결한다', () => {
  const [first, second, third] = createSimulation(demo).actors
  const mixer = { ...first, x: 5, y: 8, activity: 'syrup', target: 'syrup' } as const
  const cashier = { ...second, x: 5.5, y: 8, activity: 'checkout', target: 'checkout' } as const
  assert.equal(staffGreetings([mixer, cashier], 24_600).size, 0)
  const reader = { ...mixer, activity: 'inventory', target: 'inventory' } as const
  const farther = { ...third, x: 6, y: 8, activity: 'stock', target: 'stock' } as const
  const present = staffGreetings([reader, farther, cashier], 24_125)
  assert.equal(present.size, 2)
  assert.equal(present.get(reader.index)?.partnerId, cashier.person.id)
})

test('가속 24시간 동안 직원 16명의 경로가 가구와 다른 직원의 자리를 피한다', () => {
  const simulation = createSimulation(demo, 0)
  assert.equal(simulation.actors.length, 16)
  const seen = new Set<string>()
  for (let step = 0; step < 144_000; step++) {
    simulation.step(50)
    for (const [index, actor] of simulation.actors.entries()) {
      assert.ok(isWalkable(actor.tile), JSON.stringify(actor.tile))
      assert.ok(isWalkableAt(actor.x, actor.y), actor.person.id)
      seen.add(actor.activity)
      for (const other of simulation.actors.slice(index + 1)) {
        assert.ok(Math.hypot(other.x - actor.x, other.y - actor.y) >= 0.33)
      }
    }
  }
  assert.equal(simulation.actors.filter(actor => actor.duty === 'off').length, 2)
  for (const key of ['before', 'departed', 'dayoff', 'coffee', 'office', 'stock', 'counsel', 'checkout', 'syrup', 'dispense']) {
    assert.ok(seen.has(key), key)
  }
})


test('모든 작업 자리는 새 실내 이미지의 범위 안에 있고 기본 장면에서 직원이 모두 보인다', () => {
  const simulation = createSimulation(demo)
  assert.equal(simulation.actors.length, 16)
  assert.equal(simulation.actors.filter(actor => actor.duty === 'working' || actor.duty === 'break').length, 14)
  assert.equal(simulation.actors.filter(actor => actor.zone === 'cottage').length, 2)
  for (const seats of Object.values(stations)) {
    for (const tile of seats) {
      assert.ok(isWalkable(tile), JSON.stringify(tile))
      const point = project(tile[0] / 2, tile[1] / 2)
      assert.ok(point.x > 16 && point.x < WORLD_WIDTH - 16 && point.y > 45 && point.y < WORLD_HEIGHT - 20)
    }
  }
})

test('인원과 직원을 직접 지정하면 시각을 유지하고 근무 배치만 바뀐다', () => {
  const simulation = createSimulation(demo)
  simulation.step(21_275)
  const minute = simulation.minute
  const time = simulation.time

  simulation.setStaffing(['yuna', 'jieun', 'unknown-id', 'yuna'])
  assert.equal(simulation.minute, minute)
  assert.equal(simulation.time, time)
  assert.deepEqual(simulation.actors.filter(actor => actor.duty === 'working' || actor.duty === 'break')
    .map(actor => actor.person.id), ['jieun', 'yuna'])
  assert.equal(simulation.actors.find(actor => actor.person.id === 'yuna')?.activity, 'office')
  assert.equal(simulation.actors.filter(actor => actor.duty === 'off' && actor.present).length, 2)

  simulation.setStaffing([])
  assert.equal(simulation.actors.filter(actor => actor.duty === 'off').length, 16)
  assert.equal(simulation.actors.filter(actor => actor.present).length, 2)

  simulation.setStaffing(demo.people.map(person => person.id))
  assert.equal(simulation.actors.filter(actor => actor.present && actor.duty !== 'off').length, 16)
  assert.equal(new Set(simulation.actors.map(({ tile }) => tile.join(','))).size, 16)
  simulation.step((1160 - minute) * demo.millisecondsPerMinute)
  assert.equal(simulation.minute, 1160)
  assert.ok(simulation.actors.every(actor => actor.duty === 'working' || actor.duty === 'break'))

  simulation.setStaffing(null)
  assert.equal(simulation.actors.filter(actor => actor.duty === 'off').length, 2)
})
