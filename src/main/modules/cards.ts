// Cards. Nesta etapa só o que as listas e os itens arquivados precisam: copiar (com a lista),
// arquivar todos os de uma lista, restaurar e excluir. Criar, mover e editar entram nas etapas 3 e 4.
import { randomUUID } from 'node:crypto'
import { and, asc, eq, inArray, isNull } from 'drizzle-orm'
import { AppError } from '../../shared/result'
import type { DbOrTx, Tx } from '../db/client'
import { activity, attachment, card, cardLabel, checklist, checklistItem } from '../db/schema'

type ActivityKind = (typeof activity.$inferInsert)['kind']

export function addActivity(
  tx: DbOrTx,
  cardId: string,
  kind: ActivityKind,
  data: Record<string, unknown>,
  now: number
): void {
  tx.insert(activity)
    .values({ id: randomUUID(), cardId, kind, data: JSON.stringify(data), createdAt: now })
    .run()
}

// Zera o envelhecimento (ENV-05): a última alteração do card passa a ser agora.
export function touch(tx: DbOrTx, cardId: string, now: number): void {
  tx.update(card).set({ lastActivityAt: now, updatedAt: now }).where(eq(card.id, cardId)).run()
}

// Copia um card (CAR-07): título, descrição, nota, ✓, etiquetas, prioridade, data, lembrete, capa,
// checklists com o estado dos itens e anexos. Não copia a atividade nem a repetição. A cópia
// nasce com nível 0 e com a atividade "Copiado de <título>" (ENV-07, ATV-02).
// labelMap troca as etiquetas quando a cópia vai para outro quadro (LIS-05).
export function copyCard(
  tx: Tx,
  sourceId: string,
  target: { listId: string; position: string; labelMap?: Map<string, string> },
  now: number
): string {
  const source = tx.select().from(card).where(eq(card.id, sourceId)).get()
  if (!source) throw new AppError('NOT_FOUND', 'Card não encontrado.')
  const id = randomUUID()
  tx.insert(card)
    .values({
      ...source,
      id,
      listId: target.listId,
      position: target.position,
      reminderFiredAt: null,
      recurrenceId: null,
      occurrenceDate: null,
      lastActivityAt: now,
      archivedAt: null,
      createdAt: now,
      updatedAt: now
    })
    .run()

  const labels = tx.select().from(cardLabel).where(eq(cardLabel.cardId, sourceId)).all()
  for (const row of labels) {
    const labelId = target.labelMap?.get(row.labelId) ?? row.labelId
    tx.insert(cardLabel).values({ cardId: id, labelId }).onConflictDoNothing().run()
  }

  const lists = tx
    .select()
    .from(checklist)
    .where(eq(checklist.cardId, sourceId))
    .orderBy(asc(checklist.position))
    .all()
  for (const list of lists) {
    const checklistId = randomUUID()
    tx.insert(checklist)
      .values({ ...list, id: checklistId, cardId: id })
      .run()
    const items = tx
      .select()
      .from(checklistItem)
      .where(eq(checklistItem.checklistId, list.id))
      .all()
    for (const item of items) {
      tx.insert(checklistItem)
        .values({ ...item, id: randomUUID(), checklistId, createdAt: now, updatedAt: now })
        .run()
    }
  }

  const files = tx.select().from(attachment).where(eq(attachment.cardId, sourceId)).all()
  for (const file of files) {
    tx.insert(attachment)
      .values({ ...file, id: randomUUID(), cardId: id, createdAt: now })
      .run()
  }

  addActivity(tx, id, 'copied', { from: source.title }, now)
  return id
}

// Arquiva todos os cards ativos de uma lista (LIS-07). Arquivar não zera o envelhecimento.
export function archiveAllInList(tx: Tx, listId: string, now: number): number {
  const active = tx
    .select({ id: card.id })
    .from(card)
    .where(and(eq(card.listId, listId), isNull(card.archivedAt)))
    .all()
  if (active.length === 0) return 0
  const ids = active.map((row) => row.id)
  tx.update(card).set({ archivedAt: now, updatedAt: now }).where(inArray(card.id, ids)).run()
  for (const cardId of ids) addActivity(tx, cardId, 'archived', {}, now)
  return ids.length
}

// Restaura um card arquivado (CAR-05). Restaurar zera o envelhecimento (ENV-05).
export function restore(db: DbOrTx, cardId: string, now: number): void {
  db.transaction((tx) => {
    const found = tx
      .select({ archivedAt: card.archivedAt })
      .from(card)
      .where(eq(card.id, cardId))
      .get()
    if (!found) throw new AppError('NOT_FOUND', 'Card não encontrado.')
    if (found.archivedAt === null) return
    tx.update(card).set({ archivedAt: null }).where(eq(card.id, cardId)).run()
    touch(tx, cardId, now)
    addActivity(tx, cardId, 'restored', {}, now)
  })
}

// Exclui de vez (CAR-05). Etiquetas, checklists, atividade e anexos do card saem junto (CASCADE).
export function remove(db: DbOrTx, cardId: string): void {
  const result = db.delete(card).where(eq(card.id, cardId)).run()
  if (result.changes === 0) throw new AppError('NOT_FOUND', 'Card não encontrado.')
}
