import { dateFrom, parseRoster } from './schedule.ts'
import type { RosterBook } from './schedule.ts'
import { parseWork } from './work-status.ts'
import type { WorkPeriod } from './work-status.ts'

export const feedPollMs = 30_000
export const feedMaxAgeMs = 90_000
const storageKey = 'pharmacy-cctv:internal-feed:v1'
const loopback = new Set(['localhost', '127.0.0.1', '[::1]'])

export type FeedSnapshot = {
  generatedAt: number
  rosterCsv: string
  roster: RosterBook
  work: WorkPeriod[]
}

export function feedUrl(text: string) {
  let url: URL
  try {
    url = new URL(text.trim())
  } catch {
    throw new Error('근무 현황을 제공하는 전체 주소를 입력하세요.')
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback.has(url.hostname)))
    throw new Error('HTTPS 주소 또는 이 PC의 localhost 주소를 사용하세요.')
  if (url.username || url.password || url.search || url.hash)
    throw new Error('로그인 정보, 물음표 또는 #이 없는 주소를 사용하세요.')
  return url.href
}

export function parseFeed(value: unknown, now: number, capacity: number): FeedSnapshot {
  if (!value || typeof value !== 'object') throw new Error('연동 응답 형식을 확인하세요.')
  const { version, generatedAt, rosterCsv, workCsv } = value as Record<string, unknown>
  if (version !== 1 || typeof rosterCsv !== 'string' ||
    (workCsv != null && typeof workCsv !== 'string')) throw new Error('연동 응답 형식을 확인하세요.')
  const isoTime = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/
  const timestamp = typeof generatedAt === 'string' && isoTime.test(generatedAt) && dateFrom(generatedAt.slice(0, 10))
    ? Date.parse(generatedAt) : NaN
  if (!Number.isFinite(timestamp) || timestamp > now + 5_000) throw new Error('응답의 생성 시각을 확인하세요.')
  if (now >= timestamp + feedMaxAgeMs) throw new Error('연동 자료가 90초 이상 갱신되지 않았습니다.')
  const roster = parseRoster(rosterCsv, undefined, capacity)
  return { generatedAt: timestamp, rosterCsv, roster, work: workCsv ? parseWork(workCsv, undefined, roster.names) : [] }
}

export async function fetchFeed(url: string, signal: AbortSignal, capacity: number) {
  const response = await fetch(url, {
    signal, cache: 'no-store', credentials: 'same-origin', redirect: 'error', referrerPolicy: 'no-referrer',
    headers: { Accept: 'application/json' },
  }).catch(() => { throw new Error('연동 주소에 연결할 수 없습니다. 주소와 네트워크를 확인하세요.') })
  if (!response.ok) throw new Error('연동 서버에서 오류를 반환했습니다. (' + response.status + ')')
  const body: unknown = await response.json().catch(() => { throw new Error('연동 응답을 JSON으로 읽을 수 없습니다.') })
  return parseFeed(body, Date.now(), capacity)
}

export function readFeedUrl() {
  try {
    return feedUrl(localStorage.getItem(storageKey) ?? '')
  } catch {
    return ''
  }
}

export function saveFeedUrl(url: string) {
  try {
    if (url) localStorage.setItem(storageKey, url)
    else localStorage.removeItem(storageKey)
  } catch {
    // The selected source remains available for this session.
  }
}
