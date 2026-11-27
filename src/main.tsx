import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { createRoot } from 'react-dom/client'
import { activities, demo, staffKey, staffName, zoneLabels } from './data.ts'
import type { DataSource, Person } from './data.ts'
import { COTTAGE, project } from './layout.ts'
import { createRenderer, loadArt } from './renderer.ts'
import { createSimulation, PLACEMENT_IDLE_MS } from './simulation.ts'
import type { Actor, Duty, Simulation } from './simulation.ts'
import { readActiveRoster, readStaffing, saveActiveRoster, saveStaffing, StaffingControl } from './staffing.tsx'
import { createRosterData, koreaClock } from './schedule.ts'
import type { KoreaClock, RosterBook } from './schedule.ts'
import { readRoster, saveRoster, ScheduleDialog } from './schedule-dialog.tsx'
import { readWork, saveWork, workAssignments } from './work-status.ts'
import type { WorkPeriod } from './work-status.ts'
import { WorkStatusDialog } from './work-status-dialog.tsx'
import { appearanceAssets, applyAppearances, applyDisplayNames, chooseAppearance, chooseDisplayName,
  readAppearances, readDisplayNames, saveAppearances, saveDisplayNames } from './appearance.ts'
import { AppearanceDialog } from './appearance-dialog.tsx'
import { activeNotes, clearNote, notesForPeople, postNote, readNotes, saveNotes } from './notes.ts'
import type { NotesById } from './notes.ts'
import { NotesDialog } from './notes-dialog.tsx'
import { readFeedUrl, saveFeedUrl } from './internal-feed.ts'
import { useInternalFeed } from './use-internal-feed.ts'
import type { FeedState } from './use-internal-feed.ts'
import { InternalFeedDialog } from './internal-feed-dialog.tsx'
import { CalendarHoursDialog } from './calendar-hours-dialog.tsx'
import { PlacementTargets, useStaffPlacement } from './placement-controls.tsx'
import type { WorkPlacement } from './staff-placement.ts'
import { readBoardDuty, saveBoardDuty } from './board-duty.ts'
import { useSharedBoard } from './use-shared-board.ts'
import type { PublicBoard } from './shared-board.ts'
import { mascotMessage, mascotProfiles } from './mascots.ts'
import { snackStatus } from './snack-breaks.ts'
import { hasCheckoutBag, personalityStatus } from './staff-personalities.ts'
import { backgrounds, isBackgroundId, readBackground, saveBackground } from './scene-background.ts'
import type { BackgroundId } from './scene-background.ts'
import './styles.css'

const dutyLabels: Record<Duty, string> = {
  before: '출근 전', working: '근무 중', break: '휴식 중', off: '휴무', departed: '퇴근', unconfirmed: '근무 미확인',
}

const dateFormatter = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: 'long', day: 'numeric', weekday: 'short',
})

const waitingForFeed: DataSource = {
  source: 'connected', initialMinute: 0, millisecondsPerMinute: 60_000, people: [], shifts: {}, assignments: {},
}
const noWork: WorkPeriod[] = []
const placedWorkKey = 'pharmacy-cctv:placed-work:v1'

const actorStatus = (actor: Actor, simulated: boolean, time: number) => ({
  ...actor.person,
  name: staffName(actor.person),
  duty: actor.duty,
  label: personalityStatus(actor) ?? (actor.target === 'wander' ? activities.wander.label
    : !simulated && (actor.duty === 'working' || actor.duty === 'break') ? activities[actor.target].label
    : actor.moving ? '이동 중'
    : !simulated && actor.activity === 'departed' ? '근무시간 종료'
      : !simulated && actor.activity === 'before' ? '근무시간 전'
        : snackStatus(actor, time) ?? activities[actor.activity].label),
})

function readSnapshot(simulation: Simulation, simulated: boolean) {
  return { minute: simulation.minute, freeWalking: simulation.freeWalking, actors: simulation.actors.map(actor =>
    ({ ...actorStatus(actor, simulated, simulation.time), placed: simulation.isDirectlyPlaced(actor.person) })) }
}

function Time({ date, minute }: KoreaClock) {
  const hour = Math.floor(minute / 60)
  const suffix = String(minute % 60).padStart(2, '0')
  return <div className="clock" aria-label="한국 날짜와 시간" title="한국 표준시 (KST)">
    <span className="clock-date">{dateFormatter.format(new Date(date + 'T00:00:00+09:00'))}</span>
    <time dateTime={String(hour).padStart(2, '0') + ':' + suffix} className="clock-time">
      <small>{hour < 12 ? '오전' : '오후'}</small> {hour % 12 || 12}:{suffix}
    </time>
  </div>
}

declare global {
  interface Window {
    advanceTime?: (milliseconds: number) => void
    render_game_to_text?: () => string
  }
}

type AppProps = {
  data: DataSource
  clock: KoreaClock
  background: BackgroundId
  changeBackground: (background: BackgroundId) => void
  sharing: boolean
  sharedBoard: PublicBoard | null
  sync: ReturnType<typeof useSharedBoard>
  assignments: DataSource['assignments']
  placements: DataSource['assignments']
  allowPlacement: boolean
  placeFileStaff: (id: string, activity: WorkPlacement, extend?: boolean) => boolean
  hasWorkFile: boolean
  feedState: FeedState | null
  notes: NotesById
  openNotes: () => void
  appearances: readonly Person[]
  openAppearance: (id: string) => void
  openRoster: () => void
  openWork: () => void
}

function App({ data, clock, background, changeBackground, sharing, sharedBoard, sync, assignments, placements,
  allowPlacement, placeFileStaff, hasWorkFile, feedState, notes, openNotes, appearances,
  openAppearance, openRoster, openWork }: AppProps) {
  const simulated = data.source === 'simulation'
  const [simulation] = useState(() => {
    const current = createSimulation({ ...data, assignments }, simulated ? data.initialMinute : clock.minute,
      readStaffing(), placements, allowPlacement ? readBoardDuty(clock.date, data) : [],
      simulated ? readActiveRoster(data.people) : undefined)
    current.setAppearances(appearances)
    current.showRudolph(background === 'santa')
    return current
  })
  const [snapshot, setSnapshot] = useState(() => readSnapshot(simulation, simulated))
  const [paused, setPaused] = useState(false)
  const [cottageOpen, setCottageOpen] = useState(false)
  const [reservesOpen, setReservesOpen] = useState(false)
  const [rosterOpen, setRosterOpen] = useState(() => Boolean(data.calendar)
    || matchMedia('(max-width: 800px), (max-aspect-ratio: 5/4)').matches)
  const [fullscreen, setFullscreen] = useState(false)
  const [fallbackFullscreen, setFallbackFullscreen] = useState(false)
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'error'>('loading')
  const notesRef = useRef(notes)
  notesRef.current = notes
  const backgroundRef = useRef(background)
  backgroundRef.current = background
  const clockRef = useRef<KoreaClock | undefined>(undefined)
  clockRef.current = simulated ? undefined : clock
  const world = useRef<HTMLDivElement>(null)
  const canvas = useRef<HTMLCanvasElement>(null)
  const bubbles = useRef<HTMLDivElement[]>([])
  const labels = useRef<HTMLSpanElement[]>([])
  const leaders = useRef<HTMLDivElement[]>([])
  const pieces = useRef<HTMLButtonElement[]>([])
  const petBoxes = useRef<HTMLDivElement[]>([])
  const petLeaders = useRef<HTMLDivElement[]>([])
  const petLabels = useRef<HTMLSpanElement[]>([])
  const toggleFrame = useRef(false)
  toggleFrame.current = paused
  const shareRoster = simulated && sharing
  const placement = useStaffPlacement(world, (id, activity) => {
    if (!allowPlacement) return false
    const returning = simulation.actors.some(actor => actor.person.id === id && actor.duty === 'off')
    if (!simulated && activity !== 'dayoff') {
      const extend = returning || simulation.dutyOverrides.some(([staff, duty]) => staff === id && duty === 'working')
      if (!placeFileStaff(id, activity, extend)) return false
      if (!returning) return true
    }
    if (!simulation.placeStaff(id, activity)) return false
    if (shareRoster) {
      const duty = simulation.dutyOverrides.find(([staff]) => staff === id)?.[1] ?? null
      sync.save({
        ...(returning || activity === 'dayoff' ? { duties: [[id, duty]] } : {}),
        work: [[id, activity === 'dayoff' ? null : activity]],
      })
    }
    if (returning || activity === 'dayoff') {
      saveBoardDuty(clock.date, data, simulation.dutyOverrides)
      setSnapshot(readSnapshot(simulation, simulated))
      if (returning) setCottageOpen(false)
    }
    return true
  }, simulated ? simulation.setPlacementHeld : undefined)
  const hasManualPlacement = simulated && snapshot.actors.some(actor => actor.placed)

  const knownSchedule = data.people.some(person => data.shifts[person.id] !== undefined)
    || Object.values(data.carryUntil ?? {}).some(until => (until ?? 0) > snapshot.minute)
  const calendar = data.calendar
  let workLabel = hasWorkFile ? '근무표 · 업무 파일' : '파일 근무표'
  if (!knownSchedule) workLabel = '파일 근무표 · 오늘 일정 미확인'
  if (paused) workLabel = '파일 근무표 · 일시정지'
  if (feedState) {
    workLabel = '내부 시스템 연동'
    if (paused) workLabel = '내부 시스템 · 일시정지'
    if (!knownSchedule) workLabel = '내부 시스템 · 오늘 일정 미확인'
    if (feedState.status === 'connecting') workLabel = '내부 시스템 연결 중'
    if (feedState.status === 'error') workLabel = feedState.snapshot ? '연동 끊김 · 이전 근무표' : '내부 시스템 연동 오류'
  }
  if (calendar) {
    workLabel = '달력 근무표'
    if (calendar.planned.some(id => !data.shifts[id])) workLabel = '달력 · 일부 시간 미확인'
    if (!knownSchedule) workLabel = calendar.inMonth ? '달력 근무표 · 현재 인원 미확인' : '달력 근무표 · 오늘 일정 미확인'
  }
  const workControl = feedState ? '내부 시스템 연동 설정' : calendar ? '달력 근무시간 설정' : '업무 상태 가져오기'
  const activeIds = new Set(simulation.activeRoster)
  const activeActors = snapshot.actors.filter(actor => activeIds.has(actor.id))
  const activePeople = appearances.filter(person => activeIds.has(person.id))
  const reserves = simulated ? snapshot.actors.filter(actor => !activeIds.has(actor.id)) : []
  const workers = activeActors.filter(actor => actor.duty === 'working' || actor.duty === 'break')
  const cottageGuests = activePeople.filter(person => activeActors.some(actor => actor.id === person.id && actor.duty === 'off'))
  const rosterActors = calendar ? [
    ...activeActors.filter(actor => calendar.planned.includes(actor.id)),
    ...activeActors.filter(actor => !calendar.planned.includes(actor.id)),
  ] : activeActors
  const countLabel = calendar && !knownSchedule
    ? (calendar.inMonth ? '오늘 예정 ' + calendar.planned.length + '명' : '오늘 예정 미확인')
    : '근무표상 ' + workers.length + '명'

  function applyStaffing(ids: string[] | null) {
    const removed = simulation.dutyOverrides.map(([id]) => [id, null] as [string, null])
    simulation.setStaffing(ids)
    saveStaffing(simulation.staffing)
    saveBoardDuty(clock.date, data, simulation.dutyOverrides)
    sync.save({ staffing: simulation.staffing, duties: removed, work: simulation.activeRoster.map(id => [id, null]) })
    setSnapshot(readSnapshot(simulation, simulated))
  }

  function applyActiveRoster(ids: string[]) {
    const currentPick = placement.picked
    if (currentPick && !ids.includes(currentPick.id)) placement.dismiss()
    const before = new Set(simulation.activeRoster)
    simulation.setActiveRoster(ids)
    const after = new Set(simulation.activeRoster)
    const changed = data.people.flatMap(({ id }) => before.has(id) === after.has(id) ? [] : [[id, after.has(id)] as [string, boolean]])
    if (changed.length) sync.save({ active: changed })
    saveActiveRoster(simulation.activeRoster)
    saveStaffing(simulation.staffing)
    if (!ids.length) setReservesOpen(true)
    setSnapshot(readSnapshot(simulation, simulated))
  }

  useEffect(() => {
    simulation.setDutyOverrides(allowPlacement ? readBoardDuty(clock.date, data) : [])
    setSnapshot(readSnapshot(simulation, simulated))
  }, [allowPlacement, clock.date, data, simulated, simulation])

  useEffect(() => {
    if (!shareRoster || !sharedBoard) return
    const before = simulation.revision
    simulation.setActiveRoster(sharedBoard.active)
    const staffing = simulation.staffing
    if ((staffing === null) !== (sharedBoard.staffing === null) ||
      (staffing && sharedBoard.staffing && (staffing.length !== sharedBoard.staffing.length ||
        staffing.some(id => !sharedBoard.staffing?.includes(id))))) {
      simulation.setStaffing(sharedBoard.staffing)
    }
    simulation.setDutyOverrides(sharedBoard.date === clock.date ? sharedBoard.duties : [])
    simulation.setSharedWork(sharedBoard.date === clock.date ? sharedBoard.work.map(([id, item]) => [id, item.activity]) : [])
    if (simulation.revision === before) return
    saveActiveRoster(simulation.activeRoster)
    saveStaffing(simulation.staffing)
    saveBoardDuty(clock.date, data, simulation.dutyOverrides)
    setSnapshot(readSnapshot(simulation, simulated))
  }, [shareRoster, sharedBoard, clock.date, data, simulated, simulation])

  useEffect(() => {
    simulation.showRudolph(background === 'santa')
  }, [background, simulation])

  useEffect(() => {
    simulation.setAssignments(assignments)
  }, [assignments, simulation])

  useEffect(() => {
    simulation.setPlacements(placements)
  }, [placements, simulation])

  useEffect(() => {
    simulation.setAppearances(appearances)
  }, [appearances, simulation])

  useEffect(() => {
    function syncFullscreen() { setFullscreen(Boolean(document.fullscreenElement)) }
    function escape(event: KeyboardEvent) {
      if (event.key === 'Escape') setFallbackFullscreen(false)
    }
    document.addEventListener('fullscreenchange', syncFullscreen)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('fullscreenchange', syncFullscreen)
      document.removeEventListener('keydown', escape)
    }
  }, [])

  async function toggleFullscreen() {
    if (fallbackFullscreen) {
      setFallbackFullscreen(false)
    } else if (document.fullscreenElement) {
      await document.exitFullscreen()
    } else {
      try {
        if (!document.fullscreenEnabled) throw new Error('fullscreen unavailable')
        await document.documentElement.requestFullscreen()
      } catch {
        setFallbackFullscreen(true)
      }
    }
  }

  useEffect(() => {
    const surface = canvas.current
    const positioner = world.current
    if (!surface || !positioner) return
    const reduced = matchMedia('(prefers-reduced-motion: reduce)')
    const points = data.people.map((_, index) => ({
      box: bubbles.current[index], leader: leaders.current[index], label: labels.current[index],
      piece: allowPlacement ? pieces.current[index] : undefined,
    }))
    const petPoints = mascotProfiles.map((_, index) => ({
      box: petBoxes.current[index], leader: petLeaders.current[index], label: petLabels.current[index],
    }))
    let disposed = false
    let observer: ResizeObserver | undefined
    let frame = 0
    let lastFrame = 0
    let manual = false
    let currentKey = ''

    function publish() {
      const key = [simulation.minute, simulation.revision, ...simulation.actors.map(actor =>
        [actor.duty, actor.activity, actor.target, actor.moving, personalityStatus(actor), snackStatus(actor, simulation.time)].join('/'))].join('|')
      if (key !== currentKey) {
        currentKey = key
        setSnapshot(readSnapshot(simulation, simulated))
      }
    }

    const assets = [...appearanceAssets, ...data.people.flatMap(person => [person.sprite, ...Object.values(person.restArt ?? {})])]
    void loadArt(assets).then(art => {
      if (disposed) return
      const renderer = createRenderer(surface, positioner, points, petPoints, simulation, art, simulated)
      const draw = () => renderer.draw(reduced.matches, notesRef.current, backgroundRef.current)
      observer = new ResizeObserver(() => { renderer.resize(); draw() })
      observer.observe(surface)
      const loop = (timestamp: number) => {
        const delta = lastFrame ? Math.min(timestamp - lastFrame, 100) : 0
        lastFrame = timestamp
        if (clockRef.current) simulation.syncClock(clockRef.current.minute)
        if (!toggleFrame.current && !manual && !document.hidden) simulation.step(delta)
        draw()
        publish()
        frame = requestAnimationFrame(loop)
      }
      window.advanceTime = (milliseconds: number) => {
        if (!Number.isFinite(milliseconds) || milliseconds < 0) return
        manual = true
        simulation.step(milliseconds)
        draw()
        publish()
      }
      window.render_game_to_text = () => JSON.stringify({
        coordinateSystem: 'walkable floor tiles projected into the pharmacy image; the cottage is a separate inset',
        mode: data.source, background: backgroundRef.current, minute: simulation.minute, elapsed: simulation.time, day: simulation.day,
        paused: toggleFrame.current, door: simulation.door, staffing: simulation.staffing, rendered: true,
        freeWalking: simulation.freeWalking, activeRoster: simulation.activeRoster,
        calendar: data.calendar,
        pets: simulation.mascots.map(pet => ({
          id: pet.id, name: pet.name, screen: project(pet.x, pet.y), moving: Boolean(pet.leg),
          following: pet.following,
          message: mascotMessage(pet, simulation.time)?.text ?? null,
        })),
        actors: simulation.actors.map(actor => ({
          ...actorStatus(actor, simulated, simulation.time), x: actor.x, y: actor.y, zone: zoneLabels[actor.zone],
          activity: actor.activity, target: actor.target, moving: actor.moving, present: actor.present,
          note: notesRef.current.get(actor.person.id),
          stamina: actor.stamina ? Math.round(actor.stamina.value) : null,
          snacksEaten: actor.stamina?.bites ?? 0,
          workRate: actor.workRate, workAccuracy: actor.workAccuracy, checkoutBag: hasCheckoutBag(actor),
          screen: project(actor.x, actor.y),
        })),
      })
      draw()
      publish()
      setLoadState('ready')
      frame = requestAnimationFrame(loop)
    }).catch(error => {
      console.error(error)
      if (!disposed) setLoadState('error')
    })

    return () => {
      disposed = true
      observer?.disconnect()
      cancelAnimationFrame(frame)
      delete window.advanceTime
      delete window.render_game_to_text
    }
  }, [simulation, data, allowPlacement])

  return <div className={'app' + (fallbackFullscreen ? ' expanded' : '')}>
    <header className="topbar">
      <div className="brand">
        <span className="brand-mark" aria-hidden="true"><span className="cross" /></span>
        <div>
          <h1>약국 CCTV</h1>
          <p>가상 업무 현황판</p>
        </div>
      </div>
      <div className="top-data">
        <Time {...clock} />
        <span className="separator" aria-hidden="true" />
        {simulated
          ? <StaffingControl people={activePeople} onDuty={workers.length}
              current={workers.map(actor => actor.id)} apply={applyStaffing} openRoster={openRoster} />
          : <button className="working-count staffing-trigger" type="button" onClick={openRoster} aria-haspopup="dialog"
              aria-label={feedState && !feedState.snapshot ? '내부 시스템 연동, 근무표 대기' : '근무표 관리, ' + countLabel}>
              <span className="person-icon" aria-hidden="true" />
              {feedState && !feedState.snapshot ? '근무표 대기'
                : calendar ? <strong>{countLabel}</strong> : <>근무표상 <strong>{workers.length}명</strong></>}
              <span className="staffing-chevron" aria-hidden="true" />
            </button>}
      </div>
      <div className="controls">
        <label className="background-choice">
          <span>배경</span>
          <select aria-label="배경" value={background} onChange={event => {
            const next = event.currentTarget.value
            if (isBackgroundId(next)) changeBackground(next)
          }}>
            {Object.entries(backgrounds).map(([id, background]) => <option key={id} value={id}>{background.label}</option>)}
          </select>
        </label>
        <button className="pause-button" type="button" aria-label={paused ? '재생' : '일시정지'}
          title={paused ? '재생' : '일시정지'} onClick={() => setPaused(current => !current)}>
          <span aria-hidden="true" className={paused ? 'play-icon' : 'pause-icon'} />
        </button>
        <button className="fullscreen-button" type="button" onClick={toggleFullscreen}>
          <span className="fullscreen-icon" aria-hidden="true"><i /><i /><i /><i /></span>
          <span>{fullscreen || fallbackFullscreen ? '전체 화면 닫기' : '전체 화면'}</span>
        </button>
      </div>
    </header>

    <main className="viewer" aria-label="약국 가상 업무 공간">
      <div className="scene" data-ready={loadState === 'ready'}>
        <div className="scene-markers" aria-hidden="true"><i /><i /><i /><i /></div>
        <div className="scene-caption">
          <span className="camera-icon" aria-hidden="true" />
          <span>약국 전경</span>
          {allowPlacement && <span className="placement-hint">캐릭터를 끌어 상태 옮기기</span>}
        </div>
        {simulated ? <div className="mode-chip" title={`직접 배치 후 재생 중 ${PLACEMENT_IDLE_MS / 60_000}분이 지나면 직원들이 번갈아 자유롭게 이동합니다.`}>
          <span className={paused ? 'mode-dot paused' : 'mode-dot'} />
          {paused ? '시뮬레이션 일시정지' : snapshot.freeWalking ? '시뮬레이션 · 자율 이동'
            : hasManualPlacement ? '시뮬레이션 · 직접 배치' : '시뮬레이션 모드'}
          {shareRoster && <span className="shared-status" role="status"> · {sync.status}</span>}
        </div> : <button type="button" className="mode-chip mode-work" onClick={openWork}
          aria-haspopup="dialog" aria-label={feedState || calendar ? workControl + ', ' + workLabel : workControl} title={workControl}>
          <span className={paused || (calendar && !knownSchedule) || (feedState && feedState.status !== 'ready') ? 'mode-dot paused' : 'mode-dot'} />
          {workLabel}
          <span className="staffing-chevron" aria-hidden="true" />
        </button>}
        <canvas ref={canvas} aria-hidden="true" onPointerDown={placement.dismiss} />
        <div className="overlay" ref={world}>
          <button type="button" className="cottage-entry" aria-label={'휴무 별장, 쉬는 직원 ' + cottageGuests.length + '명'}
            aria-expanded={cottageOpen} aria-controls="cottage-picker"
            style={{ left: COTTAGE.left, top: COTTAGE.top, width: COTTAGE.width, height: COTTAGE.height }}
            onClick={() => { placement.dismiss(); setCottageOpen(open => !open) }} />
          {allowPlacement && <div className="placement-pieces">
            {appearances.map((person, index) => <button key={person.id} type="button" className="placement-piece"
              data-staff={person.id} ref={node => { if (node) pieces.current[index] = node }} hidden
              aria-label={staffName(person) + ' 상태 옮기기'} aria-pressed={placement.picked?.id === person.id}
              {...placement.pieceProps(person)} />)}
          </div>}
          {data.people.map((person, index) => {
            const note = notes.get(person.id)
            const appearance = appearances[index] ?? person
            return <div key={person.id} aria-hidden="true">
              <div className="bubble-leader" ref={node => { if (node) leaders.current[index] = node }} />
              <div className="bubble" ref={node => { if (node) bubbles.current[index] = node }}
                style={{ '--person': person.color } as CSSProperties}>
                <span className="bubble-name"><i />{staffName(appearance)}{note && <em className="note-flag">메모</em>}</span>
                <span className="bubble-task" ref={node => { if (node) labels.current[index] = node }} />
                {note && <span className="bubble-note">
                  <strong>{note.author}</strong><span>{note.text}</span>
                </span>}
              </div>
            </div>
          })}
          {mascotProfiles.map((pet, index) => <div key={pet.id}>
            <div className="bubble-leader pet-leader" hidden
              ref={node => { if (node) petLeaders.current[index] = node }} />
            <div className="pet-bubble" data-pet={pet.id} hidden
              ref={node => { if (node) petBoxes.current[index] = node }}>
              <span className="pet-name">{pet.name}</span>
              <span className="pet-message" ref={node => { if (node) petLabels.current[index] = node }} />
            </div>
          </div>)}
          <PlacementTargets placement={placement} />
        </div>
        {cottageOpen && <section id="cottage-picker" className="cottage-picker" aria-label="휴무 별장 직원">
          <header><strong>휴무 직원 {cottageGuests.length}명</strong>
            <button type="button" className="cottage-close" aria-label="별장 명단 닫기" onClick={() => {
              placement.dismiss()
              setCottageOpen(false)
            }}>×</button></header>
          {cottageGuests.length === 0 ? <p>쉬는 직원이 없습니다.</p> : <>
            {allowPlacement && <p>직원을 약국으로 끌어오세요.</p>}
            <div className="cottage-people">
              {cottageGuests.map(person => allowPlacement
                ? <button key={person.id} type="button" aria-label={staffName(person) + ' 약국으로 옮기기'}
                    aria-pressed={placement.picked?.id === person.id} {...placement.pieceProps(person, true)}>{staffName(person)}</button>
                : <span key={person.id}>{staffName(person)}</span>)}
            </div>
          </>}
        </section>}
        <div className={placement.notice ? 'placement-notice visible' : 'placement-notice'} role="status">
          {placement.notice}
        </div>
        {loadState !== 'ready' && <p className="loading" role="status">
          {loadState === 'loading' ? '업무 공간 준비 중' : '업무 공간을 열 수 없습니다. 페이지를 새로고침해 주세요.'}
        </p>}
      </div>

      <details className="roster" open={rosterOpen} onToggle={event => setRosterOpen(event.currentTarget.open)}>
        <summary>
          <span className="person-icon" aria-hidden="true" />
          <span>{calendar ? '달력 명단' : '직원 현황'} <strong>{rosterActors.length}명</strong></span>
          <span className="roster-chevron" aria-hidden="true" />
        </summary>
        {data.people.length > 0 && <div className="roster-actions">
          {simulated && <div className="roster-size">
            <label htmlFor="active-roster-size">현황 인원</label>
            <select id="active-roster-size" value={activeIds.size} onChange={event => {
              const count = Number(event.currentTarget.value)
              applyActiveRoster([...activePeople, ...appearances.filter(person => !activeIds.has(person.id))]
                .slice(0, count).map(person => person.id))
            }}>
              {Array.from({ length: appearances.length + 1 }, (_, count) =>
                <option value={count} key={count}>{count}명</option>)}
            </select>
          </div>}
          <button type="button" onClick={openNotes} aria-haspopup="dialog">전달 메모</button>
          <button type="button" onClick={() => openAppearance(data.people[0].id)} aria-haspopup="dialog">직원 이름·캐릭터 설정</button>
        </div>}
        <ul>{rosterActors.map(actor => {
          const note = notes.get(actor.id)
          const planned = calendar?.planned.includes(actor.id) && actor.duty === 'unconfirmed'
          const calendarLabel = calendar?.inMonth ? (planned ? '근무시간 미확인' : '오늘 명단에 없음') : '오늘 일정 미확인'
          return <li key={actor.id} data-duty={actor.duty}
          style={{ '--person': actor.color } as CSSProperties}>
          <span className="roster-dot" aria-hidden="true" />
          <span className="roster-copy">
            <button type="button" className="roster-name roster-name-button" title={actor.name + ' 이름·캐릭터 설정'}
              aria-label={actor.name + ' 이름·캐릭터 설정'} aria-haspopup="dialog" onClick={() => openAppearance(actor.id)}>
              <span>{actor.name}</span> <small>{actor.role}</small>
            </button>
            <span className="roster-task">
              {calendar && actor.duty === 'unconfirmed' ? calendarLabel : actor.label}
              {actor.placed && <small className="roster-placement">직접 지정</small>}
            </span>
          </span>
          <span className="roster-status"><span className="roster-duty">{planned ? '근무 예정' : !simulated && actor.duty === 'working' ? '근무표상 근무'
              : !simulated && actor.duty === 'departed' ? '근무시간 종료'
                : !simulated && actor.duty === 'before' ? '근무시간 전' : dutyLabels[actor.duty]}</span>
            {simulated && <button type="button" className="roster-switch" role="switch" aria-checked="true"
              aria-label={actor.name + ' 현황 표시'} onClick={() => applyActiveRoster([...activeIds].filter(id => id !== actor.id))}>ON</button>}
          </span>
          {note && <span className="roster-note"><strong>{note.author}</strong> {note.text}</span>}
        </li>})}</ul>
        {reserves.length > 0 && <div className="roster-reserves">
          <button type="button" className="roster-reserve-toggle" aria-expanded={reservesOpen} aria-controls="reserve-employees"
            onClick={() => setReservesOpen(open => !open)}>예비 직원 {reserves.length}명 <span aria-hidden="true">{reservesOpen ? '▴' : '▾'}</span></button>
          {reservesOpen && <div id="reserve-employees" className="roster-reserve-list">
            {reserves.map(actor => <div key={actor.id}>
              <button type="button" className="roster-name roster-name-button" aria-label={actor.name + ' 이름·캐릭터 설정'}
                aria-haspopup="dialog" onClick={() => openAppearance(actor.id)}><span>{actor.name}</span></button>
              <button type="button" className="roster-switch" role="switch" aria-checked="false"
                aria-label={actor.name + ' 현황 표시'} onClick={() => applyActiveRoster([...activeIds, actor.id])}>OFF</button>
            </div>)}
          </div>}
        </div>}
      </details>
    </main>
  </div>
}

function Board() {
  const [appearancePreferences, setAppearancePreferences] = useState(readAppearances)
  const [displayNames, setDisplayNames] = useState(readDisplayNames)
  const [sharedNames, setSharedNames] = useState<typeof displayNames | null>(null)
  const [background, setBackground] = useState(readBackground)
  const [sharedBoard, setSharedBoard] = useState<PublicBoard | null>(null)
  const [appearanceTarget, setAppearanceTarget] = useState<string | null>(null)
  const [notes, setNotes] = useState(readNotes)
  const [notesOpen, setNotesOpen] = useState(false)
  const [roster, setRoster] = useState(() => readRoster(demo.people.length))
  const [work, setWork] = useState(() => roster ? readWork(roster.names) : [])
  const [placedWork, setPlacedWork] = useState(() => roster ? readWork(roster.names, placedWorkKey) : [])
  const [endpoint, setEndpoint] = useState(readFeedUrl)
  const { state: feed, refresh: refreshFeed } = useInternalFeed(endpoint, demo.people.length)
  const [dialog, setDialog] = useState<'roster' | 'work' | 'feed' | 'hours' | null>(null)
  const [revision, setRevision] = useState(0)
  const [clock, setClock] = useState(koreaClock)
  const date = clock.date
  const sharing = location.protocol === 'https:' || location.hostname === 'localhost'
  const sync = useSharedBoard(sharing, date, board => {
    setSharedBoard(board)
    setBackground(board.background)
    const entries = board.names.map(([id, name]) => [staffKey({ id, name }, 'simulation'), name] as const)
    setSharedNames(previous => previous && entries.length === Object.keys(previous).length &&
      entries.every(([key, name]) => previous[key] === name) ? previous : Object.fromEntries(entries))
  })
  const currentRoster = feed ? feed.snapshot?.roster : roster
  const currentWork = feed ? (feed.status === 'ready' ? feed.snapshot?.work ?? noWork : noWork) : work
  const connected = Boolean(roster || endpoint)
  const data = useMemo(() => currentRoster ? createRosterData(currentRoster, demo, { date, minute: 0 })
    : connected ? waitingForFeed : demo, [currentRoster, connected, date])
  const assignments = useMemo(() => connected ? workAssignments(currentWork, data.people, date) : data.assignments,
    [connected, currentWork, data, date])
  const placements = useMemo(() => workAssignments(endpoint ? noWork : placedWork, data.people, date),
    [endpoint, placedWork, data.people, date])
  const appKey = feed ? 'feed:' + feed.url + ':' + date + ':' + feed.rosterRevision
    : roster ? 'file:' + date + ':' + revision : 'simulation'
  const shareNames = sharing && data.source === 'simulation'
  const names = shareNames && sharedNames ? sharedNames : displayNames
  const appearances = useMemo(() => applyDisplayNames(applyAppearances(data.people, data.source, appearancePreferences),
    data.source, names), [data, appearancePreferences, names])
  const displayedNotes = useMemo(() => notesForPeople(notes, data.people, data.source), [notes, data])

  useEffect(() => { saveBackground(background) }, [background])

  useEffect(() => {
    saveNotes(notes)
    if (!notes.length) return
    const expiry = Math.min(...notes.map(note => note.expiresAt))
    const timer = window.setTimeout(() => setNotes(current => activeNotes(current)), Math.max(1, expiry - Date.now()))
    return () => window.clearTimeout(timer)
  }, [notes])

  useEffect(() => {
    const timer = window.setInterval(() => {
      const now = koreaClock()
      setClock(previous => previous.date === now.date && previous.minute === now.minute ? previous : now)
    }, 500)
    return () => window.clearInterval(timer)
  }, [])

  function selectEndpoint(url: string) {
    setClock(koreaClock())
    setEndpoint(url)
    saveFeedUrl(url)
    if (!url) setDialog(null)
  }

  function storePlacedWork(next: WorkPeriod[]) {
    setPlacedWork(next)
    saveWork(next, placedWorkKey)
  }

  function placeFileStaff(id: string, activity: WorkPlacement, extend = false) {
    if (!roster || endpoint) return false
    const person = data.people.find(candidate => candidate.id === id)
    const now = koreaClock()
    if (!person || now.date !== date) return false
    const shift = data.shifts[id]
    const carry = data.carryUntil?.[id] ?? 0
    const scheduledEnd = Math.max(carry, shift && shift.start <= now.minute ? shift.end : 0)
    const end = scheduledEnd > now.minute ? scheduledEnd : extend ? 1440 : scheduledEnd
    if (end <= now.minute) return false
    const next = placedWork.filter(entry => entry.date === date && entry.name !== person.name)
    next.push({ date, name: person.name, activity, start: now.minute, end })
    storePlacedWork(next)
    return true
  }

  function replaceRoster(value: RosterBook | null) {
    setClock(koreaClock())
    setRoster(value)
    setDialog(null)
    const retained = value ? work.filter(entry => value.names.includes(entry.name)) : []
    setWork(retained)
    saveWork(retained)
    storePlacedWork([])
    setRevision(current => current + 1)
    saveRoster(value)
  }

  function replaceWork(value: WorkPeriod[]) {
    setWork(value)
    saveWork(value)
    if (value.length) storePlacedWork([])
    setDialog(null)
  }

  function replaceAppearance(id: string, sprite: string, name: string) {
    const renamed = chooseDisplayName(names, data.source, data.people, id, name)
    const next = chooseAppearance(appearancePreferences, data.source, appearances, id, sprite)
    saveAppearances(next)
    setAppearancePreferences(next)
    if (renamed !== names) {
      const person = data.people.find(item => item.id === id)
      if (person) {
        const key = staffKey(person, data.source)
        const selectedName = renamed[key]
        const local = { ...displayNames }
        if (selectedName) local[key] = selectedName
        else delete local[key]
        setDisplayNames(local)
        saveDisplayNames(local)
        if (shareNames) {
          setSharedNames(renamed)
          sync.save({ names: [[id, selectedName ?? null]] })
        }
      }
    }
    setAppearanceTarget(null)
  }

  function changeBackground(next: BackgroundId) {
    setBackground(next)
    sync.save({ background: next })
  }

  function publishNote(author: string, recipient: string, text: string) {
    setNotes(postNote(notes, appearances, data.source, author, recipient, text))
    setNotesOpen(false)
  }

  return <>
    <App key={appKey} data={data} feedState={feed}
      clock={clock} assignments={assignments} hasWorkFile={work.length > 0}
      background={background} changeBackground={changeBackground} sharing={sharing} sharedBoard={sharedBoard} sync={sync}
      placements={placements} allowPlacement={!endpoint} placeFileStaff={placeFileStaff}
      appearances={appearances} openAppearance={setAppearanceTarget}
      notes={displayedNotes} openNotes={() => setNotesOpen(true)}
      openRoster={() => setDialog(feed ? 'feed' : 'roster')} openWork={() => setDialog(feed ? 'feed' : roster?.calendarMonth ? 'hours' : 'work')} />
    {dialog === 'roster' && <ScheduleDialog capacity={demo.people.length} current={roster}
      close={() => setDialog(null)} apply={replaceRoster} openWork={() => setDialog('work')} openFeed={() => setDialog('feed')}
      openHours={() => setDialog('hours')} />}
    {dialog === 'hours' && roster?.calendarMonth && <CalendarHoursDialog book={roster}
      close={() => setDialog(null)} apply={replaceRoster} />}
    {dialog === 'work' && roster && <WorkStatusDialog names={roster.names} hasFile={work.length > 0}
      close={() => setDialog(null)} back={() => setDialog('roster')} apply={replaceWork} />}
    {dialog === 'feed' && <InternalFeedDialog state={feed} close={() => setDialog(null)}
      connect={selectEndpoint} refresh={refreshFeed} />}
    {appearanceTarget && <AppearanceDialog people={appearances} defaults={data.people} initialId={appearanceTarget}
      close={() => setAppearanceTarget(null)} apply={replaceAppearance} />}
    {notesOpen && <NotesDialog people={appearances} notes={displayedNotes} close={() => setNotesOpen(false)}
      post={publishNote} remove={id => setNotes(current => clearNote(current, data.people, data.source, id))} />}
  </>
}

createRoot(document.getElementById('root')!).render(<Board />)
