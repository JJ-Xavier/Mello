// Busca do topo (BUS): cards, tarefas (itens de checklist) e quadros, sem diferenciar acento nem
// maiúscula (BUS-01). Ficam de fora os arquivados, os modelos e os quadros fechados (BUS-04).
import { and, asc, desc, eq, isNull, or, sql } from 'drizzle-orm'
import { SEARCH_GROUP_MAX, type SearchResults } from '../../shared/ipc/search'
import { removeAccents } from '../../shared/text'
import type { DbOrTx } from '../db/client'
import { board, card, cardLabel, checklist, checklistItem, label, list } from '../db/schema'
import { listOpen } from './boards'
import { containsText } from './cards'

export function search(db: DbOrTx, text: string): SearchResults {
  const has = containsText(text)
  // O card à vista: ativo, numa lista ativa de um quadro aberto, e nem ele nem o quadro são modelo.
  const visible = and(
    isNull(card.archivedAt),
    eq(card.isTemplate, false),
    isNull(list.archivedAt),
    isNull(board.closedAt),
    eq(board.isTemplate, false)
  )

  // BUS-02: título, descrição e nota. Os que têm no título vêm primeiro; depois, os mais recentes.
  const cards = db
    .select({
      id: card.id,
      boardId: board.id,
      title: card.title,
      boardTitle: board.title,
      listTitle: list.title,
      color: sql<string | null>`(
        select ${label.color} from ${cardLabel}
        join ${label} on ${label.id} = ${cardLabel.labelId}
        where ${cardLabel.cardId} = ${card.id}
        order by ${label.position} limit 1
      )`
    })
    .from(card)
    .innerJoin(list, eq(card.listId, list.id))
    .innerJoin(board, eq(list.boardId, board.id))
    .where(and(visible, or(has(card.title), has(card.descriptionText), has(card.noteText))))
    .orderBy(desc(has(card.title)), desc(card.lastActivityAt))
    .limit(SEARCH_GROUP_MAX)
    .all()

  // As tarefas por fazer vêm antes das marcadas.
  const tasks = db
    .select({
      id: checklistItem.id,
      cardId: card.id,
      boardId: board.id,
      text: checklistItem.text,
      cardTitle: card.title,
      dueDate: checklistItem.dueDate,
      isDone: checklistItem.isDone
    })
    .from(checklistItem)
    .innerJoin(checklist, eq(checklistItem.checklistId, checklist.id))
    .innerJoin(card, eq(checklist.cardId, card.id))
    .innerJoin(list, eq(card.listId, list.id))
    .innerJoin(board, eq(list.boardId, board.id))
    .where(and(visible, has(checklistItem.text)))
    .orderBy(asc(checklistItem.isDone), desc(card.lastActivityAt), asc(checklistItem.position))
    .limit(SEARCH_GROUP_MAX)
    .all()

  // Os quadros abertos já vêm sem os modelos, na ordem do Início.
  const plain = removeAccents(text.trim()).toLowerCase()
  const boards = listOpen(db)
    .filter((b) => removeAccents(b.title).toLowerCase().includes(plain))
    .slice(0, SEARCH_GROUP_MAX)

  return { cards, tasks, boards }
}
