import values from './demo.json' with { type: 'json' }

export const activities = {
  dispense: { label: '조제 중', zone: 'dispense', pose: 'dispense' },
  prescription: { label: '처방전 확인 중', zone: 'dispense', pose: 'read' },
  pack: { label: '약품 포장 중', zone: 'dispense', pose: 'pack' },
  syrup: { label: '시럽 따르는 중', zone: 'syrup', pose: 'pour' },
  checkout: { label: '계산 중', zone: 'checkout', pose: 'checkout' },
  counsel: { label: '고객 상담 중', zone: 'counsel', pose: 'talk' },
  guidance: { label: '복약지도 중', zone: 'counsel', pose: 'guidance' },
  stock: { label: '약품 정리 중', zone: 'stock', pose: 'carry' },
  inventory: { label: '재고 확인 중', zone: 'stock', pose: 'read' },
  office: { label: '발주 확인 중', zone: 'office', pose: 'type' },
  coffee: { label: '잠시 휴식 중', zone: 'lounge', pose: 'coffee' },
  lunch: { label: '식사 중', zone: 'lounge', pose: 'lunch' },
  dayoff: { label: '오늘은 휴무!', zone: 'cottage', pose: 'dayoff' },
  before: { label: '출근 전', zone: 'arrival', pose: 'idle' },
  departed: { label: '퇴근 완료', zone: 'arrival', pose: 'idle' },
  unknown: { label: '업무 상태 미확인', zone: 'home', pose: 'idle' },
  wander: { label: '둘러보는 중', zone: 'standby', pose: 'idle' },
  inspect: { label: '업무 살피는 중', zone: 'standby', pose: 'read' },
  refill: { label: '간식 채우는 중', zone: 'lounge', pose: 'refill' },
  pastry: { label: '붕어빵 판매 중', zone: 'pastry', pose: 'serve' },
} as const

export const displayOnlyActivities = ['before', 'departed', 'dayoff', 'wander', 'inspect', 'refill'] as const

export const zoneLabels = {
  dispense: '조제', syrup: '시럽', checkout: '계산', counsel: '상담',
  stock: '재고', office: '사무', lounge: '휴게', pastry: '붕어빵', cottage: '휴무 별장',
  arrival: '출입구', standby: '공용 통로',
} as const

export type Zone = keyof typeof zoneLabels

export function workAreaLabel(zone: Zone) {
  return zone === 'pastry' ? '붕어빵 가판대' : zoneLabels[zone] + ' 공간'
}

export type Activity = keyof typeof activities
export type Pose = (typeof activities)[Activity]['pose']
export type Person = {
  id: string
  name: string
  displayName?: string
  role: string
  color: string
  sprite: string
  restArt?: { read: string; sleep: string; stretch: string } | { bench: string }
  home: Exclude<Zone, 'cottage' | 'arrival' | 'standby'>
}
export type Shift = { start: number; end: number }
export type Assignment = { at: number; activity: Activity; until?: number }
export type DataSource = {
  source: 'simulation' | 'connected'
  initialMinute: number
  millisecondsPerMinute: number
  people: readonly Person[]
  shifts: Readonly<Record<string, Shift | null | undefined>>
  carryUntil?: Readonly<Record<string, number | undefined>>
  calendar?: { inMonth: boolean; planned: readonly string[] }
  assignments: Readonly<Record<string, readonly Assignment[] | undefined>>
}
export function staffKey(person: Pick<Person, 'id' | 'name'>, scope: DataSource['source']) {
  return scope === 'simulation' ? 'demo:' + person.id : 'roster:' + person.name
}

export function staffName(person: Pick<Person, 'name' | 'displayName'>) {
  return person.displayName ?? person.name
}

export const demo = values as DataSource
