import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createClock } from './clock'
import { createTestDb } from './db/test-db'
import * as boards from './modules/boards'
import * as cards from './modules/cards'
import * as recurrence from './modules/recurrence'
import { createScheduler, TICK_MS, type Notifier } from './scheduler'

const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).getTime()

let t: ReturnType<typeof createTestDb>
let now: number
let notified: Parameters<Notifier['notify']>[0][]
let changes: number
let listId: string

const scheduler = () =>
  createScheduler({
    db: t.db,
    clock: createClock(() => now),
    notifier: { notify: (n) => notified.push(n) },
    onChange: () => changes++
  })

function withReminder(title: string, dueAt: string) {
  const id = cards.create(t.db, listId, title, at(1, 10)).id
  cards.update(t.db, { cardId: id, due: { dueAt, reminder: 'at_time' } }, at(1, 10))
  return id
}

beforeEach(() => {
  t = createTestDb()
  now = at(21, 10)
  notified = []
  changes = 0
  const boardId = boards.create(t.db, 'Casa', at(1, 10)).id
  listId = boards.get(t.db, boardId).lists[0]!.id
})

afterEach(() => vi.useRealTimers())

describe('agendador', () => {
  it('LEM-06: ao abrir, os lembretes perdidos viram o aviso agrupado, uma vez, sem notificação', () => {
    withReminder('Pagar condomínio', '2026-10-20T18:00')
    withReminder('Dentista', '2026-10-21T09:00')
    const s = scheduler()
    s.start()
    s.stop()
    expect(notified).toEqual([])
    expect(s.takeMissed().map((r) => r.title)).toEqual(['Pagar condomínio', 'Dentista'])
    expect(s.takeMissed()).toEqual([])
  })

  it('LEM-03: com o app aberto, cada lembrete vira uma notificação com o card', () => {
    const s = scheduler()
    s.start()
    s.stop()
    const id = withReminder('Pagar condomínio', '2026-10-21T18:00')
    now = at(21, 18)
    s.tick()
    expect(notified).toEqual([
      {
        title: 'Mello · Pagar condomínio',
        body: 'Entrega hoje, 18:00 · Casa',
        cardId: id,
        boardId: expect.any(String)
      }
    ])
    s.tick()
    expect(notified).toHaveLength(1)
  })

  it('REP-11: roda a cada minuto e avisa a tela quando a repetição cria um card', () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const compras = cards.create(t.db, listId, 'Compras', at(1, 10)).id
    recurrence.save(
      t.db,
      compras,
      {
        freq: 'daily',
        weekdays: 0,
        monthDay: null,
        intervalDays: null,
        time: '10:01',
        targetListId: listId,
        copyLabelsPriority: true,
        copyDescription: true,
        copyChecklist: true,
        copyDueDate: false,
        ifPreviousOpen: 'create',
        endsKind: 'never',
        endsOn: null,
        endsAfter: null
      },
      now
    )
    const s = scheduler()
    s.start()
    expect(changes).toBe(0)
    now = at(21, 10, 1)
    vi.advanceTimersByTime(TICK_MS)
    expect(changes).toBe(1)
    vi.advanceTimersByTime(TICK_MS)
    expect(changes).toBe(1)
    s.stop()
  })

  it('um erro numa rodada vai para o aviso de erro e não para o agendador', () => {
    const errors: unknown[] = []
    const s = createScheduler({
      db: t.db,
      clock: createClock(() => now),
      notifier: {
        notify: () => {
          throw new Error('Windows sem notificações')
        }
      },
      onChange: () => {},
      onError: (error) => errors.push(error)
    })
    s.start()
    s.stop()
    withReminder('Pagar', '2026-10-21T10:00')
    s.tick()
    expect(errors).toHaveLength(1)
  })
})
