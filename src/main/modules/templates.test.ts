import { asc, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { createBoardFromTemplateInput } from '../../shared/ipc/templates'
import { createTestDb, insertCard } from '../db/test-db'
import { activity, board, card, cardLabel, label, list } from '../db/schema'
import { agingOf } from '../../shared/rules/aging'
import * as boards from './boards'
import * as calendar from './calendar'
import * as cards from './cards'
import * as lists from './lists'
import * as recurrence from './recurrence'
import * as templates from './templates'

const NOW = 1_800_000_000_000
const LATER = NOW + 20 * 86_400_000

let t: ReturnType<typeof createTestDb>
let boardId: string

beforeEach(() => {
  t = createTestDb()
  boardId = boards.create(t.db, 'Casa', NOW).id
})

function listId(title: string, id = boardId): string {
  return boards.get(t.db, id).lists.find((l) => l.title === title)!.id
}

function row(id: string) {
  return t.db.select().from(card).where(eq(card.id, id)).get()!
}

function activities(id: string) {
  return t.db
    .select()
    .from(activity)
    .where(eq(activity.cardId, id))
    .all()
    .map((a) => ({ kind: a.kind, data: JSON.parse(a.data) as unknown }))
}

function boardLabels(id: string) {
  return t.db.select().from(label).where(eq(label.boardId, id)).orderBy(asc(label.position)).all()
}

const dailyRule = (targetListId: string) => ({
  freq: 'daily' as const,
  weekdays: 0,
  monthDay: null,
  intervalDays: null,
  time: '08:00',
  targetListId,
  copyLabelsPriority: true,
  copyDescription: true,
  copyChecklist: true,
  copyDueDate: false,
  ifPreviousOpen: 'skip' as const,
  endsKind: 'never' as const,
  endsOn: null,
  endsAfter: null
})

describe('card-modelo (MOD-01, MOD-02)', () => {
  it('vira modelo e deixa de ser; virar tira o ✓ e nenhum dos dois zera o tempo', () => {
    const id = insertCard(t.db, listId('Concluído'), { title: 'Revisão', isDone: true })
    templates.setCard(t.db, id, true, LATER)
    expect(row(id)).toMatchObject({ isTemplate: true, isDone: false, doneAt: null })
    expect(row(id).lastActivityAt).toBe(1000)
    templates.setCard(t.db, id, false, LATER)
    expect(row(id)).toMatchObject({ isTemplate: false, isDone: false, lastActivityAt: 1000 })
  })

  it('card com repetição é recusado; o modelo não aceita repetição nem ✓', () => {
    const repetido = insertCard(t.db, listId('A fazer'), { title: 'Regar' })
    recurrence.save(t.db, repetido, dailyRule(listId('A fazer')), NOW)
    expect(() => templates.setCard(t.db, repetido, true, NOW)).toThrow(/Tire a repetição/)

    const modelo = insertCard(t.db, listId('A fazer'), { title: 'Modelo', position: 'a1' })
    templates.setCard(t.db, modelo, true, NOW)
    expect(() => recurrence.save(t.db, modelo, dailyRule(listId('A fazer')), NOW)).toThrow(
      /modelo não pode ter repetição/
    )
    expect(() => cards.update(t.db, { cardId: modelo, isDone: true }, NOW)).toThrow(/modelo/)
  })

  it('arrastado para uma lista de conclusão, não ganha o ✓', () => {
    const id = insertCard(t.db, listId('A fazer'), { title: 'Modelo' })
    templates.setCard(t.db, id, true, NOW)
    cards.move(t.db, id, listId('Concluído'), 0, NOW)
    expect(row(id).isDone).toBe(false)
  })

  it('não envelhece e não aparece no calendário', () => {
    const id = insertCard(t.db, listId('A fazer'), { title: 'Modelo' })
    t.db.update(card).set({ dueAt: '2027-01-15' }).where(eq(card.id, id)).run()
    templates.setCard(t.db, id, true, NOW)
    const face = boards.get(t.db, boardId).lists[0]!.cards[0]!
    expect(face.isTemplate).toBe(true)
    const todo = boards.get(t.db, boardId).lists[0]!
    expect(agingOf(face, todo, true, LATER)).toMatchObject({ level: 0, frozen: 'template' })
    expect(calendar.month(t.db, { year: 2027, month: 1, boardId }).cards).toEqual([])
  })
})

describe('criar a partir de card-modelo (MOD-03)', () => {
  it('a cópia vai para o fim da lista, sem a marca de modelo, com a atividade do modelo', () => {
    const [roxa] = boardLabels(boardId)
    const modelo = insertCard(t.db, listId('A fazer'), {
      title: 'Revisão semanal',
      labelIds: [roxa!.id],
      checklist: { title: 'Passos', items: [{ text: 'Caixa de entrada', isDone: false }] }
    })
    templates.setCard(t.db, modelo, true, NOW)
    insertCard(t.db, listId('Em andamento'), { title: 'Já estava', position: 'a5' })

    const created = templates.createCard(
      t.db,
      { templateId: modelo, listId: listId('Em andamento') },
      LATER
    )
    expect(created).toMatchObject({
      title: 'Revisão semanal',
      isTemplate: false,
      isDone: false,
      lastActivityAt: LATER,
      labels: [expect.objectContaining({ id: roxa!.id })],
      checkTotal: 1
    })
    expect(
      boards
        .get(t.db, boardId)
        .lists.find((l) => l.title === 'Em andamento')!
        .cards.map((c) => c.title)
    ).toEqual(['Já estava', 'Revisão semanal'])
    expect(activities(created.id)).toEqual([
      { kind: 'from_template', data: { from: 'Revisão semanal' } }
    ])
    expect(row(modelo).isTemplate).toBe(true)
  })

  it('recusa card que não é modelo, lista de outro quadro e lista arquivada', () => {
    const comum = insertCard(t.db, listId('A fazer'), { title: 'Comum' })
    const target = { templateId: comum, listId: listId('A fazer') }
    expect(() => templates.createCard(t.db, target, NOW)).toThrow(/não é um modelo/)

    templates.setCard(t.db, comum, true, NOW)
    const outro = boards.create(t.db, 'Outro', NOW).id
    expect(() =>
      templates.createCard(t.db, { templateId: comum, listId: listId('A fazer', outro) }, NOW)
    ).toThrow(/outro quadro/)
    lists.archive(t.db, listId('Entregue'), NOW)
    const entregue = t.db.select().from(list).where(eq(list.title, 'Entregue')).get()!.id
    expect(() => templates.createCard(t.db, { templateId: comum, listId: entregue }, NOW)).toThrow(
      /arquivada/
    )
  })
})

describe('quadro-modelo (MOD-04)', () => {
  it('sai do Início e vai para os modelos, com as contagens; e volta', () => {
    insertCard(t.db, listId('A fazer'), { title: 'Um' })
    insertCard(t.db, listId('Concluído'), { title: 'Dois' })
    insertCard(t.db, listId('Concluído'), { title: 'Arquivado', position: 'a1', archivedAt: NOW })
    boards.create(t.db, 'Estudos', NOW)
    templates.setBoard(t.db, boardId, true, NOW)

    expect(boards.listOpen(t.db).map((b) => b.title)).toEqual(['Estudos'])
    expect(templates.listBoards(t.db)).toEqual([
      expect.objectContaining({
        id: boardId,
        isTemplate: true,
        listCount: 4,
        labelCount: 6,
        cardCount: 2
      })
    ])
    templates.setBoard(t.db, boardId, false, NOW)
    expect(boards.listOpen(t.db).map((b) => b.title)).toEqual(['Casa', 'Estudos'])
    expect(templates.listBoards(t.db)).toEqual([])
  })

  it('quadro-modelo fechado sai dos modelos; quadro que não existe é recusado', () => {
    templates.setBoard(t.db, boardId, true, NOW)
    boards.close(t.db, boardId, NOW)
    expect(templates.listBoards(t.db)).toEqual([])
    expect(() =>
      templates.setBoard(t.db, '00000000-0000-4000-8000-000000000000', true, NOW)
    ).toThrow(/não encontrado/)
  })
})

describe('criar quadro a partir de modelo (MOD-05)', () => {
  function prepareTemplate() {
    const [roxa, vermelha] = boardLabels(boardId)
    t.db.update(label).set({ name: 'Urgente' }).where(eq(label.id, vermelha!.id)).run()
    lists.update(t.db, { listId: listId('Em andamento'), freezesAging: true }, NOW)
    lists.archive(t.db, listId('Entregue'), NOW)
    boards.setBackground(t.db, { boardId, background: { kind: 'gradient', value: 'oceano' } }, NOW)
    const feito = insertCard(t.db, listId('Concluído'), {
      title: 'Feito',
      isDone: true,
      labelIds: [vermelha!.id],
      checklist: { title: 'Passos', items: [{ text: 'Um', isDone: true }] }
    })
    const modelo = insertCard(t.db, listId('A fazer'), {
      title: 'Modelo de card',
      labelIds: [roxa!.id]
    })
    templates.setCard(t.db, modelo, true, NOW)
    insertCard(t.db, listId('A fazer'), { title: 'Arquivado', position: 'a1', archivedAt: NOW })
    templates.setBoard(t.db, boardId, true, NOW)
    return { feito }
  }

  it('copia as listas ativas com as opções, as etiquetas e o fundo, sem cards', () => {
    prepareTemplate()
    const created = templates.createBoard(
      t.db,
      { templateId: boardId, title: 'Casa nova', keepCards: false },
      LATER
    )
    expect(created).toMatchObject({
      title: 'Casa nova',
      isTemplate: false,
      isFavorite: false,
      closedAt: null,
      background: expect.objectContaining({ kind: 'gradient', value: 'oceano' })
    })
    const detail = boards.get(t.db, created.id)
    expect(detail.bgTone).toBe(boards.get(t.db, boardId).bgTone)
    expect(
      detail.lists.map((l) => [l.title, l.isDoneList, l.freezesAging, l.cards.length])
    ).toEqual([
      ['A fazer', false, false, 0],
      ['Em andamento', false, true, 0],
      ['Concluído', true, true, 0]
    ])
    expect(boardLabels(created.id).map((l) => [l.color, l.name])).toEqual(
      boardLabels(boardId).map((l) => [l.color, l.name])
    )
    expect(boards.listOpen(t.db).map((b) => b.title)).toEqual(['Casa nova'])
    expect(templates.listBoards(t.db).map((b) => b.id)).toEqual([boardId])
  })

  it('com "Manter cards": os ativos, sem o ✓, com nível 0, as etiquetas novas e só o registro do modelo', () => {
    const { feito } = prepareTemplate()
    const created = templates.createBoard(
      t.db,
      { templateId: boardId, title: 'Casa nova', keepCards: true },
      LATER
    )
    const detail = boards.get(t.db, created.id)
    expect(detail.lists.map((l) => l.cards.map((c) => c.title))).toEqual([
      ['Modelo de card'],
      [],
      ['Feito']
    ])
    const copia = detail.lists[2]!.cards[0]!
    expect(copia).toMatchObject({ isDone: false, lastActivityAt: LATER, checkDone: 1 })
    expect(row(copia.id).doneAt).toBeNull()
    expect(detail.lists[0]!.cards[0]!.isTemplate).toBe(true)
    const novaUrgente = boardLabels(created.id).find((l) => l.name === 'Urgente')!
    expect(t.db.select().from(cardLabel).where(eq(cardLabel.cardId, copia.id)).all()).toEqual([
      { cardId: copia.id, labelId: novaUrgente.id }
    ])
    expect(activities(copia.id)).toEqual([{ kind: 'from_template', data: { from: 'Casa' } }])
    expect(row(feito).isDone).toBe(true)
  })

  it('recusa quadro que não é modelo e título vazio', () => {
    expect(() =>
      templates.createBoard(t.db, { templateId: boardId, title: 'X', keepCards: false }, NOW)
    ).toThrow(/não é um modelo/)
    expect(
      createBoardFromTemplateInput.safeParse({ templateId: boardId, title: '  ', keepCards: true })
        .success
    ).toBe(false)
    expect(t.db.select().from(board).all()).toHaveLength(1)
  })
})
