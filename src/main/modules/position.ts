// Posições de ordem manual (fractional indexing): mover um item grava só a posição dele, uma chave
// de texto entre a do vizinho de cima e a do de baixo. ORDER BY position devolve a ordem.
import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing'

export interface Positioned {
  id: string
  position: string
  hidden?: boolean
}

export function keyAfter(last: string | null): string {
  return generateKeyBetween(last, null)
}

export function keysFor(count: number): string[] {
  return generateNKeysBetween(null, null, count)
}

export function keyBetween(before: string | null, after: string | null): string {
  return generateKeyBetween(before, after)
}

// Onde o item está hoje entre os visíveis (-1 se não estiver).
export function visibleIndex(siblings: Positioned[], itemId: string): number {
  return siblings.filter((s) => !s.hidden).findIndex((s) => s.id === itemId)
}

// Chave para o item ficar na posição `index` entre os irmãos visíveis.
//
// `siblings` são todos os irmãos (inclusive os ocultos, como listas arquivadas), em ordem, SEM o
// item que está sendo movido. O item vai logo depois do visível de índice index − 1, antes de
// qualquer oculto que venha depois dele. Devolve null quando os vizinhos têm posições repetidas
// ou fora de ordem; aí quem chamou reorganiza as posições (rebalance) e tenta de novo.
export function keyAt(siblings: Positioned[], index: number): string | null {
  const visible = siblings.filter((s) => !s.hidden)
  const target = Math.max(0, Math.min(index, visible.length))
  const before = target > 0 ? visible[target - 1]! : null
  const afterIndex = before ? siblings.indexOf(before) + 1 : 0
  const after = siblings[afterIndex] ?? null
  if (before && after && before.position >= after.position) return null
  return generateKeyBetween(before?.position ?? null, after?.position ?? null)
}

// Novas posições, em ordem, para todos os irmãos (usado quando keyAt devolve null).
export function rebalance(siblings: Positioned[]): Map<string, string> {
  const keys = keysFor(siblings.length)
  return new Map(siblings.map((s, i) => [s.id, keys[i]!]))
}
