import { findPath, stations, tileKey, tilePoint } from './layout.ts'
import type { Tile } from './layout.ts'
import type { Actor } from './simulation.ts'
import { staffName } from './data.ts'

type MascotProfile = {
  id: 'dog' | 'cat' | 'rudolph'
  name: string
  sprite: string
  height: number
  pace: number
  route: readonly [Tile, ...Tile[]]
  messages: readonly string[]
  startsSpeaking: number
}

export const mascotProfiles: readonly MascotProfile[] = [
  {
    id: 'dog', name: '모카', sprite: 'pet-dog', height: 49, pace: 1.33,
    route: [[7, 28], [12, 27], [18, 27], [22, 28], [19, 30], [10, 30], [6, 29]],
    messages: ['오늘도 힘내요!', '잘하고 있어요!', '한 걸음씩 가요!', '오늘도 수고했어요!'],
    startsSpeaking: 1200,
  },
  {
    id: 'cat', name: '코코', sprite: 'pet-cat-white', height: 46, pace: 1.14,
    route: [[28, 27], [23, 27], [22, 29], [24, 30], [30, 29], [31, 27]],
    messages: ['오늘도 고생 많아요!', '잠깐 숨 돌려요!', '당신을 응원해요!', '같이 힘내요!'],
    startsSpeaking: 10_700,
  },
  {
    id: 'rudolph', name: '루돌프', sprite: 'pet-rudolph', height: 67, pace: 1.2,
    route: [[25, 29], [27, 29], [26, 30], [23, 28], [21, 28]],
    messages: ['루돌프 출발!', '오늘도 반짝!', '따뜻한 하루 되세요!'],
    startsSpeaking: 15_700,
  },
]

export type Mascot = MascotProfile & {
  tile: Tile
  x: number
  y: number
  facing: 1 | -1
  movement: number
  leg: { to: Tile; fraction: number } | null
  stop: number
  waitUntil: number
  following: string | null
  nextChoiceAt: number
}

const stationsToAvoid = Object.values(stations).flat().map(tileKey)
const speakingCycle = 20_000
const messageDuration = 4950
const followChance = .7
const choiceInterval = 7500
const followOffsets: readonly Tile[] = [
  [-2, 1], [2, 1], [-1, 2], [1, 2], [-2, 0], [2, 0], [0, 2],
  [-1, 1], [1, 1], [-2, -1], [2, -1], [-1, -2], [1, -2], [0, -2],
]

export function createMascots(): Mascot[] {
  return mascotProfiles.filter(profile => profile.id !== 'rudolph')
    .map(profile => startMascot(profile, profile.route[0], profile.id === 'dog' ? 700 : 2250))
}

function startMascot(profile: MascotProfile, tile: Tile, waitUntil: number): Mascot {
  return {
    ...profile, tile, ...tilePoint(tile),
    facing: profile.id === 'cat' ? -1 : 1, movement: 0, leg: null,
    stop: (profile.route.indexOf(tile) + 1) % profile.route.length, waitUntil,
    following: null, nextChoiceAt: 0,
  }
}

export function createRudolph(pets: readonly Mascot[], actors: readonly Actor[], time: number) {
  const profile = mascotProfiles.find(pet => pet.id === 'rudolph')!
  const occupied = new Set<number>()
  for (const pet of pets) reserveTiles(occupied, pet)
  for (const actor of actors) {
    if (actor.present) reserveTiles(occupied, actor)
  }
  const tile = profile.route.find(point => !occupied.has(tileKey(point)))
  return tile ? startMascot(profile, tile, time + 500) : undefined
}

export function mascotMessage(pet: MascotProfile, time: number) {
  const sinceFirstMessage = time - pet.startsSpeaking
  if (sinceFirstMessage < 0) return null
  const phase = sinceFirstMessage % speakingCycle
  if (phase >= messageDuration) return null
  const index = Math.floor(sinceFirstMessage / speakingCycle) % pet.messages.length
  return { text: pet.messages[index], opacity: Math.min(1, phase / 260, (messageDuration - phase) / 360) }
}

export function reserveTiles(occupied: Set<number>, mover: Pick<Mascot, 'tile' | 'leg'>) {
  occupied.add(tileKey(mover.tile))
  if (mover.leg) occupied.add(tileKey(mover.leg.to))
}

function chooseLeader(pet: Mascot, actors: readonly Actor[], time: number, random: () => number) {
  if (pet.id !== 'cat') return undefined
  const leader = actors.find(actor => actor.present && actor.x < 20 && (actor.duty === 'working' || actor.duty === 'break')
    && staffName(actor.person).trim().normalize('NFC') === '윤희')
  if (!leader) {
    pet.following = null
    pet.nextChoiceAt = 0
    return undefined
  }
  if (pet.following && pet.following !== leader.person.id) pet.nextChoiceAt = 0
  if (time >= pet.nextChoiceAt) {
    pet.following = random() < followChance ? leader.person.id : null
    pet.nextChoiceAt = time + choiceInterval
  }
  return pet.following ? leader : undefined
}

function distanceInTiles([x, y]: Tile, [targetX, targetY]: Tile) {
  return Math.abs(x - targetX) + Math.abs(y - targetY)
}

function followStep(pet: Mascot, leader: Actor, occupied: ReadonlySet<number>) {
  const tile = leader.leg?.to ?? leader.tile
  const distance = distanceInTiles(pet.tile, tile)
  if (distance >= 2 && distance <= 3) return undefined
  const nearby = followOffsets.map(([x, y]): Tile => [tile[0] + x, tile[1] + y])
    .sort((a, b) => distanceInTiles(a, pet.tile) - distanceInTiles(b, pet.tile))
  for (const destination of nearby) {
    const [next] = findPath(pet.tile, destination, occupied)
    if (next) return next
  }
}

export function walkMascots(pets: readonly Mascot[], actors: readonly Actor[], time: number, delta: number, random = Math.random) {
  for (const pet of pets) {
    if (!pet.leg) continue
    const from = tilePoint(pet.tile)
    const to = tilePoint(pet.leg.to)
    const pace = pet.following ? 1.55 : pet.pace
    const progress = Math.min(1, pet.leg.fraction + pace * delta / 500)
    pet.movement += (progress - pet.leg.fraction) / 2
    pet.leg.fraction = progress
    pet.x = from.x + (to.x - from.x) * progress
    pet.y = from.y + (to.y - from.y) * progress
    if (progress === 1) {
      pet.tile = pet.leg.to
      pet.leg = null
    }
  }

  for (const pet of pets) {
    if (pet.leg || time < pet.waitUntil) continue
    const leader = chooseLeader(pet, actors, time, random)
    const destination = pet.route[pet.stop]
    if (!leader && tileKey(pet.tile) === tileKey(destination)) {
      pet.stop = (pet.stop + 1) % pet.route.length
      pet.waitUntil = time + (pet.id === 'dog' ? 1200 : 1900)
      continue
    }
    const occupied = new Set(stationsToAvoid)
    for (const actor of actors) {
      if (actor.present) reserveTiles(occupied, actor)
    }
    for (const other of pets) {
      if (other !== pet) reserveTiles(occupied, other)
    }
    const next = leader ? followStep(pet, leader, occupied) : findPath(pet.tile, destination, occupied)[0]
    if (!next) {
      pet.waitUntil = time + 375
      continue
    }
    pet.leg = { to: next, fraction: 0 }
    if (next[0] !== pet.tile[0]) pet.facing = next[0] > pet.tile[0] ? 1 : -1
  }
}
