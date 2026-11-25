import { ellipse, round } from './architecture.ts'
import { actorAnchor, CHARACTER_VISUAL_SCALE, cottageSeat, paintActor } from './characters.ts'
import { activities, staffName, workAreaLabel } from './data.ts'
import { gardenProps, paintBreeze, paintEntranceLight, paintFixtureDetail, paintGarden, paintGardenLighting,
  paintLighting, paintSky, roomLighting } from './interior.ts'
import type { RoomLighting } from './interior.ts'
import { COTTAGE, WORLD_HEIGHT, WORLD_WIDTH, cottageFurniture, project, roomProps, zoneSigns } from './layout.ts'
import type { Actor, Simulation } from './simulation.ts'
import type { NotesById } from './notes.ts'
import { staffGreetings } from './staff-greetings.ts'
import { canPlaceStaff } from './staff-placement.ts'
import { mascotMessage, mascotProfiles } from './mascots.ts'
import type { Mascot } from './mascots.ts'
import { snackStatus } from './snack-breaks.ts'
import { personalityStatus } from './staff-personalities.ts'

type Context = CanvasRenderingContext2D
type Art = Record<string, HTMLImageElement>
type Bubble = { box: HTMLDivElement; leader: HTMLDivElement; label: HTMLSpanElement; piece?: HTMLButtonElement }
type Block = { left: number; top: number; width: number; height: number }
type SpriteProp = { art: string; x: number; y: number; width: number; height: number; sway?: number; mirror?: boolean }

const embedded = import.meta.glob([
  './art/staff-*.webp', './art/rest-*.webp', './art/room-*.webp',
  './art/{pet-dog,pet-cat-white}.webp',
  './art/{pharmacy-interior,book,open-box,hammock,sofa,bench,olive,topiary,flowers,blossom,plant,stool,box}.webp',
], { eager: true, import: 'default', query: '?inline' }) as Record<string, string>
const EXTRA = ['pharmacy-interior', 'book', 'open-box', ...mascotProfiles.map(pet => pet.sprite)]
const BOARD_FONT = '750 14px "Board Sans", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif'

export const spriteSource = (sprite: string) => embedded['./art/' + sprite + '.webp']

export async function loadArt(sprites: readonly string[]) {
  const keys = [...new Set([...gardenProps.map(item => item.art), ...roomProps.map(item => item.art), ...EXTRA, ...sprites])]
  const collection: Art = {}
  await Promise.all(keys.map(async key => {
    const asset = new Image()
    const url = spriteSource(key)
    if (!url) throw new Error('아트 리소스 누락: ' + key)
    asset.src = url
    await asset.decode()
    collection[key] = asset
  }))
  return collection
}

function paintProp(g: Context, item: SpriteProp, image: HTMLImageElement, time: number) {
  const radius = item.width * .5
  const shadow = g.createRadialGradient(0, 0, 0, 0, 0, 1)
  shadow.addColorStop(0, '#5c432b6b')
  shadow.addColorStop(.63, '#67472b29')
  shadow.addColorStop(1, '#5c432b00')
  g.save()
  g.translate(item.x, item.y - 3)
  g.rotate(.13)
  g.scale(radius, Math.max(5, radius * .24))
  ellipse(g, 0, 0, 1, 1, shadow)
  g.restore()
  g.save()
  g.translate(item.x, item.y)
  if (item.sway) g.rotate(Math.sin(time * .00134 + item.x * 11.263) * item.sway)
  g.scale(item.mirror === false ? 1 : -1, 1)
  g.translate(-item.width / 2, -item.height)
  g.drawImage(image, 0, 0, item.width, item.height)
  paintFixtureDetail(g, item.art, item.width, item.height, time)
  g.restore()
}

function paintMascot(g: Context, image: HTMLImageElement, pet: Mascot, time: number, still: boolean) {
  const feet = project(pet.x, pet.y)
  const walking = !still && Boolean(pet.leg)
  const step = walking ? Math.sin(pet.movement * 13) : 0
  const bounce = step * step * (pet.id === 'dog' ? 3 : 1.9)
  const breath = still || walking ? 0 : Math.sin(time * .0021 + (pet.id === 'dog' ? 0 : 1.8)) * .65
  const height = pet.height * CHARACTER_VISUAL_SCALE + breath
  const width = height * image.width / image.height
  ellipse(g, feet.x, feet.y + 1, width * .48, 5.6, '#5b412b36')
  g.save()
  g.translate(feet.x, feet.y - bounce)
  g.scale(pet.facing, 1)
  g.rotate(step * .026)
  g.drawImage(image, -width / 2, -height, width, height)
  g.restore()
}

function zoneBoards(g: Context) {
  g.font = BOARD_FONT
  return Object.entries(zoneSigns).map(([key, sign]) => {
    const name = workAreaLabel(key as keyof typeof zoneSigns)
    const width = g.measureText(name).width + 30
    return { ...sign, name, left: sign.x - width / 2, top: sign.y - 12, width, height: 25 }
  })
}

function paintZoneSign(g: Context, board: ReturnType<typeof zoneBoards>[number]) {
  const { left, top, width, height, color, x, y, name } = board
  g.font = BOARD_FONT
  g.textAlign = 'center'
  g.textBaseline = 'middle'
  round(g, left, top + 1.7, width, height, 7, '#69503635')
  round(g, left, top, width, height, 7, '#fff8e6f1', '#c4a781c5')
  round(g, left + 5, top + 5, 3, height - 10, 1.5, color)
  g.fillStyle = '#5b4936'
  g.fillText(name, x + 2, y + .6)
}

const overlaps = (a: Block, b: Block) => a.left < b.left + b.width + 4 && a.left + a.width + 4 > b.left
  && a.top < b.top + b.height + 4 && a.top + a.height + 4 > b.top

const COTTAGE_BOX: Block = COTTAGE
const INITIAL_PROTECTED: Block[] = [
  { left: 0, top: 0, width: 162, height: 58 },
  { left: WORLD_WIDTH - 181, top: 0, width: 181, height: 56 },
  { left: 0, top: WORLD_HEIGHT - 70, width: 216, height: 70 },
]

const POSITIONS = [[0, 0], [-57, -15], [57, -15], [0, -49], [-108, -5], [108, -5],
  [-58, 33], [58, 33], [0, -97], [-108, -53], [108, -53], [-122, 42], [122, 42]]

function placeBubble(anchor: ReturnType<typeof actorAnchor>, width: number, height: number, off: boolean,
  occupied: readonly Block[]) {
  const left = off ? COTTAGE.left + 9 : 13
  const top = off ? COTTAGE.top + 33 : 13
  const right = off ? COTTAGE.left + COTTAGE.width - 9 : WORLD_WIDTH - 13
  const bottom = off ? COTTAGE.top + COTTAGE.height - 7 : WORLD_HEIGHT - 61
  const base = { x: anchor.x - width / 2, y: anchor.top - height - (off ? 6 : 13) }
  const at = (x: number, y: number): Block => ({
    left: Math.min(right - width, Math.max(left, x)),
    top: Math.min(bottom - height, Math.max(top, y)),
    width, height,
  })
  const clear = (position: Block) => !occupied.some(other => overlaps(position, other))
  for (const [dx, dy] of POSITIONS) {
    const position = at(base.x + dx, base.y + dy)
    if (clear(position)) return position
  }

  let closest: Block | undefined
  let distance = Infinity
  for (let row = top; row <= bottom - height; row += height + 5) {
    for (let column = left; column <= right - width; column += width + 6) {
      const candidate = at(column, row)
      const cost = Math.hypot(candidate.left - base.x, candidate.top - base.y)
      if (cost < distance && clear(candidate)) {
        closest = candidate
        distance = cost
      }
    }
  }
  return closest
}

function positionBubbles(g: Context, bubbles: readonly Bubble[], actors: Actor[], time: number, elapsed: number,
  still: boolean, boards: ReturnType<typeof zoneBoards>, widths: Map<string, number>, notes: NotesById, simulated: boolean,
  mascots: readonly Mascot[]) {
  const main = [...INITIAL_PROTECTED, ...boards]
  main.push(COTTAGE_BOX)
  for (const pet of mascots) {
    const { x, y } = project(pet.x, pet.y)
    const height = pet.height * CHARACTER_VISUAL_SCALE
    main.push({ left: x - 33 * CHARACTER_VISUAL_SCALE, top: y - height,
      width: 66 * CHARACTER_VISUAL_SCALE, height })
  }
  const rest: Block[] = []
  const entries = actors.map((actor, index) => ({ actor, bubble: bubbles[index], anchor: actorAnchor(actor, time) }))
  for (const { actor, anchor } of entries) {
    if (actor.present && (actor.moving || (actor.activity !== 'before' && actor.activity !== 'departed'))) {
      const off = actor.x >= 20
      const headSize = (off ? 25 : 36) * CHARACTER_VISUAL_SCALE
      const occupied = off ? rest : main
      occupied.push({ left: anchor.x - headSize / 2, top: anchor.top + 3, width: headSize, height: headSize })
    }
  }
  g.font = '850 14px "Board Sans", "Malgun Gothic", sans-serif'
  for (const { actor, bubble, anchor } of entries) {
    if (bubble.piece) {
      bubble.piece.hidden = !canPlaceStaff(actor)
      const height = anchor.y - anchor.top
      const width = Math.max(65, height * .58)
      bubble.piece.style.width = width + 'px'
      bubble.piece.style.height = (height + 8) + 'px'
      bubble.piece.style.translate = (anchor.x - width / 2) + 'px ' + (anchor.top - 4) + 'px'
      bubble.piece.style.zIndex = String(Math.round(anchor.y))
    }
    const leaving = (actor.activity === 'before' || actor.activity === 'departed') && !actor.moving
    const fade = leaving && !still ? Math.max(0, 1 - (elapsed - actor.changedAt) / 280) : leaving ? 0 : 1
    if (!actor.present || fade === 0) {
      bubble.box.hidden = true
      bubble.leader.hidden = true
      continue
    }
    const off = actor.x >= 20
    const unconfirmed = !simulated && actor.target === 'unknown'
    const label = unconfirmed ? activities.unknown.label : personalityStatus(actor) ?? (actor.target === 'wander' ? activities.wander.label
      : actor.moving ? '이동 중' : snackStatus(actor, elapsed) ?? activities[actor.activity].label)
    const name = staffName(actor.person)
    const key = name + '\u0000' + label
    let width = widths.get(key)
    if (width === undefined) {
      const statusWidth = Math.ceil(g.measureText(label).width) + 27
      g.font = '850 11px "Board Sans", "Malgun Gothic", sans-serif'
      width = Math.min(off ? 134 : 188, Math.max(86, statusWidth, Math.ceil(g.measureText(name).width) + 30))
      widths.set(key, width)
      g.font = '850 14px "Board Sans", "Malgun Gothic", sans-serif'
    }
    const baseHeight = off ? 32 : 45
    const occupied = off ? rest : main
    const note = notes.get(actor.person.id)
    const expanded = note && !off ? placeBubble(anchor, Math.max(width, 180), 85, false, occupied) : undefined
    const compactWidth = note ? Math.min(off ? 134 : 188, width + 13) : width
    const rect = expanded ?? placeBubble(anchor, compactWidth, baseHeight, off, occupied)
    bubble.box.hidden = !rect
    bubble.leader.hidden = !rect
    if (!rect) continue
    occupied.push(rect)
    const opacity = fade === 1 ? '' : String(fade)
    bubble.box.style.opacity = opacity
    bubble.leader.style.opacity = opacity
    bubble.box.classList.toggle('in-cottage', off)
    bubble.box.classList.toggle('note-expanded', Boolean(expanded))
    if (bubble.label.textContent !== label) {
      bubble.label.textContent = label
      bubble.box.classList.remove('changing')
      void bubble.box.offsetWidth
      bubble.box.classList.add('changing')
    }

    bubble.box.style.width = rect.width + 'px'
    bubble.box.style.height = rect.height + 'px'
    bubble.box.style.translate = rect.left + 'px ' + rect.top + 'px'
    positionLeader(bubble.leader, rect, anchor.x, anchor.top - 3)
  }
  return main
}

function positionLeader(leader: HTMLDivElement, rect: Block, x: number, y: number) {
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height - 1
  const dx = x - cx
  const dy = y - cy
  leader.style.width = Math.hypot(dx, dy) + 'px'
  leader.style.transform = `translate(${cx}px, ${cy}px) rotate(${Math.atan2(dy, dx)}rad)`
}

function positionMascotBubbles(g: Context, bubbles: readonly Bubble[], pets: readonly Mascot[], occupied: Block[],
  time: number, scale: number, still: boolean) {
  g.font = `800 ${15 * scale}px "Board Sans", "Malgun Gothic", sans-serif`
  pets.forEach((pet, index) => {
    const bubble = bubbles[index]
    const message = mascotMessage(pet, time)
    const point = project(pet.x, pet.y)
    const anchor = { ...point, top: point.y - pet.height * CHARACTER_VISUAL_SCALE - 2 }
    const rect = message && placeBubble(anchor, Math.ceil(g.measureText(message.text).width + 23 * scale), 39 * scale, false, occupied)
    bubble.box.hidden = !rect
    bubble.leader.hidden = !rect
    if (!rect || !message) return
    const opacity = still ? '' : String(message.opacity)
    if (bubble.label.textContent !== message.text) bubble.label.textContent = message.text
    bubble.box.style.width = rect.width + 'px'
    bubble.box.style.height = rect.height + 'px'
    bubble.box.style.translate = rect.left + 'px ' + rect.top + 'px'
    bubble.box.style.opacity = opacity
    bubble.leader.style.opacity = opacity
    positionLeader(bubble.leader, rect, point.x, anchor.top - 3)
    occupied.push(rect)
  })
}

export function createRenderer(canvas: HTMLCanvasElement, positioner: HTMLDivElement,
  bubbles: readonly Bubble[], petBubbles: readonly Bubble[], simulation: Simulation, art: Art, simulated: boolean) {
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) throw new Error('이 브라우저에서 Canvas를 사용할 수 없습니다.')
  const g = context
  const background = art['pharmacy-interior']
  const garden = document.createElement('canvas')
  garden.width = COTTAGE.width
  garden.height = COTTAGE.height
  const gardenContext = garden.getContext('2d')!
  gardenContext.translate(-COTTAGE.left, -COTTAGE.top)
  paintGarden(gardenContext)

  const gardenObjects = gardenProps.map(item => ({ ...item, ...project(item.x, item.y) }))
  const widths = new Map<string, number>()
  let boards = zoneBoards(g)
  let scaleX = 1
  let scaleY = 1
  let petBubbleScale = 1
  let ratio = 1
  let previousFrame = -1
  let previousRevision = -1
  let previousNotes: NotesById | undefined
  let previousStill: boolean | undefined

  const resize = () => {
    const { width, height } = canvas.getBoundingClientRect()
    ratio = Math.min(devicePixelRatio || 1, 1.65)
    canvas.width = Math.max(1, Math.round(width * ratio))
    canvas.height = Math.max(1, Math.round(height * ratio))
    scaleX = width / WORLD_WIDTH
    scaleY = height / WORLD_HEIGHT
    petBubbleScale = Math.min(3.7, Math.max(1, .86 / Math.max(.1, scaleX)))
    positioner.style.transform = `scale(${scaleX}, ${scaleY})`
    positioner.style.setProperty('--pet-bubble-scale', String(petBubbleScale))
    previousFrame = -1
  }

  function draw(still: boolean, notes: NotesById) {
    if (previousFrame === simulation.time && previousRevision === simulation.revision && previousNotes === notes && previousStill === still) return
    previousFrame = simulation.time
    previousRevision = simulation.revision
    previousNotes = notes
    previousStill = still
    const time = still ? 0 : simulation.time
    const { actors, mascots, minute } = simulation
    const lighting = roomLighting(minute)
    g.setTransform(scaleX * ratio, 0, 0, scaleY * ratio, 0, 0)
    g.drawImage(background, 0, 0, WORLD_WIDTH, WORLD_HEIGHT)
    paintBreeze(g, background, time)
    paintSky(g, lighting, time)

    const workers = actors.filter(actor => actor.present && actor.x < 20)
    const greetings = still ? undefined : staffGreetings(workers, time)
    const vacation = actors.filter(actor => actor.present && actor.x >= 20)
    const foreground = [
      ...workers.map(actor => ({
        y: project(actor.x, actor.y).y,
        draw: () => paintActor(g, art, actor, simulation.time, still, greetings?.get(actor.index)),
      })),
      ...mascots.map(pet => ({
        y: project(pet.x, pet.y).y,
        draw: () => paintMascot(g, art[pet.sprite], pet, time, still),
      })),
      ...roomProps.map(item => ({ y: item.y, draw: () => paintProp(g, item, art[item.art], time) })),
      // The top of the sign is the depth reference so feet never disappear under it.
      ...boards.map(board => ({ y: board.top - 4, draw: () => paintZoneSign(g, board) })),
    ].sort((a, b) => a.y - b.y)
    for (const item of foreground) item.draw()
    paintEntranceLight(g, simulation.door)
    paintLighting(g, lighting, time)

    drawGarden(actors, vacation, time, still, lighting)
    const occupied = positionBubbles(g, bubbles, actors, time, simulation.time, still, boards, widths, notes, simulated, mascots)
    positionMascotBubbles(g, petBubbles, mascots, occupied, simulation.time, petBubbleScale, still)
  }

  function drawGarden(actors: Actor[], vacation: Actor[], time: number, still: boolean, lighting: RoomLighting) {
    const { left, top, width, height } = COTTAGE
    round(g, left + 2, top + 4, width, height, 17, '#3b392341')
    g.drawImage(garden, left, top)
    g.save()
    g.beginPath()
    g.roundRect(left + 1, top + 1, width - 2, height - 2, 16)
    g.clip()
    const gardenDepth = [
      ...gardenObjects.map(item => ({ y: item.y, draw: () => paintProp(g, item, art[item.art], time) })),
      ...vacation.map(actor => {
        const seat = cottageSeat(actor)
        const position = seat && cottageFurniture[seat]
        return {
          y: position ? project(position.x, position.y).y + 1 : project(actor.x, actor.y).y,
          draw: () => paintActor(g, art, actor, time, still),
        }
      }),
    ].sort((a, b) => a.y - b.y)
    for (const item of gardenDepth) item.draw()
    paintGardenLighting(g, lighting)
    g.restore()
    g.font = BOARD_FONT
    g.textAlign = 'left'
    g.textBaseline = 'middle'
    g.fillStyle = '#455a3d'
    g.fillText('휴무 별장', left + 15, top + 17)
    g.textAlign = 'right'
    g.fillText(actors.filter(actor => actor.duty === 'off').length + '명', left + width - 15, top + 17)
  }

  resize()
  void document.fonts.ready.then(() => {
    widths.clear()
    boards = zoneBoards(g)
    previousFrame = -1
  })
  return { draw, resize }
}
