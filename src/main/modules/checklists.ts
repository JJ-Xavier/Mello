// Checklists e itens (CHK). Tudo o que muda o conteúdo de um checklist zera o envelhecimento do
// card (ENV-05): criar, renomear, reordenar e excluir checklist; adicionar, editar, marcar, datar,
// reordenar e excluir item. "Ocultar itens marcados" não zera (ENV-06).
import { randomUUID } from 'node:crypto'
import { asc, eq, inArray, max } from 'drizzle-orm'
import type { Checklist, ChecklistItem } from '../../shared/ipc/checklists'
import { AppError } from '../../shared/result'
import type { Db, DbOrTx, Tx } from '../db/client'
import { card, checklist, checklistItem } from '../db/schema'
import { touch } from './activity'
import { keyAfter, keyAt, rebalance, visibleIndex, type Positioned } from './position'

function requireChecklist(db: DbOrTx, checklistId: string) {
  const found = db.select().from(checklist).where(eq(checklist.id, checklistId)).get()
  if (!found) throw new AppError('NOT_FOUND', 'Checklist não encontrado.')
  return found
}

function requireItem(db: DbOrTx, itemId: string) {
  const found = db
    .select({ item: checklistItem, cardId: checklist.cardId })
    .from(checklistItem)
    .innerJoin(checklist, eq(checklistItem.checklistId, checklist.id))
    .where(eq(checklistItem.id, itemId))
    .get()
  if (!found) throw new AppError('NOT_FOUND', 'Item não encontrado.')
  return found
}

const itemFields = {
  id: checklistItem.id,
  text: checklistItem.text,
  isDone: checklistItem.isDone,
  dueDate: checklistItem.dueDate,
  showInCalendar: checklistItem.showInCalendar
}

// Os checklists do card em ordem, cada um com os itens em ordem.
export function checklistsOf(db: DbOrTx, cardId: string): Checklist[] {
  const lists = db
    .select({ id: checklist.id, title: checklist.title, hideChecked: checklist.hideChecked })
    .from(checklist)
    .where(eq(checklist.cardId, cardId))
    .orderBy(asc(checklist.position))
    .all()
  if (lists.length === 0) return []
  const items = db
    .select({ checklistId: checklistItem.checklistId, ...itemFields })
    .from(checklistItem)
    .where(
      inArray(
        checklistItem.checklistId,
        lists.map((l) => l.id)
      )
    )
    .orderBy(asc(checklistItem.position))
    .all()
  const itemsOf = new Map<string, ChecklistItem[]>()
  for (const { checklistId, ...item } of items) {
    itemsOf.set(checklistId, [...(itemsOf.get(checklistId) ?? []), item])
  }
  return lists.map((l) => ({ ...l, items: itemsOf.get(l.id) ?? [] }))
}

// Posição `index` entre os irmãos (sem o que se move), reorganizando se houver repetidas.
function positionAmong(
  siblings: () => Positioned[],
  index: number,
  save: (id: string, position: string) => void
): string {
  const key = keyAt(siblings(), index)
  if (key !== null) return key
  for (const [id, position] of rebalance(siblings())) save(id, position)
  return keyAt(siblings(), index)!
}

// CHK-01: checklist novo vai para o fim do card.
export function create(db: Db, cardId: string, title: string, now: number): Checklist {
  const id = randomUUID()
  db.transaction((tx) => {
    if (!tx.select({ id: card.id }).from(card).where(eq(card.id, cardId)).get()) {
      throw new AppError('NOT_FOUND', 'Card não encontrado.')
    }
    const last =
      tx
        .select({ last: max(checklist.position) })
        .from(checklist)
        .where(eq(checklist.cardId, cardId))
        .get()?.last ?? null
    tx.insert(checklist)
      .values({ id, cardId, title, position: keyAfter(last) })
      .run()
    touch(tx, cardId, now)
  })
  return { id, title, hideChecked: false, items: [] }
}

// Renomear zera o envelhecimento; "Ocultar itens marcados" (CHK-04) não.
export function update(
  db: Db,
  input: { checklistId: string; title?: string; hideChecked?: boolean },
  now: number
): void {
  db.transaction((tx) => {
    const found = requireChecklist(tx, input.checklistId)
    const changes: Partial<typeof checklist.$inferInsert> = {}
    if (input.title !== undefined && input.title !== found.title) changes.title = input.title
    if (input.hideChecked !== undefined) changes.hideChecked = input.hideChecked
    if (Object.keys(changes).length === 0) return
    tx.update(checklist).set(changes).where(eq(checklist.id, found.id)).run()
    if (changes.title !== undefined) touch(tx, found.cardId, now)
  })
}

function checklistSiblings(tx: DbOrTx, cardId: string, exceptId: string): Positioned[] {
  return tx
    .select({ id: checklist.id, position: checklist.position })
    .from(checklist)
    .where(eq(checklist.cardId, cardId))
    .orderBy(asc(checklist.position))
    .all()
    .filter((c) => c.id !== exceptId)
}

export function move(db: Db, checklistId: string, index: number, now: number): void {
  db.transaction((tx) => {
    const found = requireChecklist(tx, checklistId)
    if (visibleIndex(checklistSiblings(tx, found.cardId, ''), checklistId) === index) return
    const position = positionAmong(
      () => checklistSiblings(tx, found.cardId, checklistId),
      index,
      (id, value) => tx.update(checklist).set({ position: value }).where(eq(checklist.id, id)).run()
    )
    tx.update(checklist).set({ position }).where(eq(checklist.id, checklistId)).run()
    touch(tx, found.cardId, now)
  })
}

export function remove(db: Db, checklistId: string, now: number): void {
  db.transaction((tx) => {
    const found = requireChecklist(tx, checklistId)
    tx.delete(checklist).where(eq(checklist.id, checklistId)).run()
    touch(tx, found.cardId, now)
  })
}

// Item novo vai para o fim do checklist, sem data e com "Mostrar no calendário" ligado (CHK-05).
export function createItem(db: Db, checklistId: string, text: string, now: number): ChecklistItem {
  const id = randomUUID()
  db.transaction((tx) => {
    const found = requireChecklist(tx, checklistId)
    const last =
      tx
        .select({ last: max(checklistItem.position) })
        .from(checklistItem)
        .where(eq(checklistItem.checklistId, checklistId))
        .get()?.last ?? null
    tx.insert(checklistItem)
      .values({ id, checklistId, text, position: keyAfter(last), createdAt: now, updatedAt: now })
      .run()
    touch(tx, found.cardId, now)
  })
  return { id, text, isDone: false, dueDate: null, showInCalendar: true }
}

// Editar o texto ou a data da tarefa (CHK-05). Sem mudança, não grava.
export function updateItem(
  db: Db,
  input: {
    itemId: string
    text?: string
    due?: { dueDate: string | null; showInCalendar: boolean }
  },
  now: number
): void {
  db.transaction((tx) => {
    const { item, cardId } = requireItem(tx, input.itemId)
    const changes: Partial<typeof checklistItem.$inferInsert> = {}
    if (input.text !== undefined && input.text !== item.text) changes.text = input.text
    if (input.due !== undefined) {
      if (input.due.dueDate !== item.dueDate) changes.dueDate = input.due.dueDate
      if (input.due.showInCalendar !== item.showInCalendar) {
        changes.showInCalendar = input.due.showInCalendar
      }
    }
    if (Object.keys(changes).length === 0) return
    tx.update(checklistItem)
      .set({ ...changes, updatedAt: now })
      .where(eq(checklistItem.id, item.id))
      .run()
    touch(tx, cardId, now)
  })
}

// Marcar e desmarcar (FIN-07). Também vale para a tarefa marcada pelo calendário (etapa 7).
export function toggleItem(db: Db, itemId: string, isDone: boolean, now: number): void {
  db.transaction((tx) => {
    const { item, cardId } = requireItem(tx, itemId)
    if (item.isDone === isDone) return
    tx.update(checklistItem)
      .set({ isDone, updatedAt: now })
      .where(eq(checklistItem.id, itemId))
      .run()
    touch(tx, cardId, now)
  })
}

function itemSiblings(tx: DbOrTx, checklistId: string, exceptId: string): Positioned[] {
  return tx
    .select({ id: checklistItem.id, position: checklistItem.position })
    .from(checklistItem)
    .where(eq(checklistItem.checklistId, checklistId))
    .orderBy(asc(checklistItem.position))
    .all()
    .filter((i) => i.id !== exceptId)
}

// Reordenar dentro do mesmo checklist.
export function moveItem(db: Db, itemId: string, index: number, now: number): void {
  db.transaction((tx) => {
    const { item, cardId } = requireItem(tx, itemId)
    if (visibleIndex(itemSiblings(tx, item.checklistId, ''), itemId) === index) return
    const position = positionAmong(
      () => itemSiblings(tx, item.checklistId, itemId),
      index,
      (id, value) =>
        tx.update(checklistItem).set({ position: value }).where(eq(checklistItem.id, id)).run()
    )
    tx.update(checklistItem)
      .set({ position, updatedAt: now })
      .where(eq(checklistItem.id, itemId))
      .run()
    touch(tx, cardId, now)
  })
}

export function removeItem(db: Db, itemId: string, now: number): void {
  db.transaction((tx: Tx) => {
    const { cardId } = requireItem(tx, itemId)
    tx.delete(checklistItem).where(eq(checklistItem.id, itemId)).run()
    touch(tx, cardId, now)
  })
}
