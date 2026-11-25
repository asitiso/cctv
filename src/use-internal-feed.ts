import { useEffect, useRef, useState } from 'react'
import { feedMaxAgeMs, feedPollMs, fetchFeed } from './internal-feed.ts'
import type { FeedSnapshot } from './internal-feed.ts'

export type FeedState = {
  url: string
  status: 'connecting' | 'ready' | 'error'
  snapshot?: FeedSnapshot
  rosterRevision: number
  error?: string
}

export function useInternalFeed(url: string, capacity: number) {
  const [state, setState] = useState<FeedState | null>(null)
  const refresh = useRef<() => void>(() => {})

  useEffect(() => {
    if (!url) {
      setState(null)
      return
    }
    const controller = new AbortController()
    let snapshot: FeedSnapshot | undefined
    let rosterRevision = 0
    let polling = false
    let pollTimer: number | undefined
    let expiryTimer: number | undefined

    function showError(error: string) {
      setState({ url, status: 'error', snapshot, rosterRevision, error })
    }

    function expire() {
      if (snapshot && Date.now() >= snapshot.generatedAt + feedMaxAgeMs) {
        showError('연동 자료가 90초 이상 갱신되지 않았습니다.')
      }
    }

    async function poll() {
      if (polling || controller.signal.aborted) return
      polling = true
      window.clearTimeout(pollTimer)
      expire()
      try {
        const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(8_000)])
        const next = await fetchFeed(url, signal, capacity)
        if (controller.signal.aborted) return
        if (snapshot?.rosterCsv === next.rosterCsv) next.roster = snapshot.roster
        else rosterRevision++
        snapshot = next
        setState({ url, status: 'ready', snapshot, rosterRevision })
        window.clearTimeout(expiryTimer)
        expiryTimer = window.setTimeout(expire, Math.max(0, next.generatedAt + feedMaxAgeMs - Date.now()))
      } catch (error) {
        if (controller.signal.aborted) return
        window.clearTimeout(expiryTimer)
        showError(error instanceof Error ? error.message : '연동 상태를 갱신할 수 없습니다.')
      } finally {
        polling = false
        if (!controller.signal.aborted) pollTimer = window.setTimeout(run, feedPollMs)
      }
    }

    function run() { void poll() }
    function visible() {
      if (document.visibilityState === 'visible') run()
    }

    setState({ url, status: 'connecting', rosterRevision })
    refresh.current = run
    document.addEventListener('visibilitychange', visible)
    run()
    return () => {
      controller.abort()
      refresh.current = () => {}
      document.removeEventListener('visibilitychange', visible)
      window.clearTimeout(pollTimer)
      window.clearTimeout(expiryTimer)
    }
  }, [url, capacity])

  return {
    state: url ? (state?.url === url ? state : { url, status: 'connecting' as const, rosterRevision: 0 }) : null,
    refresh: () => refresh.current(),
  }
}
