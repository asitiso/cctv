import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyBoardChange, currentSharedBoard, newSharedBoard, parseBoardChange } from './shared-board.ts'

const now = Date.parse('2026-11-25T05:00:00Z')
const firstId = '71466879-a692-4a4b-86a8-f6058ce16d37'
const secondId = '161c0acf-2052-4a03-9677-b77625a1e430'

test('공유 파일에 다른 직원의 변경이 서로 덮어쓰이지 않고 재시도가 중복 반영되지 않는다', () => {
  const date = newSharedBoard(now).date
  const first = parseBoardChange({ id: firstId, date, active: [['seoyeon', false]], work: [['junho', 'checkout']] })!
  const second = parseBoardChange({ id: secondId, date, active: [['sora', true]], duties: [['jieun', 'off']] })!
  const together = applyBoardChange(applyBoardChange(newSharedBoard(now), first, now), second, now + 100)
  assert.ok(!together.active.includes('seoyeon') && together.active.includes('sora'))
  assert.deepEqual(together.work, [['junho', { activity: 'checkout', until: now + 60_000 }]])
  assert.deepEqual(together.duties, [['jieun', 'off']])
  assert.deepEqual(applyBoardChange(together, first, now + 1000), together)
})

test('공개 화면의 이전 날짜 휴무와 지난 업무만 초기화되고 현황 인원은 유지된다', () => {
  const midnight = Date.parse('2026-11-25T15:00:00Z')
  const state = newSharedBoard(midnight - 1000)
  const saved = applyBoardChange(state, { id: firstId, date: state.date, active: [['sora', true]],
    duties: [['jieun', 'off']], work: [['junho', 'stock']] }, midnight - 1000)
  const next = currentSharedBoard(saved, midnight)
  assert.equal(next.date, '2026-11-26')
  assert.deepEqual(next.duties, [])
  assert.deepEqual(next.work, [])
  assert.deepEqual(next.active, saved.active)
  assert.deepEqual(currentSharedBoard(saved, midnight - 1).work, saved.work)
  const expired = currentSharedBoard({ ...saved, date: next.date }, midnight + 60_000)
  assert.equal(expired.work.length, 0)
})

test('공유 파일은 시뮬레이션 직원과 지원되는 업무만 기록한다', () => {
  const base = { id: firstId, date: '2026-11-25' }
  assert.equal(parseBoardChange({ ...base, active: [['unknown-person', true]] }), null)
  assert.equal(parseBoardChange({ ...base, work: [['junho', 'dayoff']] }), null)
  assert.equal(parseBoardChange({ ...base, duties: [['junho', 'off'], ['junho', 'working']] }), null)
})
