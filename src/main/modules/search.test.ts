import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { searchInput, SEARCH_GROUP_MAX } from '../../shared/ipc/search'
import { createTestDb, insertCard } from '../db/test-db'
import { board, card, label, list } from '../db/schema'
import * as boards from './boards'
import { search } from './search'

const NOW = 1_800_000_000_000

let t: ReturnType<typeof createTestDb>
let boardId: string

beforeEach(() => {
  t = createTestDb()
  boardId = boards.create(t.db, 'Casa', NOW).id
})

function listId(title: string, id = boardId): string {
  return boards.get(t.db, id).lists.find((l) => l.title === title)!.id
}

const titles = (text: string) => search(t.db, text).cards.map((c) => c.title)

describe('busca do topo: o que procura (BUS-01, BUS-02)', () => {
  it('"acao" encontra "Ação", sem diferenciar acento nem maiúscula', () => {
    insertCard(t.db, listId('A fazer'), { title: 'Plano de AÇÃO' })
    insertCard(t.db, listId('A fazer'), { title: 'Outro', position: 'a1' })
    expect(titles('acao')).toEqual(['Plano de AÇÃO'])
    expect(titles('  AÇÃO ')).toEqual(['Plano de AÇÃO'])
  })

  it('cards pelo título, pela descrição e pela nota; o título vem primeiro', () => {
    const todo = listId('A fazer')
    const porDescricao = insertCard(t.db, todo, { title: 'Mercado', now: NOW + 2 })
    const porNota = insertCard(t.db, todo, { title: 'Farmácia', position: 'a1', now: NOW + 1 })
    insertCard(t.db, todo, { title: 'Comprar pão', position: 'a2', now: NOW })
    t.db.update(card).set({ descriptionText: 'pão e leite' }).where(eq(card.id, porDescricao)).run()
    t.db.update(card).set({ noteText: 'sem pão' }).where(eq(card.id, porNota)).run()
    expect(titles('pao')).toEqual(['Comprar pão', 'Mercado', 'Farmácia'])
  })

  it('o card traz "Quadro · Lista" e a cor da primeira etiqueta', () => {
    const [roxa, vermelha] = t.db
      .select()
      .from(label)
      .where(eq(label.boardId, boardId))
      .orderBy(label.position)
      .all()
    insertCard(t.db, listId('Em andamento'), {
      title: 'Pintar',
      labelIds: [vermelha!.id, roxa!.id]
    })
    insertCard(t.db, listId('A fazer'), { title: 'Pintar a porta', position: 'a1' })
    expect(search(t.db, 'pintar').cards).toEqual([
      expect.objectContaining({
        title: 'Pintar',
        boardId,
        boardTitle: 'Casa',
        listTitle: 'Em andamento',
        color: roxa!.color
      }),
      expect.objectContaining({ title: 'Pintar a porta', color: null })
    ])
  })

  it('tarefas pelo texto do item, com o card e a data; as por fazer vêm antes', () => {
    const cardId = insertCard(t.db, listId('A fazer'), {
      title: 'Viagem',
      checklist: {
        title: 'Malas',
        items: [
          { text: 'Separar documentação', isDone: true },
          { text: 'Documentos do carro', isDone: false }
        ]
      }
    })
    const { tasks } = search(t.db, 'docu')
    expect(tasks.map((task) => [task.text, task.cardTitle, task.isDone])).toEqual([
      ['Documentos do carro', 'Viagem', false],
      ['Separar documentação', 'Viagem', true]
    ])
    expect(tasks[0]).toMatchObject({ cardId, boardId, dueDate: null })
  })

  it('quadros pelo título', () => {
    boards.create(t.db, 'Estudos', NOW)
    boards.create(t.db, 'Casa de praia', NOW)
    expect(search(t.db, 'CASA').boards.map((b) => b.title)).toEqual(['Casa', 'Casa de praia'])
  })

  it('% e _ são procurados como texto', () => {
    insertCard(t.db, listId('A fazer'), { title: '100% feito' })
    insertCard(t.db, listId('A fazer'), { title: '1000 feito', position: 'a1' })
    expect(titles('0%')).toEqual(['100% feito'])
  })

  it('a entrada pede de 2 a 100 caracteres, sem contar os espaços das pontas', () => {
    expect(searchInput.safeParse({ text: ' a ' }).success).toBe(false)
    expect(searchInput.safeParse({ text: 'ab' }).success).toBe(true)
    expect(searchInput.safeParse({ text: 'a'.repeat(101) }).success).toBe(false)
  })
})

describe('busca do topo: grupos (BUS-03)', () => {
  it('até 8 resultados por grupo', () => {
    const todo = listId('A fazer')
    for (let i = 0; i < 10; i++) {
      insertCard(t.db, todo, {
        title: `Tarefa ${i}`,
        position: `a${i}`,
        checklist: { title: 'Itens', items: [{ text: `Tarefa item ${i}`, isDone: false }] }
      })
      boards.create(t.db, `Tarefa ${i}`, NOW)
    }
    const found = search(t.db, 'tarefa')
    expect(found.cards).toHaveLength(SEARCH_GROUP_MAX)
    expect(found.tasks).toHaveLength(SEARCH_GROUP_MAX)
    expect(found.boards).toHaveLength(SEARCH_GROUP_MAX)
  })
})

describe('busca do topo: o que fica de fora (BUS-04)', () => {
  it('arquivados, modelos e quadros fechados, com os cards e as tarefas deles', () => {
    const item = { title: 'Itens', items: [{ text: 'Sumido item', isDone: false }] }
    insertCard(t.db, listId('A fazer'), {
      title: 'Sumido arquivado',
      archivedAt: NOW,
      checklist: item
    })
    const modelo = insertCard(t.db, listId('A fazer'), {
      title: 'Sumido modelo',
      position: 'a1',
      checklist: item
    })
    t.db.update(card).set({ isTemplate: true }).where(eq(card.id, modelo)).run()
    insertCard(t.db, listId('Concluído'), { title: 'Sumido da lista', checklist: item })
    t.db
      .update(list)
      .set({ archivedAt: NOW })
      .where(eq(list.id, listId('Concluído')))
      .run()

    const fechado = boards.create(t.db, 'Sumido fechado', NOW).id
    insertCard(t.db, listId('A fazer', fechado), { title: 'Sumido no fechado', checklist: item })
    boards.close(t.db, fechado, NOW)
    const quadroModelo = boards.create(t.db, 'Sumido quadro-modelo', NOW).id
    insertCard(t.db, listId('A fazer', quadroModelo), {
      title: 'Sumido no modelo',
      checklist: item
    })
    t.db.update(board).set({ isTemplate: true }).where(eq(board.id, quadroModelo)).run()

    insertCard(t.db, listId('A fazer'), { title: 'Sumido não', position: 'a2' })
    expect(search(t.db, 'sumido')).toEqual({
      cards: [expect.objectContaining({ title: 'Sumido não' })],
      tasks: [],
      boards: []
    })
  })
})
