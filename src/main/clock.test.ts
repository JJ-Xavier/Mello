// Relógio de teste (decidido em 24/10/2026): o adiantamento vale para tudo o que o main grava, e
// só pode mudar no modo de desenvolvimento.
import { eq } from 'drizzle-orm'
import { describe, expect, it } from 'vitest'
import { CHANNELS } from '../shared/ipc/api'
import { DAY_MS } from '../shared/rules/aging'
import { createClock } from './clock'
import { createTestDb } from './db/test-db'
import { card } from './db/schema'
import { createRoutes } from './ipc/routes'
import * as boards from './modules/boards'
import { createTestFiles } from './modules/test-files'

const NOW = 1_800_000_000_000

function setup(dev: boolean) {
  const { db } = createTestDb()
  const files = createTestFiles()
  const clock = createClock(() => NOW)
  const routes = createRoutes({
    db,
    app: { version: '0', dataDir: '', dev },
    clock,
    files: files.store
  })
  const call = (channel: string, input?: unknown) => routes.get(channel)!(input)
  return { db, clock, call, cleanup: files.cleanup }
}

describe('relógio de teste', () => {
  it('soma o adiantamento ao relógio de base', () => {
    const clock = createClock(() => NOW)
    expect(clock.now()).toBe(NOW)
    clock.setOffset(3 * DAY_MS)
    expect(clock.offset()).toBe(3 * DAY_MS)
    expect(clock.now()).toBe(NOW + 3 * DAY_MS)
  })

  it('no modo de desenvolvimento, adiantar vale para o que o main grava', async () => {
    const { db, call, cleanup } = setup(true)
    try {
      expect(await call(CHANNELS.devSetClock, { offset: 2 * DAY_MS })).toEqual({
        ok: true,
        data: { offset: 2 * DAY_MS }
      })
      expect(await call(CHANNELS.devClock)).toEqual({ ok: true, data: { offset: 2 * DAY_MS } })
      const board = boards.create(db, 'Casa', NOW)
      const listId = boards.get(db, board.id).lists[0]!.id
      const created = (await call(CHANNELS.cardsCreate, { listId, title: 'Chá' })) as {
        data: { id: string }
      }
      const row = db.select().from(card).where(eq(card.id, created.data.id)).get()!
      expect(row.lastActivityAt).toBe(NOW + 2 * DAY_MS)
    } finally {
      cleanup()
    }
  })

  it('o app instalado recusa mudar o relógio; adiantamento negativo é recusado', async () => {
    const { clock, call, cleanup } = setup(false)
    try {
      expect(await call(CHANNELS.devSetClock, { offset: DAY_MS })).toMatchObject({
        ok: false,
        error: { code: 'CONFLICT' }
      })
      expect(clock.offset()).toBe(0)
      expect(await call(CHANNELS.devClock)).toEqual({ ok: true, data: { offset: 0 } })
      expect(await call(CHANNELS.devSetClock, { offset: -1 })).toMatchObject({
        ok: false,
        error: { code: 'INVALID_INPUT' }
      })
    } finally {
      cleanup()
    }
  })
})
