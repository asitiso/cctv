import type { Activity } from './data.ts'
import { COTTAGE } from './layout.ts'
import type { Point } from './layout.ts'
import type { Actor } from './simulation.ts'

export const placementZones = [
  { activity: 'dispense', label: '조제', x: 249, y: 242, width: 276, height: 226 },
  { activity: 'syrup', label: '시럽', x: 532, y: 257, width: 244, height: 216 },
  { activity: 'stock', label: '재고', x: 782, y: 264, width: 305, height: 216 },
  { activity: 'office', label: '사무', x: 1226, y: 319, width: 300, height: 210 },
  { activity: 'counsel', label: '상담', x: 117, y: 482, width: 297, height: 183 },
  { activity: 'checkout', label: '계산', x: 480, y: 557, width: 277, height: 203 },
  { activity: 'coffee', label: '휴식', x: 1022, y: 530, width: 427, height: 233 },
  { activity: 'pastry', label: '붕어빵', x: 101, y: 680, width: 132, height: 154 },
  { activity: 'dayoff', label: '휴무 별장', x: COTTAGE.left, y: COTTAGE.top, width: COTTAGE.width, height: COTTAGE.height },
] as const satisfies readonly { activity: Activity; label: string; x: number; y: number; width: number; height: number }[]

export type PlacementActivity = (typeof placementZones)[number]['activity']
export type WorkPlacement = Exclude<PlacementActivity, 'dayoff'>

export function placementAt({ x, y }: Point) {
  return placementZones.find(zone => x >= zone.x && x < zone.x + zone.width && y >= zone.y && y < zone.y + zone.height)?.activity
}

export function canPlaceStaff(actor: Actor) {
  return actor.present && actor.x < 20 && (actor.duty === 'working' || actor.duty === 'break')
}
