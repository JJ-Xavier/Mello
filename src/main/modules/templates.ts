// Modelos (MOD): cards-modelo e quadros-modelo. Um card-modelo não envelhece, não vai para o
// calendário nem para a busca, não dispara lembrete e não tem ✓ nem repetição (MOD-02). Um
// quadro-modelo sai do Início e fica na seção "Modelos" (MOD-04).
import { randomUUID } from 'node:crypto'
import { and, count, eq, isNull, max } from 'drizzle-orm'
import type { BoardSummary } from '../../shared/ipc/boards'
import type { CardSummary } from '../../shared/ipc/cards'
import type { BoardTemplate } from '../../shared/ipc/templates'
import { AppError } from '../../shared/result'
import type { Db, DbOrTx } from '../db/client'
import { board, card, label, list } from '../db/schema'
import { activeLists, listTemplates, summaryOf as boardSummary } from './boards'
import { copyCard, requireTargetList, summaryOf as cardSummary } from './cards'
import { keyAfter } from './position'

// MOD-01: virar modelo tira o ✓. Um card com repetição é recusado: tirar a repetição é com você.
// Entrar e sair de modelo não zera o envelhecimento (ENV-04: congelar não zera o tempo).
export function setCard(db: Db, cardId: string, isTemplate: boolean, now: number): void {
  db.transaction((tx) => {
    const found = tx.select().from(card).where(eq(card.id, cardId)).get()
    if (!found) throw new AppError('NOT_FOUND', 'Card não encontrado.')
    if (found.isTemplate === isTemplate) return
    if (isTemplate && found.recurrenceId !== null) {
      throw new AppError('CONFLICT', 'Tire a repetição antes de transformar em modelo.')
    }
    const done = isTemplate ? { isDone: false, doneAt: null } : {}
    tx.update(card)
      .set({ isTemplate, ...done, updatedAt: now })
      .where(eq(card.id, cardId))
      .run()
  })
}

// MOD-03: a cópia do card-modelo, sem a marca de modelo, no fim de uma lista do mesmo quadro.
export function createCard(
  db: Db,
  input: { templateId: string; listId: string },
  now: number
): CardSummary {
  let id = ''
  db.transaction((tx) => {
    const template = tx
      .select({
        title: card.title,
        isTemplate: card.isTemplate,
        archivedAt: card.archivedAt,
        boardId: list.boardId
      })
      .from(card)
      .innerJoin(list, eq(card.listId, list.id))
      .where(eq(card.id, input.templateId))
      .get()
    if (!template) throw new AppError('NOT_FOUND', 'Modelo não encontrado.')
    if (!template.isTemplate || template.archivedAt !== null) {
      throw new AppError('CONFLICT', 'Este card não é um modelo.')
    }
    if (requireTargetList(tx, input.listId).boardId !== template.boardId) {
      throw new AppError('CONFLICT', 'O modelo é de outro quadro.')
    }
    const last =
      tx
        .select({ last: max(card.position) })
        .from(card)
        .where(eq(card.listId, input.listId))
        .get()?.last ?? null
    id = copyCard(tx, input.templateId, { listId: input.listId, position: keyAfter(last) }, now, {
      kind: 'from_template',
      from: template.title
    })
    tx.update(card).set({ isTemplate: false }).where(eq(card.id, id)).run()
  })
  return cardSummary(db, id)
}

// MOD-04
export function setBoard(db: DbOrTx, boardId: string, isTemplate: boolean, now: number): void {
  const result = db
    .update(board)
    .set({ isTemplate, updatedAt: now })
    .where(eq(board.id, boardId))
    .run()
  if (result.changes === 0) throw new AppError('NOT_FOUND', 'Quadro não encontrado.')
}

// A seção "Modelos" do Início, com o que o diálogo mostra: listas, etiquetas e cards ativos.
export function listBoards(db: DbOrTx): BoardTemplate[] {
  return listTemplates(db).map((summary) => {
    const lists = activeLists(db, summary.id)
    const labels = db.select({ n: count() }).from(label).where(eq(label.boardId, summary.id)).get()
    return {
      ...summary,
      listCount: lists.length,
      labelCount: labels?.n ?? 0,
      cardCount: lists.reduce((total, l) => total + l.cardCount, 0)
    }
  })
}

// MOD-05: o quadro novo vai para o fim do Início, com as listas ativas (e as opções delas), as
// etiquetas e o fundo do modelo; a imagem de fundo é a mesma guardada, nada é copiado no disco.
// Com keepCards, vêm também os cards ativos, sem o ✓, com nível 0 e só com o registro "Criado a
// partir do modelo <quadro>"; os cards-modelo continuam modelos.
export function createBoard(
  db: Db,
  input: { templateId: string; title: string; keepCards: boolean },
  now: number
): BoardSummary {
  return db.transaction((tx) => {
    const template = tx.select().from(board).where(eq(board.id, input.templateId)).get()
    if (!template) throw new AppError('NOT_FOUND', 'Modelo não encontrado.')
    if (!template.isTemplate) throw new AppError('CONFLICT', 'Este quadro não é um modelo.')
    const last =
      tx
        .select({ last: max(board.position) })
        .from(board)
        .get()?.last ?? null
    const boardId = randomUUID()
    tx.insert(board)
      .values({
        ...template,
        id: boardId,
        title: input.title,
        position: keyAfter(last),
        isFavorite: false,
        isTemplate: false,
        closedAt: null,
        createdAt: now,
        updatedAt: now
      })
      .run()

    const labelMap = new Map<string, string>()
    for (const source of tx.select().from(label).where(eq(label.boardId, template.id)).all()) {
      const id = randomUUID()
      labelMap.set(source.id, id)
      tx.insert(label)
        .values({ ...source, id, boardId })
        .run()
    }

    const lists = tx
      .select()
      .from(list)
      .where(and(eq(list.boardId, template.id), isNull(list.archivedAt)))
      .all()
    for (const source of lists) {
      const listId = randomUUID()
      tx.insert(list)
        .values({ ...source, id: listId, boardId, createdAt: now, updatedAt: now })
        .run()
      if (!input.keepCards) continue
      const cards = tx
        .select({ id: card.id, position: card.position })
        .from(card)
        .where(and(eq(card.listId, source.id), isNull(card.archivedAt)))
        .all()
      for (const row of cards) {
        const id = copyCard(tx, row.id, { listId, position: row.position, labelMap }, now, {
          kind: 'from_template',
          from: template.title
        })
        tx.update(card).set({ isDone: false, doneAt: null }).where(eq(card.id, id)).run()
      }
    }
    return boardSummary(tx, boardId)
  })
}
