import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { createBoardInput, updateBoardInput } from '../../shared/ipc/boards'
import { toneForBackground } from '../../shared/rules/tone'
import { createTestDb, insertCard } from '../db/test-db'
import {
  activity,
  attachment,
  board,
  card,
  checklist,
  file,
  label,
  list,
  recurrence
} from '../db/schema'
import * as boards from './boards'
import { DEFAULT_LABEL_COLORS } from './labels'

const NOW = 1_800_000_000_000

let t: ReturnType<typeof createTestDb>

beforeEach(() => {
  t = createTestDb()
})

function titles(): string[] {
  return boards.listOpen(t.db).map((b) => b.title)
}

describe('quadros', () => {
  it('QUA-01: título de 1 a 80 caracteres, sem espaços nas pontas', () => {
    expect(createBoardInput.parse({ title: '  Casa  ' }).title).toBe('Casa')
    expect(createBoardInput.safeParse({ title: '   ' }).success).toBe(false)
    expect(createBoardInput.safeParse({ title: 'x'.repeat(80) }).success).toBe(true)
    expect(createBoardInput.safeParse({ title: 'x'.repeat(81) }).success).toBe(false)
    expect(updateBoardInput.safeParse({ boardId: randomUUID(), title: '' }).success).toBe(false)
  })

  it('QUA-02: quadro novo nasce com as 4 listas; Concluído e Entregue são de conclusão e não envelhecem', () => {
    const created = boards.create(t.db, 'Casa', NOW)
    const lists = boards.get(t.db, created.id).lists
    expect(lists.map((l) => [l.title, l.isDoneList, l.freezesAging])).toEqual([
      ['A fazer', false, false],
      ['Em andamento', false, false],
      ['Concluído', true, true],
      ['Entregue', true, true]
    ])
    expect(lists.every((l) => l.cardCount === 0)).toBe(true)
  })

  it('QUA-03: fundo Mello, tom derivado do fundo e as 6 etiquetas padrão sem nome', () => {
    const created = boards.create(t.db, 'Casa', NOW)
    const detail = boards.get(t.db, created.id)
    expect([detail.bgKind, detail.bgValue]).toEqual(['gradient', 'mello'])
    expect(detail.bgTone).toBe(toneForBackground('gradient', 'mello'))
    const labels = t.db
      .select()
      .from(label)
      .where(eq(label.boardId, created.id))
      .orderBy(label.position)
      .all()
    expect(labels.map((l) => l.color)).toEqual(DEFAULT_LABEL_COLORS)
    expect(labels.every((l) => l.name === null)).toBe(true)
  })

  it('quadros novos vão para o fim', () => {
    boards.create(t.db, 'Um', NOW)
    boards.create(t.db, 'Dois', NOW)
    boards.create(t.db, 'Três', NOW)
    expect(titles()).toEqual(['Um', 'Dois', 'Três'])
  })

  it('renomear e favoritar', () => {
    const created = boards.create(t.db, 'Casa', NOW)
    const updated = boards.update(
      t.db,
      { boardId: created.id, title: 'Minha casa', isFavorite: true },
      NOW
    )
    expect([updated.title, updated.isFavorite]).toEqual(['Minha casa', true])
  })

  it('QUA-04: fechar tira do Início e põe nos fechados; reabrir devolve', () => {
    const a = boards.create(t.db, 'Um', NOW)
    boards.create(t.db, 'Dois', NOW)
    boards.close(t.db, a.id, NOW + 5)
    expect(titles()).toEqual(['Dois'])
    expect(boards.listClosed(t.db).map((b) => [b.title, b.closedAt])).toEqual([['Um', NOW + 5]])
    boards.reopen(t.db, a.id, NOW + 9)
    expect(titles()).toEqual(['Um', 'Dois'])
    expect(boards.listClosed(t.db)).toEqual([])
  })

  it('QUA-06: favoritos primeiro; dentro de cada grupo vale a ordem manual', () => {
    const [a, b, c, d] = ['A', 'B', 'C', 'D'].map((title) => boards.create(t.db, title, NOW))
    boards.update(t.db, { boardId: c!.id, isFavorite: true }, NOW)
    boards.update(t.db, { boardId: a!.id, isFavorite: true }, NOW)
    expect(titles()).toEqual(['A', 'C', 'B', 'D'])

    boards.move(t.db, c!.id, 0, NOW) // C antes de A, entre os favoritos
    expect(titles()).toEqual(['C', 'A', 'B', 'D'])
    boards.move(t.db, b!.id, 1, NOW) // B depois de D, entre os não favoritos
    expect(titles()).toEqual(['C', 'A', 'D', 'B'])
    boards.move(t.db, d!.id, 0, NOW)
    expect(titles()).toEqual(['C', 'A', 'D', 'B'])
  })

  it('mover para o lugar onde já está não grava nada', () => {
    const [a] = ['A', 'B'].map((title) => boards.create(t.db, title, NOW))
    const before = t.db.select().from(board).where(eq(board.id, a!.id)).get()!
    boards.move(t.db, a!.id, 0, NOW + 1000)
    const after = t.db.select().from(board).where(eq(board.id, a!.id)).get()!
    expect(after).toEqual(before)
  })

  it('QUA-07: excluir só um quadro fechado', () => {
    const a = boards.create(t.db, 'Um', NOW)
    expect(() => boards.remove(t.db, a.id)).toThrow(/Feche o quadro/)
  })

  it('QUA-07: excluir apaga listas, cards, etiquetas, checklists, atividade, anexos e repetições', () => {
    const keep = boards.create(t.db, 'Fica', NOW)
    const gone = boards.create(t.db, 'Sai', NOW)
    const listId = boards.get(t.db, gone.id).lists[0]!.id
    const labelId = t.db.select().from(label).where(eq(label.boardId, gone.id)).get()!.id
    const cardId = insertCard(t.db, listId, {
      labelIds: [labelId],
      checklist: { title: 'Passos', items: [{ text: 'um', isDone: false }] }
    })
    t.db
      .insert(activity)
      .values({ id: randomUUID(), cardId, kind: 'created', data: '{}', createdAt: NOW })
      .run()
    t.db
      .insert(file)
      .values({ id: 'f'.repeat(64), ext: 'png', mime: 'image/png', size: 1, createdAt: NOW })
      .run()
    t.db
      .insert(attachment)
      .values({
        id: randomUUID(),
        cardId,
        fileId: 'f'.repeat(64),
        name: 'foto.png',
        createdAt: NOW
      })
      .run()
    t.db
      .insert(recurrence)
      .values({
        id: randomUUID(),
        boardId: gone.id,
        freq: 'daily',
        anchorDate: '2026-10-21',
        time: '08:00',
        targetListId: listId,
        copyLabelsPriority: true,
        copyDescription: true,
        copyChecklist: true,
        copyDueDate: false,
        createdAt: NOW,
        updatedAt: NOW
      })
      .run()

    boards.close(t.db, gone.id, NOW)
    boards.remove(t.db, gone.id)

    expect(
      t.db
        .select()
        .from(board)
        .all()
        .map((b) => b.id)
    ).toEqual([keep.id])
    expect(
      t.db
        .select()
        .from(list)
        .all()
        .every((l) => l.boardId === keep.id)
    ).toBe(true)
    expect(
      t.db
        .select()
        .from(label)
        .all()
        .every((l) => l.boardId === keep.id)
    ).toBe(true)
    for (const table of [card, checklist, activity, attachment, recurrence]) {
      expect(t.db.select().from(table).all()).toEqual([])
    }
    // O arquivo físico só sai na limpeza de órfãos (DAD-08).
    expect(t.db.select().from(file).all()).toHaveLength(1)
  })

  it('itens arquivados: cards e listas do quadro, do mais recente para o mais antigo', () => {
    const created = boards.create(t.db, 'Casa', NOW)
    const [aFazer, emAndamento] = boards.get(t.db, created.id).lists
    insertCard(t.db, aFazer!.id, { title: 'Velho', archivedAt: NOW + 1 })
    insertCard(t.db, aFazer!.id, { title: 'Novo', archivedAt: NOW + 2 })
    insertCard(t.db, aFazer!.id, { title: 'Ativo' })
    t.db
      .update(list)
      .set({ archivedAt: NOW + 3 })
      .where(eq(list.id, emAndamento!.id))
      .run()

    const items = boards.archived(t.db, created.id)
    expect(items.cards.map((c) => [c.title, c.listTitle])).toEqual([
      ['Novo', 'A fazer'],
      ['Velho', 'A fazer']
    ])
    expect(items.lists.map((l) => l.title)).toEqual(['Em andamento'])
  })

  it('quadro inexistente dá NOT_FOUND', () => {
    expect(() => boards.get(t.db, randomUUID())).toThrow(/não encontrado/)
  })
})
