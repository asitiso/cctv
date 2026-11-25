import assert from 'node:assert/strict'
import { test } from 'node:test'
import { feedUrl, parseFeed } from './internal-feed.ts'

const now = Date.parse('2026-11-25T01:00:00Z')
const input = {
  version: 1, generatedAt: '2026-11-25T01:00:00Z',
  rosterCsv: '날짜,이름,출근,퇴근\n2026-11-25,김한나,09:00,18:00',
  workCsv: '날짜,이름,업무,시작,종료\n2026-11-25,김한나,조제,10:00,10:30',
}

test('연동 주소는 HTTPS 또는 이 PC의 HTTP 주소이며 인증 정보는 URL에서 받지 않는다', () => {
  assert.equal(feedUrl(' https://office.example/feed.json '), 'https://office.example/feed.json')
  assert.equal(feedUrl('http://127.0.0.1:8787/feed'), 'http://127.0.0.1:8787/feed')
  for (const value of ['http://office.example/feed', 'file:///feed', 'https://user:pass@office.example/feed',
    'https://office.example/feed?token=abc', 'https://office.example/feed#status']) assert.throws(() => feedUrl(value))
})

test('근무표와 업무가 같은 응답에서 검증되며 업무 누락은 빈 상태로 읽는다', () => {
  const snapshot = parseFeed(input, now, 16)
  assert.deepEqual(snapshot.roster.names, ['김한나'])
  assert.equal(snapshot.work[0].activity, 'dispense')
  assert.deepEqual(parseFeed({ ...input, workCsv: null }, now, 16).work, [])
  assert.throws(() => parseFeed({ ...input, workCsv: input.workCsv.replace('김한나', '다른직원') }, now, 16), /직원/)
  assert.throws(() => parseFeed({ ...input, version: 2 }, now, 16), /형식/)
})

test('오래됐거나 미래 시각을 담은 업무와 날짜가 빠진 표를 현재 업무로 사용하지 않는다', () => {
  assert.throws(() => parseFeed(input, now + 90_000, 16), /갱신/)
  assert.throws(() => parseFeed(input, now - 6_000, 16), /시각/)
  assert.throws(() => parseFeed({ ...input, generatedAt: '2026-11-25T01:00:00' }, now, 16), /시각/)
  assert.throws(() => parseFeed({ ...input, rosterCsv: '이름,출근,퇴근\n김한나,09:00,18:00' }, now, 16), /날짜/)
})
