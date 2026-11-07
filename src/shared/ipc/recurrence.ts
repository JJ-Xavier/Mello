// Contratos da repetição e dos lembretes: o que entra (schemas Zod, validados no main) e o que sai
// (tipos).
import { z } from 'zod'
import { isDay, parseTimeInput } from '../rules/dates'
import { ENDS, FREQUENCIES, type RecurrenceRule } from '../rules/recurrence'

const id = z.uuid()

// O que o diálogo "Repetir card" salva (Repeticao.dc.html). A data-base do "a cada N dias" é o dia
// em que a regra é salva, e quem decide é o main.
export const recurrenceRuleInput = z
  .object({
    freq: z.enum(FREQUENCIES),
    weekdays: z.int().min(0).max(127),
    monthDay: z.int().min(1).max(31).nullable(),
    intervalDays: z.int().min(1).max(365).nullable(),
    time: z.string().refine((t) => parseTimeInput(t) === t, 'Horário inválido.'),
    targetListId: id,
    copyLabelsPriority: z.boolean(),
    copyDescription: z.boolean(),
    copyChecklist: z.boolean(),
    copyDueDate: z.boolean(),
    ifPreviousOpen: z.enum(['skip', 'create']),
    endsKind: z.enum(ENDS),
    endsOn: z.string().refine(isDay, 'Data inválida.').nullable(),
    endsAfter: z.int().min(1).max(999).nullable()
  })
  .superRefine((rule, ctx) => {
    const need = (ok: boolean, path: string, message: string) => {
      if (!ok) ctx.addIssue({ code: 'custom', path: [path], message })
    }
    // REP-01
    if (rule.freq === 'weekly') need(rule.weekdays > 0, 'weekdays', 'Escolha pelo menos um dia.')
    if (rule.freq === 'monthly') need(rule.monthDay !== null, 'monthDay', 'Escolha o dia.')
    if (rule.freq === 'every_n') need(rule.intervalDays !== null, 'intervalDays', 'Escolha N.')
    // REP-06
    if (rule.endsKind === 'on_date') need(rule.endsOn !== null, 'endsOn', 'Escolha a data.')
    if (rule.endsKind === 'after_count') {
      need(rule.endsAfter !== null, 'endsAfter', 'Escolha quantas vezes.')
    }
  })

export const saveRecurrenceInput = z.object({ cardId: id, rule: recurrenceRuleInput })
export const occurrenceIdInput = z.object({ occurrenceId: id })

export type RecurrenceRuleInput = z.infer<typeof recurrenceRuleInput>
export type SaveRecurrenceInput = z.infer<typeof saveRecurrenceInput>
export type OccurrenceIdInput = z.infer<typeof occurrenceIdInput>

// A repetição do card aberto no modal. targetListId null: a lista de destino foi excluída e a
// repetição está pausada (REP-16), assim como com a lista arquivada (paused).
export interface CardRecurrence extends RecurrenceRule {
  id: string
  targetListId: string | null
  copyLabelsPriority: boolean
  copyDescription: boolean
  copyChecklist: boolean
  copyDueDate: boolean
  ifPreviousOpen: 'skip' | 'create'
  dueCount: number
  paused: boolean
  // A próxima ocorrência, ou null quando a repetição terminou (REP-06).
  next: string | null
}

// REP-08: o aviso de repetição pulada dentro do card, com a próxima ocorrência.
export interface SkipNotice {
  occurrenceId: string
  occurrence: string
  next: string | null
}

// LEM-06: um lembrete que venceu com o app fechado.
export interface MissedReminder {
  cardId: string
  boardId: string
  title: string
  boardTitle: string
  dueAt: string
  // A entrega já passou e o card não está finalizado (o texto fica vermelho).
  overdue: boolean
}

// Avisos do main para a tela (eventos, sem resposta).
export interface OpenCardEvent {
  cardId: string
  boardId: string
}
