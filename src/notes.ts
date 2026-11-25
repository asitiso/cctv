import { staffKey, staffName } from './data.ts'
import type { DataSource, Person } from './data.ts'

export const NOTE_MINUTES = 15
export const NOTE_DURATION = NOTE_MINUTES * 60_000
export const NOTE_LIMIT = 64

type Scope = DataSource['source']
export type StaffNote = { recipient: string; author: string; text: string; expiresAt: number }
export type NotesById = ReadonlyMap<string, StaffNote>

const storageKey = 'pharmacy-cctv:notes:v1'

export function activeNotes(notes: readonly StaffNote[], now = Date.now()) {
  return notes.filter(note => note.expiresAt > now)
}

export function notesForPeople(notes: readonly StaffNote[], people: readonly Person[], scope: Scope): NotesById {
  const byRecipient = new Map(notes.map(note => [note.recipient, note]))
  const result = new Map<string, StaffNote>()
  for (const person of people) {
    const note = byRecipient.get(staffKey(person, scope))
    if (note) result.set(person.id, note)
  }
  return result
}

export function postNote(notes: readonly StaffNote[], people: readonly Person[], scope: Scope,
  authorId: string, recipientId: string, input: string, now = Date.now()): StaffNote[] {
  const recipient = people.find(person => person.id === recipientId)
  if (!recipient) throw new Error('받는 직원을 선택하세요.')
  const authorPerson = people.find(person => person.id === authorId)
  const author = authorId === '' ? '현황판' : authorPerson && staffName(authorPerson)
  if (!author) throw new Error('작성자를 선택하세요.')
  const text = input.trim().replace(/\s+/g, ' ')
  if (!text) throw new Error('메모 내용을 입력하세요.')
  if (text.length > NOTE_LIMIT) throw new Error(NOTE_LIMIT + '글자 이내로 입력하세요.')

  const key = staffKey(recipient, scope)
  return [...activeNotes(notes, now).filter(note => note.recipient !== key),
    { recipient: key, author, text, expiresAt: now + NOTE_DURATION }]
}

export function clearNote(notes: readonly StaffNote[], people: readonly Person[], scope: Scope, personId: string) {
  const person = people.find(item => item.id === personId)
  const key = person ? staffKey(person, scope) : undefined
  return notes.filter(note => note.recipient !== key)
}

function isNote(value: unknown): value is StaffNote {
  if (!value || typeof value !== 'object') return false
  const note = value as Partial<StaffNote>
  return typeof note.recipient === 'string' && /^(demo|roster):.+/.test(note.recipient)
    && typeof note.author === 'string' && Boolean(note.author.trim())
    && typeof note.text === 'string' && Boolean(note.text.trim()) && note.text.length <= NOTE_LIMIT
    && typeof note.expiresAt === 'number' && Number.isFinite(note.expiresAt)
}

export function readNotes(): StaffNote[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(storageKey) ?? 'null')
    if (!Array.isArray(value)) return []
    const unique = new Map(activeNotes(value.filter(isNote)).map(note => [note.recipient, note]))
    return [...unique.values()]
  } catch {
    return []
  }
}

export function saveNotes(notes: readonly StaffNote[]) {
  try {
    if (notes.length) localStorage.setItem(storageKey, JSON.stringify(notes))
    else localStorage.removeItem(storageKey)
  } catch {
    // The board can still display notes when browser storage is disabled.
  }
}
