// Contratos do calendário: o que entra (schemas Zod, validados no main) e o que sai (tipos).
import { z } from 'zod'
import { isDay } from '../rules/dates'
import { cardTitle, type CardLabel } from './cards'

const id = z.uuid()

// Um mês de um quadro, ou de todos os quadros (boardId null), CAL-02.
export const calendarMonthInput = z.object({
  year: z.int().min(1970).max(9999),
  month: z.int().min(1).max(12),
  boardId: id.nullable()
})

// CAL-12: "Adicionar" num dia. O main escolhe a lista.
export const calendarAddCardInput = z.object({
  boardId: id,
  day: z.string().refine(isDay, 'Data inválida.'),
  title: cardTitle
})

export type CalendarMonthInput = z.infer<typeof calendarMonthInput>
export type CalendarAddCardInput = z.infer<typeof calendarAddCardInput>

// Card no dia da data de entrega (CAL-05). finished segue a FIN-01 (riscado, CAL-07).
export interface CalendarCard {
  id: string
  boardId: string
  boardTitle: string
  title: string
  dueAt: string
  isDone: boolean
  finished: boolean
  priority: number | null
  recurring: boolean
  labels: CardLabel[]
}

// Item de checklist com data e "Mostrar no calendário" ligado (CAL-05).
export interface CalendarTask {
  id: string
  cardId: string
  boardId: string
  boardTitle: string
  cardTitle: string
  text: string
  dueDate: string
  isDone: boolean
}

// REP-14: ocorrência de repetição que não virou card, tracejada no calendário. "next": a próxima
// repetição; "skipped": pulada porque a anterior estava em aberto; "missed": não criada com o app
// fechado. O título, as etiquetas e a prioridade vêm do card mais recente da série (cardId), que
// é o que abre ao clicar.
export interface CalendarRepeat {
  id: string
  kind: 'next' | 'skipped' | 'missed'
  occurrence: string
  cardId: string
  boardId: string
  boardTitle: string
  title: string
  priority: number | null
  labels: CardLabel[]
}

export interface CalendarMonth {
  cards: CalendarCard[]
  tasks: CalendarTask[]
  repeats: CalendarRepeat[]
}
