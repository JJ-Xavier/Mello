import { randomUUID } from 'node:crypto'
import { asc, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { createListInput } from '../../shared/ipc/boards'
import { createTestDb, insertCard } from '../db/test-db'
import {
  activity,
  card,
  cardLabel,
  checklist,
  checklistItem,
  label,
  list,
  recurrence
} from '../db/schema'
import * as boards from './boards'
import * as cards from './cards'
import * as lists from './lists'

const NOW = 1_800_000_000_000

let t: ReturnType<typeof createTestDb>
let boardId: string

beforeEach(() => {
  t = createTestDb()
  boardId = boards.create(t.db, 'Casa', NOW).id
})

function listTitles(id = boardId): string[] {
  return boards.get(t.db, id).lists.map((l) => l.title)
}

function listId(title: string, id = boardId): string {
  return boards.get(t.db, id).lists.find((l) => l.title === title)!.id
}

function boardLabels(id: string) {
  return t.db.select().from(label).where(eq(label.boardId, id)).orderBy(asc(label.position)).all()
}

describe('listas', () => {
  it('LIS-01: título de 1 a 80 caracteres', () => {
    expect(createListInput.safeParse({ boardId: randomUUID(), title: ' ' }).success).toBe(false)
    expect(
      createListInput.safeParse({ boardId: randomUUID(), title: 'x'.repeat(81) }).success
    ).toBe(false)
    expect(createListInput.parse({ boardId: randomUUID(), title: ' Ideias ' }).title).toBe('Ideias')
  })

  it('lista nova vai para o fim, sem as opções ligadas', () => {
    const created = lists.create(t.db, boardId, 'Ideias', NOW)
    expect(listTitles()).toEqual(['A fazer', 'Em andamento', 'Concluído', 'Entregue', 'Ideias'])
    expect([created.isDoneList, created.freezesAging, created.cardCount]).toEqual([false, false, 0])
  })

  it('não cria lista em quadro fechado', () => {
    boards.close(t.db, boardId, NOW)
    expect(() => lists.create(t.db, boardId, 'Ideias', NOW)).toThrow(/fechado/)
  })

  it('renomear não mexe nos cards (ENV-06)', () => {
    const id = listId('A fazer')
    const cardId = insertCard(t.db, id, { now: 5 })
    lists.update(t.db, { listId: id, title: 'Para fazer' }, NOW)
    expect(listTitles()[0]).toBe('Para fazer')
    expect(t.db.select().from(card).where(eq(card.id, cardId)).get()!.lastActivityAt).toBe(5)
  })

  it('LIS-02 e FIN-06: as duas opções são independentes e não mudam o ✓ dos cards', () => {
    const id = listId('A fazer')
    const done = insertCard(t.db, id, { isDone: true })
    const open = insertCard(t.db, id, { isDone: false })
    const updated = lists.update(t.db, { listId: id, isDoneList: true }, NOW)
    expect([updated.isDoneList, updated.freezesAging]).toEqual([true, false])
    const again = lists.update(t.db, { listId: id, freezesAging: true, isDoneList: false }, NOW)
    expect([again.isDoneList, again.freezesAging]).toEqual([false, true])
    const states = t.db.select({ id: card.id, isDone: card.isDone }).from(card).all()
    expect(states).toEqual(
      expect.arrayContaining([
        { id: done, isDone: true },
        { id: open, isDone: false }
      ])
    )
  })

  it('LIS-03: arrastar muda só a posição (posição fracionária)', () => {
    const id = listId('Entregue')
    const before = t.db.select().from(list).where(eq(list.id, id)).get()!
    lists.move(t.db, id, 0, NOW)
    expect(listTitles()).toEqual(['Entregue', 'A fazer', 'Em andamento', 'Concluído'])
    const after = t.db.select().from(list).where(eq(list.id, id)).get()!
    expect({ ...after, position: before.position, updatedAt: before.updatedAt }).toEqual(before)
    lists.move(t.db, listId('A fazer'), 3, NOW)
    expect(listTitles()).toEqual(['Entregue', 'Em andamento', 'Concluído', 'A fazer'])
  })

  it('soltar no mesmo lugar não grava nada', () => {
    const id = listId('Em andamento')
    const before = t.db.select().from(list).where(eq(list.id, id)).get()!
    lists.move(t.db, id, 1, NOW + 1)
    expect(t.db.select().from(list).where(eq(list.id, id)).get()).toEqual(before)
  })

  it('listas arquivadas não contam no índice do arraste', () => {
    lists.archive(t.db, listId('Em andamento'), NOW)
    lists.move(t.db, listId('Entregue'), 1, NOW)
    expect(listTitles()).toEqual(['A fazer', 'Entregue', 'Concluído'])
    lists.restore(t.db, boards.archived(t.db, boardId).lists[0]!.id, NOW)
    expect(listTitles()).toEqual(['A fazer', 'Entregue', 'Em andamento', 'Concluído'])
  })

  it('LIS-04: copiar cria "<nome> (cópia)" logo à direita, com cópias dos cards ativos', () => {
    const id = listId('A fazer')
    const roxo = boardLabels(boardId)[0]!.id
    insertCard(t.db, id, {
      title: 'Primeiro',
      position: 'a0',
      labelIds: [roxo],
      isDone: true,
      checklist: {
        title: 'Passos',
        items: [
          { text: 'feito', isDone: true },
          { text: 'falta', isDone: false }
        ]
      }
    })
    insertCard(t.db, id, { title: 'Segundo', position: 'a1' })
    insertCard(t.db, id, { title: 'Arquivado', position: 'a2', archivedAt: NOW })

    const copied = lists.copy(t.db, id, NOW + 50)
    expect(copied.title).toBe('A fazer (cópia)')
    expect(listTitles()).toEqual([
      'A fazer',
      'A fazer (cópia)',
      'Em andamento',
      'Concluído',
      'Entregue'
    ])
    expect(copied.cardCount).toBe(2)

    const copies = t.db
      .select()
      .from(card)
      .where(eq(card.listId, copied.id))
      .orderBy(asc(card.position))
      .all()
    expect(copies.map((c) => [c.title, c.isDone, c.lastActivityAt])).toEqual([
      ['Primeiro', true, NOW + 50],
      ['Segundo', false, NOW + 50]
    ])
    const first = copies[0]!.id
    expect(t.db.select().from(cardLabel).where(eq(cardLabel.cardId, first)).all()).toEqual([
      { cardId: first, labelId: roxo }
    ])
    const copiedChecklist = t.db.select().from(checklist).where(eq(checklist.cardId, first)).get()!
    const items = t.db
      .select()
      .from(checklistItem)
      .where(eq(checklistItem.checklistId, copiedChecklist.id))
      .orderBy(asc(checklistItem.position))
      .all()
    expect(items.map((i) => [i.text, i.isDone])).toEqual([
      ['feito', true],
      ['falta', false]
    ])
    const log = t.db.select().from(activity).where(eq(activity.cardId, first)).all()
    expect(log.map((a) => [a.kind, JSON.parse(a.data)])).toEqual([['copied', { from: 'Primeiro' }]])
  })

  it('a cópia de uma lista com título longo continua com no máximo 80 caracteres', () => {
    const id = lists.create(t.db, boardId, 'x'.repeat(80), NOW).id
    expect(lists.copy(t.db, id, NOW).title).toHaveLength(80)
  })

  it('a cópia mantém as opções da lista (conclusão e não envelhece)', () => {
    const copied = lists.copy(t.db, listId('Concluído'), NOW)
    expect([copied.isDoneList, copied.freezesAging]).toEqual([true, true])
  })

  it('LIS-05: mover para outro quadro leva os cards e recria as etiquetas que faltam', () => {
    const other = boards.create(t.db, 'Trabalho', NOW).id
    const source = listId('A fazer')
    const [roxo, vermelho] = boardLabels(boardId)
    t.db.update(label).set({ name: 'Urgente' }).where(eq(label.id, vermelho!.id)).run()
    const cardId = insertCard(t.db, source, { labelIds: [roxo!.id, vermelho!.id], now: 7 })
    const rec = randomUUID()
    t.db
      .insert(recurrence)
      .values({
        id: rec,
        boardId,
        freq: 'weekly',
        weekdays: 2,
        anchorDate: '2026-10-21',
        time: '08:00',
        targetListId: source,
        copyLabelsPriority: true,
        copyDescription: true,
        copyChecklist: true,
        copyDueDate: false,
        createdAt: NOW,
        updatedAt: NOW
      })
      .run()

    lists.moveToBoard(t.db, source, other, 1, NOW)

    expect(listTitles()).toEqual(['Em andamento', 'Concluído', 'Entregue'])
    expect(listTitles(other)).toEqual([
      'A fazer',
      'A fazer',
      'Em andamento',
      'Concluído',
      'Entregue'
    ])
    expect(boards.get(t.db, other).lists[1]!.id).toBe(source)

    const targetLabels = boardLabels(other)
    expect(targetLabels).toHaveLength(7) // as 6 padrão + "Urgente", que não existia lá
    const urgente = targetLabels.find((l) => l.name === 'Urgente')!
    const roxoDestino = targetLabels.find((l) => l.color === roxo!.color && l.name === null)!
    const labelsOfCard = t.db.select().from(cardLabel).where(eq(cardLabel.cardId, cardId)).all()
    expect(labelsOfCard.map((l) => l.labelId).sort()).toEqual([roxoDestino.id, urgente.id].sort())

    expect(t.db.select().from(recurrence).where(eq(recurrence.id, rec)).get()!.boardId).toBe(other)
    // mover a lista não é alteração do card (ENV-06)
    expect(t.db.select().from(card).where(eq(card.id, cardId)).get()!.lastActivityAt).toBe(7)
  })

  it('mover para o mesmo quadro é só mudar a posição', () => {
    lists.moveToBoard(t.db, listId('Entregue'), boardId, 0, NOW)
    expect(listTitles()).toEqual(['Entregue', 'A fazer', 'Em andamento', 'Concluído'])
  })

  it('não move para um quadro fechado', () => {
    const other = boards.create(t.db, 'Trabalho', NOW).id
    boards.close(t.db, other, NOW)
    expect(() => lists.moveToBoard(t.db, listId('A fazer'), other, 0, NOW)).toThrow(/fechado/)
    expect(listTitles()).toHaveLength(4)
  })

  it('LIS-06: arquivar esconde a lista; restaurar devolve na mesma posição', () => {
    const id = listId('Em andamento')
    lists.archive(t.db, id, NOW)
    expect(listTitles()).toEqual(['A fazer', 'Concluído', 'Entregue'])
    expect(boards.archived(t.db, boardId).lists.map((l) => l.id)).toEqual([id])
    lists.restore(t.db, id, NOW)
    expect(listTitles()).toEqual(['A fazer', 'Em andamento', 'Concluído', 'Entregue'])
  })

  it('LIS-07: arquivar todos os cards deixa a lista e registra "arquivado" em cada card', () => {
    const id = listId('A fazer')
    const a = insertCard(t.db, id, { now: 3 })
    const b = insertCard(t.db, id, { now: 3 })
    insertCard(t.db, id, { archivedAt: 1 })
    expect(lists.archiveCards(t.db, id, NOW)).toBe(2)
    expect(boards.get(t.db, boardId).lists[0]!.cardCount).toBe(0)
    expect(boards.archived(t.db, boardId).cards).toHaveLength(3)
    for (const cardId of [a, b]) {
      const row = t.db.select().from(card).where(eq(card.id, cardId)).get()!
      expect([row.archivedAt, row.lastActivityAt]).toEqual([NOW, 3]) // arquivar não zera
      const log = t.db.select().from(activity).where(eq(activity.cardId, cardId)).all()
      expect(log.map((l) => l.kind)).toEqual(['archived'])
    }
  })

  it('o contador conta só os cards ativos', () => {
    const id = listId('A fazer')
    insertCard(t.db, id)
    insertCard(t.db, id)
    insertCard(t.db, id, { archivedAt: NOW })
    expect(boards.get(t.db, boardId).lists[0]!.cardCount).toBe(2)
  })
})

describe('cards arquivados', () => {
  it('restaurar devolve o card, zera o envelhecimento (ENV-05) e registra "restaurado"', () => {
    const cardId = insertCard(t.db, listId('A fazer'), { now: 3, archivedAt: 10 })
    cards.restore(t.db, cardId, NOW)
    const row = t.db.select().from(card).where(eq(card.id, cardId)).get()!
    expect([row.archivedAt, row.lastActivityAt]).toEqual([null, NOW])
    const log = t.db.select().from(activity).where(eq(activity.cardId, cardId)).all()
    expect(log.map((l) => l.kind)).toEqual(['restored'])
  })

  it('excluir apaga o card e o que é dele', () => {
    const cardId = insertCard(t.db, listId('A fazer'), {
      archivedAt: 10,
      labelIds: [boardLabels(boardId)[0]!.id],
      checklist: { title: 'Passos', items: [{ text: 'um', isDone: false }] }
    })
    cards.remove(t.db, cardId)
    expect(t.db.select().from(card).all()).toEqual([])
    expect(t.db.select().from(cardLabel).all()).toEqual([])
    expect(t.db.select().from(checklistItem).all()).toEqual([])
    expect(() => cards.remove(t.db, cardId)).toThrow(/não encontrado/)
  })
})

describe('ordenar a lista (LIS-08)', () => {
  function setup() {
    const todo = listId('A fazer')
    const add = (title: string, position: string, values: Partial<typeof card.$inferInsert>) => {
      const id = insertCard(t.db, todo, { title, position })
      if (Object.keys(values).length) t.db.update(card).set(values).where(eq(card.id, id)).run()
      return id
    }
    add('Sem nada', 'a0', {})
    add('Baixa, dia 20', 'a1', { priority: 4, dueAt: '2026-10-20' })
    add('Muito alta, dia 20 às 10h', 'a2', { priority: 1, dueAt: '2026-10-20T10:00' })
    add('Baixa, dia 18', 'a3', { priority: 4, dueAt: '2026-10-18' })
    add('Arquivado', 'a4', { priority: 1, archivedAt: NOW })
    return todo
  }
  const order = () =>
    t.db
      .select({ title: card.title })
      .from(card)
      .where(eq(card.listId, listId('A fazer')))
      .orderBy(asc(card.position))
      .all()
      .map((c) => c.title)

  it('PRI-05: do 1 ao 5, sem prioridade no fim, empates na ordem em que estavam', () => {
    lists.sort(t.db, setup(), 'priority')
    expect(order()).toEqual([
      'Muito alta, dia 20 às 10h',
      'Baixa, dia 20',
      'Baixa, dia 18',
      'Sem nada',
      'Arquivado'
    ])
  })

  it('DAT-04: do prazo mais cedo ao mais tarde (o dia inteiro vai até o fim do dia)', () => {
    lists.sort(t.db, setup(), 'due')
    expect(order()).toEqual([
      'Baixa, dia 18',
      'Muito alta, dia 20 às 10h',
      'Baixa, dia 20',
      'Sem nada',
      'Arquivado'
    ])
  })

  it('ordenar não zera o envelhecimento (ENV-06)', () => {
    lists.sort(t.db, setup(), 'priority')
    const touched = t.db
      .select()
      .from(card)
      .all()
      .filter((c) => c.lastActivityAt !== 1000)
    expect(touched).toEqual([])
  })
})
