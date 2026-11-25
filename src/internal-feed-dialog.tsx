import { useEffect, useRef, useState } from 'react'
import { feedPollMs, feedUrl } from './internal-feed.ts'
import type { FeedState } from './use-internal-feed.ts'

type Props = {
  state: FeedState | null
  close: () => void
  connect: (url: string) => void
  refresh: () => void
}

const checkedTime = new Intl.DateTimeFormat('ko-KR', {
  timeZone: 'Asia/Seoul', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit',
})

export function InternalFeedDialog({ state, close, connect, refresh }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [address, setAddress] = useState(state?.url ?? '')
  const [error, setError] = useState('')
  const sourceTime = state?.snapshot ? checkedTime.format(state.snapshot.generatedAt) : ''

  useEffect(() => { dialog.current?.showModal() }, [])

  function submit() {
    try {
      const url = feedUrl(address)
      setAddress(url)
      setError('')
      if (url === state?.url) refresh()
      else connect(url)
    } catch (problem) {
      setError(problem instanceof Error ? problem.message : '연동 주소를 확인하세요.')
    }
  }

  return <dialog ref={dialog} className="staffing-dialog schedule-dialog" aria-labelledby="internal-feed-title" onClose={close}>
    <form onSubmit={event => { event.preventDefault(); submit() }}>
      <header className="staffing-header">
        <div>
          <h2 id="internal-feed-title">내부 시스템 연동</h2>
          <p>근무표와 확인된 업무를 {feedPollMs / 1000}초마다 불러옵니다.</p>
        </div>
        <button className="staffing-close" type="button" aria-label="닫기" onClick={() => dialog.current?.close()}>×</button>
      </header>
      <div className="feed-field">
        <label className="schedule-label" htmlFor="internal-feed-address">연동 주소</label>
        <input id="internal-feed-address" className="feed-address" type="text" inputMode="url" autoComplete="off"
          spellCheck={false} aria-invalid={error ? true : undefined}
          placeholder="https://intranet.example/status.json" value={address}
          onChange={event => { setAddress(event.target.value); setError('') }} />
      </div>
      {error && <p className="schedule-error" role="alert">{error}</p>}
      {state && <div className="feed-result" data-status={state.status} role="status">
        {state.status === 'connecting' && '연동 자료를 불러오는 중입니다.'}
        {state.status === 'ready' && <>연결됨 · 자료 생성 {sourceTime}</>}
        {state.status === 'error' && <>
          <strong>{state.error}</strong>
          {sourceTime && <span>마지막 근무표 자료 생성 {sourceTime} · 업무 상태 미확인</span>}
        </>}
      </div>}
      <footer className="staffing-footer">
        <div className="staffing-secondary">
          {state && <button type="button" className="staffing-reset" onClick={() => connect('')}>연결 해제</button>}
        </div>
        <button type="submit" className="staffing-apply" disabled={!address.trim()}>
          {state?.url === address.trim() ? '지금 새로고침' : '연결'}
        </button>
      </footer>
    </form>
  </dialog>
}
