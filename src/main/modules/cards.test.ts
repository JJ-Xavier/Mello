import { randomUUID } from 'node:crypto'
import { asc, eq } from 'drizzle-orm'
import { beforeEach, describe, expect, it } from 'vitest'
import { createCardInput, moveCardInput } from '../../shared/ipc/cards'
import { createTestDb, insertCard } from '../db/test-db'
import {
  activity,
  attachment,
  card,
  cardLabel,
  checklist,
  checklistItem,
  file,
  label
} from '../db/schema'
import * as boards from './boards'
import * as cards from './cards'
import * as lists from './lists'

const NOW = 1_800_000_000_000
const LATER = NOW + 5 * 86_400_000

let t: ReturnType<typeof createTestDb>
let boardId: string

beforeEach(() => {
  t = createTestDb()
  boardId = boards.create(t.db, 'Casa', NOW).id
})

function listId(title: string, id = boardId): string {
  return boards.get(t.db, id).lists.find((l) => l.title === title)!.id
}

function titlesIn(title: string, id = boardId): string[] {
  return boards
    .get(t.db, id)
    .lists.find((l) => l.title === title)!
    .cards.map((c) => c.title)
}

function row(id: string) {
  return t.db.select().from(card).where(eq(card.id, id)).get()!
}

function activities(id: string) {
  return t.db
    .select()
    .from(activity)
    .where(eq(activity.cardId, id))
    .orderBy(asc(activity.createdAt))
    .all()
    .map((a) => ({ kind: a.kind, data: JSON.parse(a.data) as unknown }))
}

// Três cards em "A fazer": Compras, Faxina, Contas.
function threeCards() {
  const todo = listId('A fazer')
  return {
    todo,
    compras: insertCard(t.db, todo, { title: 'Compras', position: 'a0' }),
    faxina: insertCard(t.db, todo, { title: 'Faxina', position: 'a1' }),
    contas: insertCard(t.db, todo, { title: 'Contas', position: 'a2' })
  }
}

describe('criar card', () => {
  it('CAR-01: título de 1 a 500 caracteres, sem espaços nas pontas', () => {
    const listIdValue = randomUUID()
    expect(createCardInput.safeParse({ listId: listIdValue, title: '  ' }).success).toBe(false)
    expect(createCardInput.safeParse({ listId: listIdValue, title: 'x'.repeat(501) }).success).toBe(
      false
    )
    expect(createCardInput.parse({ listId: listIdValue, title: ' Compras ' }).title).toBe('Compras')
  })

  it('CAR-02: entra no fim da lista, com nível 0 e a atividade "criado em <lista>"', () => {
    const { todo } = threeCards()
    const created = cards.create(t.db, todo, 'Pagar a luz', LATER)
    expect(titlesIn('A fazer')).toEqual(['Compras', 'Faxina', 'Contas', 'Pagar a luz'])
    expect(created).toMatchObject({ title: 'Pagar a luz', isDone: false, labels: [] })
    expect(row(created.id).lastActivityAt).toBe(LATER)
    expect(activities(created.id)).toEqual([{ kind: 'created', data: { list: 'A fazer' } }])
  })

  it('criado direto numa lista de conclusão nasce sem ✓ (FIN-02, etapa 3)', () => {
    const created = cards.create(t.db, listId('Concluído'), 'Revisão', NOW)
    expect(created.isDone).toBe(false)
  })

  it('não cria card em lista arquivada nem em quadro fechado', () => {
    const ideas = lists.create(t.db, boardId, 'Ideias', NOW).id
    lists.archive(t.db, ideas, NOW)
    expect(() => cards.create(t.db, ideas, 'Card', NOW)).toThrow(/arquivada/)
    const todo = listId('A fazer')
    boards.close(t.db, boardId, NOW)
    expect(() => cards.create(t.db, todo, 'Card', NOW)).toThrow(/fechado/)
  })
})

describe('mover card', () => {
  it('o índice é inteiro e não negativo', () => {
    const base = { cardId: randomUUID(), listId: randomUUID() }
    expect(moveCardInput.safeParse({ ...base, index: -1 }).success).toBe(false)
    expect(moveCardInput.safeParse({ ...base, index: 1.5 }).success).toBe(false)
  })

  it('reordena na mesma lista e zera o envelhecimento (ENV-05), sem registrar atividade', () => {
    const { todo, compras } = threeCards()
    cards.move(t.db, compras, todo, 2, LATER)
    expect(titlesIn('A fazer')).toEqual(['Faxina', 'Contas', 'Compras'])
    expect(row(compras).lastActivityAt).toBe(LATER)
    expect(activities(compras)).toEqual([])
  })

  it('CAR-03: soltar no mesmo lugar não grava nada', () => {
    const { todo, faxina } = threeCards()
    const before = row(faxina)
    cards.move(t.db, faxina, todo, 1, LATER)
    expect(row(faxina)).toEqual(before)
    expect(activities(faxina)).toEqual([])
  })

  it('para outra lista: muda a lista e a posição, zera o envelhecimento e registra', () => {
    const { contas } = threeCards()
    const doing = listId('Em andamento')
    const other = insertCard(t.db, doing, { title: 'Mudança', position: 'a0' })
    cards.move(t.db, contas, doing, 0, LATER)
    expect(titlesIn('A fazer')).toEqual(['Compras', 'Faxina'])
    expect(titlesIn('Em andamento')).toEqual(['Contas', 'Mudança'])
    expect(row(contas).lastActivityAt).toBe(LATER)
    expect(row(other).lastActivityAt).toBe(1000)
    expect(activities(contas)).toEqual([
      { kind: 'moved', data: { from: 'A fazer', to: 'Em andamento' } }
    ])
  })

  it('FIN-02: entrar numa lista de conclusão marca o ✓ e registra', () => {
    const { compras } = threeCards()
    cards.move(t.db, compras, listId('Concluído'), 0, LATER)
    expect(row(compras)).toMatchObject({ isDone: true, doneAt: LATER })
    expect(activities(compras).map((a) => a.kind)).toEqual(['moved', 'done'])
  })

  it('FIN-03: sair para uma lista comum desmarca; entre listas de conclusão fica como está', () => {
    const { compras } = threeCards()
    cards.move(t.db, compras, listId('Concluído'), 0, NOW)
    cards.move(t.db, compras, listId('Entregue'), 0, LATER)
    expect(row(compras)).toMatchObject({ isDone: true, doneAt: NOW })
    cards.move(t.db, compras, listId('A fazer'), 0, LATER)
    expect(row(compras)).toMatchObject({ isDone: false, doneAt: null })
    expect(activities(compras).map((a) => a.kind)).toEqual([
      'moved',
      'done',
      'moved',
      'moved',
      'undone'
    ])
  })

  it('FIN-04: o ✓ marcado à mão continua entre listas comuns', () => {
    const todo = listId('A fazer')
    const checked = insertCard(t.db, todo, { title: 'Contas', isDone: true })
    cards.move(t.db, checked, listId('Em andamento'), 0, LATER)
    expect(row(checked).isDone).toBe(true)
  })

  it('FIN-05: dentro da lista de conclusão, reordenar não mexe no ✓', () => {
    const done = listId('Concluído')
    const a = insertCard(t.db, done, { title: 'A', position: 'a0', isDone: false })
    insertCard(t.db, done, { title: 'B', position: 'a1', isDone: true })
    cards.move(t.db, a, done, 1, LATER)
    expect(titlesIn('Concluído')).toEqual(['B', 'A'])
    expect(row(a).isDone).toBe(false)
  })

  it('o índice conta só os cards visíveis (os arquivados ficam onde estão)', () => {
    const { todo, compras } = threeCards()
    insertCard(t.db, todo, { title: 'Arquivado', position: 'a1V', archivedAt: NOW })
    cards.move(t.db, compras, todo, 1, LATER)
    expect(titlesIn('A fazer')).toEqual(['Faxina', 'Compras', 'Contas'])
  })

  it('reorganiza as posições quando há repetidas', () => {
    const todo = listId('A fazer')
    const a = insertCard(t.db, todo, { title: 'A', position: 'a0' })
    insertCard(t.db, todo, { title: 'B', position: 'a1' })
    insertCard(t.db, todo, { title: 'C', position: 'a1' })
    cards.move(t.db, a, todo, 1, LATER)
    expect(titlesIn('A fazer')).toHaveLength(3)
    expect(titlesIn('A fazer')[1]).toBe('A')
  })

  it('CAR-06: para outro quadro, com as etiquetas recriadas lá (LIS-05)', () => {
    const named = t.db.select().from(label).where(eq(label.boardId, boardId)).all()[0]!
    t.db.update(label).set({ name: 'Urgente' }).where(eq(label.id, named.id)).run()
    const moving = insertCard(t.db, listId('A fazer'), { title: 'Compras', labelIds: [named.id] })
    const other = boards.create(t.db, 'Estudos', NOW).id
    cards.move(t.db, moving, listId('A fazer', other), 0, LATER)

    expect(titlesIn('A fazer', other)).toEqual(['Compras'])
    const [link] = t.db.select().from(cardLabel).where(eq(cardLabel.cardId, moving)).all()
    const target = t.db.select().from(label).where(eq(label.id, link!.labelId)).get()!
    expect(target).toMatchObject({ boardId: other, name: 'Urgente', color: named.color })
    expect(activities(moving)).toEqual([
      {
        kind: 'moved',
        data: { from: 'A fazer', to: 'A fazer', fromBoard: 'Casa', toBoard: 'Estudos' }
      }
    ])
  })

  it('não move card arquivado, nem para lista arquivada ou quadro fechado', () => {
    const todo = listId('A fazer')
    const archived = insertCard(t.db, todo, { title: 'Velho', archivedAt: NOW })
    expect(() => cards.move(t.db, archived, listId('Em andamento'), 0, LATER)).toThrow(/arquivado/)
    const moving = insertCard(t.db, todo, { title: 'Compras' })
    const ideas = lists.create(t.db, boardId, 'Ideias', NOW).id
    lists.archive(t.db, ideas, NOW)
    expect(() => cards.move(t.db, moving, ideas, 0, LATER)).toThrow(/arquivada/)
    const other = boards.create(t.db, 'Estudos', NOW).id
    const otherList = listId('A fazer', other)
    boards.close(t.db, other, NOW)
    expect(() => cards.move(t.db, moving, otherList, 0, LATER)).toThrow(/fechado/)
    expect(() => cards.move(t.db, randomUUID(), todo, 0, LATER)).toThrow(/não encontrado/)
  })
})

describe('face do card (CAR-04)', () => {
  it('o quadro traz os cards de cada lista em ordem, sem os arquivados', () => {
    const { todo } = threeCards()
    insertCard(t.db, todo, { title: 'Arquivado', position: 'a3', archivedAt: NOW })
    const detail = boards.get(t.db, boardId)
    expect(detail.lists.map((l) => [l.title, l.cards.length, l.cardCount])).toEqual([
      ['A fazer', 3, 3],
      ['Em andamento', 0, 0],
      ['Concluído', 0, 0],
      ['Entregue', 0, 0]
    ])
  })

  it('etiquetas na ordem do quadro, checklist x/y somado, anexos, descrição, nota e data', () => {
    const labels = t.db
      .select()
      .from(label)
      .where(eq(label.boardId, boardId))
      .orderBy(asc(label.position))
      .all()
    const todo = listId('A fazer')
    const id = insertCard(t.db, todo, {
      title: 'Compras',
      labelIds: [labels[3]!.id, labels[0]!.id],
      checklist: {
        title: 'Itens',
        items: [
          { text: 'Pão', isDone: true },
          { text: 'Leite', isDone: false }
        ]
      }
    })
    const second = randomUUID()
    t.db.insert(checklist).values({ id: second, cardId: id, title: 'Mais', position: 'a1' }).run()
    t.db
      .insert(checklistItem)
      .values({
        id: randomUUID(),
        checklistId: second,
        text: 'Café',
        isDone: true,
        position: 'a0',
        createdAt: NOW,
        updatedAt: NOW
      })
      .run()
    t.db
      .insert(file)
      .values({ id: 'f'.repeat(64), ext: 'pdf', mime: 'application/pdf', size: 1, createdAt: NOW })
      .run()
    for (const name of ['a.pdf', 'b.pdf']) {
      t.db
        .insert(attachment)
        .values({ id: randomUUID(), cardId: id, fileId: 'f'.repeat(64), name, createdAt: NOW })
        .run()
    }
    t.db
      .update(card)
      .set({ descriptionText: 'Lista do mercado', noteText: ' ', dueAt: '2026-10-20' })
      .where(eq(card.id, id))
      .run()

    const face = boards.get(t.db, boardId).lists[0]!.cards[0]!
    expect(face).toMatchObject({
      title: 'Compras',
      dueAt: '2026-10-20',
      hasDescription: true,
      hasNote: false,
      attachmentCount: 2,
      checkDone: 2,
      checkTotal: 3
    })
    expect(face.labels.map((l) => l.color)).toEqual([labels[0]!.color, labels[3]!.color])
  })

  it('abrir o card traz o título, a lista, o quadro e os campos do modal', () => {
    const { compras } = threeCards()
    expect(cards.get(t.db, compras)).toEqual({
      id: compras,
      boardId,
      listId: listId('A fazer'),
      listTitle: 'A fazer',
      isDoneList: false,
      title: 'Compras',
      isDone: false,
      priority: null,
      dueAt: null,
      reminder: 'none',
      labelIds: [],
      descriptionHtml: '',
      noteHtml: '',
      cover: null,
      lastActivityAt: 1000,
      archivedAt: null,
      checklists: [],
      attachments: [],
      activity: []
    })
    expect(() => cards.get(t.db, randomUUID())).toThrow(/não encontrado/)
  })

  it('ATV-01: a atividade vem do registro mais recente para o mais antigo', () => {
    const created = cards.create(t.db, listId('A fazer'), 'Compras', NOW)
    cards.move(t.db, created.id, listId('Concluído'), 0, LATER)
    expect(cards.get(t.db, created.id).activity).toEqual([
      { id: expect.any(String), kind: 'done', data: {}, createdAt: LATER },
      {
        id: expect.any(String),
        kind: 'moved',
        data: { from: 'A fazer', to: 'Concluído' },
        createdAt: LATER
      },
      { id: expect.any(String), kind: 'created', data: { list: 'A fazer' }, createdAt: NOW }
    ])
  })
})

describe('editar o card pelo modal', () => {
  it('título: grava e zera o envelhecimento; o mesmo título não grava nada', () => {
    const { compras } = threeCards()
    cards.update(t.db, { cardId: compras, title: 'Compras do mês' }, LATER)
    expect(row(compras)).toMatchObject({ title: 'Compras do mês', lastActivityAt: LATER })
    const before = row(compras)
    cards.update(t.db, { cardId: compras, title: 'Compras do mês' }, LATER + 1)
    expect(row(compras)).toEqual(before)
  })

  it('FIN-04: o ✓ marcado à mão fora da lista de conclusão fica, mas não finaliza', () => {
    const { compras } = threeCards()
    cards.update(t.db, { cardId: compras, isDone: true }, LATER)
    expect(row(compras)).toMatchObject({ isDone: true, doneAt: LATER, lastActivityAt: LATER })
    expect(cards.get(t.db, compras).isDoneList).toBe(false)
    expect(activities(compras)).toEqual([{ kind: 'done', data: {} }])
  })

  it('FIN-05: desmarcar o ✓ na lista de conclusão mantém o card lá', () => {
    const done = insertCard(t.db, listId('Concluído'), { title: 'Faxina', isDone: true })
    cards.update(t.db, { cardId: done, isDone: false }, LATER)
    expect(row(done)).toMatchObject({ isDone: false, doneAt: null, listId: listId('Concluído') })
    expect(activities(done)).toEqual([{ kind: 'undone', data: {} }])
  })

  it('PRI-01: prioridade de 1 a 5 ou nenhuma', () => {
    const { compras } = threeCards()
    cards.update(t.db, { cardId: compras, priority: 2 }, LATER)
    expect(row(compras)).toMatchObject({ priority: 2, lastActivityAt: LATER })
    cards.update(t.db, { cardId: compras, priority: null }, LATER)
    expect(row(compras).priority).toBeNull()
  })

  it('DAT-01 e LEM-01: data com e sem hora; sem data não há lembrete', () => {
    const { compras } = threeCards()
    cards.update(t.db, { cardId: compras, due: { dueAt: '2026-10-20', reminder: 'none' } }, LATER)
    expect(row(compras)).toMatchObject({ dueAt: '2026-10-20', lastActivityAt: LATER })
    cards.update(
      t.db,
      { cardId: compras, due: { dueAt: '2026-10-20T17:00', reminder: 'day_before' } },
      LATER
    )
    expect(row(compras)).toMatchObject({ dueAt: '2026-10-20T17:00', reminder: 'day_before' })
    cards.update(t.db, { cardId: compras, due: { dueAt: null, reminder: 'at_time' } }, LATER)
    expect(row(compras)).toMatchObject({ dueAt: null, reminder: 'none' })
  })

  it('LEM-04: mudar a data rearma o lembrete', () => {
    const { compras } = threeCards()
    t.db
      .update(card)
      .set({ dueAt: '2026-10-20', reminder: 'at_time', reminderFiredAt: NOW })
      .where(eq(card.id, compras))
      .run()
    cards.update(
      t.db,
      { cardId: compras, due: { dueAt: '2026-10-21', reminder: 'at_time' } },
      LATER
    )
    expect(row(compras).reminderFiredAt).toBeNull()
  })

  it('NOT-07: a descrição é limpa, vira HTML e texto; HTML proibido é descartado', () => {
    const { compras } = threeCards()
    const description = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Mercado' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: '<script>alert(1)</script>', marks: [{ type: 'bold' }] },
            {
              type: 'text',
              text: 'link',
              marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }]
            }
          ]
        },
        { type: 'codeBlock', content: [{ type: 'text', text: 'fora' }] }
      ]
    }
    cards.update(t.db, { cardId: compras, description }, LATER)
    expect(row(compras)).toMatchObject({
      descriptionHtml:
        '<h3>Mercado</h3><p><strong>&lt;script&gt;alert(1)&lt;/script&gt;</strong>link</p>',
      descriptionText: 'Mercado\n<script>alert(1)</script>link',
      lastActivityAt: LATER
    })
    expect(boards.get(t.db, boardId).lists[0]!.cards[0]!.hasDescription).toBe(true)
    cards.update(t.db, { cardId: compras, description: { type: 'doc', content: [] } }, LATER)
    expect(row(compras)).toMatchObject({ descriptionHtml: '', descriptionText: '' })
  })

  const paragraph = (text: string) => ({
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }]
  })

  it('NOT-03 e NOT-04: a nota é limpa e salva; a mesma nota não grava; nada na atividade', () => {
    const { compras } = threeCards()
    const note = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text: 'Pendências' }] },
        {
          type: 'taskList',
          content: [
            {
              type: 'taskItem',
              attrs: { checked: true },
              content: [
                {
                  type: 'paragraph',
                  content: [
                    {
                      type: 'text',
                      text: 'logo',
                      marks: [{ type: 'link', attrs: { href: 'javascript:alert(1)' } }]
                    }
                  ]
                }
              ]
            }
          ]
        },
        { type: 'image', attrs: { src: 'x', onerror: 'alert(1)' } }
      ]
    }
    cards.update(t.db, { cardId: compras, note }, LATER)
    expect(row(compras)).toMatchObject({
      noteHtml:
        '<h3>Pendências</h3><ul data-type="taskList"><li data-type="taskItem" data-checked="true"><p>logo</p></li></ul>',
      noteText: 'Pendências\nlogo',
      lastActivityAt: LATER
    })
    expect(cards.get(t.db, compras).noteHtml).toContain('Pendências')
    expect(boards.get(t.db, boardId).lists[0]!.cards[0]!.hasNote).toBe(true)
    const before = row(compras)
    cards.update(t.db, { cardId: compras, note }, LATER + 1)
    expect(row(compras)).toEqual(before)
    expect(activities(compras)).toEqual([])
    cards.update(t.db, { cardId: compras, note: paragraph('  ') }, LATER + 2)
    expect(row(compras)).toMatchObject({ noteHtml: '', noteText: '' })
  })

  it('NOT-01 e NOT-07: nota e descrição até 20 000 caracteres, contados como o editor conta', () => {
    const { compras } = threeCards()
    const twoBlocks = (size: number) => ({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'a'.repeat(size - 1) }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'b' }] }
      ]
    })
    cards.update(t.db, { cardId: compras, note: twoBlocks(20_000) }, LATER)
    expect(row(compras).noteText).toHaveLength(20_001)
    expect(() => cards.update(t.db, { cardId: compras, note: twoBlocks(20_001) }, LATER)).toThrow(
      /nota passou do tamanho máximo/
    )
    expect(() =>
      cards.update(t.db, { cardId: compras, description: twoBlocks(20_001) }, LATER)
    ).toThrow(/descrição passou do tamanho máximo/)
  })
})

describe('etiquetas no card (ETQ-04)', () => {
  const boardLabelIds = (id = boardId) =>
    t.db
      .select()
      .from(label)
      .where(eq(label.boardId, id))
      .orderBy(asc(label.position))
      .all()
      .map((l) => l.id)

  it('marcar e desmarcar zera o envelhecimento; o mesmo conjunto não grava', () => {
    const { compras } = threeCards()
    const [roxo, vermelho] = boardLabelIds()
    cards.setLabels(t.db, compras, [vermelho!, roxo!], LATER)
    expect(cards.get(t.db, compras).labelIds).toEqual([roxo, vermelho])
    expect(row(compras).lastActivityAt).toBe(LATER)
    cards.setLabels(t.db, compras, [vermelho!], LATER + 1)
    expect(cards.get(t.db, compras).labelIds).toEqual([vermelho])
    const before = row(compras)
    cards.setLabels(t.db, compras, [vermelho!], LATER + 2)
    expect(row(compras)).toEqual(before)
  })

  it('não aceita etiqueta de outro quadro', () => {
    const { compras } = threeCards()
    const other = boards.create(t.db, 'Estudos', NOW).id
    expect(() => cards.setLabels(t.db, compras, [boardLabelIds(other)[0]!], LATER)).toThrow(
      /outro quadro/
    )
  })
})

describe('copiar, arquivar e filtrar', () => {
  it('CAR-07: cópia com outro título, na lista e posição escolhidas, com checklist', () => {
    const todo = listId('A fazer')
    insertCard(t.db, listId('Em andamento'), { title: 'Mudança', position: 'a0' })
    const source = insertCard(t.db, todo, {
      title: 'Compras',
      checklist: { title: 'Itens', items: [{ text: 'Pão', isDone: true }] }
    })
    const copied = cards.copy(
      t.db,
      { cardId: source, title: 'Compras (cópia)', listId: listId('Em andamento'), index: 0 },
      LATER
    )
    expect(titlesIn('Em andamento')).toEqual(['Compras (cópia)', 'Mudança'])
    expect(copied).toMatchObject({ checkDone: 1, checkTotal: 1 })
    expect(row(copied.id).lastActivityAt).toBe(LATER)
    expect(activities(copied.id)).toEqual([{ kind: 'copied', data: { from: 'Compras' } }])
  })

  it('CAR-07: cópia em outro quadro recria as etiquetas lá', () => {
    const roxo = t.db.select().from(label).where(eq(label.boardId, boardId)).all()[0]!
    const source = insertCard(t.db, listId('A fazer'), { title: 'Compras', labelIds: [roxo.id] })
    const other = boards.create(t.db, 'Estudos', NOW).id
    const copied = cards.copy(
      t.db,
      { cardId: source, title: 'Compras', listId: listId('A fazer', other), index: 0 },
      LATER
    )
    expect(copied.labels[0]!.id).not.toBe(roxo.id)
    expect(copied.labels[0]!.color).toBe(roxo.color)
  })

  it('CAR-07: a cópia leva a nota, a capa e os anexos, sem copiar arquivos', () => {
    const source = insertCard(t.db, listId('A fazer'), { title: 'Viagem' })
    const fileId = 'a'.repeat(64)
    t.db
      .insert(file)
      .values({
        id: fileId,
        ext: 'png',
        mime: 'image/png',
        size: 10,
        width: 4,
        height: 3,
        createdAt: NOW
      })
      .run()
    t.db
      .insert(attachment)
      .values({ id: randomUUID(), cardId: source, fileId, name: 'praia.png', createdAt: NOW })
      .run()
    t.db
      .update(card)
      .set({ noteHtml: '<p>levar protetor</p>', coverKind: 'image', coverValue: fileId })
      .where(eq(card.id, source))
      .run()
    const copied = cards.copy(
      t.db,
      { cardId: source, title: 'Viagem (cópia)', listId: listId('A fazer'), index: 1 },
      LATER
    )
    expect(copied.cover).toEqual({
      kind: 'image',
      fileId,
      url: `mello-arquivo://arquivos/${fileId}.png`,
      width: 4,
      height: 3
    })
    const detail = cards.get(t.db, copied.id)
    expect(detail.noteHtml).toBe('<p>levar protetor</p>')
    expect(detail.attachments.map((a) => [a.name, a.fileId])).toEqual([['praia.png', fileId]])
    expect(t.db.select().from(file).all()).toHaveLength(1)
  })

  it('CAR-05: arquivar tira do quadro, registra e não zera; restaurar zera', () => {
    const { compras } = threeCards()
    cards.archive(t.db, compras, LATER)
    expect(titlesIn('A fazer')).toEqual(['Faxina', 'Contas'])
    expect(row(compras)).toMatchObject({ archivedAt: LATER, lastActivityAt: 1000 })
    expect(cards.get(t.db, compras).archivedAt).toBe(LATER)
    expect(activities(compras)).toEqual([{ kind: 'archived', data: {} }])
    cards.restore(t.db, compras, LATER + 1)
    expect(row(compras)).toMatchObject({ archivedAt: null, lastActivityAt: LATER + 1 })
  })

  it('FLT-01: palavra-chave no título, na descrição, na nota e na etiqueta, sem acento', () => {
    const { compras, faxina, contas } = threeCards()
    const roxo = t.db.select().from(label).where(eq(label.boardId, boardId)).all()[0]!
    t.db.update(label).set({ name: 'Ação' }).where(eq(label.id, roxo.id)).run()
    cards.setLabels(t.db, contas, [roxo.id], NOW)
    t.db.update(card).set({ descriptionText: 'Pão e LEITE' }).where(eq(card.id, compras)).run()
    t.db.update(card).set({ noteText: 'Usar vinagre' }).where(eq(card.id, faxina)).run()
    const find = (keyword: string) => cards.matching(t.db, boardId, keyword).sort()
    expect(find('leite')).toEqual([compras])
    expect(find('VINAGRE')).toEqual([faxina])
    expect(find('acao')).toEqual([contas])
    expect(find('Faxína')).toEqual([faxina])
    expect(find('%')).toEqual([])
    cards.archive(t.db, faxina, NOW)
    expect(find('vinagre')).toEqual([])
  })
})
