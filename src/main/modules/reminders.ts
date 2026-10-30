// Lembretes (LEM): os que venceram, cada um uma vez só (reminder_fired_at), e os perdidos com o
// app fechado. Quem mostra a notificação é o agendador (src/main/scheduler.ts).
import { and, eq, inArray, isNotNull, isNull, ne } from 'drizzle-orm'
import type { MissedReminder } from '../../shared/ipc/recurrence'
import { isOverdue } from '../../shared/rules/dates'
import { isFinished } from '../../shared/rules/finished'
import { MISSED_WINDOW_MS, reminderAt } from '../../shared/rules/reminders'
import type { Db } from '../db/client'
import { board, card, list } from '../db/schema'

// Os lembretes que venceram até agora e ainda não dispararam, do mais antigo para o mais novo.
// LEM-05: não dispara para card finalizado, arquivado, modelo, de lista arquivada ou de quadro
// fechado. O finalizado continua pendente: se voltar a ficar em aberto, o lembrete ainda vale.
// Todos os devolvidos ficam marcados como disparados; os que venceram há mais de 7 dias são
// descartados sem aviso (LEM-06).
export function takeDue(db: Db, now: number): MissedReminder[] {
  const rows = db
    .select({
      cardId: card.id,
      boardId: board.id,
      title: card.title,
      boardTitle: board.title,
      dueAt: card.dueAt,
      reminder: card.reminder,
      isDone: card.isDone,
      isDoneList: list.isDoneList
    })
    .from(card)
    .innerJoin(list, eq(card.listId, list.id))
    .innerJoin(board, eq(list.boardId, board.id))
    .where(
      and(
        ne(card.reminder, 'none'),
        isNotNull(card.dueAt),
        isNull(card.reminderFiredAt),
        isNull(card.archivedAt),
        eq(card.isTemplate, false),
        isNull(list.archivedAt),
        isNull(board.closedAt),
        eq(board.isTemplate, false)
      )
    )
    .all()

  const due = rows
    .map((row) => ({ ...row, at: reminderAt(row.dueAt, row.reminder) }))
    .filter((row) => row.at !== null && row.at <= now && !isFinished(row.isDone, row))
    .sort((a, b) => a.at! - b.at!)
  if (due.length === 0) return []
  db.update(card)
    .set({ reminderFiredAt: now })
    .where(
      inArray(
        card.id,
        due.map((row) => row.cardId)
      )
    )
    .run()
  return due
    .filter((row) => row.at! >= now - MISSED_WINDOW_MS)
    .map((row) => ({
      cardId: row.cardId,
      boardId: row.boardId,
      title: row.title,
      boardTitle: row.boardTitle,
      dueAt: row.dueAt!,
      overdue: isOverdue(row.dueAt!, false, now)
    }))
}
