// Repetição (REP): a regra da série de um card, o agendador que cria os cards (PLANO.md, seção 6.4)
// e o aviso de repetição pulada. As contas de data ficam em shared/rules/recurrence.ts.
//
// Uma série é a regra (tabela recurrence) mais os cards com recurrence_id apontando para ela: o
// card em que a repetição foi configurada e os criados por ela. Cada ocorrência que venceu fica
// registrada em recurrence_occurrence (criada, pulada, perdida ou criada mesmo assim), com a
// restrição UNIQUE que impede processar a mesma duas vezes.
import { randomUUID } from 'node:crypto'
import { and, asc, desc, eq, gte, inArray, isNull, lt, min, sql } from 'drizzle-orm'
import type { CalendarRepeat } from '../../shared/ipc/calendar'
import type { CardRecurrence, RecurrenceRuleInput, SkipNotice } from '../../shared/ipc/recurrence'
import { AppError } from '../../shared/result'
import { dayOf } from '../../shared/rules/dates'
import { isFinished } from '../../shared/rules/finished'
import {
  nextOccurrences,
  occurrencesBetween,
  stampOf,
  type RecurrenceRule
} from '../../shared/rules/recurrence'
import type { Db, DbOrTx, Tx } from '../db/client'
import {
  board,
  card,
  cardLabel,
  checklist,
  checklistItem,
  label,
  list,
  recurrence,
  recurrenceOccurrence
} from '../db/schema'
import { addActivity, touch } from './activity'
import { mapLabelsToBoard } from './labels'
import { keyBetween } from './position'

type RecurrenceRow = typeof recurrence.$inferSelect

function ruleOf(row: RecurrenceRow): RecurrenceRule {
  return {
    freq: row.freq,
    weekdays: row.weekdays,
    monthDay: row.monthDay,
    intervalDays: row.intervalDays,
    anchorDate: row.anchorDate,
    time: row.time,
    endsKind: row.endsKind,
    endsOn: row.endsOn,
    endsAfter: row.endsAfter
  }
}

// REP-16: pausada quando a lista de destino foi excluída (NULL) ou arquivada, ou o quadro está
// fechado. Pausada, não processa nada; ao voltar, vale a REP-10 para o período parado.
function isPaused(db: DbOrTx, row: RecurrenceRow): boolean {
  if (row.targetListId === null) return true
  const target = db
    .select({ archivedAt: list.archivedAt, closedAt: board.closedAt })
    .from(list)
    .innerJoin(board, eq(list.boardId, board.id))
    .where(eq(list.id, row.targetListId))
    .get()
  return !target || target.archivedAt !== null || target.closedAt !== null
}

// A próxima ocorrência depois da última processada (o agendador roda a cada minuto, então é a
// próxima a partir de agora), ou null quando a repetição terminou (REP-06).
function nextOf(row: RecurrenceRow): string | null {
  const after = row.lastProcessed ?? `${row.anchorDate}T00:00`
  return nextOccurrences(ruleOf(row), row.dueCount, after, 1)[0] ?? null
}

// O estado das séries para a face do card (REP-13, FLT-03): ativa (não terminou; pausada também
// conta) e a próxima ocorrência (null se pausada).
export function seriesState(
  db: DbOrTx,
  recurrenceIds: string[]
): Map<string, { recurring: boolean; next: string | null }> {
  const state = new Map<string, { recurring: boolean; next: string | null }>()
  if (recurrenceIds.length === 0) return state
  const rows = db
    .select()
    .from(recurrence)
    .where(inArray(recurrence.id, [...new Set(recurrenceIds)]))
    .all()
  for (const row of rows) {
    const paused = isPaused(db, row)
    const next = nextOf(row)
    state.set(row.id, { recurring: paused || next !== null, next: paused ? null : next })
  }
  return state
}

// O card mais recente da série: com os arquivados, é a origem da cópia (REP-05); sem eles, é o
// "anterior" da REP-07.
function latestCard(tx: DbOrTx, recurrenceId: string, withArchived: boolean) {
  return tx
    .select({
      id: card.id,
      title: card.title,
      isDone: card.isDone,
      isDoneList: list.isDoneList,
      boardId: list.boardId,
      priority: card.priority,
      reminder: card.reminder,
      descriptionHtml: card.descriptionHtml,
      descriptionText: card.descriptionText
    })
    .from(card)
    .innerJoin(list, eq(card.listId, list.id))
    .where(
      and(
        eq(card.recurrenceId, recurrenceId),
        withArchived ? undefined : and(isNull(card.archivedAt), isNull(list.archivedAt))
      )
    )
    .orderBy(desc(card.createdAt), desc(sql`${card}.rowid`))
    .get()
}

// O card de uma ocorrência (REP-04): sempre o título; etiquetas e prioridade, descrição,
// checklists (desmarcados e sem data) e a data de entrega (dia da ocorrência e horário da regra,
// com o lembrete da origem) conforme a regra. Nunca nota, anexos, capa nem atividade. Nasce no
// topo da lista de destino, com nível 0 e sem ✓ (REP-03, REP-12). Sem nenhum card na série para
// copiar, devolve null.
function createFromSeries(tx: Tx, row: RecurrenceRow, occurrence: string, now: number) {
  const source = latestCard(tx, row.id, true)
  const listId = row.targetListId
  if (!source || !listId) return null
  const first =
    tx
      .select({ first: min(card.position) })
      .from(card)
      .where(eq(card.listId, listId))
      .get()?.first ?? null
  const id = randomUUID()
  tx.insert(card)
    .values({
      id,
      listId,
      title: source.title,
      position: keyBetween(null, first),
      descriptionHtml: row.copyDescription ? source.descriptionHtml : '',
      descriptionText: row.copyDescription ? source.descriptionText : '',
      priority: row.copyLabelsPriority ? source.priority : null,
      dueAt: row.copyDueDate ? `${occurrence.slice(0, 10)}T${row.time}` : null,
      reminder: row.copyDueDate ? source.reminder : 'none',
      recurrenceId: row.id,
      occurrenceDate: occurrence,
      lastActivityAt: now,
      createdAt: now,
      updatedAt: now
    })
    .run()

  if (row.copyLabelsPriority) {
    const used = tx
      .select({ labelId: cardLabel.labelId })
      .from(cardLabel)
      .where(eq(cardLabel.cardId, source.id))
      .all()
      .map((u) => u.labelId)
    // A origem pode ter ido para outro quadro: as etiquetas são recriadas no da repetição.
    const map = source.boardId === row.boardId ? null : mapLabelsToBoard(tx, used, row.boardId)
    for (const labelId of used) {
      tx.insert(cardLabel)
        .values({ cardId: id, labelId: map?.get(labelId) ?? labelId })
        .onConflictDoNothing()
        .run()
    }
  }

  if (row.copyChecklist) {
    const lists = tx
      .select()
      .from(checklist)
      .where(eq(checklist.cardId, source.id))
      .orderBy(asc(checklist.position))
      .all()
    for (const item of lists) {
      const checklistId = randomUUID()
      tx.insert(checklist)
        .values({ ...item, id: checklistId, cardId: id })
        .run()
      const items = tx
        .select()
        .from(checklistItem)
        .where(eq(checklistItem.checklistId, item.id))
        .all()
      for (const task of items) {
        tx.insert(checklistItem)
          .values({
            ...task,
            id: randomUUID(),
            checklistId,
            isDone: false,
            dueDate: null,
            createdAt: now,
            updatedAt: now
          })
          .run()
      }
    }
  }

  addActivity(tx, id, 'from_recurrence', { date: occurrence }, now)
  return id
}

// Salvar no diálogo "Repetir card": cria a repetição da série ou altera a que existe. Vale a
// partir de agora: o "a cada N dias" conta do dia de hoje e nada do passado é processado.
// Configurar a repetição zera o envelhecimento do card (ENV-05).
export function save(db: Db, cardId: string, input: RecurrenceRuleInput, now: number): void {
  db.transaction((tx) => {
    const found = tx
      .select({ recurrenceId: card.recurrenceId, boardId: list.boardId })
      .from(card)
      .innerJoin(list, eq(card.listId, list.id))
      .where(eq(card.id, cardId))
      .get()
    if (!found) throw new AppError('NOT_FOUND', 'Card não encontrado.')
    const target = tx.select().from(list).where(eq(list.id, input.targetListId)).get()
    if (!target || target.boardId !== found.boardId || target.archivedAt !== null) {
      throw new AppError('CONFLICT', 'A lista de destino precisa ser uma lista ativa do quadro.')
    }
    const values = {
      freq: input.freq,
      weekdays: input.freq === 'weekly' ? input.weekdays : 0,
      monthDay: input.freq === 'monthly' ? input.monthDay : null,
      intervalDays: input.freq === 'every_n' ? input.intervalDays : null,
      anchorDate: dayOf(now),
      time: input.time,
      targetListId: input.targetListId,
      copyLabelsPriority: input.copyLabelsPriority,
      copyDescription: input.copyDescription,
      copyChecklist: input.copyChecklist,
      copyDueDate: input.copyDueDate,
      ifPreviousOpen: input.ifPreviousOpen,
      endsKind: input.endsKind,
      endsOn: input.endsKind === 'on_date' ? input.endsOn : null,
      endsAfter: input.endsKind === 'after_count' ? input.endsAfter : null,
      lastProcessed: stampOf(now),
      updatedAt: now
    }
    if (found.recurrenceId !== null) {
      tx.update(recurrence).set(values).where(eq(recurrence.id, found.recurrenceId)).run()
    } else {
      const id = randomUUID()
      tx.insert(recurrence)
        .values({ ...values, id, boardId: found.boardId, dueCount: 0, createdAt: now })
        .run()
      tx.update(card).set({ recurrenceId: id }).where(eq(card.id, cardId)).run()
    }
    touch(tx, cardId, now)
  })
}

// REP-15: "Remover repetição". Os cards já criados ficam, sem o ↻; as ocorrências registradas
// saem junto (ON DELETE CASCADE). Zera o envelhecimento do card (ENV-05).
export function remove(db: Db, cardId: string, now: number): void {
  db.transaction((tx) => {
    const found = tx
      .select({ recurrenceId: card.recurrenceId })
      .from(card)
      .where(eq(card.id, cardId))
      .get()
    if (!found) throw new AppError('NOT_FOUND', 'Card não encontrado.')
    if (found.recurrenceId === null) return
    tx.delete(recurrence).where(eq(recurrence.id, found.recurrenceId)).run()
    touch(tx, cardId, now)
  })
}

// A repetição do card aberto no modal e o aviso de repetição pulada dele (REP-08).
export function forCard(
  db: DbOrTx,
  cardId: string,
  recurrenceId: string | null
): { recurrence: CardRecurrence | null; skipNotice: SkipNotice | null } {
  const row =
    recurrenceId === null
      ? undefined
      : db.select().from(recurrence).where(eq(recurrence.id, recurrenceId)).get()
  const next = row ? nextOf(row) : null
  const notice = db
    .select({ id: recurrenceOccurrence.id, occurrence: recurrenceOccurrence.occurrenceDate })
    .from(recurrenceOccurrence)
    .where(
      and(
        eq(recurrenceOccurrence.noticeCardId, cardId),
        eq(recurrenceOccurrence.status, 'skipped'),
        isNull(recurrenceOccurrence.dismissedAt)
      )
    )
    .orderBy(desc(recurrenceOccurrence.occurrenceDate))
    .get()
  return {
    recurrence: row
      ? {
          ...ruleOf(row),
          id: row.id,
          targetListId: row.targetListId,
          copyLabelsPriority: row.copyLabelsPriority,
          copyDescription: row.copyDescription,
          copyChecklist: row.copyChecklist,
          copyDueDate: row.copyDueDate,
          ifPreviousOpen: row.ifPreviousOpen,
          dueCount: row.dueCount,
          paused: isPaused(db, row),
          next
        }
      : null,
    skipNotice: notice ? { occurrenceId: notice.id, occurrence: notice.occurrence, next } : null
  }
}

// Uma rodada do agendador (REP-11; PLANO.md, seção 6.4), para cada repetição que não está pausada:
// - das ocorrências que venceram desde a última rodada, só a mais recente é processada; as
//   anteriores ficam como "não criada: app fechado" (REP-10);
// - se o anterior (REP-07) não está finalizado e a regra é "Pular e avisar", a ocorrência fica
//   pulada e o aviso aparece no anterior (REP-08); senão, o card novo é criado (REP-04, REP-12);
// - todas as que venceram contam para o "depois de N vezes" (REP-06).
// Cada repetição numa transação. Devolve se alguma coisa mudou (para avisar a tela).
export function processDue(db: Db, now: number): boolean {
  const stamp = stampOf(now)
  let changed = false
  for (const row of db.select().from(recurrence).all()) {
    if (isPaused(db, row)) continue
    const due = occurrencesBetween(ruleOf(row), row.dueCount, row.lastProcessed ?? stamp, stamp)
    if (due.length === 0) continue
    db.transaction((tx) => {
      const occurrence = (date: string, status: 'missed' | 'skipped' | 'created') => ({
        id: randomUUID(),
        recurrenceId: row.id,
        occurrenceDate: date,
        status,
        createdAt: now
      })
      const previous = latestCard(tx, row.id, false)
      const missed = due.slice(0, -1)
      for (const date of missed) {
        tx.insert(recurrenceOccurrence)
          .values(occurrence(date, 'missed'))
          .onConflictDoNothing()
          .run()
      }
      if (missed.length > 0 && previous) {
        addActivity(
          tx,
          previous.id,
          'recurrence_missed',
          { from: missed[0], to: missed.at(-1), count: missed.length },
          now
        )
      }
      const last = due.at(-1)!
      const open = previous && !isFinished(previous.isDone, previous)
      if (open && row.ifPreviousOpen === 'skip') {
        // Só o aviso mais recente fica no card.
        tx.update(recurrenceOccurrence)
          .set({ dismissedAt: now })
          .where(
            and(
              eq(recurrenceOccurrence.noticeCardId, previous.id),
              isNull(recurrenceOccurrence.dismissedAt)
            )
          )
          .run()
        tx.insert(recurrenceOccurrence)
          .values({ ...occurrence(last, 'skipped'), noticeCardId: previous.id })
          .onConflictDoNothing()
          .run()
        addActivity(tx, previous.id, 'recurrence_skipped', { date: last }, now)
      } else {
        const created = createFromSeries(tx, row, last, now)
        if (created === null) {
          // Nenhum card sobrou na série: não há o que copiar, e a repetição sai.
          tx.delete(recurrence).where(eq(recurrence.id, row.id)).run()
          return
        }
        tx.insert(recurrenceOccurrence)
          .values({ ...occurrence(last, 'created'), cardId: created })
          .onConflictDoNothing()
          .run()
      }
      tx.update(recurrence)
        .set({ dueCount: row.dueCount + due.length, lastProcessed: last, updatedAt: now })
        .where(eq(recurrence.id, row.id))
        .run()
    })
    changed = true
  }
  return changed
}

// REP-14: as repetições do mês que não viraram card, para o calendário: as próximas (de repetição
// que não está pausada), as puladas e as não criadas com o app fechado. Cada uma com o título, as
// etiquetas (se a regra copia) e a prioridade do card mais recente da série, que é o que abre.
// Ficam de fora as de quadro fechado e de quadro-modelo, como os cards (CAL-06).
export function calendarRepeats(
  db: DbOrTx,
  range: { from: string; to: string; boardId: string | null }
): CalendarRepeat[] {
  const rows = db
    .select({ row: recurrence, boardTitle: board.title })
    .from(recurrence)
    .innerJoin(board, eq(recurrence.boardId, board.id))
    .where(
      and(
        isNull(board.closedAt),
        eq(board.isTemplate, false),
        range.boardId === null ? undefined : eq(board.id, range.boardId)
      )
    )
    .all()
  const repeats: CalendarRepeat[] = []
  // O mês acaba às 23:59 do dia anterior ao "to".
  const [y = 0, m = 1] = range.to.split('-').map(Number)
  const until = `${dayOf(new Date(y, m - 1, 0).getTime())}T23:59`
  for (const { row, boardTitle } of rows) {
    const source = latestCard(db, row.id, true)
    if (!source) continue
    const labels = row.copyLabelsPriority
      ? db
          .select({ id: label.id, color: label.color, name: label.name })
          .from(cardLabel)
          .innerJoin(label, eq(cardLabel.labelId, label.id))
          .where(eq(cardLabel.cardId, source.id))
          .orderBy(asc(label.position))
          .all()
      : []
    const ghost = (kind: CalendarRepeat['kind'], occurrence: string): CalendarRepeat => ({
      id: `${kind}-${row.id}-${occurrence}`,
      kind,
      occurrence,
      cardId: source.id,
      boardId: row.boardId,
      boardTitle,
      title: source.title,
      priority: row.copyLabelsPriority ? source.priority : null,
      labels
    })
    if (!isPaused(db, row) && row.lastProcessed !== null) {
      const next = occurrencesBetween(ruleOf(row), row.dueCount, row.lastProcessed, until)
      for (const occurrence of next) {
        if (occurrence >= range.from) repeats.push(ghost('next', occurrence))
      }
    }
    const past = db
      .select({
        status: recurrenceOccurrence.status,
        occurrence: recurrenceOccurrence.occurrenceDate
      })
      .from(recurrenceOccurrence)
      .where(
        and(
          eq(recurrenceOccurrence.recurrenceId, row.id),
          inArray(recurrenceOccurrence.status, ['skipped', 'missed']),
          gte(recurrenceOccurrence.occurrenceDate, range.from),
          lt(recurrenceOccurrence.occurrenceDate, range.to)
        )
      )
      .all()
    for (const { status, occurrence } of past) {
      repeats.push(ghost(status === 'skipped' ? 'skipped' : 'missed', occurrence))
    }
  }
  return repeats.sort((a, b) => a.occurrence.localeCompare(b.occurrence))
}

function requireSkipped(tx: DbOrTx, occurrenceId: string) {
  const found = tx
    .select()
    .from(recurrenceOccurrence)
    .where(eq(recurrenceOccurrence.id, occurrenceId))
    .get()
  if (!found) throw new AppError('NOT_FOUND', 'Repetição não encontrada.')
  if (found.status !== 'skipped') throw new AppError('CONFLICT', 'A repetição não está pulada.')
  return found
}

// REP-09: "Criar agora mesmo assim" cria o card daquela ocorrência e some com o aviso. Devolve o
// id do card criado.
export function createAnyway(db: Db, occurrenceId: string, now: number): string {
  return db.transaction((tx) => {
    const found = requireSkipped(tx, occurrenceId)
    const row = tx.select().from(recurrence).where(eq(recurrence.id, found.recurrenceId)).get()
    if (!row || isPaused(tx, row)) {
      throw new AppError('CONFLICT', 'A repetição está pausada: a lista de destino não está ativa.')
    }
    const created = createFromSeries(tx, row, found.occurrenceDate, now)
    if (created === null) throw new AppError('CONFLICT', 'Não há card na série para copiar.')
    tx.update(recurrenceOccurrence)
      .set({ status: 'created_anyway', cardId: created, dismissedAt: now })
      .where(eq(recurrenceOccurrence.id, occurrenceId))
      .run()
    return created
  })
}

// REP-09: "Dispensar" só some com o aviso; a ocorrência continua pulada.
export function dismiss(db: Db, occurrenceId: string, now: number): void {
  db.transaction((tx) => {
    const found = requireSkipped(tx, occurrenceId)
    if (found.dismissedAt !== null) return
    tx.update(recurrenceOccurrence)
      .set({ dismissedAt: now })
      .where(eq(recurrenceOccurrence.id, occurrenceId))
      .run()
  })
}
