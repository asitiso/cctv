import { activities, displayOnlyActivities, workAreaLabel } from './data.ts'
import type { Activity, DataSource, Person, Shift, Zone } from './data.ts'
import { coffeeCounterX, cottageSeats, findPath, nearDoor, project, stations, tileKey, tilePoint, wanderStops, zoneSigns } from './layout.ts'
import type { Tile } from './layout.ts'
import { canPlaceStaff } from './staff-placement.ts'
import type { PlacementActivity, WorkPlacement } from './staff-placement.ts'
import { createMascots, reserveTiles, walkMascots } from './mascots.ts'
import { updateStamina } from './snack-breaks.ts'
import type { Stamina } from './snack-breaks.ts'
import { compoundingVisit, createCrowdReminder, createManagerRoutine, createSnackDetour, inspectionStops,
  isDirector, isJeongmin, isManager, maxWorkersPerArea, partnerSlot, preferCompounding, refillStops, updateStaffPersonalities } from './staff-personalities.ts'

export type Duty = 'before' | 'working' | 'break' | 'off' | 'departed' | 'unconfirmed'
export type DutyOverride = readonly [id: string, duty: 'working' | 'off']

export function getDuty(shift: Shift | null | undefined, minute: number): Exclude<Duty, 'break'> {
  if (shift === undefined) return 'unconfirmed'
  if (shift === null) return 'off'
  if (shift.end < shift.start) return minute >= shift.start || minute < shift.end ? 'working' : 'before'
  if (minute < shift.start) return 'before'
  return minute >= shift.end ? 'departed' : 'working'
}

export function resolveActivity(duty: Exclude<Duty, 'break'>, assignment?: Activity): Activity {
  if (duty === 'off') return 'dayoff'
  if (duty === 'unconfirmed') return 'unknown'
  if (duty !== 'working') return duty
  if (!assignment || displayOnlyActivities.some(activity => activity === assignment)) return 'unknown'
  return assignment
}

export const isBreak = (activity: Activity) => activity === 'coffee' || activity === 'lunch'

export type Actor = {
  person: Person
  index: number
  tile: Tile
  x: number
  y: number
  facing: 1 | -1
  turnedAt: number
  duty: Duty
  present: boolean
  activity: Activity
  target: Activity
  zone: Zone
  moving: boolean
  speed: number
  movement: number
  walkWeight: number
  changedAt: number
  visit: number
  retryAt: number
  leg: { to: Tile; fraction: number } | null
  stamina: Stamina | null
  workRate: number
  workTimeBonus: number
  workAccuracy: number | null
  remark: string | null
}

function assignmentAt(assignments: DataSource['assignments'], person: Person, minute: number) {
  let assigned: Activity | undefined
  let last = -1
  for (const task of assignments[person.id] ?? []) {
    if (task.at <= minute && task.at > last && (task.until === undefined || minute < task.until)) {
      assigned = task.activity
      last = task.at
    }
  }
  return assigned
}

function zoneFor(person: Person, activity: Activity, source: DataSource['source']): Zone {
  if (activity === 'unknown' && source === 'connected') return 'standby'
  const zone = activities[activity].zone
  return zone === 'home' ? person.home : zone
}

function facingStation(zone: Zone, tile: Tile, activity?: Activity): 1 | -1 {
  if (zone === 'arrival' || zone === 'cottage' || zone === 'standby') return 1
  const feet = tilePoint(tile)
  const destinationX = activity === 'refill' ? coffeeCounterX : zoneSigns[zone].x
  return project(feet.x, feet.y).x < destinationX ? 1 : -1
}

function candidates(zone: Zone, visit: number, tiles = stations[zone]): Tile[] {
  const start = visit % tiles.length
  return [...tiles.slice(start), ...tiles.slice(0, start)]
}

const TICK_MS = 25
const DAY = 1440
export const PLACEMENT_IDLE_MS = 60_000

const startingActivity: Record<Person['home'], Activity> = {
  dispense: 'dispense', syrup: 'syrup', checkout: 'checkout', counsel: 'counsel',
  stock: 'stock', office: 'office', lounge: 'coffee', pastry: 'pastry',
}
const supportAreas = ['stock', 'office', 'checkout', 'counsel', 'dispense', 'syrup'] as const
type SupportAssignment = { activity: Activity; normalActivity: Activity; deadline: number; arrivedAt?: number }

export function createSimulation(data: DataSource, startMinute = data.initialMinute, selected: readonly string[] | null = null,
  initialPlacements: DataSource['assignments'] = {}, initialDuty: readonly DutyOverride[] = [],
  initialRoster: readonly string[] = data.people.map(person => person.id)) {
  let elapsed = 0
  let remainder = 0
  let minute = startMinute
  let door = 0
  let revision = 0
  let activeRoster = new Set(initialRoster)
  let staffing = selectedPeople(selected)
  let assignments = data.assignments
  let filePlacements = initialPlacements
  const demoPlacements = new Map<string, WorkPlacement>()
  let dutyOverrides = new Map(initialDuty)
  let lastPlacement = 0
  let lastPlacedIndex: number | null = null
  let placementHeld = false
  let nextWanderAt = Infinity
  let nextWalker = 0
  let wandering: { actor: Actor; stop: number; timeout: number; pauseUntil?: number } | undefined
  const managerRoutine = createManagerRoutine()
  const snackDetour = createSnackDetour()
  const supportAssignments = new Map<Actor, SupportAssignment>()
  const crowdReminder = createCrowdReminder(divideWork)
  let manager: Actor | undefined
  let director: Actor | undefined
  let jeongmin: Actor | undefined
  let snacking: Actor | undefined
  let partners: Actor[] = []
  let managerVisit: ReturnType<typeof managerRoutine.update> = null
  let people = data.people

  function selectedPeople(ids: readonly string[] | null) {
    return ids && data.source === 'simulation'
      ? new Set(data.people.filter(person => activeRoster.has(person.id) && ids.includes(person.id)).map(person => person.id))
      : null
  }

  function scheduledAttendanceOf(person: Person) {
    if (staffing) return staffing.has(person.id) ? 'working' : 'off'
    if ((data.carryUntil?.[person.id] ?? 0) > minute) return 'working'
    return getDuty(data.shifts[person.id], minute)
  }

  function attendanceOf(person: Person) {
    if (!activeRoster.has(person.id)) return 'unconfirmed'
    return dutyOverrides.get(person.id) ?? scheduledAttendanceOf(person)
  }

  function activityOf(person: Person, attendance: ReturnType<typeof getDuty>) {
    if (attendance === 'working') {
      const placed = placedActivity(person)
      if (placed) return placed
    } else {
      demoPlacements.delete(person.id)
    }
    const assignment = assignmentAt(assignments, person, minute)
    const activity = resolveActivity(attendance, assignment)
    return (staffing || dutyOverrides.get(person.id) === 'working') && attendance === 'working' &&
      (activity === 'unknown' || getDuty(data.shifts[person.id], minute) !== 'working')
      ? startingActivity[person.home] : activity
  }

  function placedActivity(person: Person) {
    return demoPlacements.get(person.id) ?? assignmentAt(filePlacements, person, minute)
  }

  function placeWork(actor: Actor, activity: WorkPlacement) {
    demoPlacements.set(actor.person.id, activity)
    if (data.source !== 'simulation') return
    lastPlacement = elapsed
    lastPlacedIndex = actor.index
    nextWanderAt = Infinity
    wandering = undefined
  }

  function cottageVisit(person: Person, index: number) {
    const strolling = data.source === 'simulation' && Math.floor((elapsed + index * 730) / 28_000) % 2 === 1
    const art = person.restArt
    if (!art) return strolling ? 3 : 1
    if ('bench' in art) return strolling ? 1 : stations.cottage.indexOf(cottageSeats.bench)
    return stations.cottage.indexOf(strolling ? cottageSeats.hammock : cottageSeats.sofa)
  }

  function cottageVisitors() {
    const priority = [...dutyOverrides.keys()]
    return new Set(people.filter(person => attendanceOf(person) === 'off')
      .sort((a, b) => priority.indexOf(b.id) - priority.indexOf(a.id)
        || Number(Boolean(b.restArt)) - Number(Boolean(a.restArt))
        || Number(data.shifts[b.id] === null) - Number(data.shifts[a.id] === null))
      .slice(0, 2).map(person => person.id))
  }

  function seedActors(): Actor[] {
    const started = new Set<number>()
    const visiting = cottageVisitors()
    return people.map((person, index) => {
      const attendance = attendanceOf(person)
      const activity = activityOf(person, attendance)
      const zone = zoneFor(person, activity, data.source)
      const present = attendance !== 'unconfirmed' && (attendance !== 'off' || visiting.has(person.id))
      const visit = zone === 'cottage' ? cottageVisit(person, index) : 0
      const tile = [...(present ? candidates(zone, visit) : []), ...candidates('arrival', 0)]
        .find(item => !started.has(tileKey(item)))
      if (!tile) throw new Error('직원 시작 위치가 부족합니다.')
      started.add(tileKey(tile))
      return {
        person, index, tile, ...tilePoint(tile), facing: facingStation(zone, tile), turnedAt: -Infinity, present,
        duty: isBreak(activity) ? 'break' : attendance, activity, target: activity, zone,
        moving: false, speed: 1.6 + (index % 3) * .10, movement: 0, walkWeight: 0,
        leg: null, changedAt: elapsed - 1000, retryAt: 0, visit,
        stamina: data.source === 'simulation' ? { value: 72, bites: 0, recoveredAt: null } : null,
        workRate: 1, workAccuracy: null, workTimeBonus: 0, remark: null,
      }
    })
  }

  const actors = seedActors()
  const mascots = createMascots()
  function refreshPersonalities() {
    if (data.source !== 'simulation') return
    const active = actors.filter(actor => activeRoster.has(actor.person.id))
    manager = active.find(actor => isManager(actor.person))
    director = active.find(actor => isDirector(actor.person))
    jeongmin = active.find(actor => isJeongmin(actor.person))
    partners = active.filter(actor => partnerSlot(actor.person) >= 0)
  }
  refreshPersonalities()
  function occupiedByOthers(actor: Actor) {
    const occupied = new Set<number>()
    for (const other of actors) {
      if (other.present && other !== actor) reserveTiles(occupied, other)
    }
    for (const pet of mascots) reserveTiles(occupied, pet)
    return occupied
  }

  function advanceActor(actor: Actor) {
    if (!actor.leg) return
    const from = tilePoint(actor.tile)
    const to = tilePoint(actor.leg.to)
    const distance = actor.speed * TICK_MS / 1000
    const progress = Math.min(1, actor.leg.fraction + distance * 2)
    actor.movement += (progress - actor.leg.fraction) / 2
    actor.leg.fraction = progress
    actor.x = from.x + (to.x - from.x) * progress
    actor.y = from.y + (to.y - from.y) * progress
    if (progress === 1) {
      actor.tile = actor.leg.to
      actor.leg = null
    }
  }

  function face(actor: Actor, facing: Actor['facing']) {
    if (actor.facing === facing) return
    actor.facing = facing
    actor.turnedAt = elapsed
  }

  function settle(actor: Actor, activity: Activity, zone: Zone) {
    if (actor.activity !== activity || actor.moving) {
      actor.changedAt = elapsed
      actor.workTimeBonus = 0
    }
    actor.moving = false
    face(actor, facingStation(zone, actor.tile, activity))
    actor.activity = activity
    actor.zone = zone
  }

  function updateDutyOverrides(next: readonly DutyOverride[]) {
    dutyOverrides = new Map(next)
    const visiting = cottageVisitors()
    for (const actor of actors) {
      if (attendanceOf(actor.person) !== 'off' || visiting.has(actor.person.id)) continue
      actor.present = false
      actor.leg = null
      settle(actor, 'dayoff', 'cottage')
      actor.duty = 'off'
      actor.target = 'dayoff'
      actor.remark = null
    }
    for (const actor of actors) {
      const duty = attendanceOf(actor.person)
      const goingToCottage = visiting.has(actor.person.id) && (actor.x < 20 || !actor.present)
      const returning = duty !== 'off' && actor.duty === 'off'
      if (!goingToCottage && !returning) continue
      const activity = activityOf(actor.person, duty)
      const destination = zoneFor(actor.person, activity, data.source)
      const visit = destination === 'cottage' ? cottageVisit(actor.person, actor.index) : 0
      const occupied = occupiedByOthers(actor)
      const position = candidates(destination, visit).find(tile => !occupied.has(tileKey(tile)))
      const tile = position ?? stations.arrival.find(tile => !occupied.has(tileKey(tile)))
      if (!tile) continue
      actor.leg = null
      actor.walkWeight = 0
      actor.retryAt = 0
      actor.remark = null
      actor.duty = isBreak(activity) ? 'break' : duty
      actor.present = duty !== 'unconfirmed'
      actor.tile = tile
      Object.assign(actor, tilePoint(tile))
      actor.visit = visit
      actor.target = activity
      settle(actor, position ? activity : 'unknown', position ? destination : 'arrival')
      actor.changedAt = elapsed
      actor.workTimeBonus = 0
      supportAssignments.delete(actor)
    }
    revision++
  }

  function divideWork(region: Zone, workers: readonly Actor[], keepTogether: readonly Actor[]) {
    if (placementHeld) return false
    const loads = new Map<Zone, number>()
    for (const actor of actors) {
      if (actor === director || !actor.present || attendanceOf(actor.person) !== 'working') continue
      const area = activities[actor.target].zone
      if (area !== 'home') loads.set(area, (loads.get(area) ?? 0) + 1)
    }
    const loadOf = (area: Zone) => loads.get(area) ?? 0
    const extras = workers.filter(actor => !keepTogether.includes(actor))
      .sort((a, b) => Number(a.person.home === region) - Number(b.person.home === region) || b.index - a.index)
    const needed = workers.length - maxWorkersPerArea
    let moved = 0
    for (const actor of extras) {
      const preferred = supportAreas.filter(area => area !== region && loadOf(area) < maxWorkersPerArea &&
        (actor.person.role === '약사' || (area !== 'dispense' && area !== 'syrup')))
        .sort((a, b) => loadOf(a) - loadOf(b) || Number(b === actor.person.home) - Number(a === actor.person.home))
      const blocked = occupiedByOthers(actor)
      const area = preferred.find(destination => stations[destination].some(tile => findPath(actor.tile, tile, blocked).length > 0))
      if (!area) continue
      demoPlacements.delete(actor.person.id)
      supportAssignments.set(actor, {
        activity: startingActivity[area], normalActivity: activityOf(actor.person, 'working'), deadline: elapsed + 20_000,
      })
      loads.set(area, loadOf(area) + 1)
      moved++
      if (moved === needed) break
    }
    return moved > 0
  }

  function supportActivity(actor: Actor, ordinary: Activity, attendance: ReturnType<typeof getDuty>) {
    const assignment = supportAssignments.get(actor)
    if (!assignment) return
    if (actor.activity === assignment.activity && !actor.moving) assignment.arrivedAt ??= elapsed
    const changed = ordinary !== assignment.normalActivity
    const missedArrival = assignment.arrivedAt === undefined && elapsed >= assignment.deadline
    const resume = changed && (isBreak(ordinary) || (assignment.arrivedAt !== undefined && elapsed - assignment.arrivedAt >= 15_000))
    if (attendance !== 'working' || missedArrival || resume) {
      supportAssignments.delete(actor)
      return
    }
    return assignment.activity
  }

  function planActor(actor: Actor) {
    if (!actor.present) return
    const attendance = attendanceOf(actor.person)
    const outing = wandering?.actor === actor && attendance === 'working' ? wandering : undefined
    const oversight = managerVisit?.actor === actor && attendance === 'working' && !demoPlacements.has(actor.person.id)
      ? managerVisit : null
    const ordinary = activityOf(actor.person, attendance)
    const support = supportActivity(actor, ordinary, attendance)
    const snack = actor === snacking && attendance === 'working' && !demoPlacements.has(actor.person.id)
    const canRotate = data.source === 'simulation' && attendance === 'working' && !demoPlacements.has(actor.person.id)
    const preferLab = canRotate && partners.includes(actor) && !isBreak(ordinary) && preferCompounding(actor.person, elapsed)
    const planned = preferLab && activities[ordinary].zone !== 'dispense' ? 'dispense' : ordinary
    const target = support ?? oversight?.activity ?? (snack ? 'coffee' : outing ? 'wander' : planned)
    const oldTarget = actor.target
    actor.target = target
    actor.duty = attendance === 'working' && isBreak(actor.activity) ? 'break' : attendance
    if (actor.leg) return
    const zone = zoneFor(actor.person, target, data.source)
    let visit = 0
    if (oversight) visit = oversight.visit
    else if (outing) visit = outing.stop
    else if (zone === 'cottage') visit = cottageVisit(actor.person, actor.index)
    else if (zone === 'dispense' && !support && canRotate && partners.length === 2) visit = compoundingVisit(partnerSlot(actor.person), elapsed)
    if (actor.activity === target && actor.zone === zone && actor.visit === visit && !actor.moving) return
    if (oldTarget === target && elapsed < actor.retryAt) return
    const stops = oversight ? (oversight.activity === 'inspect' ? inspectionStops : refillStops) : outing ? wanderStops : undefined
    const [preferred, ...others] = candidates(zone, visit, stops)
    const options = actor.zone === zone && actor.visit === visit
      ? [actor.tile, preferred, ...others]
      : [preferred, ...others]
    const occupied = occupiedByOthers(actor)
    let found = false

    for (const tile of options) {
      if (!tile || occupied.has(tileKey(tile))) continue
      if (tileKey(tile) === tileKey(actor.tile)) {
        settle(actor, target, zone)
        actor.visit = visit
        actor.duty = isBreak(target) ? 'break' : attendance
        found = true
        break
      }
      const [next] = findPath(actor.tile, tile, occupied)
      if (next) {
        actor.leg = { to: next, fraction: 0 }
        actor.moving = true
        if (next[0] !== actor.tile[0]) face(actor, next[0] > actor.tile[0] ? 1 : -1)
        found = true
        break
      }
    }

    if (!found) {
      actor.retryAt = elapsed + 250 + actor.index * 55
      // Keep the pending target while a doorway or station is occupied.
      actor.moving = false
    }
  }

  function refreshConfirmedActivity() {
    for (const actor of actors) {
      const attendance = attendanceOf(actor.person)
      if (!actor.present || attendance !== 'working') continue
      const confirmed = activityOf(actor.person, attendance)
      actor.target = confirmed
      if (actor.activity !== confirmed && actor.activity !== 'unknown') {
        actor.activity = 'unknown'
        actor.duty = 'working'
        actor.changedAt = elapsed
        actor.workTimeBonus = 0
        actor.retryAt = 0
      }
    }
  }

  function chooseWanderer() {
    if (elapsed < nextWanderAt || placementHeld) return
    if (wandering) {
      const { actor, timeout } = wandering
      if (attendanceOf(actor.person) === 'working' && elapsed < timeout) {
        if (actor.activity !== 'wander' || actor.moving) return
        wandering.pauseUntil ??= elapsed + 3250
        if (elapsed < wandering.pauseUntil) return
      }
      wandering = undefined
      nextWanderAt = elapsed + 3100
      return
    }

    for (let offset = 0; offset < actors.length; offset++) {
      const index = (nextWalker + offset) % actors.length
      const actor = actors[index]
      const attendance = attendanceOf(actor.person)
      if (!actor.present || actor === manager || actor === snacking || actor.x >= 20 || supportAssignments.has(actor) ||
        attendance !== 'working' || isBreak(activityOf(actor.person, attendance))) continue
      nextWalker = (index + 1) % actors.length
      const stop = (index * 3 + Math.floor(elapsed / 4000)) % wanderStops.length
      wandering = { actor, stop, timeout: elapsed + 18_000 }
      return
    }
    nextWanderAt = elapsed + 3100
  }

  function tick() {
    elapsed += TICK_MS
    const previousMinute = minute
    if (data.source === 'simulation') minute = (startMinute + Math.floor(elapsed / data.millisecondsPerMinute)) % DAY
    if (minute < previousMinute && (demoPlacements.size > 0 || supportAssignments.size > 0)) {
      demoPlacements.clear()
      supportAssignments.clear()
      revision++
    }
    if (lastPlacedIndex !== null && !placementHeld && elapsed - lastPlacement >= PLACEMENT_IDLE_MS) {
      nextWalker = lastPlacedIndex
      lastPlacedIndex = null
      demoPlacements.clear()
      nextWanderAt = elapsed
      revision++
    }
    for (const actor of actors) advanceActor(actor)
    const managerInRoom = manager?.present && manager.x < 20 && attendanceOf(manager.person) === 'working' ? manager : undefined
    managerVisit = managerRoutine.update(managerInRoom && !demoPlacements.has(managerInRoom.person.id) &&
      !supportAssignments.has(managerInRoom) ? managerInRoom : undefined, elapsed)
    const canTakeSnack = jeongmin?.present && jeongmin.x < 20 && attendanceOf(jeongmin.person) === 'working' &&
      !demoPlacements.has(jeongmin.person.id) && !supportAssignments.has(jeongmin) &&
      wandering?.actor !== jeongmin && !isBreak(activityOf(jeongmin.person, 'working'))
    snacking = snackDetour(managerVisit, canTakeSnack ? jeongmin : undefined, elapsed)
    chooseWanderer()
    // Rotating priority gives each worker a chance to claim a crowded walkway.
    const priority = Math.floor(elapsed / 1000) % actors.length
    for (let index = 0; index < actors.length; index++) {
      const actor = actors[(index + priority) % actors.length]
      planActor(actor)
      actor.walkWeight = actor.moving ? Math.min(1, actor.walkWeight + TICK_MS / 125)
        : Math.max(0, actor.walkWeight - TICK_MS / 165)
      updateStamina(actor, elapsed, TICK_MS)
    }
    if (data.source === 'simulation') {
      updateStaffPersonalities(actors, managerInRoom, partners, elapsed, TICK_MS)
      if (snacking && snacking.activity !== 'coffee') snacking.remark = '간식 먹으러 가는 중'
      for (const [actor, assignment] of supportAssignments) {
        const zone = zoneFor(actor.person, assignment.activity, data.source)
        if (actor.zone !== zone && actor.target === assignment.activity) actor.remark = workAreaLabel(zone) + ' 지원하러 가는 중'
      }
      const directorAtWork = director?.present && director.x < 20 && director.duty === 'working' ? director : undefined
      crowdReminder(directorAtWork, actors, partners, elapsed)
    }
    walkMascots(mascots, actors, elapsed, TICK_MS)
    const passingDoor = actors.some(actor => actor.moving && nearDoor(actor.x, actor.y))
    const target = passingDoor ? 1 : 0
    door += (target - door) * (passingDoor ? .15 : .065)
  }

  return {
    actors,
    mascots,
    get time() { return elapsed },
    get minute() { return minute },
    get day() { return data.source === 'simulation' ? Math.floor((startMinute + Math.floor(elapsed / data.millisecondsPerMinute)) / DAY) : 0 },
    get door() { return door },
    get revision() { return revision },
    get staffing() { return staffing ? [...staffing] : null },
    get activeRoster() { return [...activeRoster] },
    get dutyOverrides(): DutyOverride[] { return [...dutyOverrides] },
    get freeWalking() { return nextWanderAt < Infinity },
    isDirectlyPlaced(person: Person) {
      return attendanceOf(person) === 'working' && Boolean(placedActivity(person))
    },
    syncClock(nextMinute: number) {
      if (data.source !== 'connected' || minute === nextMinute) return
      const previous = actors.map(actor => attendanceOf(actor.person))
      minute = nextMinute
      if (actors.some((actor, index) => previous[index] !== attendanceOf(actor.person))) {
        actors.splice(0, actors.length, ...seedActors())
      }
      refreshConfirmedActivity()
      revision++
    },
    setAssignments(next: DataSource['assignments']) {
      if (data.source !== 'connected' || assignments === next) return
      assignments = next
      refreshConfirmedActivity()
      revision++
    },
    setPlacements(next: DataSource['assignments']) {
      if (data.source !== 'connected' || filePlacements === next) return
      const changed = actors.filter(actor => demoPlacements.has(actor.person.id) || assignmentAt(filePlacements, actor.person, minute)
        !== assignmentAt(next, actor.person, minute))
      filePlacements = next
      for (const actor of changed) {
        demoPlacements.delete(actor.person.id)
        actor.retryAt = 0
        planActor(actor)
      }
      revision++
    },
    setDutyOverrides(next: readonly DutyOverride[]) {
      if (next.length !== dutyOverrides.size || next.some(([id, duty]) => dutyOverrides.get(id) !== duty)) updateDutyOverrides(next)
    },
    setActiveRoster(ids: readonly string[]) {
      if (data.source !== 'simulation') return
      const next = new Set(data.people.filter(person => ids.includes(person.id)).map(person => person.id))
      if (next.size === activeRoster.size && [...next].every(id => activeRoster.has(id))) return
      for (const actor of actors) {
        const id = actor.person.id
        if (next.has(id) === activeRoster.has(id)) continue
        if (next.has(id)) {
          // Re-enter through the same placement logic used for returning from the cottage.
          actor.duty = 'off'
          if (staffing && (dutyOverrides.get(id) === 'working' || getDuty(data.shifts[id], minute) === 'working')) staffing.add(id)
        } else {
          actor.present = false
          actor.leg = null
          actor.moving = false
          actor.remark = null
          actor.duty = 'unconfirmed'
          actor.activity = 'unknown'
          actor.target = 'unknown'
          supportAssignments.delete(actor)
          demoPlacements.delete(id)
          staffing?.delete(id)
          if (wandering?.actor === actor) wandering = undefined
        }
      }
      activeRoster = next
      updateDutyOverrides([...dutyOverrides])
      refreshPersonalities()
    },
    setPlacementHeld(held: boolean) {
      if (data.source !== 'simulation' || placementHeld === held) return
      placementHeld = held
      lastPlacement = elapsed
    },
    placeStaff(id: string, activity: PlacementActivity) {
      const actor = actors.find(candidate => candidate.person.id === id)
      if (!actor || !activeRoster.has(id)) return false
      const returning = attendanceOf(actor.person) === 'off'
      if (!returning && (!canPlaceStaff(actor) || attendanceOf(actor.person) !== 'working')) return false
      if (activity === 'dayoff' || returning) {
        if (returning && activity === 'dayoff') return false
        const next = new Map(dutyOverrides)
        if (activity === 'dayoff') {
          demoPlacements.delete(id)
          next.delete(id)
          next.set(id, 'off')
        } else {
          placeWork(actor, activity)
          if (scheduledAttendanceOf(actor.person) === 'working') next.delete(id)
          else next.set(id, 'working')
        }
        supportAssignments.delete(actor)
        if (wandering?.actor === actor) wandering = undefined
        updateDutyOverrides([...next])
        return true
      }
      if (data.source !== 'simulation') return false
      if (supportAssignments.delete(actor)) actor.remark = null
      placeWork(actor, activity)
      actor.retryAt = 0
      planActor(actor)
      revision++
      return true
    },
    setAppearances(next: readonly Person[]) {
      const byId = new Map(next.map(person => [person.id, person]))
      let changed = false
      people = people.map(person => {
        const appearance = byId.get(person.id)
        if (!appearance || (appearance.sprite === person.sprite && appearance.restArt === person.restArt
          && appearance.displayName === person.displayName)) return person
        changed = true
        return { ...person, sprite: appearance.sprite, restArt: appearance.restArt, displayName: appearance.displayName }
      })
      if (!changed) return
      actors.forEach((actor, index) => { actor.person = people[index] })
      refreshPersonalities()
      revision++
    },
    setStaffing(ids: readonly string[] | null) {
      const next = selectedPeople(ids)
      if (dutyOverrides.size === 0 && (next === staffing || (next && staffing && next.size === staffing.size
        && [...next].every(id => staffing?.has(id))))) return
      staffing = next
      dutyOverrides.clear()
      demoPlacements.clear()
      supportAssignments.clear()
      lastPlacedIndex = null
      nextWanderAt = Infinity
      wandering = undefined
      actors.splice(0, actors.length, ...seedActors())
      refreshPersonalities()
      door = 0
      revision++
    },
    step(milliseconds: number) {
      remainder += Math.max(0, milliseconds)
      while (remainder >= TICK_MS) {
        tick()
        remainder -= TICK_MS
      }
    },
  }
}

export type Simulation = ReturnType<typeof createSimulation>
