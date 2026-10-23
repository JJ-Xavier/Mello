// Cards: criar, editar (modal), mover (arrastar ou menu), copiar, etiquetas, arquivar, restaurar,
// excluir, a face no quadro e a busca do filtro do quadro. Nota, anexos e capa entram na etapa 5.
import { randomUUID } from 'node:crypto'
import { and, asc, count, eq, inArray, isNull, max, or, sql, type SQL } from 'drizzle-orm'
import type { CardDetail, CardSummary, UpdateCardInput } from '../../shared/ipc/cards'
import { DESCRIPTION_TEXT_MAX } from '../../shared/limits'
import { AppError } from '../../shared/result'
import { doneAfterMove } from '../../shared/rules/finished'
import { clean, toHtml, toText } from '../../shared/rules/richText'
import { removeAccents } from '../../shared/text'
import type { Db, DbOrTx, Tx } from '../db/client'
import {
  attachment,
  board,
  card,
  cardLabel,
  checklist,
  checklistItem,
  label,
  list
} from '../db/schema'
import { addActivity, touch } from './activity'
import { checklistsOf } from './checklists'
import { mapLabelsToBoard } from './labels'
import { keyAfter, keyAt, rebalance, visibleIndex } from './position'

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

function requireCard(db: DbOrTx, cardId: string) {
  const found = db.select().from(card).where(eq(card.id, cardId)).get()
  if (!found) throw new AppError('NOT_FOUND', 'Card não encontrado.')
  return found
}

// A lista que recebe um card precisa estar ativa, num quadro aberto.
function requireTargetList(db: DbOrTx, listId: string) {
  const found = db
    .select({
      id: list.id,
      boardId: list.boardId,
      title: list.title,
      isDoneList: list.isDoneList,
      archivedAt: list.archivedAt,
      boardTitle: board.title,
      boardClosedAt: board.closedAt
    })
    .from(list)
    .innerJoin(board, eq(list.boardId, board.id))
    .where(eq(list.id, listId))
    .get()
  if (!found) throw new AppError('NOT_FOUND', 'Lista não encontrada.')
  if (found.archivedAt !== null) throw new AppError('CONFLICT', 'A lista está arquivada.')
  if (found.boardClosedAt !== null) throw new AppError('CONFLICT', 'O quadro está fechado.')
  return found
}

// Os dados da face (CAR-04) dos cards que atendem `where` (sobre card + lista), em ordem.
function summaries(db: DbOrTx, where: SQL | undefined): CardSummary[] {
  const rows = db
    .select({
      id: card.id,
      listId: card.listId,
      title: card.title,
      position: card.position,
      isDone: card.isDone,
      priority: card.priority,
      dueAt: card.dueAt,
      recurrenceId: card.recurrenceId,
      descriptionText: card.descriptionText,
      noteText: card.noteText
    })
    .from(card)
    .innerJoin(list, eq(card.listId, list.id))
    .where(where)
    .orderBy(asc(card.position))
    .all()
  if (rows.length === 0) return []

  const labels = db
    .select({ cardId: cardLabel.cardId, id: label.id, color: label.color, name: label.name })
    .from(cardLabel)
    .innerJoin(label, eq(cardLabel.labelId, label.id))
    .innerJoin(card, eq(cardLabel.cardId, card.id))
    .innerJoin(list, eq(card.listId, list.id))
    .where(where)
    .orderBy(asc(label.position))
    .all()
  const checks = db
    .select({
      cardId: checklist.cardId,
      total: count(checklistItem.id),
      done: sql<number>`sum(${checklistItem.isDone})`.mapWith(Number)
    })
    .from(checklistItem)
    .innerJoin(checklist, eq(checklistItem.checklistId, checklist.id))
    .innerJoin(card, eq(checklist.cardId, card.id))
    .innerJoin(list, eq(card.listId, list.id))
    .where(where)
    .groupBy(checklist.cardId)
    .all()
  const files = db
    .select({ cardId: attachment.cardId, total: count(attachment.id) })
    .from(attachment)
    .innerJoin(card, eq(attachment.cardId, card.id))
    .innerJoin(list, eq(card.listId, list.id))
    .where(where)
    .groupBy(attachment.cardId)
    .all()

  const labelsOf = new Map<string, CardSummary['labels']>()
  for (const { cardId, ...rest } of labels) {
    labelsOf.set(cardId, [...(labelsOf.get(cardId) ?? []), rest])
  }
  const checksOf = new Map(checks.map((c) => [c.cardId, c]))
  const filesOf = new Map(files.map((f) => [f.cardId, f.total]))
  return rows.map(({ descriptionText, noteText, recurrenceId, ...row }) => ({
    ...row,
    recurring: recurrenceId !== null,
    labels: labelsOf.get(row.id) ?? [],
    hasDescription: descriptionText.trim() !== '',
    hasNote: noteText.trim() !== '',
    attachmentCount: filesOf.get(row.id) ?? 0,
    checkDone: checksOf.get(row.id)?.done ?? 0,
    checkTotal: checksOf.get(row.id)?.total ?? 0
  }))
}

// Cards ativos do quadro (listas ativas, cards não arquivados), agrupados pela lista.
export function summariesByList(db: DbOrTx, boardId: string): Map<string, CardSummary[]> {
  const byList = new Map<string, CardSummary[]>()
  const where = and(eq(list.boardId, boardId), isNull(list.archivedAt), isNull(card.archivedAt))
  for (const summary of summaries(db, where)) {
    byList.set(summary.listId, [...(byList.get(summary.listId) ?? []), summary])
  }
  return byList
}

// O card aberto no modal, inclusive arquivado (o modal mostra o aviso para restaurar).
export function get(db: DbOrTx, cardId: string): CardDetail {
  const found = db
    .select({
      id: card.id,
      boardId: list.boardId,
      listId: card.listId,
      listTitle: list.title,
      isDoneList: list.isDoneList,
      title: card.title,
      isDone: card.isDone,
      priority: card.priority,
      dueAt: card.dueAt,
      reminder: card.reminder,
      descriptionHtml: card.descriptionHtml,
      lastActivityAt: card.lastActivityAt,
      archivedAt: card.archivedAt
    })
    .from(card)
    .innerJoin(list, eq(card.listId, list.id))
    .where(eq(card.id, cardId))
    .get()
  if (!found) throw new AppError('NOT_FOUND', 'Card não encontrado.')
  const labelIds = db
    .select({ id: label.id })
    .from(cardLabel)
    .innerJoin(label, eq(cardLabel.labelId, label.id))
    .where(eq(cardLabel.cardId, cardId))
    .orderBy(asc(label.position))
    .all()
    .map((l) => l.id)
  return { ...found, labelIds, checklists: checklistsOf(db, cardId) }
}

// Editar pelo modal. Cada mudança zera o envelhecimento (ENV-05); se nada mudou, não grava.
// - ✓ (FIN-04, FIN-05): registra na atividade (ATV-02).
// - Data: sem data não há lembrete (LEM-01); mudar a data ou o lembrete rearma (LEM-04).
// - Descrição: só fica o que a NOT-04 permite; o main gera o HTML (richText.ts).
export function update(db: Db, input: UpdateCardInput, now: number): void {
  db.transaction((tx) => {
    const current = requireCard(tx, input.cardId)
    const changes: Partial<typeof card.$inferInsert> = {}
    if (input.title !== undefined && input.title !== current.title) changes.title = input.title
    if (input.isDone !== undefined && input.isDone !== current.isDone) {
      changes.isDone = input.isDone
      changes.doneAt = input.isDone ? now : null
    }
    if (input.priority !== undefined && input.priority !== current.priority) {
      changes.priority = input.priority
    }
    if (input.due !== undefined) {
      const reminder = input.due.dueAt === null ? 'none' : input.due.reminder
      if (input.due.dueAt !== current.dueAt || reminder !== current.reminder) {
        changes.dueAt = input.due.dueAt
        changes.reminder = reminder
        changes.reminderFiredAt = null
      }
    }
    if (input.description !== undefined) {
      const doc = clean(input.description)
      const text = toText(doc)
      if (text.length > DESCRIPTION_TEXT_MAX) {
        throw new AppError('INVALID_INPUT', 'A descrição passou do tamanho máximo.')
      }
      const html = toHtml(doc)
      if (html !== current.descriptionHtml) {
        changes.descriptionHtml = html
        changes.descriptionText = html ? text : ''
      }
    }
    if (Object.keys(changes).length === 0) return
    tx.update(card).set(changes).where(eq(card.id, input.cardId)).run()
    touch(tx, input.cardId, now)
    if (changes.isDone !== undefined) {
      addActivity(tx, input.cardId, changes.isDone ? 'done' : 'undone', {}, now)
    }
  })
}

// Marcar e desmarcar etiquetas no card (ETQ-04). Só etiquetas do quadro do card; adicionar ou
// remover zera o envelhecimento (ENV-05).
export function setLabels(db: Db, cardId: string, labelIds: string[], now: number): void {
  db.transaction((tx) => {
    const found = tx
      .select({ boardId: list.boardId })
      .from(card)
      .innerJoin(list, eq(card.listId, list.id))
      .where(eq(card.id, cardId))
      .get()
    if (!found) throw new AppError('NOT_FOUND', 'Card não encontrado.')
    const wanted = new Set(labelIds)
    const valid = tx
      .select({ id: label.id })
      .from(label)
      .where(eq(label.boardId, found.boardId))
      .all()
      .map((l) => l.id)
    if ([...wanted].some((id) => !valid.includes(id))) {
      throw new AppError('CONFLICT', 'Etiqueta de outro quadro.')
    }
    const current = new Set(
      tx
        .select({ labelId: cardLabel.labelId })
        .from(cardLabel)
        .where(eq(cardLabel.cardId, cardId))
        .all()
        .map((r) => r.labelId)
    )
    const removed = [...current].filter((id) => !wanted.has(id))
    const added = [...wanted].filter((id) => !current.has(id))
    if (removed.length === 0 && added.length === 0) return
    if (removed.length > 0) {
      tx.delete(cardLabel)
        .where(and(eq(cardLabel.cardId, cardId), inArray(cardLabel.labelId, removed)))
        .run()
    }
    for (const labelId of added) tx.insert(cardLabel).values({ cardId, labelId }).run()
    touch(tx, cardId, now)
  })
}

// CAR-05: arquivar tira o card do quadro (e do calendário, da busca e dos lembretes). Não zera o
// envelhecimento; restaurar, sim.
export function archive(db: Db, cardId: string, now: number): void {
  db.transaction((tx) => {
    const found = requireCard(tx, cardId)
    if (found.archivedAt !== null) return
    tx.update(card).set({ archivedAt: now, updatedAt: now }).where(eq(card.id, cardId)).run()
    addActivity(tx, cardId, 'archived', {}, now)
  })
}

// "% texto %" para o LIKE, com os caracteres especiais escapados.
function likePattern(keyword: string): string {
  const plain = removeAccents(keyword.trim()).toLowerCase()
  return `%${plain.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
}

// FLT-01: os cards ativos do quadro com a palavra-chave no título, na descrição, na nota ou no
// nome de uma etiqueta, sem diferenciar acento nem maiúscula (função unaccent do SQLite).
export function matching(db: DbOrTx, boardId: string, keyword: string): string[] {
  const pattern = likePattern(keyword)
  const has = (column: SQL | typeof card.title) =>
    sql`lower(unaccent(${column})) like ${pattern} escape '\\'`
  return db
    .selectDistinct({ id: card.id })
    .from(card)
    .innerJoin(list, eq(card.listId, list.id))
    .leftJoin(cardLabel, eq(cardLabel.cardId, card.id))
    .leftJoin(label, eq(cardLabel.labelId, label.id))
    .where(
      and(
        eq(list.boardId, boardId),
        isNull(list.archivedAt),
        isNull(card.archivedAt),
        or(
          has(card.title),
          has(sql`${card.descriptionText}`),
          has(sql`${card.noteText}`),
          has(sql`coalesce(${label.name}, '')`)
        )
      )
    )
    .all()
    .map((row) => row.id)
}

// CAR-02: o card novo entra no fim da lista, com nível 0 (última alteração = agora). Criado direto
// numa lista de conclusão, nasce sem o ✓: o ✓ automático é só para quem chega arrastado ou movido
// (FIN-02, decidido na etapa 3).
export function create(db: Db, listId: string, title: string, now: number): CardSummary {
  const id = randomUUID()
  db.transaction((tx) => {
    const target = requireTargetList(tx, listId)
    const last =
      tx
        .select({ last: max(card.position) })
        .from(card)
        .where(eq(card.listId, listId))
        .get()?.last ?? null
    tx.insert(card)
      .values({
        id,
        listId,
        title,
        position: keyAfter(last),
        lastActivityAt: now,
        createdAt: now,
        updatedAt: now
      })
      .run()
    addActivity(tx, id, 'created', { list: target.title }, now)
  })
  return summaries(db, eq(card.id, id))[0]!
}

// Todos os cards da lista em ordem (os arquivados ocultos), sem o que está sendo movido.
function siblingsOf(tx: DbOrTx, listId: string, exceptId: string) {
  return tx
    .select({ id: card.id, position: card.position, archivedAt: card.archivedAt })
    .from(card)
    .where(eq(card.listId, listId))
    .orderBy(asc(card.position))
    .all()
    .filter((c) => c.id !== exceptId)
    .map((c) => ({ id: c.id, position: c.position, hidden: c.archivedAt !== null }))
}

// Chave para a posição `index` entre os cards visíveis da lista, reorganizando as posições se
// houver repetidas.
function positionInList(tx: Tx, listId: string, exceptId: string, index: number): string {
  const key = keyAt(siblingsOf(tx, listId, exceptId), index)
  if (key !== null) return key
  for (const [id, position] of rebalance(siblingsOf(tx, listId, exceptId))) {
    tx.update(card).set({ position }).where(eq(card.id, id)).run()
  }
  return keyAt(siblingsOf(tx, listId, exceptId), index)!
}

// CAR-07: "Copiar" do menu do card, com o título, a lista e a posição escolhidos (a lista pode ser
// de outro quadro; as etiquetas são recriadas lá, LIS-05). O ✓ vem como está no original.
export function copy(
  db: Db,
  input: { cardId: string; title: string; listId: string; index: number },
  now: number
): CardSummary {
  let id = ''
  db.transaction((tx) => {
    const source = requireCard(tx, input.cardId)
    const fromBoard = tx
      .select({ boardId: list.boardId })
      .from(list)
      .where(eq(list.id, source.listId))
      .get()!.boardId
    const to = requireTargetList(tx, input.listId)
    const position = positionInList(tx, input.listId, '', input.index)
    let labelMap: Map<string, string> | undefined
    if (fromBoard !== to.boardId) {
      const used = tx.select().from(cardLabel).where(eq(cardLabel.cardId, source.id)).all()
      labelMap = mapLabelsToBoard(
        tx,
        used.map((u) => u.labelId),
        to.boardId
      )
    }
    id = copyCard(tx, source.id, { listId: input.listId, position, labelMap }, now)
    if (input.title !== source.title) {
      tx.update(card).set({ title: input.title }).where(eq(card.id, id)).run()
    }
  })
  return summaries(db, eq(card.id, id))[0]!
}

// Arrastar ou mover o card para a posição `index` (entre os cards visíveis, sem ele) da lista
// `listId`, que pode ser de outro quadro (CAR-06).
// - Mesmo lugar (mesma lista e mesma posição): não grava nada (CAR-03).
// - O ✓ segue FIN-02 e FIN-03, e a mudança entra na atividade (ATV-02).
// - Zera o envelhecimento (ENV-05).
// - Em outro quadro, as etiquetas do card são recriadas lá quando não existem (LIS-05).
export function move(db: Db, cardId: string, listId: string, index: number, now: number): void {
  db.transaction((tx) => {
    const moving = requireCard(tx, cardId)
    if (moving.archivedAt !== null) throw new AppError('CONFLICT', 'O card está arquivado.')
    const to = requireTargetList(tx, listId)
    const sameList = moving.listId === listId
    if (sameList && visibleIndex(siblingsOf(tx, listId, ''), cardId) === index) return
    const from = sameList ? to : requireTargetList(tx, moving.listId)

    const isDone = doneAfterMove(moving.isDone, from, to)
    const doneAt = isDone === moving.isDone ? moving.doneAt : isDone ? now : null
    const position = positionInList(tx, listId, cardId, index)
    tx.update(card).set({ listId, position, isDone, doneAt }).where(eq(card.id, cardId)).run()
    touch(tx, cardId, now)

    if (from.boardId !== to.boardId) {
      const used = tx.select().from(cardLabel).where(eq(cardLabel.cardId, cardId)).all()
      const map = mapLabelsToBoard(
        tx,
        used.map((u) => u.labelId),
        to.boardId
      )
      for (const row of used) {
        tx.update(cardLabel)
          .set({ labelId: map.get(row.labelId)! })
          .where(and(eq(cardLabel.cardId, cardId), eq(cardLabel.labelId, row.labelId)))
          .run()
      }
    }
    if (!sameList) {
      const boards =
        from.boardId === to.boardId ? {} : { fromBoard: from.boardTitle, toBoard: to.boardTitle }
      addActivity(tx, cardId, 'moved', { from: from.title, to: to.title, ...boards }, now)
    }
    if (isDone !== moving.isDone) addActivity(tx, cardId, isDone ? 'done' : 'undone', {}, now)
  })
}
