import { describe, expect, it } from 'vitest'
import type { BoardDetail, ListDetail } from '../../../../shared/ipc/boards'
import type { CardSummary } from '../../../../shared/ipc/cards'
import {
  applyMove,
  edgeStep,
  fullIndex,
  keyboardTarget,
  listItems,
  targetFromPoint,
  type CardDrag,
  type MeasuredList
} from './cardDrag'

function card(id: string, listId = 'a', isDone = false): CardSummary {
  return {
    id,
    listId,
    title: id,
    position: id,
    isDone,
    priority: null,
    dueAt: null,
    recurring: false,
    nextRepeat: null,
    cover: null,
    labels: [],
    hasDescription: false,
    hasNote: false,
    attachmentCount: 0,
    checkDone: 0,
    checkTotal: 0,
    lastActivityAt: 0,
    isTemplate: false
  }
}

function list(id: string, cards: CardSummary[], isDoneList = false): ListDetail {
  return {
    id,
    boardId: 'q',
    title: id,
    position: id,
    freezesAging: false,
    isDoneList,
    cardCount: cards.length,
    cards
  }
}

// Duas listas lado a lado (272 px + 12 de espaço), cards de 60 px com 8 de espaço.
const measured: MeasuredList[] = [
  {
    id: 'a',
    left: 16,
    right: 288,
    cards: [
      { id: 'c1', top: 100, bottom: 160 },
      { id: 'c2', top: 168, bottom: 228 },
      { id: 'c3', top: 236, bottom: 296 }
    ]
  },
  { id: 'b', left: 300, right: 572, cards: [{ id: 'd1', top: 100, bottom: 160 }] }
]

describe('arrastar card com o mouse', () => {
  it('a posição é quantos cards têm o meio acima do ponto', () => {
    expect(targetFromPoint(measured, { x: 100, y: 90 }, 'x')).toEqual({ listId: 'a', index: 0 })
    expect(targetFromPoint(measured, { x: 100, y: 140 }, 'x')).toEqual({ listId: 'a', index: 1 })
    expect(targetFromPoint(measured, { x: 100, y: 500 }, 'x')).toEqual({ listId: 'a', index: 3 })
  })

  it('o card arrastado não conta', () => {
    expect(targetFromPoint(measured, { x: 100, y: 500 }, 'c2')).toEqual({ listId: 'a', index: 2 })
  })

  it('fora das listas, vale a mais próxima na horizontal', () => {
    expect(targetFromPoint(measured, { x: 296, y: 130 }, 'x')).toEqual({ listId: 'b', index: 0 })
    expect(targetFromPoint(measured, { x: 900, y: 500 }, 'x')).toEqual({ listId: 'b', index: 1 })
    expect(targetFromPoint(measured, { x: 0, y: 0 }, 'x')).toEqual({ listId: 'a', index: 0 })
    expect(targetFromPoint([], { x: 0, y: 0 }, 'x')).toBeNull()
  })
})

describe('arrastar card com o teclado', () => {
  const counts = [
    { id: 'a', count: 3 },
    { id: 'b', count: 1 },
    { id: 'c', count: 0 }
  ]

  it('para cima e para baixo, sem passar das pontas', () => {
    expect(keyboardTarget({ listId: 'a', index: 0 }, 'up', counts)).toEqual({
      listId: 'a',
      index: 0
    })
    expect(keyboardTarget({ listId: 'a', index: 1 }, 'up', counts)).toEqual({
      listId: 'a',
      index: 0
    })
    expect(keyboardTarget({ listId: 'a', index: 2 }, 'down', counts)).toEqual({
      listId: 'a',
      index: 3
    })
    expect(keyboardTarget({ listId: 'a', index: 3 }, 'down', counts)).toEqual({
      listId: 'a',
      index: 3
    })
  })

  it('para os lados, a lista vizinha na mesma altura ou no fim', () => {
    expect(keyboardTarget({ listId: 'a', index: 2 }, 'right', counts)).toEqual({
      listId: 'b',
      index: 1
    })
    expect(keyboardTarget({ listId: 'b', index: 0 }, 'right', counts)).toEqual({
      listId: 'c',
      index: 0
    })
    expect(keyboardTarget({ listId: 'b', index: 1 }, 'left', counts)).toEqual({
      listId: 'a',
      index: 1
    })
    expect(keyboardTarget({ listId: 'a', index: 1 }, 'left', counts)).toEqual({
      listId: 'a',
      index: 1
    })
  })
})

describe('a lista durante o arraste', () => {
  const cards = [card('c1'), card('c2'), card('c3')]
  const drag = (listId: string, index: number): CardDrag => ({
    card: cards[1]!,
    origin: { listId: 'a', index: 1 },
    target: { listId, index },
    height: 60
  })
  const shape = (items: ReturnType<typeof listItems>) =>
    items.map((i) => (i.kind === 'slot' ? 'vaga' : i.ghost ? `(${i.card.id})` : i.card.id))

  it('sem arraste, só os cards', () => {
    expect(shape(listItems(cards, 'a', null))).toEqual(['c1', 'c2', 'c3'])
  })

  it('o card arrastado fica translúcido no lugar; no mesmo lugar não há vaga', () => {
    expect(shape(listItems(cards, 'a', drag('a', 1)))).toEqual(['c1', '(c2)', 'c3'])
  })

  it('a vaga entra antes do card que ocupa a posição de destino', () => {
    expect(shape(listItems(cards, 'a', drag('a', 0)))).toEqual(['vaga', 'c1', '(c2)', 'c3'])
    expect(shape(listItems(cards, 'a', drag('a', 2)))).toEqual(['c1', '(c2)', 'c3', 'vaga'])
  })

  it('em outra lista, a origem guarda o card translúcido e o destino mostra a vaga', () => {
    const other = [card('d1', 'b')]
    expect(shape(listItems(cards, 'a', drag('b', 0)))).toEqual(['c1', '(c2)', 'c3'])
    expect(shape(listItems(other, 'b', drag('b', 0)))).toEqual(['vaga', 'd1'])
    expect(shape(listItems(other, 'b', drag('b', 1)))).toEqual(['d1', 'vaga'])
  })
})

describe('o quadro depois de soltar', () => {
  const board: BoardDetail = {
    id: 'q',
    title: 'Casa',
    position: 'a0',
    isFavorite: false,
    closedAt: null,
    bgKind: 'gradient',
    bgValue: 'mello',
    bgTone: '#739ffc',
    lists: [
      list('a', [card('c1'), card('c2')]),
      list('b', [card('d1', 'b')]),
      list('ok', [card('e1', 'ok', true)], true)
    ]
  }
  const titles = (b: BoardDetail) => b.lists.map((l) => l.cards.map((c) => c.id))

  it('na mesma lista, só muda a ordem', () => {
    expect(titles(applyMove(board, 'c1', { listId: 'a', index: 1 }, 5))).toEqual([
      ['c2', 'c1'],
      ['d1'],
      ['e1']
    ])
  })

  it('para outra lista, com o contador e o ✓ (FIN-02 e FIN-03)', () => {
    const moved = applyMove(board, 'c1', { listId: 'ok', index: 1 }, 5)
    expect(titles(moved)).toEqual([['c2'], ['d1'], ['e1', 'c1']])
    expect(moved.lists.map((l) => l.cardCount)).toEqual([1, 1, 2])
    expect(moved.lists[2]!.cards[1]).toMatchObject({ listId: 'ok', isDone: true })
    const back = applyMove(moved, 'c1', { listId: 'b', index: 0 }, 5)
    expect(back.lists[1]!.cards[0]).toMatchObject({ id: 'c1', isDone: false })
  })

  it('ENV-05: o card movido fica novo na hora; os outros não mudam', () => {
    const moved = applyMove(board, 'c1', { listId: 'b', index: 0 }, 5)
    expect(moved.lists[1]!.cards.map((c) => [c.id, c.lastActivityAt])).toEqual([
      ['c1', 5],
      ['d1', 0]
    ])
  })
})

describe('arrastar com o filtro ativo', () => {
  // Lista inteira: a, b, c, d, e; o filtro mostra só b e d.
  const all = ['a', 'b', 'c', 'd', 'e'].map((id) => card(id))
  const shown = [all[1]!, all[3]!]

  it('antes de um card visível: a posição dele na lista inteira', () => {
    expect(fullIndex(all, shown, 'x', 0)).toBe(1)
    expect(fullIndex(all, shown, 'x', 1)).toBe(3)
  })

  it('depois do último visível; sem visíveis, no fim', () => {
    expect(fullIndex(all, shown, 'x', 2)).toBe(4)
    expect(fullIndex(all, [], 'x', 0)).toBe(5)
  })

  it('o card arrastado não conta', () => {
    expect(fullIndex(all, shown, 'b', 0)).toBe(2)
    expect(fullIndex(all, shown, 'b', 1)).toBe(3)
  })
})

describe('rolagem automática durante o arraste', () => {
  it('perto das bordas rola, mais rápido quanto mais perto; no meio, não', () => {
    expect(edgeStep(700, 0, 1440)).toBe(0)
    expect(edgeStep(64, 0, 1440)).toBe(0)
    expect(edgeStep(32, 0, 1440)).toBe(-8)
    expect(edgeStep(0, 0, 1440)).toBe(-16)
    expect(edgeStep(-50, 0, 1440)).toBe(-16)
    expect(edgeStep(1408, 0, 1440)).toBe(8)
    expect(edgeStep(1500, 0, 1440)).toBe(16)
  })

  it('área pequena demais não rola', () => {
    expect(edgeStep(10, 0, 100)).toBe(0)
  })
})
