import { useEffect, useRef, useState } from 'react'
import { parseBoardChange } from './shared-board.ts'
import type { BoardChange, BoardEdit, PublicBoard } from './shared-board.ts'

const pendingPrefix = 'pharmacy-cctv:shared-edits:v1:'
const endpoint = '/api/board-state'
const pollMilliseconds = 8000
type SyncStatus = '조회 중' | '공유 저장됨' | '저장 중' | '다시 연결 중'
type Pending = { key: string; edit: BoardChange }

function readPending(): Pending[] {
  try {
    return Object.keys(localStorage).filter(key => key.startsWith(pendingPrefix)).sort().flatMap(key => {
      try {
        const edit = parseBoardChange(JSON.parse(localStorage.getItem(key) ?? 'null'))
        return edit ? [{ key, edit }] : []
      } catch {
        return []
      }
    })
  } catch {
    return []
  }
}

function persist({ key, edit }: Pending, saved: boolean) {
  try {
    if (saved) localStorage.removeItem(key)
    else localStorage.setItem(key, JSON.stringify(edit))
  } catch {
    // Keep unsent edits in memory when browser storage is unavailable.
  }
}

export function useSharedBoard(enabled: boolean, date: string, apply: (board: PublicBoard) => void) {
  const [status, setStatus] = useState<SyncStatus>('조회 중')
  const [pending] = useState(() => enabled ? readPending() : [])
  const applyRef = useRef(apply)
  applyRef.current = apply
  const refresh = useRef<() => void>(() => {})

  useEffect(() => {
    if (!enabled) return
    let active = true
    let running = false
    let latestRevision = -1
    let received = false
    async function update() {
      if (running || !active || document.hidden) return
      running = true
      const item = pending[0]
      const edit = item?.edit
      if (edit) setStatus('저장 중')
      try {
        const response = await fetch(endpoint, {
          method: edit ? 'PATCH' : 'GET',
          headers: edit ? { 'Content-Type': 'application/json' } : undefined,
          body: edit ? JSON.stringify(edit) : undefined,
          cache: 'no-store', signal: AbortSignal.timeout(5500),
        })
        if (!response.ok) throw new Error('Shared board request failed')
        const board = await response.json() as PublicBoard
        if (!active) return
        if (item) {
          pending.shift()
          persist(item, true)
        }
        if (!pending.length && board.revision >= latestRevision) {
          latestRevision = board.revision
          applyRef.current(board)
        }
        received = true
        setStatus(pending.length ? '저장 중' : '공유 저장됨')
      } catch {
        if (active) setStatus('다시 연결 중')
        received = false
      } finally {
        running = false
        if (active && received && pending.length) void update()
      }
    }
    refresh.current = () => void update()
    refresh.current()
    const timer = window.setInterval(refresh.current, pollMilliseconds)
    window.addEventListener('online', refresh.current)
    window.addEventListener('focus', refresh.current)
    document.addEventListener('visibilitychange', refresh.current)
    return () => {
      active = false
      window.clearInterval(timer)
      window.removeEventListener('online', refresh.current)
      window.removeEventListener('focus', refresh.current)
      document.removeEventListener('visibilitychange', refresh.current)
      refresh.current = () => {}
    }
  }, [enabled, pending])

  function save(edit: BoardEdit) {
    if (!enabled) return
    const id = crypto.randomUUID()
    const item = { key: pendingPrefix + Date.now() + ':' + id, edit: { ...edit, id, date } }
    pending.push(item)
    persist(item, false)
    setStatus('저장 중')
    refresh.current()
  }

  return { status, save }
}
