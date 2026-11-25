import { ellipse, gradient, polygon, round, smoothstep, strokeLine } from './architecture.ts'
import { COTTAGE, cottageFloor, cottageFurniture, project, WORLD_HEIGHT, WORLD_WIDTH } from './layout.ts'
import type { Outline } from './layout.ts'

type Context = CanvasRenderingContext2D

const glazing: readonly Outline[] = [
  [[281, 105], [297, 71], [322, 47], [355, 31], [390, 21], [438, 16], [480, 18], [522, 27], [553, 43],
    [580, 65], [599, 101], [602, 282], [282, 277], [283, 238], [324, 221], [350, 190], [357, 110]],
  [[646, 108], [653, 81], [670, 56], [702, 34], [746, 19], [804, 10], [866, 10], [920, 13], [978, 22],
    [1024, 37], [1059, 58], [1085, 85], [1091, 111], [1092, 296], [648, 282]],
  [[1163, 102], [1178, 76], [1207, 53], [1245, 33], [1294, 21], [1367, 17], [1426, 27], [1481, 46], [1524, 71],
    [1547, 110], [1471, 113], [1475, 239], [1510, 255], [1553, 269], [1549, 332], [1165, 306]],
]

export function roomLighting(minute: number) {
  const daylight = smoothstep(337, 485, minute) * (1 - smoothstep(980, 1155, minute))
  const night = 1 - daylight
  return {
    daylight,
    night,
    twilight: 4 * daylight * night,
    starlight: smoothstep(.55, .98, night),
    lamps: smoothstep(.25, .88, night),
  }
}

export type RoomLighting = ReturnType<typeof roomLighting>

// Only these areas of the room illustration move. The curtain rods and the pots are on the fixed edges.
const breezePatches = [
  { left: 253, top: 104, width: 127, height: 167, swing: 5.1, period: 9_400, phase: .35, anchor: 'top' },
  { left: 1439, top: 114, width: 147, height: 181, swing: 4.5, period: 11_300, phase: 2.3, anchor: 'top' },
  { left: 0, top: 716, width: 196, height: 221, swing: 4.0, period: 8_300, phase: .2, anchor: 'bottom' },
  { left: 1414, top: 668, width: 172, height: 258, swing: 4.7, period: 10_600, phase: .4, anchor: 'bottom' },
] as const

export function paintBreeze(g: Context, background: HTMLImageElement, time: number) {
  if (time === 0) return
  const sx = background.naturalWidth / WORLD_WIDTH
  const sy = background.naturalHeight / WORLD_HEIGHT
  for (const { left, top, width, height, swing, period, phase, anchor } of breezePatches) {
    const leftEdge = Math.round(width * .28)
    const rightEdge = Math.round(width * .79)
    const wave = time * (2 * Math.PI / period) + phase
    for (let y = 0; y < height; y += 12) {
      const h = Math.min(12, height - y)
      const depth = (y + h / 2) / height
      const reach = anchor === 'top' ? depth : 1 - depth
      const shift = Math.sin(wave - reach * 1.2) * Math.sin(depth * Math.PI) * reach * swing * 1.5
      const row = top + y
      g.drawImage(background, left * sx, row * sy, leftEdge * sx, h * sy,
        left, row, leftEdge + shift, h)
      g.drawImage(background, (left + leftEdge) * sx, row * sy, (rightEdge - leftEdge) * sx, h * sy,
        left + leftEdge + shift, row, rightEdge - leftEdge, h)
      g.drawImage(background, (left + rightEdge) * sx, row * sy, (width - rightEdge) * sx, h * sy,
        left + rightEdge + shift, row, width - rightEdge - shift, h)
    }
  }
}

export function paintSky(g: Context, { daylight, night, twilight, starlight }: RoomLighting, time: number) {
  g.save()
  g.beginPath()
  for (const panel of glazing) {
    panel.forEach(([x, y], index) => index ? g.lineTo(x, y) : g.moveTo(x, y))
    g.closePath()
  }
  g.clip()
  if (night > 0) {
    g.fillStyle = gradient(g, 0, 0, 0, 336,
      `rgba(24,37,73,${night * .81})`, `rgba(48,67,95,${night * .58})`)
    g.fillRect(0, 0, WORLD_WIDTH, 336)
  }
  if (twilight > 0) {
    g.fillStyle = gradient(g, 0, 28, 0, 310,
      `rgba(239,143,108,${twilight * .15})`, `rgba(255,168,116,${twilight * .47})`)
    g.fillRect(0, 0, WORLD_WIDTH, 336)
  }
  if (starlight > 0) {
    g.save()
    g.beginPath()
    g.arc(928, 45, 10, 0, 2 * Math.PI)
    g.clip()
    g.moveTo(941, 42)
    g.ellipse(932, 42, 9, 8, 0, 0, 2 * Math.PI)
    g.fillStyle = `rgba(250,239,198,${starlight * .91})`
    g.fill('evenodd')
    g.restore()
    for (const [x, y, radius] of [[445, 14, 1.2], [533, 32, 1.35], [908, 15, 1.1], [957, 42, 1.1], [1023, 65, 1.15], [1460, 86, 1.15]]) {
      ellipse(g, x, y, radius, radius, `rgba(250,239,198,${starlight * .8})`)
    }
  }
  if (daylight > 0) {
    const white = `rgba(255,254,235,${daylight * daylight * .20})`
    for (const [index, [left, y, w]] of [[303, 30, 302], [735, 39, 351], [1322, 74, 270]].entries()) {
      const x = left - 34 + (time * .004 + 94 + index * 41) % (w + 60)
      ellipse(g, x, y, 28, 7, white)
      ellipse(g, x - 6, y - 5, 12, 7, white)
      ellipse(g, x + 10, y - 4, 15, 9, white)
    }
  }
  g.restore()
}

export function paintLighting(g: Context, { daylight, night, twilight, lamps }: RoomLighting, time: number) {
  if (night > 0) {
    g.fillStyle = `rgba(33,47,77,${night * .36 * (1 - twilight * .3)})`
    g.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
  }
  if (twilight > 0) {
    g.fillStyle = gradient(g, 0, 145, 0, WORLD_HEIGHT,
      `rgba(255,173,112,${twilight * .16})`, `rgba(255,189,124,${twilight * .095})`)
    g.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT)
  }
  if (daylight > 0) {
    const beam = daylight * (.043 + Math.sin(time * .000065) * .012 + twilight * .018)
    polygon(g, [{ x: 383, y: 206 }, { x: 478, y: 207 }, { x: 719, y: 688 }, { x: 633, y: 731 }],
      gradient(g, 400, 216, 676, 705, '#fff4cf00', `rgba(255,238,177,${beam})`))
  }
  if (lamps > 0) {
    g.save()
    g.globalCompositeOperation = 'screen'
    for (const [x, y, r] of [[365, 393, 162], [617, 646, 181], [1350, 680, 153]]) {
      const glow = g.createRadialGradient(x, y, 10, x, y, r)
      glow.addColorStop(0, `rgba(248,191,97,${lamps * .37})`)
      glow.addColorStop(.48, `rgba(241,176,88,${lamps * .15})`)
      glow.addColorStop(1, '#f5b84a00')
      ellipse(g, x, y, r, r * .72, glow)
    }
    g.restore()
  }
}

export function paintGardenLighting(g: Context, { night, twilight }: RoomLighting) {
  const { left, top, width, height } = COTTAGE
  if (night > 0) {
    g.fillStyle = `rgba(47,61,100,${night * .38})`
    g.fillRect(left, top, width, height)
  }
  if (twilight > 0) {
    g.fillStyle = gradient(g, left, top, left, top + height,
      `rgba(249,178,115,${twilight * .16})`, `rgba(239,174,125,${twilight * .05})`)
    g.fillRect(left, top, width, height)
  }
}

function paintCoffeeSteam(g: Context, time: number) {
  if (time === 0) return
  g.lineCap = 'round'
  for (const [index, offset] of [0, 970, 2040].entries()) {
    const age = ((time + offset) % 3230) / 3230
    const x = 43.5 + (index - 1) * 3 + Math.sin(age * 4 + index) * 1.9
    const y = 44 - age * 19
    g.strokeStyle = `rgba(255,251,227,${Math.sin(age * Math.PI) * .67})`
    g.lineWidth = 2 - age * .7
    g.beginPath()
    g.moveTo(x, y)
    g.bezierCurveTo(x + 4, y - 2, x - 3.5, y - 4.5, x + 1, y - 8)
    g.stroke()
  }
}

const jars = [
  { x: 102.5, y: 48, width: 12, height: 12, level: 53, phase: .7, period: 4280 },
  { x: 126.5, y: 40, width: 28, height: 29, level: 47, phase: .2, period: 3960 },
  { x: 163, y: 54, width: 17.5, height: 15, level: 58.7, phase: 1.5, period: 4800 },
] as const

function paintSyrupJars(g: Context, time: number) {
  g.lineCap = 'round'
  for (const { x, y, width, height, level, phase, period } of jars) {
    const cycle = time / period + phase
    const sway = Math.sin(cycle * Math.PI * 2)
    g.save()
    g.beginPath()
    g.roundRect(x, y, width, height, Math.min(4.5, width * .24))
    g.clip()

    g.strokeStyle = '#fff0c889'
    g.lineWidth = 1
    g.beginPath()
    g.moveTo(x + 2, level + sway * 1.7)
    g.bezierCurveTo(x + width * .35, level - 1.8 * sway, x + width * .64, level + 2.3 * sway, x + width - 2, level - sway)
    g.stroke()
    for (const [index, offset] of [0, .52].entries()) {
      const age = (cycle + offset) % 1
      const bubbleX = x + width * (.25 + index * .37) + sway * 1.3
      const bubbleY = y + height - 2 - age * (y + height - level - 2)
      ellipse(g, bubbleX, bubbleY, .9 + age * .3, 1.1 + age * .3,
        `rgba(255,244,204,${Math.sin(age * Math.PI) * .67})`)
    }
    g.restore()
  }
}

function paintOfficeScreen(g: Context, time: number) {
  g.transform(1, .125, 0, 1, 65.8, 9)
  g.beginPath()
  g.roundRect(0, 0, 46, 20.5, 1.1)
  g.clip()
  g.fillStyle = gradient(g, 0, 0, 46, 20, '#384b4280', '#465f55b0')
  g.fillRect(0, 0, 46, 21)
  round(g, 3, 2, 15, 1.7, .5, '#eef6ceaa')
  round(g, 39, 2, 3.7, 1.65, .6, '#d2e3ab95')
  for (const [row, width] of [22, 29, 19].entries()) {
    const y = 6 + row * 4.15
    const focus = Math.max(0, Math.cos((time / 8100 - row / 3) * Math.PI * 2))
    round(g, 2, y - .55, 42, 3.9, 1, `rgba(194,224,175,${.07 + focus * .24})`)
    round(g, 4, y + .65, 2.1, 1.3, .5, '#dbe5adbf')
    round(g, 8, y + .65, width, 1.35, .55, '#dce9c693')
  }
}

function paintShelfTray(g: Context) {
  polygon(g, [{ x: 7, y: 146 }, { x: 129, y: 159 }, { x: 129, y: 162 }, { x: 7, y: 149 }],
    '#b98955', '#a87945', .6)
  polygon(g, [{ x: 129, y: 159 }, { x: 137, y: 147 }, { x: 137, y: 150 }, { x: 129, y: 162 }], '#a87746')
  polygon(g, [{ x: 16, y: 134 }, { x: 137, y: 147 }, { x: 129, y: 159 }, { x: 7, y: 146 }],
    gradient(g, 12, 135, 132, 160, '#e9c995', '#d9ac76'), '#c59b66', .75)
  strokeLine(g, '#f8dfb077', .75, { x: 12, y: 144 }, { x: 42, y: 147.2 }, { x: 90, y: 152 }, { x: 128, y: 155 })
}

// Coordinates are relative to the top left of each illustrated prop.
const fixtureDetails: Partial<Record<string, { width: number; height: number; paint: (g: Context, time: number) => void }>> = {
  'room-syrup': { width: 201, height: 143, paint: paintSyrupJars },
  'room-office': { width: 183, height: 141, paint: paintOfficeScreen },
  'room-coffee': { width: 136, height: 124, paint: paintCoffeeSteam },
  'room-shelf': { width: 151, height: 157, paint: paintShelfTray },
}

export function paintFixtureDetail(g: Context, art: string, width: number, height: number, time: number) {
  const detail = fixtureDetails[art]
  if (!detail) return
  g.save()
  g.scale(width / detail.width, height / detail.height)
  detail.paint(g, time)
  g.restore()
}

export function paintEntranceLight(g: Context, door: number) {
  if (door > .03) {
    const gap = 26 + door * 75
    polygon(g, [{ x: 789 - gap, y: WORLD_HEIGHT }, { x: 789 + gap, y: WORLD_HEIGHT },
      { x: 827 + gap * .5, y: 867 }, { x: 813 - gap * .4, y: 875 }],
      gradient(g, 780, 870, 780, WORLD_HEIGHT, '#fff6d000', `rgba(255,242,193,${door * .46})`))
  }
}

export const gardenProps = [
  { art: 'hammock', ...cottageFurniture.hammock, width: 100, height: 53 },
  { art: 'sofa', ...cottageFurniture.sofa, width: 104, height: 69 },
  { art: 'bench', ...cottageFurniture.bench, width: 61, height: 36 },
  { art: 'olive', x: 25.99, y: 1.45, width: 65, height: 80, sway: .015 },
  { art: 'topiary', x: 20.85, y: 1.36, width: 49, height: 31, sway: .012 },
  { art: 'flowers', x: 21.5, y: 4.38, width: 54, height: 30, sway: .021 },
  { art: 'blossom', x: 24.9, y: 4.67, width: 29, height: 40, sway: .02 },
] as const

export function paintGarden(g: Context) {
  const { left, top, width, height } = COTTAGE
  round(g, left, top, width, height, 17, gradient(g, left, top, left, top + height, '#edf1d9', '#dce8c3'), '#ede8ce')
  const [u, v, x, y] = cottageFloor
  const topFace = [project(u, v), project(x, v), project(x, y), project(u, y)]
  const lower = topFace.map(point => ({ x: point.x, y: point.y + 10 }))
  polygon(g, [topFace[1], topFace[2], lower[2], lower[1]], '#89a064')
  polygon(g, [topFace[2], topFace[3], lower[3], lower[2]], '#b29e6a')
  polygon(g, topFace, gradient(g, left, top + 80, left + width, top + height, '#d5dda0', '#b6c183'), '#94a064')
  for (let i = 0; i < 62; i++) {
    const p = project(u + .19 + (i * .618 % 1) * (x - u - .38), v + .2 + (i * .413 % 1) * (y - v - .4))
    ellipse(g, p.x, p.y, 1.8 + i % 2, .9, i % 2 ? '#7a9b584f' : '#f1edb88a', -.23)
  }
  for (const [cx, cy] of [[20.64, 3.43], [21.39, 3.78], [22.18, 4.1], [22.99, 3.85], [23.65, 3.55], [24.4, 3.33]]) {
    const p = project(cx, cy)
    ellipse(g, p.x, p.y + 2, 13.5, 6, '#60714930', .13)
    ellipse(g, p.x, p.y, 13.5, 6, '#f2e0b7', .13)
  }
  for (const [x0, y0, x1, y1] of [[20.55, .65, 25.9, .65], [26, .65, 26, 4.43], [24.9, 4.5, 26, 4.5]]) {
    for (const z of [5, 11]) strokeLine(g, '#baab80', 2.6, project(x0, y0, z), project(x1, y1, z))
    const pieces = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 3)
    for (let i = 0; i <= pieces; i++) {
      const p = project(x0 + (x1 - x0) * i / pieces, y0 + (y1 - y0) * i / pieces)
      polygon(g, [{ x: p.x - 2.5, y: p.y }, { x: p.x - 2.5, y: p.y - 13 }, { x: p.x, y: p.y - 16 },
        { x: p.x + 2.5, y: p.y - 13 }, { x: p.x + 2.5, y: p.y }], '#f6eac7', '#b7a37b90', .55)
    }
  }
}
