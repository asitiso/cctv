import { useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import { appearanceOptions, displayNameLimit } from './appearance.ts'
import { staffName } from './data.ts'
import type { Person } from './data.ts'
import { spriteSource } from './renderer.ts'

type Props = {
  people: readonly Person[]
  defaults: readonly Person[]
  initialId: string
  close: () => void
  apply: (id: string, sprite: string, name: string) => void
}

export function AppearanceDialog({ people, defaults, initialId, close, apply }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [personId, setPersonId] = useState(initialId)
  const person = people.find(item => item.id === personId) ?? people[0]
  const [sprite, setSprite] = useState(person.sprite)
  const [name, setName] = useState(staffName(person))
  const [error, setError] = useState('')
  const original = defaults.find(item => item.id === person.id)?.sprite ?? person.sprite
  const owners = new Map(people.map(item => [item.sprite, item]))
  const swap = owners.get(sprite)
  const changed = sprite !== person.sprite || (name.trim().replace(/\s+/g, ' ') || person.name) !== staffName(person)

  useEffect(() => { dialog.current?.showModal() }, [])

  return <dialog className="staffing-dialog appearance-dialog" ref={dialog}
    aria-labelledby="appearance-title" onClose={close}>
    <form onSubmit={event => {
      event.preventDefault()
      if (!changed) return
      try {
        apply(person.id, sprite, name)
        dialog.current?.close()
      } catch (problem) {
        setError(problem instanceof Error ? problem.message : '직원 설정을 저장할 수 없습니다.')
      }
    }}>
      <header className="staffing-header">
        <div>
          <h2 id="appearance-title">직원 이름·캐릭터 설정</h2>
          <p>직원을 고르고 현황판에 표시할 이름과 캐릭터를 정하세요.</p>
        </div>
        <button className="staffing-close" type="button" aria-label="닫기"
          onClick={() => dialog.current?.close()}>×</button>
      </header>

      <div className="appearance-fields">
        <div className="appearance-field">
          <label htmlFor="appearance-person">직원</label>
          <select id="appearance-person" value={person.id} onChange={event => {
            const next = people.find(item => item.id === event.target.value)
            if (!next) return
            setPersonId(next.id)
            setSprite(next.sprite)
            setName(staffName(next))
            setError('')
          }}>
            {people.map(item => <option value={item.id} key={item.id}>{staffName(item)}</option>)}
          </select>
        </div>
        <div className="appearance-field">
          <label htmlFor="appearance-name">표시 이름</label>
          <input id="appearance-name" value={name} maxLength={displayNameLimit} placeholder={person.name}
            aria-invalid={Boolean(error)} aria-describedby="appearance-name-help"
            onChange={event => { setName(event.target.value); setError('') }} />
        </div>
      </div>
      <p className="appearance-name-help" id="appearance-name-help">비워 두면 기본 이름({person.name})으로 돌아갑니다.</p>
      {error && <p className="schedule-error" role="alert">{error}</p>}

      <div className="appearance-options" role="group" aria-labelledby="appearance-options-label">
        <p id="appearance-options-label">캐릭터 모습</p>
        <div className="appearance-grid">
          {appearanceOptions.map(option => {
            const owner = owners.get(option.sprite)
            return <label key={option.sprite} className="appearance-card"
              style={{ '--appearance-color': option.color } as CSSProperties}>
              <input type="radio" name="appearance-sprite" value={option.sprite} aria-label={option.label}
                checked={sprite === option.sprite} onChange={() => setSprite(option.sprite)} />
              <span className="appearance-image">
                <img src={spriteSource(option.sprite)} alt="" width={104} height={112} decoding="async" />
              </span>
              <span className="appearance-card-label">{option.label}</span>
              {owner && <span className="appearance-owner" title={staffName(owner)}>
                {owner.id === person.id ? '현재 외형' : staffName(owner)}
              </span>}
            </label>
          })}
        </div>
      </div>

      <footer className="staffing-footer appearance-footer">
        <div className="staffing-secondary">
          <button className="staffing-reset" type="button" onClick={() => setSprite(original)} disabled={sprite === original}>
            기본 외형 선택
          </button>
          <p className="appearance-notice" aria-live="polite">
            {sprite !== person.sprite && swap ? staffName(swap) + '의 외형과 서로 바뀝니다.' : ''}
          </p>
        </div>
        <button className="staffing-apply" type="submit" disabled={!changed}>적용</button>
      </footer>
    </form>
  </dialog>
}
