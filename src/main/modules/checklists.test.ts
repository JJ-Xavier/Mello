import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { createItemInput, updateItemInput } from '../../shared/ipc/checklists'
import { createTestDb, insertCard } from '../db/test-db'
import { card } from '../db/schema'
import * as boards from './boards'
import * as cards from './cards'
import * as checklists from './checklists'

const NOW = 1_800_000_000_000
const LATER = NOW + 86_400_000

let t: ReturnType<typeof createTestDb>
let cardId: string

beforeEach(() => {
  t = createTestDb()
  const boardId = boards.create(t.db, 'Casa', NOW).id
  cardId = insertCard(t.db, boards.get(t.db, boardId).lists[0]!.id, { title: 'Mudança' })
})

const lastActivity = () => t.db.select().from(card).where(eq(card.id, cardId)).get()!.lastActivityAt
const shape = () =>
  cards.get(t.db, cardId).checklists.map((c) => [c.title, c.items.map((i) => i.text)])

describe('checklists (CHK)', () => {
  it('CHK-01: vários checklists, cada um no fim; criar zera o envelhecimento', () => {
    checklists.create(t.db, cardId, 'Caixas', LATER)
    checklists.create(t.db, cardId, 'Contas', LATER)
    expect(shape()).toEqual([
      ['Caixas', []],
      ['Contas', []]
    ])
    expect(lastActivity()).toBe(LATER)
  })

  it('CHK-01: renomear e reordenar zeram; mesmo lugar não grava', () => {
    const a = checklists.create(t.db, cardId, 'Caixas', NOW)
    checklists.create(t.db, cardId, 'Contas', NOW)
    checklists.update(t.db, { checklistId: a.id, title: 'Embalar' }, LATER)
    expect(lastActivity()).toBe(LATER)
    checklists.move(t.db, a.id, 1, LATER + 1)
    expect(shape().map(([title]) => title)).toEqual(['Contas', 'Embalar'])
    expect(lastActivity()).toBe(LATER + 1)
    checklists.move(t.db, a.id, 1, LATER + 2)
    expect(lastActivity()).toBe(LATER + 1)
  })

  it('CHK-04: "Ocultar itens marcados" fica salvo e não zera (ENV-06)', () => {
    const a = checklists.create(t.db, cardId, 'Caixas', NOW)
    checklists.update(t.db, { checklistId: a.id, hideChecked: true }, LATER)
    expect(cards.get(t.db, cardId).checklists[0]!.hideChecked).toBe(true)
    expect(lastActivity()).toBe(NOW)
  })

  it('excluir o checklist leva os itens e zera', () => {
    const a = checklists.create(t.db, cardId, 'Caixas', NOW)
    checklists.createItem(t.db, a.id, 'Fita', NOW)
    checklists.remove(t.db, a.id, LATER)
    expect(shape()).toEqual([])
    expect(lastActivity()).toBe(LATER)
    expect(() => checklists.remove(t.db, a.id, LATER)).toThrow(/não encontrado/)
  })
})

describe('itens do checklist (CHK)', () => {
  let listId: string
  beforeEach(() => {
    listId = checklists.create(t.db, cardId, 'Caixas', NOW).id
  })

  it('texto de 1 a 500; data com o dia e, se quiser, a hora (CHK-05)', () => {
    expect(createItemInput.safeParse({ checklistId: randomUUID(), text: ' ' }).success).toBe(false)
    const due = (dueDate: string) =>
      updateItemInput.safeParse({ itemId: randomUUID(), due: { dueDate, showInCalendar: true } })
    expect(due('2026-10-20').success).toBe(true)
    expect(due('2026-10-20T10:00').success).toBe(true)
    expect(due('2026-10-20T24:00').success).toBe(false)
    expect(due('2026-10-20T9:00').success).toBe(false)
    expect(due('2026-02-30').success).toBe(false)
  })

  it('CHK-05: item novo no fim, sem data e no calendário; tudo zera o envelhecimento', () => {
    const a = checklists.createItem(t.db, listId, 'Fita', LATER)
    expect(a).toMatchObject({ isDone: false, dueDate: null, showInCalendar: true })
    expect(lastActivity()).toBe(LATER)

    checklists.updateItem(t.db, { itemId: a.id, text: 'Fita larga' }, LATER + 1)
    expect(lastActivity()).toBe(LATER + 1)
    checklists.updateItem(
      t.db,
      { itemId: a.id, due: { dueDate: '2026-10-20', showInCalendar: false } },
      LATER + 2
    )
    expect(cards.get(t.db, cardId).checklists[0]!.items[0]).toMatchObject({
      text: 'Fita larga',
      dueDate: '2026-10-20',
      showInCalendar: false
    })
    expect(lastActivity()).toBe(LATER + 2)
    checklists.toggleItem(t.db, a.id, true, LATER + 3)
    expect(lastActivity()).toBe(LATER + 3)
  })

  it('o mesmo valor não grava nada', () => {
    const a = checklists.createItem(t.db, listId, 'Fita', NOW)
    checklists.toggleItem(t.db, a.id, false, LATER)
    checklists.updateItem(t.db, { itemId: a.id, text: 'Fita' }, LATER)
    checklists.updateItem(
      t.db,
      { itemId: a.id, due: { dueDate: null, showInCalendar: true } },
      LATER
    )
    expect(lastActivity()).toBe(NOW)
  })

  it('CHK-03: a face soma x/y de todos os checklists', () => {
    const a = checklists.createItem(t.db, listId, 'Fita', NOW)
    checklists.createItem(t.db, listId, 'Caixas', NOW)
    const other = checklists.create(t.db, cardId, 'Contas', NOW).id
    const c = checklists.createItem(t.db, other, 'Luz', NOW)
    checklists.toggleItem(t.db, a.id, true, NOW)
    checklists.toggleItem(t.db, c.id, true, NOW)
    const face = boards.get(t.db, cards.get(t.db, cardId).boardId).lists[0]!.cards[0]!
    expect([face.checkDone, face.checkTotal]).toEqual([2, 3])
  })

  it('reordenar e excluir itens zeram', () => {
    const a = checklists.createItem(t.db, listId, 'Fita', NOW)
    checklists.createItem(t.db, listId, 'Caixas', NOW)
    checklists.moveItem(t.db, a.id, 1, LATER)
    expect(shape()).toEqual([['Caixas', ['Caixas', 'Fita']]])
    expect(lastActivity()).toBe(LATER)
    checklists.removeItem(t.db, a.id, LATER + 1)
    expect(shape()).toEqual([['Caixas', ['Caixas']]])
    expect(lastActivity()).toBe(LATER + 1)
  })
})
