// Contratos de cards: o que entra (schemas Zod, validados no main) e o que sai (tipos).
import { z } from 'zod'
import { CARD_TITLE_MAX } from '../limits'

const id = z.uuid()
const cardTitle = z.string().trim().min(1).max(CARD_TITLE_MAX)

export const cardIdInput = z.object({ cardId: id })
export const createCardInput = z.object({ listId: id, title: cardTitle })
// index: a posição entre os cards visíveis da lista de destino, sem contar o próprio card.
export const moveCardInput = z.object({ cardId: id, listId: id, index: z.int().min(0) })

export type CardIdInput = z.infer<typeof cardIdInput>
export type CreateCardInput = z.infer<typeof createCardInput>
export type MoveCardInput = z.infer<typeof moveCardInput>

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
  dueAt: string | null
  labels: CardLabel[]
  hasDescription: boolean
  hasNote: boolean
  attachmentCount: number
  checkDone: number
  checkTotal: number
}

// O card aberto no modal. Cresce nas etapas 4 e 5.
export interface CardDetail {
  id: string
  boardId: string
  listId: string
  listTitle: string
  isDoneList: boolean
  title: string
  isDone: boolean
}
