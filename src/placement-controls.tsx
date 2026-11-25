import { useEffect, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, RefObject } from 'react'
import { activities, staffName } from './data.ts'
import { CHARACTER_VISUAL_SCALE } from './characters.ts'
import type { Person } from './data.ts'
import { isOnPharmacyFloor, WORLD_HEIGHT, WORLD_WIDTH } from './layout.ts'
import type { Point } from './layout.ts'
import { spriteSource } from './renderer.ts'
import { placementAt, placementZones } from './staff-placement.ts'
import type { PlacementActivity } from './staff-placement.ts'

type HeldPiece = { person: Person; pointer: number; start: Point; dragged: boolean }

function dropActivity(point: Point, person: Person, fromCottage: boolean): PlacementActivity | undefined {
  const activity = placementAt(point)
  if (activity === 'dayoff' && fromCottage) return
  return activity ?? (fromCottage && isOnPharmacyFloor(point) ? person.home === 'lounge' ? 'stock' : person.home : undefined)
}

export function useStaffPlacement(world: RefObject<HTMLDivElement | null>, place: (id: string, activity: PlacementActivity) => boolean,
  setHeld?: (held: boolean) => void) {
  const [picked, setPicked] = useState<Person | null>(null)
  const [fromCottage, setFromCottage] = useState(false)
  const [ghost, setGhost] = useState<Point | null>(null)
  const [notice, setNotice] = useState('')
  const held = useRef<HeldPiece | null>(null)
  const zones = useRef<HTMLDivElement>(null)
  const keyboardSource = useRef<HTMLButtonElement | null>(null)
  const timeout = useRef<number | undefined>(undefined)

  function releasePiece() {
    if (!held.current) return
    held.current = null
    setHeld?.(false)
  }

  function dismiss() {
    releasePiece()
    setPicked(null)
    setGhost(null)
  }

  function announce(message: string) {
    window.clearTimeout(timeout.current)
    setNotice(message)
    timeout.current = window.setTimeout(() => setNotice(''), 4200)
  }

  useEffect(() => {
    function escape(event: KeyboardEvent) {
      if (event.key !== 'Escape') return
      dismiss()
      keyboardSource.current?.focus()
      keyboardSource.current = null
    }
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('keydown', escape)
      window.clearTimeout(timeout.current)
    }
  }, [])

  function scenePoint(event: ReactPointerEvent<HTMLButtonElement>) {
    const rect = world.current?.getBoundingClientRect()
    if (!rect?.width || !rect.height) return null
    return { x: (event.clientX - rect.left) * WORLD_WIDTH / rect.width,
      y: (event.clientY - rect.top) * WORLD_HEIGHT / rect.height }
  }

  function choose(person: Person, source?: HTMLButtonElement, cottage = false) {
    keyboardSource.current = source ?? null
    setFromCottage(cottage)
    setPicked(person)
    if (source) requestAnimationFrame(() => zones.current?.querySelector('button')?.focus())
  }

  function commit(person: Person, activity: PlacementActivity) {
    dismiss()
    const applied = place(person.id, activity)
    announce(applied ? staffName(person) + ' · ' + activities[activity].label : '지금은 이 직원의 상태를 옮길 수 없습니다.')
    keyboardSource.current?.focus()
    keyboardSource.current = null
  }

  function pieceProps(person: Person, cottage = false) {
    return {
      onPointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
        if (!event.isPrimary || event.button !== 0) return
        keyboardSource.current = null
        held.current = { person, pointer: event.pointerId, start: { x: event.clientX, y: event.clientY }, dragged: false }
        event.currentTarget.setPointerCapture(event.pointerId)
        setHeld?.(true)
        setFromCottage(cottage)
        setPicked(person)
      },
      onPointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
        const piece = held.current
        if (piece?.pointer !== event.pointerId) return
        piece.dragged ||= Math.hypot(event.clientX - piece.start.x, event.clientY - piece.start.y) >= 6
        if (piece.dragged) setGhost(scenePoint(event))
      },
      onPointerUp(event: ReactPointerEvent<HTMLButtonElement>) {
        const piece = held.current
        if (piece?.pointer !== event.pointerId) return
        releasePiece()
        if (!piece.dragged && Math.hypot(event.clientX - piece.start.x, event.clientY - piece.start.y) < 6) return
        const point = scenePoint(event)
        const activity = point && dropActivity(point, piece.person, cottage)
        if (activity) commit(piece.person, activity)
        else dismiss()
      },
      onLostPointerCapture(event: ReactPointerEvent<HTMLButtonElement>) {
        if (held.current?.pointer === event.pointerId) dismiss()
      },
      onClick(event: ReactMouseEvent<HTMLButtonElement>) {
        if (event.detail === 0) choose(person, event.currentTarget, cottage)
      },
    }
  }

  return { picked, fromCottage, ghost, notice, zones, choose, dismiss, commit, pieceProps }
}

export function PlacementTargets({ placement }: { placement: ReturnType<typeof useStaffPlacement> }) {
  const { picked, fromCottage, ghost } = placement
  if (!picked) return null
  const target = ghost && dropActivity(ghost, picked, fromCottage)
  const targets = fromCottage ? placementZones.filter(zone => zone.activity !== 'dayoff') : placementZones
  return <>
    <div className="placement-zones" ref={placement.zones}>
      {targets.map(({ activity, label, x, y, width, height }) => <button key={activity} type="button"
        className="placement-zone" data-target={target === activity} data-activity={activity}
        style={{ left: x, top: y, width, height }}
        aria-label={staffName(picked) + ' · ' + activities[activity].label}
        onClick={() => placement.commit(picked, activity)}><span>{label}</span></button>)}
    </div>
    {ghost && <img className="placement-ghost" alt="" src={spriteSource(picked.sprite)}
      style={{ left: ghost.x, top: ghost.y, height: 103 * CHARACTER_VISUAL_SCALE }} />}
  </>
}
