import { isJeongmin } from './staff-personalities.ts'
import type { Actor } from './simulation.ts'

export type Stamina = { value: number; bites: number; recoveredAt: number | null }

const snackDuration = 2450
const biteAt = 1280
const recoveryNotice = 950

export function snackInterval(actor: Actor) {
  return isJeongmin(actor.person) ? 8000 : 12_000
}

function snackAge(actor: Actor, time: number) {
  if (!actor.stamina || actor.activity !== 'coffee' || actor.target !== 'coffee' || actor.moving) return null
  const elapsed = time - actor.changedAt - (2000 + actor.index * 115)
  if (elapsed < 0) return null
  const age = elapsed % snackInterval(actor)
  return age < snackDuration ? age : null
}

export function snackPhase(actor: Actor, time: number) {
  const age = snackAge(actor, time)
  return age === null ? null : age / snackDuration
}

export function snackStatus(actor: Actor, time: number) {
  if (snackAge(actor, time) === null) return undefined
  const recovery = actor.stamina?.recoveredAt
  return recovery != null && time - recovery < recoveryNotice ? '체력 회복' : '다과 먹는 중'
}

export function updateStamina(actor: Actor, time: number, delta: number) {
  const stamina = actor.stamina
  if (!stamina) return
  if (actor.duty === 'working') stamina.value = Math.max(0, stamina.value - delta / 5000)
  const age = snackAge(actor, time)
  if (age === null || age < biteAt || age - delta >= biteAt) return
  stamina.bites++
  if (stamina.value >= 100) return
  stamina.value = Math.min(100, stamina.value + 8)
  stamina.recoveredAt = time
}
