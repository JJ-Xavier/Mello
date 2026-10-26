import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { calendarAddCardInput, calendarMonthInput } from '../../shared/ipc/calendar'
import { createTestDb, insertCard } from '../db/test-db'
import { card, checklistItem, label } from '../db/schema'
import * as boards from './boards'
import * as calendar from './calendar'
import * as cards from './cards'
import * as checklists from './checklists'
import * as lists from './lists'

const NOW = 1_800_000_000_000
const LATER = NOW + 60_000

let t: ReturnType<typeof createTestDb>
let casa: string
let estudos: string
let listsOf: Record<string, string>

beforeEach(() => {
  t = createTestDb()
  casa = boards.create(t.db, 'Casa', NOW).id
  estudos = boards.create(t.db, 'Estudos', NOW).id
  listsOf = Object.fromEntries(boards.get(t.db, casa).lists.map((l) => [l.title, l.id]))
})

const october = (boardId: string | null = casa) =>
  calendar.month(t.db, { year: 2026, month: 10, boardId })

// Card com data de entrega (e, se pedido, um item de checklist com data).
function dated(title: string, dueAt: string | null, list = 'A fazer', options = {}) {
  const id = insertCard(t.db, listsOf[list]!, { title, ...options })
  t.db.update(card).set({ dueAt }).where(eq(card.id, id)).run()
  return id
}

function task(cardId: string, text: string, dueDate: string | null, showInCalendar = true) {
  const checklist = checklists.create(t.db, cardId, 'Itens', NOW)
  const item = checklists.createItem(t.db, checklist.id, text, NOW)
  t.db
    .update(checklistItem)
    .set({ dueDate, showInCalendar })
    .where(eq(checklistItem.id, item.id))
    .run()
  return item.id
}

describe('calendário: o que aparece no mês (CAL-05)', () => {
  it('cards pela data de entrega, com e sem hora, só do mês', () => {
    dated('Dia inteiro', '2026-10-01')
    dated('Com hora', '2026-10-31T23:30')
    dated('Setembro', '2026-09-30T23:59')
    dated('Novembro', '2026-11-01')
    dated('Sem data', null)
    expect(october().cards.map((c) => [c.title, c.dueAt])).toEqual([
      ['Dia inteiro', '2026-10-01'],
      ['Com hora', '2026-10-31T23:30']
    ])
  })

  it('tarefas: itens com data e "Mostrar no calendário" ligado, com o card e o quadro', () => {
    const id = dated('Reforma', null)
    task(id, 'Comprar tinta', '2026-10-21')
    task(id, 'Escondida', '2026-10-21', false)
    task(id, 'Sem data', null)
    task(id, 'Novembro', '2026-11-02')
    expect(october().tasks).toEqual([
      expect.objectContaining({
        cardId: id,
        cardTitle: 'Reforma',
        boardId: casa,
        boardTitle: 'Casa',
        text: 'Comprar tinta',
        dueDate: '2026-10-21',
        isDone: false
      })
    ])
  })

  it('o card traz as etiquetas na ordem do quadro, a prioridade e o quadro', () => {
    const [first, second] = t.db.select().from(label).where(eq(label.boardId, casa)).all()
    const id = dated('Pagar', '2026-10-20', 'A fazer', { labelIds: [second!.id, first!.id] })
    cards.update(t.db, { cardId: id, priority: 1 }, NOW)
    const [found] = october().cards
    expect(found).toMatchObject({
      id,
      boardId: casa,
      boardTitle: 'Casa',
      priority: 1,
      recurring: false,
      labels: [{ id: first!.id }, { id: second!.id }]
    })
  })
})

describe('calendário: riscado (CAL-07) segue a FIN-01', () => {
  it('finalizado só com o ✓ numa lista de conclusão', () => {
    dated('Aberto', '2026-10-05')
    dated('✓ fora da conclusão', '2026-10-06', 'A fazer', { isDone: true })
    dated('Concluído sem ✓', '2026-10-07', 'Concluído')
    dated('Finalizado', '2026-10-08', 'Concluído', { isDone: true })
    expect(october().cards.map((c) => [c.title, c.isDone, c.finished])).toEqual([
      ['Aberto', false, false],
      ['✓ fora da conclusão', true, false],
      ['Concluído sem ✓', false, false],
      ['Finalizado', true, true]
    ])
  })
})

describe('calendário: o que fica de fora (CAL-06)', () => {
  it('card arquivado, modelo, de lista arquivada e de quadro fechado; e as tarefas deles', () => {
    const archived = dated('Arquivado', '2026-10-10', 'A fazer', { archivedAt: NOW })
    task(archived, 'do arquivado', '2026-10-10')
    const template = dated('Modelo', '2026-10-11')
    t.db.update(card).set({ isTemplate: true }).where(eq(card.id, template)).run()
    task(template, 'do modelo', '2026-10-11')
    const ideias = lists.create(t.db, casa, 'Ideias', NOW).id
    listsOf['Ideias'] = ideias
    task(dated('Da lista arquivada', '2026-10-12', 'Ideias'), 'da lista', '2026-10-12')
    lists.archive(t.db, ideias, NOW)
    const visible = dated('Visível', '2026-10-13')
    task(visible, 'visível', '2026-10-13')

    expect(october().cards.map((c) => c.title)).toEqual(['Visível'])
    expect(october().tasks.map((i) => i.text)).toEqual(['visível'])

    boards.close(t.db, casa, NOW)
    expect(october(null)).toEqual({ cards: [], tasks: [] })
    expect(october(casa)).toEqual({ cards: [], tasks: [] })
  })
})

describe('calendário: escopo (CAL-02)', () => {
  it('de um quadro mostra só aquele; de todos mostra todos, com o nome do quadro', () => {
    dated('Da casa', '2026-10-21')
    const estudosList = boards.get(t.db, estudos).lists[0]!.id
    const other = insertCard(t.db, estudosList, { title: 'Prova' })
    t.db.update(card).set({ dueAt: '2026-10-23' }).where(eq(card.id, other)).run()

    expect(october(casa).cards.map((c) => c.title)).toEqual(['Da casa'])
    expect(october(estudos).cards.map((c) => c.title)).toEqual(['Prova'])
    expect(october(null).cards.map((c) => [c.title, c.boardTitle])).toEqual([
      ['Da casa', 'Casa'],
      ['Prova', 'Estudos']
    ])
  })

  it('a entrada aceita mês de 1 a 12 e quadro ou null', () => {
    expect(calendarMonthInput.safeParse({ year: 2026, month: 10, boardId: null }).success).toBe(
      true
    )
    expect(calendarMonthInput.safeParse({ year: 2026, month: 13, boardId: null }).success).toBe(
      false
    )
    expect(calendarMonthInput.safeParse({ year: 2026, month: 0, boardId: casa }).success).toBe(
      false
    )
    expect(calendarMonthInput.safeParse({ year: 2026, month: 10 }).success).toBe(false)
  })
})

describe('"Adicionar" pelo calendário (CAL-12)', () => {
  it('cria na primeira lista que não é de conclusão, com a data do dia e sem hora', () => {
    lists.move(t.db, listsOf['Concluído']!, 0, NOW)
    insertCard(t.db, listsOf['A fazer']!, { title: 'Antes', position: 'a0' })
    const created = calendar.addCard(
      t.db,
      { boardId: casa, day: '2026-10-23', title: 'Prova' },
      LATER
    )
    expect(created).toMatchObject({ listId: listsOf['A fazer'], title: 'Prova' })
    const detail = cards.get(t.db, created.id)
    expect(detail).toMatchObject({ dueAt: '2026-10-23', reminder: 'none', isDone: false })
    expect(detail.lastActivityAt).toBe(LATER)
    expect(detail.activity.map((a) => a.kind)).toEqual(['created'])
    // CAR-02: no fim da lista.
    expect(boards.get(t.db, casa).lists[1]!.cards.map((c) => c.title)).toEqual(['Antes', 'Prova'])
  })

  it('pula a lista arquivada', () => {
    lists.archive(t.db, listsOf['A fazer']!, NOW)
    const created = calendar.addCard(t.db, { boardId: casa, day: '2026-10-23', title: 'X' }, NOW)
    expect(created.listId).toBe(listsOf['Em andamento'])
  })

  it('recusa quadro sem lista comum, quadro fechado e quadro que não existe', () => {
    lists.archive(t.db, listsOf['A fazer']!, NOW)
    lists.archive(t.db, listsOf['Em andamento']!, NOW)
    const input = { boardId: casa, day: '2026-10-23', title: 'X' }
    expect(() => calendar.addCard(t.db, input, NOW)).toThrow(/lista que não seja de conclusão/)
    boards.close(t.db, estudos, NOW)
    expect(() => calendar.addCard(t.db, { ...input, boardId: estudos }, NOW)).toThrow(/fechado/)
    expect(() =>
      calendar.addCard(t.db, { ...input, boardId: '6f1c2b2e-1d3a-4c55-9a1e-2f4b8c9d0e1f' }, NOW)
    ).toThrow(/não encontrado/)
  })

  it('a entrada recusa um dia que não existe e título vazio', () => {
    const ok = { boardId: casa, day: '2026-10-23', title: 'Prova' }
    expect(calendarAddCardInput.safeParse(ok).success).toBe(true)
    expect(calendarAddCardInput.safeParse({ ...ok, day: '2026-02-30' }).success).toBe(false)
    expect(calendarAddCardInput.safeParse({ ...ok, day: '2026-10-23T10:00' }).success).toBe(false)
    expect(calendarAddCardInput.safeParse({ ...ok, title: '  ' }).success).toBe(false)
  })
})
