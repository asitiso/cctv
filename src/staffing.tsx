import { useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { Person } from './data.ts'
import { staffName } from './data.ts'

const storageKey = 'pharmacy-cctv:staffing:v1'
const rosterKey = 'pharmacy-cctv:active-roster:v1'

export function readActiveRoster(people: readonly Person[]): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(rosterKey) ?? 'null')
    if (Array.isArray(saved) && saved.every(id => typeof id === 'string')) {
      return people.filter(person => saved.includes(person.id)).map(person => person.id)
    }
  } catch {
    // Use the initial ten members when settings are unavailable.
  }
  return people.slice(0, 10).map(person => person.id)
}

export function saveActiveRoster(ids: readonly string[]) {
  try {
    localStorage.setItem(rosterKey, JSON.stringify(ids))
  } catch {
    // The current selection still applies until the page is closed.
  }
}

export function readStaffing(): string[] | null {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? 'null')
    return Array.isArray(value) && value.every(id => typeof id === 'string') ? value : null
  } catch {
    return null
  }
}

export function saveStaffing(ids: string[] | null) {
  try {
    if (ids === null) localStorage.removeItem(storageKey)
    else localStorage.setItem(storageKey, JSON.stringify(ids))
  } catch {
    // The current scene still uses the chosen staff when browser storage is disabled.
  }
}

type Props = {
  people: readonly Person[]
  current: readonly string[]
  onDuty: number
  apply: (ids: string[] | null) => void
  openRoster: () => void
}

export function StaffingControl({ people, current, onDuty, apply, openRoster }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [draft, setDraft] = useState<string[]>([])
  const picked = new Set(draft)

  function open() {
    setDraft([...current])
    dialog.current?.showModal()
  }

  function submit(ids: string[] | null) {
    apply(ids)
    dialog.current?.close()
  }

  function resize(count: number) {
    const retained = people.filter(person => picked.has(person.id))
    const available = people.filter(person => !picked.has(person.id))
    setDraft([...retained, ...available].slice(0, count).map(person => person.id))
  }

  function toggle(id: string, checked: boolean) {
    setDraft(current => checked ? [...current, id] : current.filter(item => item !== id))
  }

  return <>
    <button className="working-count staffing-trigger" type="button" onClick={open}
      aria-haspopup="dialog" aria-label={'근무 인원 설정, 현재 ' + onDuty + '명'}>
      <span className="person-icon" aria-hidden="true" />
      근무 <strong>{onDuty}명</strong>
      <span className="staffing-chevron" aria-hidden="true" />
    </button>
    <dialog className="staffing-dialog" ref={dialog} aria-labelledby="staffing-title">
      <form onSubmit={event => { event.preventDefault(); submit(draft) }}>
        <header className="staffing-header">
          <div>
            <h2 id="staffing-title">근무 인원 설정</h2>
            <p>인원 수를 고르거나 원하는 직원을 선택하세요.</p>
          </div>
          <button className="staffing-close" type="button" aria-label="닫기" onClick={() => dialog.current?.close()}>×</button>
        </header>
        <div className="staffing-count">
          <label htmlFor="staffing-size">근무 인원</label>
          <select id="staffing-size" value={draft.length} onChange={event => resize(Number(event.target.value))}>
            {Array.from({ length: people.length + 1 }, (_, count) => <option key={count} value={count}>{count}명</option>)}
          </select>
        </div>
        <fieldset className="staffing-people">
          <legend>근무할 직원</legend>
          <div className="staffing-options">{people.map(person =>
            <label key={person.id} className="staffing-person" style={{ '--person': person.color } as CSSProperties}>
              <input type="checkbox" checked={picked.has(person.id)}
                onChange={event => toggle(person.id, event.target.checked)} />
              <span className="staffing-person-name"><i aria-hidden="true" />{staffName(person)}</span>
              <small>{person.role}</small>
            </label>
          )}</div>
        </fieldset>
        <footer className="staffing-footer">
          <div className="staffing-secondary">
            <button className="staffing-reset" type="button" onClick={() => submit(null)}>기본 근무표 적용</button>
            <button className="staffing-reset" type="button" onClick={() => {
              dialog.current?.close()
              openRoster()
            }}>근무표 가져오기</button>
          </div>
          <button className="staffing-apply" type="submit">적용</button>
        </footer>
      </form>
    </dialog>
  </>
}
