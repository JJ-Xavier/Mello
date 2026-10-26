// Calendário (CAL): os cards e as tarefas de um mês, de um quadro ou de todos (CAL-02), e o
// "Adicionar" de um dia (CAL-12).
import { and, asc, eq, gte, inArray, isNull, lt, type SQL } from 'drizzle-orm'
import type {
  CalendarAddCardInput,
  CalendarMonth,
  CalendarMonthInput
} from '../../shared/ipc/calendar'
import type { CardLabel, CardSummary } from '../../shared/ipc/cards'
import { AppError } from '../../shared/result'
import { addTarget, monthRange } from '../../shared/rules/calendar'
import { isFinished } from '../../shared/rules/finished'
import type { Db, DbOrTx } from '../db/client'
import { board, card, cardLabel, checklist, checklistItem, label, list } from '../db/schema'
import { activeLists } from './boards'
import { create } from './cards'

// CAL-06: ficam de fora os cards arquivados, os modelos, os de lista arquivada e os de quadro
// fechado (QUA-05). Quadros-modelo (etapa 11) também.
function visible(boardId: string | null): SQL | undefined {
  return and(
    isNull(card.archivedAt),
    eq(card.isTemplate, false),
    isNull(list.archivedAt),
    isNull(board.closedAt),
    eq(board.isTemplate, false),
    boardId === null ? undefined : eq(board.id, boardId)
  )
}

// CAL-05: os cards pela data de entrega e as tarefas (itens de checklist com data e "Mostrar no
// calendário") do mês.
export function month(db: DbOrTx, input: CalendarMonthInput): CalendarMonth {
  const { from, to } = monthRange(input.year, input.month)
  const rows = db
    .select({
      id: card.id,
      boardId: board.id,
      boardTitle: board.title,
      title: card.title,
      dueAt: card.dueAt,
      isDone: card.isDone,
      isDoneList: list.isDoneList,
      priority: card.priority,
      recurrenceId: card.recurrenceId
    })
    .from(card)
    .innerJoin(list, eq(card.listId, list.id))
    .innerJoin(board, eq(list.boardId, board.id))
    .where(and(visible(input.boardId), gte(card.dueAt, from), lt(card.dueAt, to)))
    .orderBy(asc(card.dueAt), asc(card.position))
    .all()

  const labelsOf = new Map<string, CardLabel[]>()
  if (rows.length > 0) {
    const labels = db
      .select({ cardId: cardLabel.cardId, id: label.id, color: label.color, name: label.name })
      .from(cardLabel)
      .innerJoin(label, eq(cardLabel.labelId, label.id))
      .where(
        inArray(
          cardLabel.cardId,
          rows.map((r) => r.id)
        )
      )
      .orderBy(asc(label.position))
      .all()
    for (const { cardId, ...rest } of labels) {
      labelsOf.set(cardId, [...(labelsOf.get(cardId) ?? []), rest])
    }
  }

  const tasks = db
    .select({
      id: checklistItem.id,
      cardId: card.id,
      boardId: board.id,
      boardTitle: board.title,
      cardTitle: card.title,
      text: checklistItem.text,
      dueDate: checklistItem.dueDate,
      isDone: checklistItem.isDone
    })
    .from(checklistItem)
    .innerJoin(checklist, eq(checklistItem.checklistId, checklist.id))
    .innerJoin(card, eq(checklist.cardId, card.id))
    .innerJoin(list, eq(card.listId, list.id))
    .innerJoin(board, eq(list.boardId, board.id))
    .where(
      and(
        visible(input.boardId),
        eq(checklistItem.showInCalendar, true),
        gte(checklistItem.dueDate, from),
        lt(checklistItem.dueDate, to)
      )
    )
    .orderBy(asc(checklistItem.dueDate), asc(checklist.position), asc(checklistItem.position))
    .all()

  return {
    cards: rows.map(({ isDoneList, recurrenceId, dueAt, ...row }) => ({
      ...row,
      dueAt: dueAt!,
      finished: isFinished(row.isDone, { isDoneList }),
      recurring: recurrenceId !== null,
      labels: labelsOf.get(row.id) ?? []
    })),
    tasks: tasks.map(({ dueDate, ...task }) => ({ ...task, dueDate: dueDate! }))
  }
}

// CAL-12: cria o card com a data de entrega no dia, sem hora, na primeira lista do quadro que não
// é de conclusão. Quadro fechado ou sem uma lista assim é recusado.
export function addCard(db: Db, input: CalendarAddCardInput, now: number): CardSummary {
  const found = db
    .select({ closedAt: board.closedAt })
    .from(board)
    .where(eq(board.id, input.boardId))
    .get()
  if (!found) throw new AppError('NOT_FOUND', 'Quadro não encontrado.')
  if (found.closedAt !== null) throw new AppError('CONFLICT', 'O quadro está fechado.')
  const target = addTarget(activeLists(db, input.boardId))
  if (!target) {
    throw new AppError('CONFLICT', 'O quadro não tem uma lista que não seja de conclusão.')
  }
  return create(db, target.id, input.title, now, input.day)
}
