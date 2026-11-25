import type { Zone } from './data.ts'

export type Point = { x: number; y: number }
export type Tile = readonly [number, number]
type Rect = readonly [number, number, number, number]
export type Outline = readonly (readonly [number, number])[]

export const WORLD_WIDTH = 1586
export const WORLD_HEIGHT = 992
export const COTTAGE = { left: 1239, top: 71, width: 324, height: 205 }
export const cottageFloor: Rect = [20.25, .4, 26.3, 4.85]
export const coffeeCounterX = 1359

export function project(x: number, y: number, z = 0): Point {
  if (x >= 20) {
    return { x: COTTAGE.left + 70 + (x - 20) * 37 - y * 13, y: COTTAGE.top + 47 + (x - 20) * 6.5 + y * 19 - z }
  }
  return { x: 36 + x * 90, y: 9 + y * 62 - z }
}

const floor: Outline = [[68, 482], [269, 379], [587, 385], [940, 408], [1225, 428],
  [1549, 453], [1549, 752], [1480, 911], [1340, 951], [140, 945], [78, 826], [64, 590]]

export type RoomProp = Point & {
  art: string
  width: number
  height: number
  base: readonly [left: number, right: number, back: number]
  sway?: number
  mirror?: boolean
}

export const roomProps: readonly RoomProp[] = [
  { art: 'plant', x: 172, y: 454, width: 74, height: 96, base: [-18, 19, 15], sway: .017 },
  { art: 'room-compound', x: 375, y: 435, width: 221, height: 139, base: [-102, 98, 29], mirror: false },
  { art: 'room-syrup', x: 650, y: 447, width: 201, height: 143, base: [-91, 92, 28], mirror: false },
  { art: 'room-shelf', x: 920, y: 470, width: 151, height: 157, base: [-66, 71, 22], mirror: false },
  { art: 'box', x: 1066, y: 460, width: 89, height: 54, base: [-40, 40, 22] },
  { art: 'plant', x: 1153, y: 476, width: 62, height: 83, base: [-15, 17, 14], sway: .015 },
  { art: 'room-office', x: 1365, y: 508, width: 183, height: 141, base: [-79, 78, 38], mirror: false },
  { art: 'blossom', x: 1494, y: 530, width: 44, height: 64, base: [-12, 13, 12], sway: .018 },
  { art: 'room-consult', x: 275, y: 631, width: 211, height: 142, base: [-91, 92, 44], mirror: false },
  { art: 'room-checkout', x: 617, y: 738, width: 226, height: 144, base: [-104, 101, 42], mirror: false },
  { art: 'plant', x: 449, y: 671, width: 51, height: 70, base: [-14, 16, 12], sway: .015 },
  { art: 'room-sofa', x: 1141, y: 678, width: 190, height: 118, base: [-85, 82, 42], mirror: false },
  { art: 'room-coffee', x: coffeeCounterX, y: 736, width: 136, height: 124, base: [-57, 57, 34], mirror: false },
  { art: 'stool', x: 1111, y: 767, width: 77, height: 49, base: [-32, 33, 23] },
  { art: 'room-pastry', x: 166, y: 808, width: 125, height: 127, base: [-46, 46, 28], mirror: false },
  { art: 'bench', x: 359, y: 851, width: 124, height: 66, base: [-55, 53, 23] },
  { art: 'blossom', x: 1447, y: 683, width: 51, height: 74, base: [-14, 14, 13], sway: .021 },
  { art: 'plant', x: 1328, y: 815, width: 59, height: 83, base: [-16, 16, 15], sway: .016 },
]

const furnitureFootprints: readonly Outline[] = roomProps.map(({ x, y, base: [left, right, back] }) => [
  [x + left, y - back - 4], [x + right - 5, y - back - 10],
  [x + right + 4, y - 3], [x + right - 11, y + 6], [x + left + 11, y + 5], [x + left - 4, y - 4],
])

export const cottageFurniture = {
  hammock: { x: 22.31, y: 1.55 },
  sofa: { x: 24.98, y: 2.3 },
  bench: { x: 23.86, y: 3.88 },
} as const

export const cottageSeats = {
  sofa: [49, 5],
  hammock: [45, 4],
  bench: [47, 8],
} as const satisfies Record<keyof typeof cottageFurniture, Tile>

const cottageBlockers: readonly Rect[] = [
  [21.45, .72, 23.19, 1.69],
  [24.15, 1.63, 25.76, 2.35],
  [23.15, 3.25, 24.19, 3.92],
]

const stockShelving: readonly { tile: Tile; slot: Point }[] = [
  { tile: [18, 16], slot: { x: 884, y: 458 } },
  { tile: [21, 17], slot: { x: 947, y: 465 } },
  { tile: [19, 17], slot: { x: 922, y: 462 } },
  { tile: [22, 16], slot: { x: 972, y: 467 } },
]

export function stockShelfSlot([x, y]: Tile) {
  return stockShelving.find(({ tile }) => tile[0] === x && tile[1] === y)?.slot
}

export const stations: Readonly<Record<Zone, readonly Tile[]>> = {
  dispense: [[6, 15], [10, 15], [8, 16], [7, 17], [5, 16]],
  syrup: [[12, 16], [15, 16], [13, 17], [16, 15]],
  stock: stockShelving.map(({ tile }) => tile),
  office: [[28, 17], [32, 17], [29, 19], [31, 18]],
  counsel: [[3, 21], [8, 21], [9, 18], [6, 23]],
  checkout: [[16, 24], [10, 24], [13, 26], [17, 22]],
  lounge: [[22, 23], [27, 23], [21, 24], [30, 25], [25, 26], [26, 25]],
  pastry: [[5, 26], [4, 28], [6, 25]],
  cottage: [cottageSeats.sofa, [43, 7], cottageSeats.hammock, [51, 8], cottageSeats.bench, [51, 6], [52, 8]],
  standby: [
    [17, 18], [19, 18], [15, 18], [21, 18], [13, 18], [23, 18], [11, 18],
    [18, 20], [20, 20], [16, 20], [22, 20], [14, 20], [12, 20], [19, 22], [21, 22], [17, 22],
  ],
  arrival: [
    [16, 29], [17, 29], [15, 29], [18, 29], [14, 29], [19, 29], [13, 29], [20, 29],
    [12, 29], [21, 29], [11, 29], [16, 28], [18, 28], [14, 28], [19, 28], [12, 28],
  ],
}

export const wanderStops: readonly Tile[] = [
  [5, 23], [10, 20], [14, 19], [20, 21], [23, 19], [26, 22], [31, 20], [25, 27], [17, 27], [7, 26],
]

export const zoneSigns: Readonly<Record<Exclude<Zone, 'arrival' | 'cottage' | 'standby'>, Point & { color: string }>> = {
  dispense: { x: 375, y: 257, color: '#b47642' },
  syrup: { x: 650, y: 273, color: '#668b73' },
  stock: { x: 920, y: 280, color: '#a68050' },
  office: { x: 1365, y: 335, color: '#5f8390' },
  counsel: { x: 246, y: 468, color: '#a96974' },
  checkout: { x: 617, y: 574, color: '#a87a40' },
  lounge: { x: 1160, y: 542, color: '#6d866d' },
  pastry: { x: 167, y: 668, color: '#c58a56' },
}

const contains = (x: number, y: number, rect: Rect) =>
  x >= rect[0] && x <= rect[2] && y >= rect[1] && y <= rect[3]

function inside(point: Point, outline: Outline) {
  let within = false
  for (let index = 0, previous = outline.length - 1; index < outline.length; previous = index++) {
    const [a, b] = outline[index]
    const [c, d] = outline[previous]
    if ((b > point.y) !== (d > point.y) && point.x < a + (c - a) * (point.y - b) / (d - b)) within = !within
  }
  return within
}

export const isOnPharmacyFloor = (point: Point) => inside(point, floor)

export function isWalkableAt(x: number, y: number) {
  if (x >= 20) return contains(x, y, cottageFloor) && !cottageBlockers.some(rect => contains(x, y, rect))
  const point = project(x, y)
  return isOnPharmacyFloor(point) && !furnitureFootprints.some(outline => inside(point, outline))
}

export const tileKey = ([x, y]: Tile) => x + y * 56
export const tilePoint = ([x, y]: Tile): Point => ({ x: x / 2, y: y / 2 })
export const isWalkable = ([x, y]: Tile) => isWalkableAt(x / 2, y / 2)
export const nearDoor = (x: number, y: number) => x > 5 && x < 11 && y > 13.1 && y < 15

const neighbors: readonly Tile[] = [[1, 0], [0, 1], [-1, 0], [0, -1]]
const map = new Map<number, Tile[]>()
for (let y = 0; y <= 30; y++) {
  for (let x = 0; x <= 53; x++) {
    if (!isWalkable([x, y])) continue
    const around = neighbors.map(([dx, dy]): Tile => [x + dx, y + dy])
    map.set(tileKey([x, y]), around.filter(([nextX, nextY]) =>
      [0.25, .5, .75, 1].every(fraction =>
        isWalkableAt((x + (nextX - x) * fraction) / 2, (y + (nextY - y) * fraction) / 2))))
  }
}

export function findPath(from: Tile, to: Tile, occupied: ReadonlySet<number>): Tile[] {
  const start = tileKey(from)
  const finish = tileKey(to)
  if (start === finish || occupied.has(finish)) return []
  const queue: Tile[] = [from]
  const previous = new Map<number, Tile>([[start, from]])

  for (let index = 0; index < queue.length; index++) {
    const tile = queue[index]
    for (const next of map.get(tileKey(tile)) ?? []) {
      const key = tileKey(next)
      if (previous.has(key) || occupied.has(key)) continue
      previous.set(key, tile)
      if (key === finish) {
        const path = [next]
        for (let parent = tile; tileKey(parent) !== start; parent = previous.get(tileKey(parent))!) path.push(parent)
        return path.reverse()
      }
      queue.push(next)
    }
  }

  return []
}
