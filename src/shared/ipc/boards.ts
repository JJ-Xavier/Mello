// Contratos de quadros, listas e itens arquivados: o que entra (schemas Zod, validados no main)
// e o que sai (tipos). A tela importa só os tipos; os limites de tamanho ficam em shared/limits.ts.
import { z } from 'zod'
import { BOARD_TITLE_MAX, LIST_TITLE_MAX } from '../limits'
import type { BackgroundKind } from '../rules/background'
import type { CardSummary } from './cards'

const id = z.uuid()
const boardTitle = z.string().trim().min(1).max(BOARD_TITLE_MAX)
const listTitle = z.string().trim().min(1).max(LIST_TITLE_MAX)
const index = z.int().min(0)

export const boardIdInput = z.object({ boardId: id })
export const createBoardInput = z.object({ title: boardTitle })
export const updateBoardInput = z.object({
  boardId: id,
  title: boardTitle.optional(),
  isFavorite: z.boolean().optional()
})
export const moveBoardInput = z.object({ boardId: id, index })

export const listIdInput = z.object({ listId: id })
export const createListInput = z.object({ boardId: id, title: listTitle })
export const updateListInput = z.object({
  listId: id,
  title: listTitle.optional(),
  freezesAging: z.boolean().optional(),
  isDoneList: z.boolean().optional()
})
export const moveListInput = z.object({ listId: id, index })
export const moveListToBoardInput = z.object({ listId: id, boardId: id, index })
// LIS-08: ordenar uma vez por prioridade (PRI-05) ou por data de entrega (DAT-04).
export const sortListInput = z.object({ listId: id, by: z.enum(['priority', 'due']) })

export type BoardIdInput = z.infer<typeof boardIdInput>
export type CreateBoardInput = z.infer<typeof createBoardInput>
export type UpdateBoardInput = z.infer<typeof updateBoardInput>
export type MoveBoardInput = z.infer<typeof moveBoardInput>
export type ListIdInput = z.infer<typeof listIdInput>
export type CreateListInput = z.infer<typeof createListInput>
export type UpdateListInput = z.infer<typeof updateListInput>
export type MoveListInput = z.infer<typeof moveListInput>
export type MoveListToBoardInput = z.infer<typeof moveListToBoardInput>
export type SortListInput = z.infer<typeof sortListInput>

export interface BoardSummary {
  id: string
  title: string
  position: string
  isFavorite: boolean
  closedAt: number | null
  bgKind: BackgroundKind
  bgValue: string
}

export interface ListSummary {
  id: string
  boardId: string
  title: string
  position: string
  freezesAging: boolean
  isDoneList: boolean
  cardCount: number
}

// Lista na tela do quadro, com os cards ativos em ordem.
export interface ListDetail extends ListSummary {
  cards: CardSummary[]
}

export interface BoardDetail extends BoardSummary {
  bgTone: string
  lists: ListDetail[]
}

export interface ArchivedCard {
  id: string
  title: string
  listTitle: string
  archivedAt: number
}

export interface ArchivedList {
  id: string
  title: string
  archivedAt: number
}

export interface ArchivedItems {
  cards: ArchivedCard[]
  lists: ArchivedList[]
}
