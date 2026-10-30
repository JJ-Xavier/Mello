// Etiquetas (ETQ): as 6 padrão do quadro novo, o editor (listar, criar, editar e excluir) e a
// recriação no quadro de destino quando uma lista ou um card muda de quadro (LIS-05).
// Editar o nome ou a cor de uma etiqueta não é alteração dos cards: não zera o envelhecimento
// (ENV-06). Excluir também não: ela some de todos os cards de uma vez (ETQ-04).
import { randomUUID } from 'node:crypto'
import { asc, eq, inArray, max } from 'drizzle-orm'
import type { Label } from '../../shared/ipc/labels'
import { AppError } from '../../shared/result'
import type { DbOrTx, Tx } from '../db/client'
import { board, label } from '../db/schema'
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

const fields = { id: label.id, boardId: label.boardId, name: label.name, color: label.color }

// As etiquetas do quadro, na ordem do quadro.
export function list(db: DbOrTx, boardId: string): Label[] {
  if (!db.select({ id: board.id }).from(board).where(eq(board.id, boardId)).get()) {
    throw new AppError('NOT_FOUND', 'Quadro não encontrado.')
  }
  return db
    .select(fields)
    .from(label)
    .where(eq(label.boardId, boardId))
    .orderBy(asc(label.position))
    .all()
}

function requireLabel(db: DbOrTx, labelId: string): Label {
  const found = db.select(fields).from(label).where(eq(label.id, labelId)).get()
  if (!found) throw new AppError('NOT_FOUND', 'Etiqueta não encontrada.')
  return found
}

// Etiqueta nova vai para o fim do quadro.
export function create(
  db: DbOrTx,
  input: { boardId: string; name: string | null; color: string }
): Label {
  list(db, input.boardId)
  const last =
    db
      .select({ last: max(label.position) })
      .from(label)
      .where(eq(label.boardId, input.boardId))
      .get()?.last ?? null
  const id = randomUUID()
  db.insert(label)
    .values({ id, ...input, position: keyAfter(last) })
    .run()
  return requireLabel(db, id)
}

export function update(
  db: DbOrTx,
  input: { labelId: string; name?: string | null; color?: string }
): Label {
  requireLabel(db, input.labelId)
  const changes: Partial<typeof label.$inferInsert> = {}
  if (input.name !== undefined) changes.name = input.name
  if (input.color !== undefined) changes.color = input.color
  if (Object.keys(changes).length > 0) {
    db.update(label).set(changes).where(eq(label.id, input.labelId)).run()
  }
  return requireLabel(db, input.labelId)
}

// Excluir tira a etiqueta de todos os cards (card_label com ON DELETE CASCADE).
export function remove(db: DbOrTx, labelId: string): void {
  requireLabel(db, labelId)
  db.delete(label).where(eq(label.id, labelId)).run()
}
