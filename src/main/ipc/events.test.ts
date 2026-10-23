// Tabela de eventos do envelhecimento (PLANO.md, seção 6.2): para cada canal que mexe num card,
// confere se ele zera (ENV-05) ou não (ENV-06) a última alteração. O último teste confere que todo
// canal do IPC está nesta tabela: um canal novo sem classificação faz o teste falhar.
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { CHANNELS } from '../../shared/ipc/api'
import { createTestDb, insertCard } from '../db/test-db'
import { card, checklist, checklistItem, label } from '../db/schema'
import * as boards from '../modules/boards'
import { createRoutes, type Routes } from './routes'

const BEFORE = 1000
const NOW = 1_800_000_000_000

interface Fixture {
  boardId: string
  otherBoardId: string
  lists: Record<string, string>
  cardId: string
  otherCardId: string
  labelIds: string[]
  checklistId: string
  itemId: string
}

let routes: Routes
let db: ReturnType<typeof createTestDb>['db']
let f: Fixture

beforeEach(() => {
  ;({ db } = createTestDb())
  routes = createRoutes({ db, app: { version: '0', dataDir: '', dev: true }, now: () => NOW })
  const boardId = boards.create(db, 'Casa', BEFORE).id
  const otherBoardId = boards.create(db, 'Estudos', BEFORE).id
  const lists = Object.fromEntries(boards.get(db, boardId).lists.map((l) => [l.title, l.id]))
  const labelIds = db
    .select()
    .from(label)
    .where(eq(label.boardId, boardId))
    .all()
    .map((l) => l.id)
  const cardId = insertCard(db, lists['A fazer']!, {
    title: 'Alvo',
    position: 'a0',
    labelIds: [labelIds[0]!],
    checklist: { title: 'Itens', items: [{ text: 'Um', isDone: false }] }
  })
  const otherCardId = insertCard(db, lists['A fazer']!, { title: 'Outro', position: 'a1' })
  const checklistId = db.select().from(checklist).get()!.id
  const itemId = db.select().from(checklistItem).get()!.id
  f = { boardId, otherBoardId, lists, cardId, otherCardId, labelIds, checklistId, itemId }
})

async function call(channel: string, input?: unknown) {
  const result = (await routes.get(channel)!(input)) as { ok: boolean; error?: unknown }
  expect(result, JSON.stringify(result.error)).toMatchObject({ ok: true })
}

const lastActivity = (id: string) =>
  db.select().from(card).where(eq(card.id, id)).get()?.lastActivityAt

type Scenario = { name: string; channel: string; input: (f: Fixture) => unknown }

// ENV-05: zeram o envelhecimento do card "Alvo".
const TOUCHES: Scenario[] = [
  {
    name: 'editar o título',
    channel: CHANNELS.cardsUpdate,
    input: (f) => ({ cardId: f.cardId, title: 'Novo' })
  },
  {
    name: 'marcar o ✓',
    channel: CHANNELS.cardsUpdate,
    input: (f) => ({ cardId: f.cardId, isDone: true })
  },
  {
    name: 'mudar a prioridade',
    channel: CHANNELS.cardsUpdate,
    input: (f) => ({ cardId: f.cardId, priority: 2 })
  },
  {
    name: 'mudar a data e o lembrete',
    channel: CHANNELS.cardsUpdate,
    input: (f) => ({ cardId: f.cardId, due: { dueAt: '2026-10-20', reminder: 'at_time' } })
  },
  {
    name: 'editar a descrição',
    channel: CHANNELS.cardsUpdate,
    input: (f) => ({
      cardId: f.cardId,
      description: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'oi' }] }]
      }
    })
  },
  {
    name: 'mover para outra lista',
    channel: CHANNELS.cardsMove,
    input: (f) => ({ cardId: f.cardId, listId: f.lists['Concluído'], index: 0 })
  },
  {
    name: 'mover para outra posição',
    channel: CHANNELS.cardsMove,
    input: (f) => ({ cardId: f.cardId, listId: f.lists['A fazer'], index: 1 })
  },
  {
    name: 'adicionar etiqueta',
    channel: CHANNELS.cardsSetLabels,
    input: (f) => ({ cardId: f.cardId, labelIds: [f.labelIds[0], f.labelIds[1]] })
  },
  {
    name: 'remover etiqueta',
    channel: CHANNELS.cardsSetLabels,
    input: (f) => ({ cardId: f.cardId, labelIds: [] })
  },
  {
    name: 'criar checklist',
    channel: CHANNELS.checklistsCreate,
    input: (f) => ({ cardId: f.cardId, title: 'Mais' })
  },
  {
    name: 'renomear checklist',
    channel: CHANNELS.checklistsUpdate,
    input: (f) => ({ checklistId: f.checklistId, title: 'Outro nome' })
  },
  {
    name: 'excluir checklist',
    channel: CHANNELS.checklistsDelete,
    input: (f) => ({ checklistId: f.checklistId })
  },
  {
    name: 'adicionar item',
    channel: CHANNELS.itemsCreate,
    input: (f) => ({ checklistId: f.checklistId, text: 'Dois' })
  },
  {
    name: 'editar item',
    channel: CHANNELS.itemsUpdate,
    input: (f) => ({ itemId: f.itemId, text: 'Um!' })
  },
  {
    name: 'datar item',
    channel: CHANNELS.itemsUpdate,
    input: (f) => ({ itemId: f.itemId, due: { dueDate: '2026-10-20', showInCalendar: true } })
  },
  {
    name: 'marcar item',
    channel: CHANNELS.itemsToggle,
    input: (f) => ({ itemId: f.itemId, isDone: true })
  },
  { name: 'excluir item', channel: CHANNELS.itemsDelete, input: (f) => ({ itemId: f.itemId }) }
]

// ENV-06: não zeram o envelhecimento do card "Alvo".
const KEEPS: Scenario[] = [
  { name: 'abrir o card', channel: CHANNELS.cardsGet, input: (f) => ({ cardId: f.cardId }) },
  {
    name: 'soltar no mesmo lugar',
    channel: CHANNELS.cardsMove,
    input: (f) => ({ cardId: f.cardId, listId: f.lists['A fazer'], index: 0 })
  },
  { name: 'arquivar', channel: CHANNELS.cardsArchive, input: (f) => ({ cardId: f.cardId }) },
  {
    name: 'copiar (a cópia nasce nova; o original não muda)',
    channel: CHANNELS.cardsCopy,
    input: (f) => ({ cardId: f.cardId, title: 'Cópia', listId: f.lists['A fazer'], index: 0 })
  },
  {
    name: 'criar outro card',
    channel: CHANNELS.cardsCreate,
    input: (f) => ({ listId: f.lists['A fazer'], title: 'Novo' })
  },
  {
    name: 'ocultar itens marcados',
    channel: CHANNELS.checklistsUpdate,
    input: (f) => ({ checklistId: f.checklistId, hideChecked: true })
  },
  {
    name: 'renomear a lista',
    channel: CHANNELS.listsUpdate,
    input: (f) => ({ listId: f.lists['A fazer'], title: 'Já' })
  },
  {
    name: 'mover a lista',
    channel: CHANNELS.listsMove,
    input: (f) => ({ listId: f.lists['A fazer'], index: 2 })
  },
  {
    name: 'copiar a lista',
    channel: CHANNELS.listsCopy,
    input: (f) => ({ listId: f.lists['A fazer'] })
  },
  {
    name: 'mover a lista para outro quadro',
    channel: CHANNELS.listsMoveToBoard,
    input: (f) => ({ listId: f.lists['A fazer'], boardId: f.otherBoardId, index: 0 })
  },
  {
    name: 'ordenar a lista',
    channel: CHANNELS.listsSort,
    input: (f) => ({ listId: f.lists['A fazer'], by: 'priority' })
  },
  {
    name: 'arquivar a lista',
    channel: CHANNELS.listsArchive,
    input: (f) => ({ listId: f.lists['A fazer'] })
  },
  {
    name: 'restaurar a lista',
    channel: CHANNELS.listsRestore,
    input: (f) => ({ listId: f.lists['A fazer'] })
  },
  {
    name: 'arquivar todos os cards',
    channel: CHANNELS.listsArchiveCards,
    input: (f) => ({ listId: f.lists['A fazer'] })
  },
  {
    name: 'editar uma etiqueta',
    channel: CHANNELS.labelsUpdate,
    input: (f) => ({ labelId: f.labelIds[0], name: 'Casa', color: '#1f5eff' })
  },
  {
    name: 'excluir uma etiqueta',
    channel: CHANNELS.labelsDelete,
    input: (f) => ({ labelId: f.labelIds[0] })
  },
  {
    name: 'criar uma etiqueta',
    channel: CHANNELS.labelsCreate,
    input: (f) => ({ boardId: f.boardId, name: '', color: '#1f5eff' })
  },
  {
    name: 'renomear o quadro',
    channel: CHANNELS.boardsUpdate,
    input: (f) => ({ boardId: f.boardId, title: 'Lar' })
  },
  {
    name: 'mover o quadro',
    channel: CHANNELS.boardsMove,
    input: (f) => ({ boardId: f.boardId, index: 1 })
  },
  {
    name: 'fechar o quadro',
    channel: CHANNELS.boardsClose,
    input: (f) => ({ boardId: f.boardId })
  },
  {
    name: 'reabrir o quadro',
    channel: CHANNELS.boardsReopen,
    input: (f) => ({ boardId: f.boardId })
  },
  {
    name: 'filtrar o quadro',
    channel: CHANNELS.cardsMatching,
    input: (f) => ({ boardId: f.boardId, keyword: 'alvo' })
  }
]

// Canais que não alteram um card que continua existindo: consultas, criação de quadro e listas e
// exclusões de vez. Os que zeram mas exigem um estado anterior têm teste próprio abaixo.
const NOT_APPLICABLE = [
  CHANNELS.appInfo,
  CHANNELS.boardsList,
  CHANNELS.boardsListClosed,
  CHANNELS.boardsGet,
  CHANNELS.boardsCreate,
  CHANNELS.boardsDelete,
  CHANNELS.boardsArchived,
  CHANNELS.listsCreate,
  CHANNELS.labelsList,
  CHANNELS.cardsDelete
]
const OWN_TEST = [CHANNELS.cardsRestore, CHANNELS.checklistsMove, CHANNELS.itemsMove]

describe('ENV-05: zeram o envelhecimento', () => {
  it.each(TOUCHES)('$name', async ({ channel, input }) => {
    await call(channel, input(f))
    expect(lastActivity(f.cardId)).toBe(NOW)
    expect(lastActivity(f.otherCardId)).toBe(BEFORE)
  })

  it('restaurar do arquivo', async () => {
    await call(CHANNELS.cardsArchive, { cardId: f.cardId })
    await call(CHANNELS.cardsRestore, { cardId: f.cardId })
    expect(lastActivity(f.cardId)).toBe(NOW)
  })

  it('reordenar checklist e item', async () => {
    await call(CHANNELS.checklistsCreate, { cardId: f.cardId, title: 'Mais' })
    db.update(card).set({ lastActivityAt: BEFORE }).where(eq(card.id, f.cardId)).run()
    await call(CHANNELS.checklistsMove, { checklistId: f.checklistId, index: 1 })
    expect(lastActivity(f.cardId)).toBe(NOW)
    await call(CHANNELS.itemsCreate, { checklistId: f.checklistId, text: 'Dois' })
    db.update(card).set({ lastActivityAt: BEFORE }).where(eq(card.id, f.cardId)).run()
    await call(CHANNELS.itemsMove, { itemId: f.itemId, index: 1 })
    expect(lastActivity(f.cardId)).toBe(NOW)
  })
})

describe('ENV-06: não zeram o envelhecimento', () => {
  it.each(KEEPS)('$name', async ({ channel, input }) => {
    await call(channel, input(f))
    expect(lastActivity(f.cardId)).toBe(BEFORE)
  })
})

describe('cobertura da tabela', () => {
  it('todo canal do IPC está classificado', () => {
    const classified = new Set<string>([
      ...TOUCHES.map((s) => s.channel),
      ...KEEPS.map((s) => s.channel),
      ...NOT_APPLICABLE,
      ...OWN_TEST
    ])
    const missing = Object.values(CHANNELS).filter((channel) => !classified.has(channel))
    expect(missing).toEqual([])
  })
})
