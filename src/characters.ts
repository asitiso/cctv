import { ellipse, round, smoothstep, strokeLine } from './architecture.ts'
import { activities } from './data.ts'
import { cottageFurniture, cottageSeats, project, stockShelfSlot, tileKey } from './layout.ts'
import type { Point } from './layout.ts'
import type { Actor } from './simulation.ts'
import type { Greeting } from './staff-greetings.ts'
import { snackPhase } from './snack-breaks.ts'
import { hasCheckoutBag } from './staff-personalities.ts'

type Context = CanvasRenderingContext2D
type Art = Readonly<Record<string, HTMLImageElement>>

const sleeves = ['#e8d9be', '#ebd9bd', '#e9dbc2', '#bc7767', '#819999', '#a58191', '#e5dac9', '#e9ddc8', '#e5dbc1', '#628992', '#eae0c9', '#8b8c61', '#e1d1b8', '#d6ae59', '#7e89a0', '#d5ae9d', '#e7d8c0', '#ead9bd', '#e5d6be']
const shade = ['#b7a68e', '#bba58b', '#ad9779', '#9c5c51', '#59777c', '#806673', '#ae9a8a', '#ae9f91', '#aaa48a', '#43636b', '#b7a798', '#62694b', '#b3a08b', '#a98238', '#596475', '#a17b73', '#af9c83', '#b49c85', '#ac9b85']
const skin = ['#efae7b', '#ecae7b', '#f1b081', '#ecab80', '#efaf7c', '#edac82', '#efae7b', '#ecae7b', '#f1b081', '#ecab80', '#efaf7c', '#edac82', '#ecae81', '#f0b286', '#df9c75', '#edac84', '#eeac80', '#f1ae80', '#edaa7d']
const eyes = [[.63,.80,.23,.215], [.56,.77,.235,.217], [.55,.77,.232,.216],
  [.64,.81,.222,.208], [.58,.80,.237,.221], [.63,.81,.234,.215], [.61,.8,.23,.216], [.59,.8,.234,.216], [.58,.79,.23,.215], [.62,.8,.231,.218],
  [.59,.8,.231,.214], [.61,.81,.232,.216], [.62,.79,.234,.215], [.60,.81,.23,.218], [.60,.80,.238,.221], [.63,.82,.235,.216],
  [.57,.79,.216,.208], [.55,.77,.214,.185], [.55,.77,.225,.217]]

const STAFF_HEIGHT = 101
const BENCH_READING_HEIGHT = 47
const TAU = Math.PI * 2
export const CHARACTER_VISUAL_SCALE = 1.3

function characterScale(actor: Actor) {
  const feet = project(actor.x, actor.y)
  const scale = actor.x >= 20 ? .55 : (85 + feet.y * .036) / STAFF_HEIGHT
  return scale * CHARACTER_VISUAL_SCALE
}

function cottageRestPose(time: number, hammock = false) {
  const phase = (time + 3700) % 30_000
  if (hammock || phase > 17_000) return { key: 'sleep', width: 66, height: 31, seatOffset: 0 } as const
  if (phase > 14_000) return { key: 'stretch', width: 51, height: 51, seatOffset: 4 } as const
  return { key: 'read', width: 50, height: 48, seatOffset: 4 } as const
}

export function cottageSeat(actor: Actor) {
  const art = actor.person.restArt
  if (!art || actor.activity !== 'dayoff' || actor.moving) return null
  const tile = tileKey(actor.tile)
  if ('bench' in art) return tile === tileKey(cottageSeats.bench) ? 'bench' : null
  if (tile === tileKey(cottageSeats.sofa)) return 'sofa'
  if (tile === tileKey(cottageSeats.hammock)) return 'hammock'
  return null
}

export function actorAnchor(actor: Actor, time: number) {
  const point = project(actor.x, actor.y)
  const seat = cottageSeat(actor)
  if (!seat) return { ...point, top: point.y - STAFF_HEIGHT * characterScale(actor) }
  const furniture = cottageFurniture[seat]
  const p = project(furniture.x, furniture.y)
  if (seat === 'bench') {
    return { x: p.x - 12, y: p.y + 3, top: p.y + 3 - BENCH_READING_HEIGHT * CHARACTER_VISUAL_SCALE }
  }
  const pose = cottageRestPose(time, seat === 'hammock')
  const bottom = p.y - (seat === 'hammock' ? 20 : 12) + pose.seatOffset
  return { x: p.x - (pose.key === 'sleep' ? 0 : 12), y: bottom, top: bottom - pose.height * CHARACTER_VISUAL_SCALE }
}

function painted(g: Context, image: HTMLImageElement | undefined, x: number, y: number, w: number, height?: number) {
  if (!image) return
  const h = height ?? w * image.height / image.width
  g.drawImage(image, x - w / 2, y - h, w, h)
}

function paintBenchReader(g: Context, image: HTMLImageElement, anchor: Point, time: number, index: number, still: boolean) {
  const height = BENCH_READING_HEIGHT * CHARACTER_VISUAL_SCALE
  const width = height * image.width / image.height
  const breath = still ? 0 : Math.sin(time * .0022 + index * 1.65) * .55
  const left = anchor.x - width / 2
  const top = anchor.y + breath - height
  g.drawImage(image, left, top, width, height)
  if (still) return

  const clock = (time + index * 970) % 6300
  const page = smoothstep(4750, 5580, clock)
  if (page === 0 || page === 1) return
  const angle = page * Math.PI
  const spineX = left + width * .658
  const spineY = top + height * .53
  const edgeX = spineX + Math.cos(angle) * width * .155
  const edgeY = spineY - (2.8 + Math.sin(angle) * 3.6)
  g.save()
  g.globalAlpha *= smoothstep(0, .13, page) * (1 - smoothstep(.87, 1, page))
  g.beginPath()
  g.moveTo(spineX, spineY)
  g.quadraticCurveTo((spineX + edgeX) / 2, edgeY - 1, edgeX, edgeY)
  g.lineTo(edgeX - .55, edgeY + 2.1)
  g.quadraticCurveTo((spineX + edgeX) / 2, spineY - .35, spineX, spineY + 1.5)
  g.closePath()
  g.fillStyle = page < .5 ? '#fff0d6' : '#e7cdaa'
  g.fill()
  g.strokeStyle = '#c39b74a6'
  g.lineWidth = .42
  g.stroke()
  g.restore()
}

function line(g: Context, color: string, width: number, x: number, y: number, toX: number, toY: number) {
  strokeLine(g, color, width, { x, y }, { x: toX, y: toY })
}

function pointOnProp(prop: { x: number; y: number; angle: number }, dx: number, dy: number) {
  const cosine = Math.cos(prop.angle)
  const sine = Math.sin(prop.angle)
  return { x: prop.x + cosine * dx - sine * dy, y: prop.y + sine * dx + cosine * dy }
}

function arm(g: Context, index: number, x: number, y: number, handX: number, handY: number, far = false, open = 0) {
  const elbow = { x: x + (handX - x) * .43 - 1.4, y: y + Math.max(3, (handY - y) * .66) }
  g.lineCap = 'round'
  strokeLine(g, shade[index], far ? 7.6 : 9, { x, y }, elbow, { x: handX, y: handY })
  strokeLine(g, sleeves[index], far ? 6 : 7, { x, y: y - .7 }, { x: elbow.x, y: elbow.y - 1 }, { x: handX, y: handY - .7 })
  ellipse(g, handX + 1, handY + .3, 3.7, 4, skin[index], -.3)
  ellipse(g, handX + 1.9, handY - .8, 2.3, 1.2, '#ffe3b577', -.3)
  if (open > 0) {
    g.save()
    g.translate(handX + 1, handY)
    g.rotate(.22)
    g.scale(1, open)
    g.fillStyle = skin[index]
    g.beginPath()
    g.moveTo(-3.5, .5)
    g.quadraticCurveTo(-5.8, -3.2, -4.5, -4.7)
    g.quadraticCurveTo(-3.5, -5.3, -2.6, -3.5)
    g.lineTo(-2.8, -6.3)
    g.quadraticCurveTo(-2.3, -8.5, -.9, -7.4)
    g.quadraticCurveTo(.1, -9.1, 1.25, -7.5)
    g.quadraticCurveTo(2.7, -8, 2.9, -5.9)
    g.quadraticCurveTo(4.6, -6.5, 4.2, -3.4)
    g.quadraticCurveTo(4, -.7, 2.7, 1.4)
    g.closePath()
    g.fill()
    g.restore()
  }
}

const bottleNeck = 15.6

function bottle(g: Context, x: number, y: number, angle: number, liquid: string, level?: number) {
  g.save()
  g.translate(x, y)
  g.rotate(angle)
  round(g, -4.2, -11, 8.4, 16, 2.3, '#fcf0d0b8', '#a47546')
  if (level === undefined) {
    round(g, -3.5, -4, 7, 7.9, 1.8, liquid)
    round(g, -2.3, -bottleNeck, 4.6, 5.4, 1, '#f4d5a4', '#ab7b50')
    round(g, -3.6, -5.3, 7.2, 5.6, .8, '#fff0d4')
    line(g, '#89a28a', .85, -2.1, -3.1, 2.2, -3.1)
  } else {
    g.save()
    g.beginPath()
    g.roundRect(-3.5, -10.6, 7, 14.8, 1.7)
    g.clip()
    g.rotate(-angle)
    g.fillStyle = liquid
    g.fillRect(-16, 2.9 - level * 8.8, 32, 22)
    g.restore()
    round(g, -2.1, -bottleNeck, 4.2, 5.6, .9, '#f3d39cd8', '#ac7847')
    ellipse(g, 0, -bottleNeck, 2.2, 1.05, '#8e653e')
  }
  round(g, -1.1, -9, 1.15, 8.7, .5, '#fffaf3d7')
  g.restore()
}

export function syrupPourPose(phase: number) {
  const lift = smoothstep(.055, .28, phase) * (1 - smoothstep(.80, .97, phase))
  const tilt = smoothstep(.26, .44, phase) * (1 - smoothstep(.71, .85, phase))
  const transfer = smoothstep(.425, .72, phase)
  const bottle = { x: 16 + lift * 4.2 + tilt * .9, y: -35 - lift * 21, angle: .13 + tilt * 1.64 }
  return {
    bottle,
    mouth: pointOnProp(bottle, 0, -bottleNeck),
    rim: { x: 30 + lift * 4.6, y: -40 - lift * 2 },
    flow: smoothstep(.425, .48, phase) * (1 - smoothstep(.66, .72, phase)),
    bottleLevel: .9 - transfer * .53,
    cupLevel: transfer * .84,
    cupOpacity: smoothstep(0, .105, phase) * (1 - smoothstep(.91, .985, phase)),
  }
}

function measureCup(g: Context, x: number, y: number, level: number) {
  g.save()
  g.translate(x, y)
  g.beginPath()
  g.moveTo(-6.1, 0)
  g.lineTo(6.1, 0)
  g.lineTo(4.85, 10)
  g.quadraticCurveTo(4.7, 12.3, 2.7, 12.3)
  g.lineTo(-2.7, 12.3)
  g.quadraticCurveTo(-4.7, 12.3, -4.85, 10)
  g.closePath()
  g.fillStyle = '#fff3d9bf'
  g.fill()
  g.strokeStyle = '#a7895f'
  g.lineWidth = .9
  g.stroke()
  g.clip()
  if (level > 0) {
    const surface = 11.4 - level * 10.4
    g.fillStyle = '#df9b55d4'
    g.fillRect(-7, surface, 14, 13 - surface)
    ellipse(g, 0, surface, 6, 1.05, '#ffd593b0')
  }
  round(g, -3.9, 2.1, 1.1, 7.5, .55, '#fff9e1d0')
  for (const mark of [3.9, 6.5, 9]) line(g, '#bd95689c', .6, 3, mark, 4.5, mark)
  g.restore()
  ellipse(g, x, y, 6.1, 1.32, '#fff4d7a8')
}

function drawSyrupPour(g: Context, id: number, nearX: number, farX: number, shoulderY: number, phase: number) {
  const pose = syrupPourPose(phase)
  const { x, y, angle } = pose.bottle
  const { mouth, rim, flow } = pose
  arm(g, id, farX, shoulderY + 1, rim.x - 3.7, rim.y + 9, true)
  arm(g, id, nearX, shoulderY, x - 3.1, y + 2.5)
  g.save()
  g.globalAlpha *= pose.cupOpacity
  measureCup(g, rim.x, rim.y, pose.cupLevel)
  bottle(g, x, y, angle, '#d39a55e5', pose.bottleLevel)
  g.restore()
  if (flow > 0) {
    g.strokeStyle = `rgba(227,154,77,${flow * .94})`
    g.lineWidth = .85 + flow * .9
    g.beginPath()
    g.moveTo(mouth.x, mouth.y)
    g.quadraticCurveTo(mouth.x + 1.1, mouth.y + (rim.y - mouth.y) * .53, rim.x, rim.y)
    g.stroke()
    ellipse(g, rim.x, rim.y + 2.3, 1.9, .64, `rgba(255,223,162,${flow * .76})`)
  }
}

export function dispensingPose(phase: number) {
  const lift = smoothstep(.04, .31, phase) * (1 - smoothstep(.69, .95, phase))
  const checking = smoothstep(.31, .47, phase) * (1 - smoothstep(.62, .75, phase))
  return {
    x: 13 + lift * 8,
    y: -31 - lift * 19,
    angle: -.08 + checking * .41,
    checking,
    opacity: smoothstep(.015, .13, phase) * (1 - smoothstep(.9, .99, phase)),
  }
}

export function packingPose(phase: number) {
  const lift = smoothstep(.04, .22, phase) * (1 - smoothstep(.68, .89, phase))
  const seal = smoothstep(.29, .57, phase)
  const press = smoothstep(.37, .59, phase) * (1 - smoothstep(.65, .76, phase))
  const place = smoothstep(.67, .92, phase)
  const release = smoothstep(.88, 1, phase)
  const packet = { x: 15 + lift * 6 + place * 18, y: -31 - lift * 9 + place * 4, angle: -.1 + lift * .14 + place * .25 }
  function grip(dx: number, dy: number, restX: number) {
    const { x, y } = pointOnProp(packet, dx, dy)
    return { x: x + (restX - x) * release, y: y + (-28 - y) * release }
  }
  return {
    packet,
    seal,
    near: grip(-8 + press * 6, 2 - press * 4, -3),
    far: grip(6.6, 4.4, 13),
    opacity: smoothstep(0, .09, phase) * (1 - smoothstep(.91, 1, phase)),
  }
}

function packet(g: Context, x: number, y: number, angle: number, seal: number) {
  g.save()
  g.translate(x, y)
  g.rotate(angle)
  round(g, -8.1, -4.9, 16.2, 12, 1.55, '#fff2d8', '#c69368')
  const edge = -10.5 + seal * 10.9
  g.beginPath()
  g.moveTo(-7.85, -4.55)
  g.lineTo(-6, edge)
  g.quadraticCurveTo(0, edge + (1.8 - seal), 6, edge)
  g.lineTo(7.85, -4.55)
  g.closePath()
  g.fillStyle = '#f6ddba'
  g.fill()
  g.strokeStyle = '#bd9366'
  g.lineWidth = .72
  g.stroke()
  round(g, -3, 1.5, 6, 3.5, .65, '#aabb92')
  line(g, '#dfbc93', .62, -6, 5.6, 6, 5.6)
  g.restore()
}

const terminalKeys = [
  { x: -5.6, y: .6 }, { x: 0, y: .6 }, { x: 5.6, y: .6 },
  { x: -5.6, y: 4.9 }, { x: 0, y: 4.9 }, { x: 5.6, y: 4.9 },
]
const keyPresses = [{ key: 0, at: .24 }, { key: 1, at: .4 }, { key: 5, at: .57 }]

export function checkoutPose(phase: number) {
  const lifted = smoothstep(.035, .18, phase) * (1 - smoothstep(.83, .99, phase))
  const terminal = { x: 15.5 + lifted * 5.6, y: -31 - lifted * 8.5, angle: .18 - lifted * .23 }
  const column = smoothstep(.282, .365, phase)
  const enter = smoothstep(.444, .535, phase)
  const press = keyPresses.find(({ at }) => phase > at - .04 && phase < at + .04)
  const pressure = press ? smoothstep(press.at - .04, press.at, phase) * (1 - smoothstep(press.at, press.at + .04, phase)) : 0
  const keyX = terminalKeys[0].x + 5.6 * (column + enter)
  const keyY = terminalKeys[0].y + (terminalKeys[5].y - terminalKeys[0].y) * enter
  const retract = smoothstep(.612, .718, phase)
  const hoverY = keyY - 6.1 * (1 - pressure)
  return {
    terminal,
    support: pointOnProp(terminal, 5.2, 7.1),
    finger: pointOnProp(terminal, keyX + (-13.5 - keyX) * retract, hoverY + (5.5 - hoverY) * retract),
    activeKey: press?.key ?? -1,
    pressure,
    confirmation: smoothstep(.635, .72, phase) * (1 - smoothstep(.83, .96, phase)),
    nod: smoothstep(.704, .767, phase) * (1 - smoothstep(.789, .9, phase)),
  }
}

function drawCheckout(g: Context, id: number, nearX: number, farX: number, shoulderY: number, phase: number, bag: boolean) {
  const pose = checkoutPose(phase)
  const { terminal, support, finger, confirmation } = pose
  if (!bag) arm(g, id, farX, shoulderY + 2, support.x, support.y, true)
  g.save()
  g.translate(terminal.x, terminal.y)
  g.rotate(terminal.angle)
  round(g, -11.3, -7.2, 22.6, 16.8, 2.5, '#acb397')
  round(g, -11.3, -8, 22.6, 15.4, 2.6, '#e4e5cc', '#978e70')
  round(g, -7.8, -6, 15.6, 3.7, 1.2, '#66847a')
  round(g, -5.8, -4.8, 4.9, .7, .35, '#d6e6beaa')
  round(g, .4, -4.8, 2.6, .7, .35, '#d6e6be87')
  for (const [index, { x, y }] of terminalKeys.entries()) {
    const pressed = index === pose.activeKey ? pose.pressure : 0
    const color = index === 5 ? '#9db99d' : '#fff4db'
    round(g, x - 2, y - 1.17 + pressed * .52, 4.05, 2.35, .6, color, '#b9b292')
  }
  if (confirmation > 0) {
    g.globalAlpha *= confirmation
    round(g, -7.8, -6, 15.6, 3.7, 1.2, '#94ad8d')
    strokeLine(g, '#fff5cf', .9, { x: -1.9, y: -4.25 }, { x: -.55, y: -3.15 }, { x: 2.1, y: -5.45 })
  }
  g.restore()
  arm(g, id, bag ? farX : nearX, shoulderY + 1, finger.x - 1, finger.y - .3)
  if (bag) {
    const sway = Math.sin(phase * TAU)
    const grip = { x: nearX - 7, y: -25 + sway * 1.15 }
    paintShoppingBag(g, grip.x, grip.y + 1.5, sway * .1)
    arm(g, id, nearX, shoulderY + 2, grip.x, grip.y)
  }
}

function paintShoppingBag(g: Context, x: number, y: number, tilt: number) {
  g.save()
  g.translate(x, y)
  g.rotate(tilt)
  g.beginPath()
  g.moveTo(-3, 1)
  g.bezierCurveTo(-9, 1, -8, 8, -8, 12)
  g.quadraticCurveTo(-8, 16, -4, 16.3)
  g.lineTo(5, 16.3)
  g.quadraticCurveTo(9, 15, 7, 9)
  g.quadraticCurveTo(6, 3, 2.4, 1)
  g.closePath()
  g.fillStyle = '#25262a'
  g.fill()
  g.strokeStyle = '#17171b'
  g.lineWidth = .73
  g.stroke()
  g.beginPath()
  g.moveTo(-5.5, 6.2)
  g.quadraticCurveTo(-6.9, -3.3, -2.6, -.8)
  g.lineTo(1.4, 4.8)
  g.moveTo(4.6, 6.2)
  g.quadraticCurveTo(6.4, -.8, 2.1, -.6)
  g.lineTo(-1.7, 4.6)
  g.stroke()
  strokeLine(g, '#8c8b92a0', .8, { x: -5.6, y: 8 }, { x: -4.1, y: 13.7 })
  strokeLine(g, '#55545d', .6, { x: 4.8, y: 9 }, { x: 5.6, y: 14.9 })
  g.restore()
}

export function consultationPose(phase: number) {
  const explain = smoothstep(.06, .21, phase) * (1 - smoothstep(.46, .61, phase))
  const emphasis = smoothstep(.23, .33, phase) * (1 - smoothstep(.36, .49, phase))
  return {
    hand: { x: 9 + explain * 16 + emphasis * 2.6, y: -30 - explain * 17.8 - emphasis * 5.8 },
    nod: smoothstep(.655, .745, phase) * (1 - smoothstep(.78, .91, phase)),
  }
}

const firstGuidanceLine = -2.1
const guidanceLineGap = 5.1

export function guidancePose(phase: number) {
  const lift = smoothstep(.015, .195, phase) * (1 - smoothstep(.81, .98, phase))
  const reach = smoothstep(.17, .25, phase) * (1 - smoothstep(.72, .85, phase))
  const row = smoothstep(.336, .432, phase) + smoothstep(.505, .62, phase)
  const leaflet = { x: 16 + lift * 7.5, y: -30 - lift * 11.5, angle: -.23 + lift * .137 }
  return {
    leaflet,
    row,
    reach,
    support: pointOnProp(leaflet, 6.4, 8.3),
    finger: pointOnProp(leaflet, -8.8 - (1 - reach) * 7, firstGuidanceLine + row * guidanceLineGap + (1 - reach) * 8),
  }
}

function drawGuidance(g: Context, id: number, nearX: number, farX: number, shoulderY: number, phase: number) {
  const { leaflet, row, reach, support, finger } = guidancePose(phase)
  arm(g, id, farX, shoulderY + 2, support.x, support.y, true)
  g.save()
  g.translate(leaflet.x, leaflet.y)
  g.rotate(leaflet.angle)
  round(g, -10.3, -12.1, 20.6, 24.2, 1.2, '#fff4dc', '#bf9c71')
  round(g, -7.65, -9.15, 12.3, 2.8, .65, '#a5ba9c')
  for (const [index, width] of [9.5, 10.4, 7.7].entries()) {
    const y = firstGuidanceLine + index * guidanceLineGap
    const marked = reach * Math.max(0, 1 - Math.abs(index - row))
    round(g, -8.25, y - 1.7, 16.5, 3.3, .95, `rgba(168,193,150,${marked * .55})`)
    ellipse(g, -6.3, y, .77, .72, '#b7ab88')
    line(g, '#a79573', .75, -3.9, y, -3.9 + width, y)
  }
  g.restore()
  arm(g, id, nearX, shoulderY + 1, finger.x - 2.1, finger.y + .65)
}

const stockHold = { x: 17, y: -27, width: 27, height: 21 }

export function stockBoxPose(phase: number, shelf: Point = stockHold, bounce = 0) {
  const lift = smoothstep(.14, .52, phase)
  const towardShelf = smoothstep(.31, .62, phase)
  const release = smoothstep(.66, .83, phase)
  const heldY = stockHold.y - bounce * .77
  const box = {
    x: stockHold.x + (shelf.x - stockHold.x) * towardShelf,
    y: heldY + (shelf.y - heldY) * lift,
    width: stockHold.width - towardShelf * 7,
    height: stockHold.height - towardShelf * 4,
    opacity: 1 - smoothstep(.76, .96, phase),
  }
  function grip(offset: number, restX: number) {
    const x = box.x + box.width * offset
    const y = box.y - box.height * .32
    return { x: x + (restX - x) * release, y: y + (heldY - 6.7 - y) * release }
  }
  return {
    box,
    near: grip(-.29, stockHold.x - stockHold.width * .29),
    far: grip(.28, stockHold.x + stockHold.width * .28),
    nextOpacity: smoothstep(.865, .99, phase),
  }
}

function drawStockBox(g: Context, image: HTMLImageElement | undefined, id: number, width: number, phase: number, shelf: Point | undefined, bounce: number) {
  const { box, near, far, nextOpacity } = stockBoxPose(phase, shelf, bounce)
  const shoulderY = -STAFF_HEIGHT * .53 - bounce
  arm(g, id, width * .28, shoulderY + 2, far.x, far.y, true)
  g.save()
  g.globalAlpha *= box.opacity
  painted(g, image, box.x, box.y, box.width, box.height)
  g.restore()
  if (nextOpacity > 0) {
    g.save()
    g.globalAlpha *= nextOpacity
    painted(g, image, stockHold.x, stockHold.y, stockHold.width, stockHold.height)
    g.restore()
  }
  arm(g, id, -width * .20, shoulderY, near.x, near.y)
}

export function coffeeBreakPose(phase: number) {
  const lift = smoothstep(.08, .32, phase) * (1 - smoothstep(.43, .61, phase))
  const sip = smoothstep(.255, .335, phase) * (1 - smoothstep(.409, .5, phase))
  const holding = smoothstep(.015, .105, phase) * (1 - smoothstep(.61, .7, phase))
  const stretch = smoothstep(.70, .81, phase) * (1 - smoothstep(.86, .985, phase))
  const mug = { x: 16.6 - lift * 3.8, y: -34 - lift * 20, angle: -.28 * sip }
  const grip = pointOnProp(mug, -3, -1.15)
  return {
    mug,
    mugOpacity: holding,
    stretch,
    near: { x: -13 + (grip.x + 13) * holding - stretch * 14.5, y: -29 + (grip.y + 29) * holding - stretch * 44 },
    far: { x: 12 + stretch * 14.4, y: -29 - stretch * 43 },
  }
}

function paintMug(g: Context, mug: ReturnType<typeof coffeeBreakPose>['mug']) {
  g.save()
  g.translate(mug.x, mug.y)
  g.rotate(mug.angle)
  ellipse(g, 4.4, -3.5, 3.35, 2.8, '#caa171')
  ellipse(g, 4.8, -3.6, 1.85, 1.42, '#faeed0')
  round(g, -4.65, -7.3, 9.25, 9.1, 2.05, '#f6e3bd', '#b38d61')
  round(g, -3.26, -5.3, 1.22, 4.8, .55, '#fff4dbb5')
  ellipse(g, 0, -7.1, 4.4, 1.6, '#a87349')
  ellipse(g, -1, -7.45, 2, .45, '#e4bc8e9d')
  g.restore()
}

function drawCoffeeBreak(g: Context, id: number, width: number, motion: ReturnType<typeof coffeeBreakPose>) {
  const { mug, mugOpacity, near, far, stretch } = motion
  const shoulderY = -STAFF_HEIGHT * .53 - stretch * 1.25
  const armOpacity = Math.max(mugOpacity, smoothstep(0, .26, stretch))
  if (stretch > 0) {
    g.save()
    g.globalAlpha *= smoothstep(0, .26, stretch)
    arm(g, id, width * .28, shoulderY + 1, far.x, far.y, true)
    g.restore()
  }
  if (armOpacity > 0) {
    g.save()
    g.globalAlpha *= armOpacity
    arm(g, id, -width * .20, shoulderY, near.x, near.y)
    g.restore()
  }
  if (mugOpacity > 0) {
    g.save()
    g.globalAlpha *= mugOpacity
    paintMug(g, mug)
    g.restore()
  }
}

export function lunchPose(phase: number) {
  const lift = smoothstep(.235, .495, phase) * (1 - smoothstep(.57, .88, phase))
  const bowl = { x: 21, y: -32.5, angle: .037 }
  const from = pointOnProp(bowl, -1.2, -6)
  const spoon = {
    x: from.x + (12.2 - from.x) * lift,
    y: from.y + (-59.2 - from.y) * lift - Math.sin(lift * Math.PI) * 1.85,
    angle: -.17 - lift * .25,
  }
  return {
    bowl,
    spoon,
    support: pointOnProp(bowl, 7.1, -.8),
    hand: pointOnProp(spoon, -7.7, .18),
    food: smoothstep(.247, .346, phase) * (1 - smoothstep(.536, .602, phase)),
    nod: smoothstep(.45, .512, phase) * (1 - smoothstep(.565, .674, phase)),
  }
}

function drawLunch(g: Context, id: number, width: number, motion: ReturnType<typeof lunchPose>) {
  const { bowl, spoon, support, hand, food } = motion
  const shoulderY = -STAFF_HEIGHT * .53
  arm(g, id, width * .28, shoulderY + 2, support.x, support.y, true)
  g.save()
  g.translate(bowl.x, bowl.y)
  g.rotate(bowl.angle)
  g.beginPath()
  g.moveTo(-10.4, -7.3)
  g.bezierCurveTo(-9.4, -.5, -6, 1.55, -2.3, 1.8)
  g.lineTo(2.3, 1.8)
  g.bezierCurveTo(6, 1.55, 9.4, -.5, 10.4, -7.3)
  g.closePath()
  g.fillStyle = '#e1e4cb'
  g.fill()
  g.strokeStyle = '#aa9472'
  g.lineWidth = .92
  g.stroke()
  ellipse(g, 0, -7.3, 10.35, 3.85, '#fff0d7')
  ellipse(g, 0, -7.05, 8.45, 2.75, '#e9c48b')
  ellipse(g, -4.65, -7.5, 2.23, 1.2, '#9ca779', .13)
  ellipse(g, 2.3, -6.4, 2.21, 1.19, '#d6a36b', -.31)
  ellipse(g, 5.25, -7.4, 1.33, .9, '#ae9d6e')
  g.restore()

  arm(g, id, -width * .20, shoulderY, hand.x - .72, hand.y + .55)
  g.save()
  g.translate(spoon.x, spoon.y)
  g.rotate(spoon.angle)
  line(g, '#a69170', 1.58, -9, .15, -.1, 0)
  ellipse(g, 0, 0, 2.65, 1.63, '#eae0c4')
  ellipse(g, .23, -.2, 1.78, 1.04, '#c4b79f')
  if (food > 0) ellipse(g, .25, -.52, 1.83, 1.23, `rgba(240,195,128,${food})`)
  g.restore()
}

function snackPose(phase: number) {
  const lift = smoothstep(.13, .46, phase) * (1 - smoothstep(.57, .92, phase))
  const holding = smoothstep(0, .14, phase) * (1 - smoothstep(.83, 1, phase))
  return {
    holding,
    hand: { x: 18 - lift * 4, y: -38 - lift * 22 },
    cookie: smoothstep(.02, .2, phase) * (1 - smoothstep(.48, .61, phase)),
    chew: smoothstep(.49, .57, phase) * (1 - smoothstep(.67, .81, phase)),
  }
}

function paintCookie(g: Context, x: number, y: number, tilt: number) {
  ellipse(g, x, y + .5, 4.4, 3.4, '#ab7746', tilt)
  ellipse(g, x, y, 4.25, 2.95, '#e1b175', tilt)
  ellipse(g, x - 1.25, y - .55, .73, .49, '#946140', tilt)
  ellipse(g, x + 1.35, y + .55, .59, .47, '#ad784d', tilt)
  ellipse(g, x + 1.1, y - 1.35, .58, .42, '#fff3dc86', tilt)
}

function drawSnack(g: Context, id: number, width: number, motion: ReturnType<typeof snackPose>) {
  const shoulderY = -STAFF_HEIGHT * .53
  g.save()
  g.globalAlpha *= motion.holding
  arm(g, id, width * .28, shoulderY + 2, 23, -35, true)
  ellipse(g, 20, -36, 11.5, 4.8, '#a99579', -.14)
  ellipse(g, 20, -37.2, 11, 4.4, '#faf0d7', -.14)
  ellipse(g, 20, -37.2, 8, 2.9, '#d9e3c5', -.14)
  paintCookie(g, 23.2, -39.1, .23)
  arm(g, id, -width * .2, shoulderY, motion.hand.x, motion.hand.y)
  g.globalAlpha *= motion.cookie
  paintCookie(g, motion.hand.x + 3.1, motion.hand.y - 1.9, -.36)
  g.restore()
}

function drawRestock(g: Context, id: number, width: number, elapsed: number, bounce: number, remark: boolean) {
  const lift = smoothstep(2300, 3500, elapsed)
  const release = smoothstep(4000, 4550, elapsed)
  const reach = lift * (1 - smoothstep(4500, 5500, elapsed))
  const talk = remark ? Math.max(0, Math.sin(elapsed * .008)) : 0
  const hands = { x: 16 + reach * 14, y: -27 - reach * 21 - bounce }
  const tray = { x: 16 + lift * 14, y: -27 - lift * 21 - bounce }
  const shoulderY = -STAFF_HEIGHT * .53 - bounce
  arm(g, id, width * .28, shoulderY + 2, hands.x + 9, hands.y - 2, true)
  g.save()
  g.globalAlpha *= 1 - release
  round(g, tray.x - 11, tray.y - 8, 23, 9.5, 2.4, '#a48b60', '#79694e')
  round(g, tray.x - 10, tray.y - 9, 21, 6, 2.1, '#e4d1a4')
  for (const index of [-1, 0, 1]) paintCookie(g, tray.x + index * 5.7, tray.y - 9 - (index === 0 ? 2.2 : 0), .23 * index)
  g.restore()
  arm(g, id, -width * .2, shoulderY, hands.x - 7 - talk * 11, hands.y - 3 - talk * 29)
}

function drawPastrySale(g: Context, id: number, nearX: number, farX: number, shoulderY: number, phase: number) {
  const putAway = smoothstep(.2, .58, phase) * (1 - smoothstep(.75, .99, phase))
  const pastry = { x: 7 + putAway * 13, y: -46 + putAway * 8 }
  arm(g, id, farX, shoulderY + 2, 23, -33, true)
  round(g, 15.3, -39, 12.4, 17, 1.9, '#e9c692', '#a98053')
  round(g, 17, -36, 1.6, 10, .6, '#fff3cf9c')
  arm(g, id, nearX, shoulderY, pastry.x - 3, pastry.y + 2)
  g.save()
  g.globalAlpha *= 1 - smoothstep(.6, .68, phase)
  ellipse(g, pastry.x, pastry.y, 5.6, 2.9, '#dda356', -.22)
  ellipse(g, pastry.x - 4.8, pastry.y + .9, 2.2, 2.5, '#d6974d', .47)
  ellipse(g, pastry.x + 2.3, pastry.y - .55, .55, .52, '#a2703e')
  g.restore()
}

const torsoEdges = [
  [0, 0, 1], [.154, .16, .88], [.25, .25, .77], [.39, .278, .79],
  [.516, .254, .82], [.54, .254, .82], [.602, 0, 1], [1, 0, 1],
] as const

function clipActorArms(g: Context, width: number, top: number, height: number, near: number, far: number) {
  const left = smoothstep(0, .38, near)
  const right = smoothstep(0, .38, far)
  g.beginPath()
  for (const [at, edge] of torsoEdges) g.lineTo(-width / 2 + width * left * edge, top + height * at)
  for (let i = torsoEdges.length - 1; i >= 0; i--) {
    const [at, , edge] = torsoEdges[i]
    g.lineTo(width / 2 - width * right * (1 - edge), top + height * at)
  }
  g.closePath()
  g.clip()
}

function artIndex(actor: Actor) {
  const index = Number(actor.person.sprite.replace(/^staff-/, '')) - 1
  return index >= 0 && index < eyes.length ? index : actor.index % eyes.length
}

function actionClock(actor: Actor, time: number) {
  const period = 3480 + actor.index * 311
  const offset = actor.activity === 'stock' ? 0 : actor.index * (actor.activity === 'checkout' ? 1490 : 1370)
  return (time - actor.changedAt + offset + actor.workTimeBonus) / period
}

function action(g: Context, art: Art, actor: Actor, width: number, phase: number) {
  const pose = activities[actor.activity].pose
  const id = artIndex(actor)
  const movement = Math.sin(phase * TAU)
  const nearX = -width * .20
  const farX = width * .28
  const shoulderY = -STAFF_HEIGHT * .53
  switch (pose) {
    case 'dispense': {
      const held = dispensingPose(phase)
      arm(g, id, nearX, shoulderY, held.x - 2.4, held.y + 2.5)
      g.save()
      g.globalAlpha *= held.opacity
      bottle(g, held.x, held.y, held.angle, '#d2a25c')
      g.restore()
      break
    }
    case 'pack': {
      const folded = packingPose(phase)
      arm(g, id, farX, shoulderY + 1, folded.far.x, folded.far.y, true)
      g.save()
      g.globalAlpha *= folded.opacity
      packet(g, folded.packet.x, folded.packet.y, folded.packet.angle, folded.seal)
      g.restore()
      arm(g, id, nearX, shoulderY, folded.near.x, folded.near.y)
      break
    }
    case 'pour': {
      drawSyrupPour(g, id, nearX, farX, shoulderY, phase)
      break
    }
    case 'checkout': {
      drawCheckout(g, id, nearX, farX, shoulderY, phase, hasCheckoutBag(actor))
      break
    }
    case 'serve': {
      drawPastrySale(g, id, nearX, farX, shoulderY, phase)
      break
    }
    case 'dayoff':
    case 'read': {
      arm(g, id, nearX, shoulderY, 12, -40)
      painted(g, art.book, 19, -35 + movement * 1.5, 24)
      break
    }
    case 'type': {
      const tap = Math.sin(phase * TAU * 3)
      arm(g, id, farX, shoulderY, 21, -40 + tap * 2, true)
      arm(g, id, nearX, shoulderY + 3, 13, -38 - tap * 2)
      break
    }
    case 'talk': {
      const { hand } = consultationPose(phase)
      arm(g, id, nearX, shoulderY + 1, hand.x, hand.y)
      break
    }
    case 'guidance': {
      drawGuidance(g, id, nearX, farX, shoulderY, phase)
      break
    }
  }
}

export function walkingPose(actor: Actor, time: number, still: boolean) {
  const blend = still ? 0 : actor.walkWeight
  const weight = blend * blend * (3 - 2 * blend)
  const stride = Math.sin(actor.movement * 12.2 + actor.index * .77)
  const turning = still ? 1 : Math.min(1, Math.max(0, (time - actor.turnedAt) / 190))
  return {
    weight,
    step: stride * weight,
    bounce: stride * stride * 3.6 * weight,
    facing: turning < .5 ? -actor.facing : actor.facing,
    width: .74 + .26 * Math.abs(Math.cos(Math.PI * turning)),
  }
}

function walkingLeg(g: Context, img: HTMLImageElement, width: number, height: number, step: number, bounce: number, right: boolean) {
  const start = Math.round(img.height * .76)
  const x = right ? Math.round(img.width * .51) : 0
  const sw = right ? img.width - x : Math.round(img.width * .51)
  const dx = right ? width * .51 : 0
  const dw = right ? width * .49 : width * .51
  const lift = Math.max(0, step) * 4.7
  const legHeight = height * .22 + bounce - lift
  // Keep the hip fixed. The shear only moves the foot at the far end of the leg.
  g.save()
  g.translate(-width / 2 + dx, -height * .22 - bounce)
  g.transform(1, 0, step * 4.2 / legHeight, 1, 0, 0)
  g.drawImage(img, x, start, sw, img.height - start, 0, 0, dw, legHeight)
  g.restore()
}

export function paintActor(g: Context, art: Art, actor: Actor, elapsed: number, still: boolean, greeting?: Greeting) {
  const time = still ? 0 : elapsed
  const sprite = art[actor.person.sprite]
  if (!sprite) return
  const p = actorAnchor(actor, time)
  const seat = cottageSeat(actor)
  const restArt = actor.person.restArt
  if (seat && restArt && 'bench' in restArt) {
    const pose = art[restArt.bench]
    if (pose) {
      paintBenchReader(g, pose, p, time, actor.index, still)
      return
    }
  } else if (seat && restArt && 'read' in restArt) {
    const { key, width, height } = cottageRestPose(time, seat === 'hammock')
    const pose = art[restArt[key]]
    if (pose) {
      const breath = still ? 0 : Math.sin(time * .0024) * .72
      painted(g, pose, p.x, p.y + breath, width * CHARACTER_VISUAL_SCALE, height * CHARACTER_VISUAL_SCALE)
      if (key === 'sleep' && !still) {
        const lift = (time / 1700) % 3
        g.font = 'italic 700 9px Georgia, serif'
        g.fillStyle = `rgba(125,124,91,${Math.sin(lift / 3 * Math.PI) * .65})`
        g.fillText('z', p.x - 25 * CHARACTER_VISUAL_SCALE + lift * 4, p.top - lift * 4)
      }
      return
    }
  }

  const id = artIndex(actor)
  const absent = (actor.activity === 'before' || actor.activity === 'departed') && !actor.moving
  if (absent) return
  const { weight, step, bounce, facing, width: turnWidth } = walkingPose(actor, time, still)
  const scale = characterScale(actor)
  const breathe = still ? 0 : Math.sin(time * .0034 + actor.index * 1.62) * .96
  const width = STAFF_HEIGHT * sprite.width / sprite.height * 1.15
  const height = STAFF_HEIGHT
  const clock = actionClock(actor, time)
  const phase = still ? .35 : clock % 1
  const pose = activities[actor.activity].pose
  const wave = greeting?.wave ?? 0
  const snackProgress = snackPhase(actor, elapsed)
  const snack = snackProgress === null ? null : snackPose(still ? .35 : snackProgress)
  const restock = actor.target === 'refill' && (actor.moving || actor.activity === 'refill')
  const coffee = pose === 'coffee' && !actor.moving && !snack ? coffeeBreakPose(phase) : null
  const lunch = pose === 'lunch' && !actor.moving ? lunchPose(phase) : null
  ellipse(g, p.x, p.y + 2.1, width * .57 * scale, 7.3 * scale, '#72533926', .12)
  ellipse(g, p.x, p.y + .9, width * .39 * scale, 4.6 * scale, '#614a302d', .1)

  g.save()
  g.translate(p.x, p.y)
  g.scale(facing * scale * turnWidth, scale)

  const cutoff = Math.round(sprite.height * .39)
  const footHeight = height * .24
  if (weight > 0) {
    walkingLeg(g, sprite, width, height, step, bounce, false)
    walkingLeg(g, sprite, width, height, -step, bounce, true)
    const end = Math.ceil(sprite.height * .78)
    g.drawImage(sprite, 0, cutoff, sprite.width, end - cutoff, -width / 2,
      -height * .555 - bounce, width, height * .555 - footHeight * .82)
  } else {
    const bodyHeight = height * .555 + breathe
    g.save()
    if (coffee) clipActorArms(g, width, -bodyHeight, bodyHeight, Math.max(coffee.mugOpacity, coffee.stretch), coffee.stretch)
    if (snack) clipActorArms(g, width, -bodyHeight, bodyHeight, snack.holding, snack.holding)
    if (lunch) clipActorArms(g, width, -bodyHeight, bodyHeight, 1, 1)
    if (restock) clipActorArms(g, width, -bodyHeight, bodyHeight, 1, 1)
    if (hasCheckoutBag(actor)) clipActorArms(g, width, -bodyHeight, bodyHeight, 1, 1)
    if (wave > 0) clipActorArms(g, width, -bodyHeight, bodyHeight, pose === 'idle' ? 0 : wave, wave)
    g.drawImage(sprite, 0, cutoff, sprite.width, sprite.height - cutoff, -width / 2,
      -bodyHeight, width, bodyHeight)
    g.restore()
  }

  let nod = 0
  if (!actor.moving && !still) {
    if (pose === 'type') nod = Math.max(0, Math.sin(time * .0031 + actor.index * 2)) * 1.5 * (1 - weight)
    if (pose === 'dispense') nod = dispensingPose(phase).checking * 1.65 * (1 - weight)
    if (pose === 'checkout') nod = checkoutPose(phase).nod * 2.15 * (1 - weight)
    if (pose === 'talk') nod = consultationPose(phase).nod * 2.3 * (1 - weight)
    if (coffee) nod = -coffee.stretch * 2.15 * (1 - weight)
    if (snack) nod = snack.chew * 1.9 * (1 - weight)
    const pass = ((Math.floor(clock) * 7 + actor.index * 3) % 10) / 10
    if (actor.zone === 'dispense' && actor.workAccuracy !== null && pass >= actor.workAccuracy)
      nod += smoothstep(.67, .74, phase) * (1 - smoothstep(.78, .9, phase)) * 2.3
    if (lunch) nod = lunch.nod * 2.1 * (1 - weight)
    if (greeting) nod += greeting.nod * 2.85 * (1 - weight)
  }
  const headHeight = height * .462
  const headY = -height - breathe - bounce + nod
  const glance = greeting ? greeting.direction * facing * Math.max(wave, greeting.nod) * 1.45 : 0
  const turn = still ? 0 : Math.sin(time * .00143 + actor.index * 2.5) * .95 + glance
  g.drawImage(sprite, 0, 0, sprite.width, cutoff + 3, -width / 2 + turn, headY, width, headHeight)

  const blink = !still && (time + 977 * actor.index + 1000) % (4670 + actor.index * 430) < 101
  if (blink) {
    const [near, far, nearY, farY] = eyes[id]
    for (const [x, y] of [[near, nearY], [far, farY]]) {
      const px = (x - .5) * width + turn
      const py = headY + y * headHeight / .39
      ellipse(g, px, py, 3.14, 2.8, skin[id])
      line(g, '#855c46', 1.15, px - 2, py, px + 2, py + .55)
    }
  }

  if (restock) {
    drawRestock(g, id, width, actor.moving || still ? 0 : elapsed - actor.changedAt, bounce, Boolean(actor.remark) && !still)
  } else if (actor.moving && actor.target === 'stock') {
    drawStockBox(g, art['open-box'], id, width, 0, undefined, bounce)
  } else if (!actor.moving && pose === 'carry') {
    const slot = stockShelfSlot(actor.tile)
    const shelf = slot && { x: (slot.x - p.x) / (facing * scale * turnWidth), y: (slot.y - p.y) / scale }
    drawStockBox(g, art['open-box'], id, width, shelf ? phase : 0, shelf, bounce)
  } else if (coffee) {
    drawCoffeeBreak(g, id, width, coffee)
  } else if (snack) {
    drawSnack(g, id, width, snack)
  } else if (lunch) {
    drawLunch(g, id, width, lunch)
  } else if (!actor.moving) {
    action(g, art, actor, width, phase)
  }
  if (greeting && wave > 0) {
    g.save()
    g.globalAlpha *= smoothstep(0, .30, wave)
    arm(g, id, width * .27, -52.8, width * .32 + wave * 6.5 + greeting.wrist * 3.5, -34 - wave * 39, true,
      smoothstep(.50, .95, wave))
    g.restore()
  }
  g.restore()
}
