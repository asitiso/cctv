import { smoothstep } from './architecture.ts'
import { activities } from './data.ts'
import type { Actor } from './simulation.ts'

export type Greeting = {
  partnerId: string
  direction: 1 | -1
  wave: number
  wrist: number
  nod: number
}

const interval = 25_600
const duration = 1640

function canWave(actor: Actor) {
  const pose = activities[actor.activity].pose
  return pose === 'idle' || pose === 'read' || pose === 'talk'
}

function directionTo(actor: Actor, partner: Actor) {
  return partner.x === actor.x ? actor.facing : partner.x > actor.x ? 1 : -1
}

export function staffGreetings(actors: readonly Actor[], time: number) {
  const nearby = actors.filter(actor => actor.present && actor.duty === 'working' && !actor.moving
    && actor.activity === actor.target && time - actor.changedAt >= 750).sort((a, b) => a.index - b.index)
  const pairs: { initiator: Actor; receiver: Actor; phase: number; distance: number }[] = []
  for (const [index, first] of nearby.entries()) {
    const firstWaves = canWave(first)
    for (let next = index + 1; next < nearby.length; next++) {
      const second = nearby[next]
      const cycle = time + first.index * 2100 + second.index * 1500
      const phase = cycle % interval
      if (phase >= duration) continue
      const distance = Math.hypot(second.x - first.x, second.y - first.y)
      if (distance >= 1.75) continue
      const secondWaves = canWave(second)
      if (!firstWaves && !secondWaves) continue
      const firstLeads = firstWaves && (!secondWaves || Math.floor(cycle / interval) % 2 === 0)
      pairs.push(firstLeads ? { initiator: first, receiver: second, phase, distance }
        : { initiator: second, receiver: first, phase, distance })
    }
  }

  const result = new Map<number, Greeting>()
  for (const { initiator, receiver, phase } of pairs.sort((a, b) => a.distance - b.distance)) {
    if (result.has(initiator.index) || result.has(receiver.index)) continue
    const wave = smoothstep(80, 340, phase) * (1 - smoothstep(910, 1360, phase))
    const wrist = Math.sin(phase * .019) * smoothstep(340, 460, phase) * (1 - smoothstep(810, 960, phase))
    const nod = smoothstep(665, 1040, phase) * (1 - smoothstep(1150, 1510, phase))
    result.set(initiator.index, { partnerId: receiver.person.id, direction: directionTo(initiator, receiver), wave, wrist, nod: 0 })
    result.set(receiver.index, { partnerId: initiator.person.id, direction: directionTo(receiver, initiator), wave: 0, wrist: 0, nod })
  }
  return result
}
