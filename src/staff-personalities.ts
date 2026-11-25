import { activities, staffName, workAreaLabel } from './data.ts'
import type { Activity, Person, Zone } from './data.ts'
import type { Tile } from './layout.ts'
import type { Actor } from './simulation.ts'

const nameOf = (person: Person) => staffName(person).trim().normalize('NFC')
export const isManager = (person: Person) => nameOf(person) === '실장님'
export const isDirector = (person: Person) => nameOf(person) === '국장님'
export const isJeongmin = (person: Person) => nameOf(person) === '정민'
export function partnerSlot(person: Person) {
  const name = nameOf(person)
  return name === '혜미' ? 0 : name === '혜빈' ? 1 : -1
}

export const inspectionStops: readonly Tile[] = [[9, 16], [14, 16], [17, 16], [29, 18], [20, 24], [10, 20], [25, 18]]
export const refillStops: readonly Tile[] = [[28, 23], [30, 24], [29, 25], [31, 24]]
const reminders = ['조금만 쉬고 와요!', '간식 먹고 다시 모여요!', '휴식 끝나면 자리로!']
const work = new Set<Activity>(['dispense', 'prescription', 'pack', 'syrup', 'checkout', 'counsel', 'guidance', 'stock', 'inventory', 'office', 'pastry'])
const workSlotInterval = 48_000
export const maxWorkersPerArea = 2

export function hasCheckoutBag(actor: Actor) {
  return !actor.moving && actor.zone === 'checkout' && actor.activity === 'checkout' &&
    actor.target === 'checkout' && nameOf(actor.person) === '윤희'
}

export function compoundingVisit(partner: number, time: number) {
  if (partner < 0) return Math.floor(time / workSlotInterval)
  const rotation = Math.floor(time / (workSlotInterval / 2))
  return [[0, 2], [3, 1]][rotation % 2][partner]
}

export function preferCompounding(person: Person, time: number) {
  return Math.floor(time / (workSlotInterval / 2)) % 4 < 3 && partnerSlot(person) >= 0
}

type ManagerAssignment = { actor: Actor; activity: 'inspect' | 'refill'; visit: number; startedAt: number; arrivedAt?: number }

export function createManagerRoutine() {
  let assignment: ManagerAssignment | null = null
  let inspection = 0
  let inspectionsSinceRefill = 0
  let nextAt = 0
  let nextRefillAt = 70_000
  return {
    update(manager: Actor | undefined, time: number) {
      if (!manager || (assignment && assignment.actor !== manager)) assignment = null
      if (!manager) return null
      if (assignment) {
        if (assignment.arrivedAt === undefined && manager.activity === assignment.activity &&
          manager.visit === assignment.visit && !manager.moving) {
          assignment.arrivedAt = time
          if (assignment.activity === 'refill') nextRefillAt = time + 120_000
        }
        const stay = assignment.activity === 'refill' ? 5600 : 2300
        if (time - (assignment.arrivedAt ?? time) < stay && time - assignment.startedAt < 18_000) return assignment
        assignment = null
        nextAt = time + 800
      }
      if (time < nextAt) return null
      const refill = time >= nextRefillAt && inspectionsSinceRefill >= 4
      if (refill) {
        inspectionsSinceRefill = 0
        nextRefillAt = time + 120_000
      } else inspectionsSinceRefill++
      assignment = { actor: manager, activity: refill ? 'refill' : 'inspect',
        visit: refill ? 0 : inspection++ % inspectionStops.length, startedAt: time }
      return assignment
    },
  }
}

export function createSnackDetour() {
  let observed: ManagerAssignment | null = null
  let visit: { actor: Actor; startsAt: number; deadline: number; bites: number; returnAt?: number } | null = null
  return (managerVisit: ManagerAssignment | null, employee: Actor | undefined, time: number) => {
    const refill = managerVisit?.activity === 'refill' ? managerVisit : null
    if (refill !== observed) {
      observed = refill
      if (refill && employee?.stamina && !visit && Math.random() < .4) {
        visit = { actor: employee, startsAt: time + 1600, deadline: time + 22_000, bites: employee.stamina.bites }
      }
    }
    if (!visit) return
    if (employee !== visit.actor || !employee.stamina) {
      visit = null
      return
    }
    if (employee.stamina.bites > visit.bites) visit.returnAt ??= time + 1500
    if (time >= (visit.returnAt ?? visit.deadline)) {
      visit = null
      return
    }
    if (time >= visit.startsAt) return employee
  }
}

export function createCrowdReminder(divideWork: (region: Zone, workers: readonly Actor[], keepTogether: readonly Actor[]) => boolean) {
  let region: Zone | undefined
  let crowdedSince = 0
  let nextRemarkAt = 0
  let message: { text: string; until: number } | undefined
  let nextCheck = 0
  let speaker: Actor | undefined
  return (director: Actor | undefined, actors: readonly Actor[], partners: readonly Actor[], time: number) => {
    if (speaker !== director) {
      speaker = director
      region = undefined
      message = undefined
      nextCheck = time
    }
    if (!director) return
    if (time >= nextCheck) {
      nextCheck = time + 250
      const groups = new Map<Zone, Actor[]>()
      let crowded: Zone | undefined
      let largest = maxWorkersPerArea
      for (const actor of actors) {
        if (actor === director || !readyToWork(actor)) continue
        let group = groups.get(actor.zone)
        if (!group) groups.set(actor.zone, group = [])
        group.push(actor)
        if (group.length > largest) {
          crowded = actor.zone
          largest = group.length
        }
      }
      if (region !== crowded) {
        region = crowded
        crowdedSince = time
      }
      if (region && time >= nextRemarkAt && time - crowdedSince >= 1750) {
        const teamInLab = region === 'dispense' && partners.length === 2 &&
          partners.every(actor => actor.zone === 'dispense' && readyToWork(actor))
        if (divideWork(region, groups.get(region)!, teamInLab ? partners : [])) {
          const address = region !== director.zone ? workAreaLabel(region) + ', ' : teamInLab ? '' : '한곳에 몰렸어요. '
          const instruction = teamInLab ? '두 분은 조제를 이어가고, 나머진 분업해요!' : '일을 좀 나눠요!'
          message = { text: address + instruction, until: time + 4000 }
          nextRemarkAt = time + 45_000
        }
      }
    }
    if (message && time < message.until) director.remark = message.text
  }
}

export function updateStaffPersonalities(actors: readonly Actor[], manager: Actor | undefined,
  partners: readonly Actor[], time: number, delta: number) {
  const together = partners.length === 2 && partners.every(actor => readyToWork(actor) && actor.zone === 'dispense')
    && Math.hypot(partners[0].x - partners[1].x, partners[0].y - partners[1].y) < 2.1
  for (const actor of actors) {
    const working = readyToWork(actor)
    const partner = working && partners.includes(actor)
    const collaborating = partner && together
    const supervised = working && manager && actor !== manager && Math.hypot(actor.x - manager.x, actor.y - manager.y) <= 1.8
    actor.workRate = (collaborating ? 1.5 : 1) * (supervised ? 1.2 : 1)
    actor.workAccuracy = partner ? (collaborating ? .9 : .6) : null
    actor.workTimeBonus += (actor.workRate - 1) * delta
    actor.remark = null
  }
  if (manager?.activity === 'refill' && manager.target === 'refill' && !manager.moving &&
    time - manager.changedAt < 2300 && actors.some(actor => actor !== manager && actor.present &&
    actor.zone === 'lounge' && actor.duty === 'break' && !actor.moving)) {
    manager.remark = reminders[Math.floor(manager.changedAt / 13_000) % reminders.length]
  }
}

function readyToWork(actor: Actor) {
  return actor.present && !actor.moving && actor.duty === 'working' && actor.target === actor.activity && work.has(actor.activity)
}

export function personalityStatus(actor: Actor) {
  if (actor.remark) return actor.remark
  if (actor.target === 'inspect') return activities.inspect.label
  if (actor.target === 'refill') return actor.moving ? '간식 가져오는 중' : activities.refill.label
  if (actor.workAccuracy === .9) return '협업 조제 중'
}
