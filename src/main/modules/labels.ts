// Etiquetas (ETQ). Nesta etapa: as 6 padrão do quadro novo e a recriação no quadro de destino
// quando uma lista muda de quadro (LIS-05). O editor de etiquetas entra na etapa 4.
import { randomUUID } from 'node:crypto'
import { asc, eq, inArray } from 'drizzle-orm'
import type { Tx } from '../db/client'
import { label } from '../db/schema'
import { keyAfter, keysFor } from './position'

// ETQ-02: roxo, vermelho, laranja, amarelo, cinza e verde, sem nome.
export const DEFAULT_LABEL_COLORS = [
  '#6e5dc6',
  '#c9372c',
  '#b65c02',
  '#e2b203',
  '#8c9bab',
  '#216e4e'
]

export function createDefaultLabels(tx: Tx, boardId: string): void {
  const positions = keysFor(DEFAULT_LABEL_COLORS.length)
  DEFAULT_LABEL_COLORS.forEach((color, i) => {
    tx.insert(label)
      .values({ id: randomUUID(), boardId, name: null, color, position: positions[i]! })
      .run()
  })
}

// Para cada etiqueta de origem, a etiqueta equivalente no quadro de destino (mesma cor e mesmo
// nome). As que não existem lá são criadas no fim (LIS-05, CAR-06).
export function mapLabelsToBoard(
  tx: Tx,
  labelIds: string[],
  targetBoardId: string
): Map<string, string> {
  const map = new Map<string, string>()
  if (labelIds.length === 0) return map
  const sources = tx.select().from(label).where(inArray(label.id, labelIds)).all()
  const targets = tx
    .select()
    .from(label)
    .where(eq(label.boardId, targetBoardId))
    .orderBy(asc(label.position))
    .all()
  let last = targets.at(-1)?.position ?? null
  for (const source of sources) {
    const same = targets.find((t) => t.color === source.color && t.name === source.name)
    if (same) {
      map.set(source.id, same.id)
      continue
    }
    const created = {
      id: randomUUID(),
      boardId: targetBoardId,
      name: source.name,
      color: source.color,
      position: keyAfter(last)
    }
    tx.insert(label).values(created).run()
    targets.push(created)
    last = created.position
    map.set(source.id, created.id)
  }
  return map
}
