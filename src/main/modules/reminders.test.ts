import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import type { Reminder } from '../../shared/ipc/cards'
import { createTestDb } from '../db/test-db'
import { board, card } from '../db/schema'
import * as boards from './boards'
import * as cards from './cards'
import * as lists from './lists'
import * as reminders from './reminders'

const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).getTime()

let t: ReturnType<typeof createTestDb>
let boardId: string
let listsOf: Record<string, string>

beforeEach(() => {
  t = createTestDb()
  boardId = boards.create(t.db, 'Casa', at(1, 10)).id
  listsOf = Object.fromEntries(boards.get(t.db, boardId).lists.map((l) => [l.title, l.id]))
})

function withReminder(title: string, dueAt: string, reminder: Reminder, list = 'A fazer') {
  const id = cards.create(t.db, listsOf[list]!, title, at(1, 10)).id
  cards.update(t.db, { cardId: id, due: { dueAt, reminder } }, at(1, 10))
  return id
}

const titles = (due: { title: string }[]) => due.map((r) => r.title)

describe('lembretes (LEM)', () => {
  it('LEM-03: dispara no horário uma vez só, com o card e o quadro', () => {
    const id = withReminder('Pagar condomínio', '2026-10-21T18:00', 'at_time')
    expect(reminders.takeDue(t.db, at(21, 17, 59))).toEqual([])
    expect(reminders.takeDue(t.db, at(21, 18))).toEqual([
      {
        cardId: id,
        boardId,
        title: 'Pagar condomínio',
        boardTitle: 'Casa',
        dueAt: '2026-10-21T18:00',
        overdue: false
      }
    ])
    expect(reminders.takeDue(t.db, at(21, 18, 1))).toEqual([])
    expect(t.db.select().from(card).where(eq(card.id, id)).get()!.reminderFiredAt).toBe(at(21, 18))
  })

  it('"1 dia antes" e data sem hora (09:00, LEM-02), na ordem em que venceram', () => {
    withReminder('Dentista', '2026-10-22T15:00', 'day_before')
    withReminder('Feira', '2026-10-21', 'at_time')
    expect(reminders.takeDue(t.db, at(21, 8, 59))).toEqual([])
    expect(titles(reminders.takeDue(t.db, at(21, 16)))).toEqual(['Feira', 'Dentista'])
  })

  it('LEM-05: não dispara para finalizado, arquivado, modelo, lista arquivada e quadro fechado', () => {
    const done = withReminder('Finalizado', '2026-10-21T18:00', 'at_time')
    cards.move(t.db, done, listsOf['Concluído']!, 0, at(1, 10))
    const archived = withReminder('Arquivado', '2026-10-21T18:00', 'at_time')
    cards.archive(t.db, archived, at(1, 10))
    const template = withReminder('Modelo', '2026-10-21T18:00', 'at_time')
    t.db.update(card).set({ isTemplate: true }).where(eq(card.id, template)).run()
    const ideias = lists.create(t.db, boardId, 'Ideias', at(1, 10)).id
    listsOf['Ideias'] = ideias
    withReminder('Na lista arquivada', '2026-10-21T18:00', 'at_time', 'Ideias')
    lists.archive(t.db, ideias, at(1, 10))
    const other = boards.create(t.db, 'Fechado', at(1, 10)).id
    const otherList = boards.get(t.db, other).lists[0]!.id
    const closed = cards.create(t.db, otherList, 'Do fechado', at(1, 10)).id
    cards.update(
      t.db,
      { cardId: closed, due: { dueAt: '2026-10-21T18:00', reminder: 'at_time' } },
      at(1, 10)
    )
    t.db
      .update(board)
      .set({ closedAt: at(1, 10) })
      .where(eq(board.id, other))
      .run()
    expect(reminders.takeDue(t.db, at(21, 19))).toEqual([])

    // O finalizado continua pendente: em aberto de novo, o lembrete ainda vale.
    cards.move(t.db, done, listsOf['A fazer']!, 0, at(21, 19))
    expect(titles(reminders.takeDue(t.db, at(21, 19)))).toEqual(['Finalizado'])
  })

  it('LEM-04: mudar a data rearma o lembrete', () => {
    const id = withReminder('Prova', '2026-10-21T08:00', 'at_time')
    expect(titles(reminders.takeDue(t.db, at(21, 9)))).toEqual(['Prova'])
    cards.update(
      t.db,
      { cardId: id, due: { dueAt: '2026-10-22T08:00', reminder: 'at_time' } },
      at(21, 9)
    )
    expect(reminders.takeDue(t.db, at(21, 10))).toEqual([])
    expect(titles(reminders.takeDue(t.db, at(22, 8)))).toEqual(['Prova'])
  })

  it('LEM-06: venceu há mais de 7 dias é descartado sem aviso; a entrega que passou fica em atraso', () => {
    withReminder('Velho', '2026-10-01T08:00', 'at_time')
    withReminder('Recente', '2026-10-20T08:00', 'at_time')
    const due = reminders.takeDue(t.db, at(21, 9))
    expect(due).toEqual([expect.objectContaining({ title: 'Recente', overdue: true })])
    expect(reminders.takeDue(t.db, at(21, 9))).toEqual([])
  })
})
