// Contratos de cards: o que entra (schemas Zod, validados no main) e o que sai (tipos).
import { z } from 'zod'
import { CARD_TITLE_MAX, FILTER_KEYWORD_MAX } from '../limits'
import { isDue } from '../rules/dates'
import type { Checklist } from './checklists'

const id = z.uuid()
export const cardTitle = z.string().trim().min(1).max(CARD_TITLE_MAX)
const index = z.int().min(0)

export const REMINDERS = ['none', 'at_time', 'day_before'] as const
export type Reminder = (typeof REMINDERS)[number]

export const cardIdInput = z.object({ cardId: id })
export const createCardInput = z.object({ listId: id, title: cardTitle })
// index: a posição entre os cards visíveis da lista de destino, sem contar o próprio card.
export const moveCardInput = z.object({ cardId: id, listId: id, index })
export const copyCardInput = z.object({ cardId: id, title: cardTitle, listId: id, index })

// Um campo por vez: o modal salva cada um quando você confirma.
// - priority: 1 a 5, ou null para "Sem prioridade" (PRI-01).
// - due: a data de entrega com o lembrete (DAT-01, LEM-01); dueAt null remove a data.
// - description: o documento do editor (NOT-07); o main limpa e gera o HTML.
export const updateCardInput = z.object({
  cardId: id,
  title: cardTitle.optional(),
  isDone: z.boolean().optional(),
  priority: z.int().min(1).max(5).nullable().optional(),
  due: z
    .object({
      dueAt: z.string().refine(isDue, 'Data inválida.').nullable(),
      reminder: z.enum(REMINDERS)
    })
    .optional(),
  description: z.unknown().optional()
})

export const setLabelsInput = z.object({ cardId: id, labelIds: z.array(id).max(100) })

// Filtro do quadro (FLT-01): os cards do quadro que têm a palavra-chave.
export const matchingInput = z.object({
  boardId: id,
  keyword: z.string().trim().min(1).max(FILTER_KEYWORD_MAX)
})

export type CardIdInput = z.infer<typeof cardIdInput>
export type CreateCardInput = z.infer<typeof createCardInput>
export type MoveCardInput = z.infer<typeof moveCardInput>
export type CopyCardInput = z.infer<typeof copyCardInput>
export type UpdateCardInput = z.infer<typeof updateCardInput>
export type SetLabelsInput = z.infer<typeof setLabelsInput>
export type MatchingInput = z.infer<typeof matchingInput>

export interface CardLabel {
  id: string
  color: string
  name: string | null
}

// O que a face do card mostra (CAR-04).
export interface CardSummary {
  id: string
  listId: string
  title: string
  position: string
  isDone: boolean
  priority: number | null
  dueAt: string | null
  // Faz parte de uma repetição (FLT-03; a repetição entra na etapa 8).
  recurring: boolean
  labels: CardLabel[]
  hasDescription: boolean
  hasNote: boolean
  attachmentCount: number
  checkDone: number
  checkTotal: number
}

// O card aberto no modal. A nota, a atividade, os anexos e a capa entram na etapa 5.
export interface CardDetail {
  id: string
  boardId: string
  listId: string
  listTitle: string
  isDoneList: boolean
  title: string
  isDone: boolean
  priority: number | null
  dueAt: string | null
  reminder: Reminder
  labelIds: string[]
  descriptionHtml: string
  lastActivityAt: number
  archivedAt: number | null
  checklists: Checklist[]
}
