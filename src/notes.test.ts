import assert from 'node:assert/strict'
import { test } from 'node:test'
import { demo } from './data.ts'
import { activeNotes, clearNote, NOTE_DURATION, notesForPeople, postNote } from './notes.ts'
import { createRosterData, parseRoster } from './schedule.ts'

test('작성자와 수신자가 있는 메모는 같은 수신자의 앞 메모를 교체하고 정해진 시간에 만료된다', () => {
  const now = 12_000
  let notes = postNote([], demo.people, 'simulation', 'junho', 'jieun', '  계산대 확인 부탁해요. ', now)
  assert.deepEqual(notesForPeople(notes, demo.people, 'simulation').get('jieun'), {
    recipient: 'demo:jieun', author: '준호', text: '계산대 확인 부탁해요.', expiresAt: now + NOTE_DURATION,
  })
  notes = postNote(notes, demo.people, 'simulation', '', 'jieun', '  영수증 확인\n 부탁해요. ', now + 1_000)
  assert.equal(notes.length, 1)
  assert.equal(notes[0].text, '영수증 확인 부탁해요.')
  assert.equal(notes[0].author, '현황판')
  assert.equal(activeNotes(notes, now + NOTE_DURATION + 999).length, 1)
  assert.deepEqual(activeNotes(notes, now + NOTE_DURATION + 1_000), [])
  assert.deepEqual(clearNote(notes, demo.people, 'simulation', 'jieun'), [])
})

test('파일 명단의 수신자는 명단 순서를 바꾸어도 찾을 수 있고 시뮬레이션에 섞이지 않는다', () => {
  const date = '2026-11-24'
  const csv = '이름,출근,퇴근\n'
  const first = parseRoster(csv + '김한나,09:00,18:00\n박별,09:00,18:00', date, 16)
  const second = parseRoster(csv + '박별,09:00,18:00\n김한나,09:00,18:00', date, 16)
  const people = createRosterData(first, demo, { date, minute: 600 }).people
  const reordered = createRosterData(second, demo, { date, minute: 600 }).people
  const notes = postNote([], people, 'connected', people[1].id, people[0].id, '발주 확인해 주세요.', 100_000)
  assert.equal(notesForPeople(notes, reordered, 'connected').get(reordered[1].id)?.author, '박별')
  assert.equal(notesForPeople(notes, reordered, 'connected').get(reordered[1].id)?.text, '발주 확인해 주세요.')
  assert.equal(notesForPeople(notes, demo.people, 'simulation').size, 0)
})

test('없는 직원, 빈 내용과 지나치게 긴 메모는 게시하기 전에 거부한다', () => {
  const write = (author: string, to: string, text: string) => postNote([], demo.people, 'simulation', author, to, text, 0)
  assert.throws(() => write('ghost', 'jieun', '메모'), /작성자/)
  assert.throws(() => write('junho', 'ghost', '메모'), /받는 직원/)
  assert.throws(() => write('junho', 'jieun', '\n   '), /내용/)
  assert.throws(() => write('junho', 'jieun', '글'.repeat(1000)), /글자/)
})
