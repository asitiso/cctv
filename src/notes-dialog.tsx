import { useEffect, useRef, useState } from 'react'
import type { Person } from './data.ts'
import { staffName } from './data.ts'
import { NOTE_LIMIT, NOTE_MINUTES } from './notes.ts'
import type { NotesById } from './notes.ts'

type Props = {
  people: readonly Person[]
  notes: NotesById
  close: () => void
  post: (author: string, recipient: string, text: string) => void
  remove: (recipient: string) => void
}

export function NotesDialog({ people, notes, close, post, remove }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [author, setAuthor] = useState('')
  const [recipient, setRecipient] = useState('')
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const existing = notes.get(recipient)
  const posted = people.flatMap(person => {
    const note = notes.get(person.id)
    return note ? [{ person, note }] : []
  })

  useEffect(() => { dialog.current?.showModal() }, [])

  function submit() {
    try {
      post(author, recipient, text)
      dialog.current?.close()
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : '메모를 게시할 수 없습니다.')
    }
  }

  return <dialog className="staffing-dialog notes-dialog" ref={dialog} aria-labelledby="notes-title" onClose={close}>
    <form onSubmit={event => { event.preventDefault(); submit() }}>
      <header className="staffing-header">
        <div>
          <h2 id="notes-title">전달 메모</h2>
          <p>이 현황판에서 받는 직원의 말풍선에 {NOTE_MINUTES}분 동안 표시됩니다.</p>
        </div>
        <button className="staffing-close" type="button" aria-label="닫기" onClick={() => dialog.current?.close()}>×</button>
      </header>

      <div className="note-people">
        <label>
          <span>작성자</span>
          <select value={author} onChange={event => { setAuthor(event.target.value); setError('') }}>
            <option value="">현황판</option>
            {people.map(person => <option key={person.id} value={person.id}>{staffName(person)}</option>)}
          </select>
        </label>
        <label>
          <span>받는 직원</span>
          <select value={recipient} onChange={event => { setRecipient(event.target.value); setError('') }}>
            <option value="">직원 선택</option>
            {people.map(person => <option key={person.id} value={person.id}>{staffName(person)}</option>)}
          </select>
        </label>
      </div>

      <label className="schedule-label note-text-label" htmlFor="note-text">
        <span>메모 내용</span><small>{text.length}/{NOTE_LIMIT}</small>
      </label>
      <textarea id="note-text" rows={3} maxLength={NOTE_LIMIT} value={text}
        placeholder="예시 계산대 확인 부탁해요." aria-invalid={error ? true : undefined}
        onChange={event => { setText(event.target.value); setError('') }} />
      {existing && <p className="schedule-help">받는 직원에게 게시 중인 메모를 바꿉니다.</p>}
      {error && <p className="schedule-error" role="alert">{error}</p>}

      {posted.length > 0 && <section className="posted-notes" aria-label="게시 중인 메모">
        <h3>게시 중인 메모</h3>
        <ul>{posted.map(({ person, note }) => <li key={person.id}>
          <div className="posted-note">
            <strong>{note.author} → {staffName(person)}</strong>
            <p>{note.text}</p>
          </div>
          <button type="button" className="staffing-reset" aria-label={staffName(person) + ' 메모 지우기'}
            onClick={() => remove(person.id)}>지우기</button>
        </li>)}</ul>
      </section>}

      <footer className="staffing-footer">
        <button className="staffing-reset" type="button" onClick={() => dialog.current?.close()}>취소</button>
        <button className="staffing-apply" type="submit" disabled={!recipient || !text.trim()}>
          {existing ? '메모 바꾸기' : '메모 게시'}
        </button>
      </footer>
    </form>
  </dialog>
}
