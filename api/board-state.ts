import { get, list, put } from '@vercel/blob'
import { getCache } from '@vercel/functions'
import { applyBoardChange, currentSharedBoard, newSharedBoard, parseBoardChange } from '../src/shared-board.ts'
import type { SharedBoard } from '../src/shared-board.ts'

const prefix = process.env.VERCEL_ENV === 'preview' ? 'preview-board/v1/' : 'shared-board/v1/'
const cacheKey = 'cctv-shared-board-v1'
const largestRevisionCode = 999_999_999_999
const cache = getCache()

function send(value: unknown, status = 200) {
  return Response.json(value, { status, headers: { 'Cache-Control': 'no-store' } })
}

async function latestPath() {
  // Blob lists paths alphabetically. Reverse revision codes therefore return the newest write first.
  return (await list({ prefix, limit: 1 })).blobs[0]?.pathname
}

async function loadBoard() {
  const path = await latestPath()
  if (!path) return newSharedBoard(Date.now())
  const blob = await get(path, { access: 'private' })
  if (blob?.statusCode !== 200 || !blob.stream) throw new Error('Shared board file is unavailable')
  return await new Response(blob.stream).json() as SharedBoard
}

function blobPath(revision: number) {
  return prefix + String(largestRevisionCode - revision).padStart(12, '0') + '.json'
}

async function publish(board: SharedBoard) {
  try {
    await cache.set(cacheKey, board, { ttl: 3600, tags: [cacheKey] })
    const expected = board.revision ? blobPath(board.revision) : undefined
    if (await latestPath() !== expected) await cache.expireTag(cacheKey)
  } catch {
    // The durable write can still be used when the cache is unavailable.
  }
}

async function readBoard() {
  try {
    const cached = await cache.get(cacheKey) as SharedBoard | null
    if (cached) return cached
  } catch {
    // Read the file directly if the cache is unavailable.
  }
  const board = await loadBoard()
  await publish(board)
  return board
}

function publicState(board: SharedBoard) {
  const { receipts: _receipts, ...state } = currentSharedBoard(board, Date.now())
  return state
}

export default {
  async fetch(request: Request) {
    try {
      if (request.method === 'GET') return send(publicState(await readBoard()))
      if (request.method !== 'PATCH') return send({ error: 'method' }, 405)
      const origin = request.headers.get('origin')
      if (origin !== new URL(request.url).origin) return send({ error: 'origin' }, 403)
      const body = await request.text()
      if (body.length > 6000) return send({ error: 'size' }, 413)
      let edit
      try { edit = parseBoardChange(JSON.parse(body)) } catch { edit = null }
      if (!edit) return send({ error: 'change' }, 400)
      for (let attempt = 0; attempt < 5; attempt++) {
        const before = await loadBoard()
        if (before.receipts.includes(edit.id)) return send(publicState(before))
        const next = applyBoardChange(before, edit, Date.now())
        try {
          await put(blobPath(next.revision), JSON.stringify(next), {
            access: 'private', allowOverwrite: false, addRandomSuffix: false, contentType: 'application/json',
          })
          await publish(next)
          return send(publicState(next))
        } catch (error) {
          // A concurrent editor may have claimed the next revision. Merge again with the winning file.
          const saved = await latestPath()
          if (!saved || saved > blobPath(next.revision)) throw error
        }
      }
      return send({ error: 'busy' }, 409)
    } catch {
      return send({ error: 'storage' }, 503)
    }
  },
}
