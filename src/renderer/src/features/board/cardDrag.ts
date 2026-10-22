// Arrastar cards (Arrasto.dc.html): o card fica translúcido no lugar de origem, uma vaga aparece
// onde ele vai cair e a lista de destino ganha a borda azul. Aqui ficam as contas, sem DOM e sem
// React: onde o card cai (pelo mouse ou pelo teclado), como a lista é desenhada durante o arraste e
// como o quadro fica depois de soltar.
import type { BoardDetail } from '../../../../shared/ipc/boards'
import type { CardSummary } from '../../../../shared/ipc/cards'
import { doneAfterMove } from '../../../../shared/rules/finished'

// index: a posição entre os cards da lista sem contar o que está sendo arrastado (a mesma do
// canal cards:move).
export interface DropTarget {
  listId: string
  index: number
}

export interface CardDrag {
  card: CardSummary
  origin: DropTarget
  target: DropTarget
  height: number
}

export function sameTarget(a: DropTarget, b: DropTarget): boolean {
  return a.listId === b.listId && a.index === b.index
}

// Posições na tela (em px), medidas no começo de cada movimento.
export interface MeasuredList {
  id: string
  left: number
  right: number
  cards: { id: string; top: number; bottom: number }[]
}

// Mouse: a lista sob o ponto (ou a mais próxima na horizontal) e, nela, quantos cards têm o meio
// acima do ponto. Como a vaga empurra para baixo os cards que vêm depois dela, a posição não fica
// oscilando quando o ponto está em cima da vaga.
export function targetFromPoint(
  lists: MeasuredList[],
  point: { x: number; y: number },
  draggedId: string
): DropTarget | null {
  let best: MeasuredList | null = null
  let bestDistance = Infinity
  for (const list of lists) {
    const distance = Math.max(list.left - point.x, point.x - list.right, 0)
    if (distance < bestDistance) {
      best = list
      bestDistance = distance
    }
  }
  if (!best) return null
  const index = best.cards.filter(
    (card) => card.id !== draggedId && (card.top + card.bottom) / 2 < point.y
  ).length
  return { listId: best.id, index }
}

export type Direction = 'up' | 'down' | 'left' | 'right'

// Teclado: setas para cima e para baixo andam uma posição na lista; para os lados, vão para a
// lista vizinha, na mesma altura (ou no fim, se ela for mais curta). `counts` são as listas do
// quadro, em ordem, com quantos cards cada uma tem sem o arrastado.
export function keyboardTarget(
  target: DropTarget,
  direction: Direction,
  counts: { id: string; count: number }[]
): DropTarget {
  const at = counts.findIndex((l) => l.id === target.listId)
  if (at === -1) return target
  if (direction === 'up') return { ...target, index: Math.max(0, target.index - 1) }
  if (direction === 'down') {
    return { ...target, index: Math.min(counts[at]!.count, target.index + 1) }
  }
  const next = counts[at + (direction === 'left' ? -1 : 1)]
  if (!next) return target
  return { listId: next.id, index: Math.min(target.index, next.count) }
}

export type ListItem = { kind: 'card'; card: CardSummary; ghost: boolean } | { kind: 'slot' }

// Como a lista aparece durante o arraste: o card arrastado continua no lugar (translúcido) e a vaga
// entra antes do card que hoje ocupa a posição de destino. Soltar no mesmo lugar não mostra vaga.
export function listItems(cards: CardSummary[], listId: string, drag: CardDrag | null): ListItem[] {
  const items: ListItem[] = cards.map((card) => ({
    kind: 'card',
    card,
    ghost: card.id === drag?.card.id
  }))
  if (!drag || drag.target.listId !== listId || sameTarget(drag.target, drag.origin)) return items
  const before = cards.filter((c) => c.id !== drag.card.id)[drag.target.index]
  const at = before
    ? items.findIndex((item) => item.kind === 'card' && item.card.id === before.id)
    : items.length
  items.splice(at, 0, { kind: 'slot' })
  return items
}

// O quadro como fica depois de soltar, para a tela mudar na hora (o main confirma em seguida). O ✓
// segue FIN-02 e FIN-03, como no main.
export function applyMove(board: BoardDetail, cardId: string, target: DropTarget): BoardDetail {
  const from = board.lists.find((l) => l.cards.some((c) => c.id === cardId))
  const to = board.lists.find((l) => l.id === target.listId)
  if (!from || !to) return board
  const card = from.cards.find((c) => c.id === cardId)!
  const moved = { ...card, listId: to.id, isDone: doneAfterMove(card.isDone, from, to) }
  return {
    ...board,
    lists: board.lists.map((list) => {
      if (list.id !== from.id && list.id !== to.id) return list
      const cards = list.cards.filter((c) => c.id !== cardId)
      if (list.id === to.id) cards.splice(target.index, 0, moved)
      return { ...list, cards, cardCount: cards.length }
    })
  }
}
