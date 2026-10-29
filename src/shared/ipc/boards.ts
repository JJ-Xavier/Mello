// Contratos de quadros, listas e itens arquivados: o que entra (schemas Zod, validados no main)
// e o que sai (tipos). A tela importa só os tipos; os limites de tamanho ficam em shared/limits.ts.
import { z } from 'zod'
import { BOARD_TITLE_MAX, LIST_TITLE_MAX } from '../limits'
import { FILE_ID } from '../files'
import {
  BLUR_RANGE,
  BOARD_COLORS,
  BOARD_GRADIENTS,
  DIM_RANGE,
  ZOOM_RANGE,
  type BoardBackground
} from '../rules/background'
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

// FUN-02: a imagem escolhida ou solta no editor de fundo (a ficha de files:pick ou files:dropped).
// É guardada na hora, para a prévia; o quadro só muda no "Aplicar ao quadro" (FUN-07).
export const uploadBackgroundInput = z.object({ boardId: id, token: id })
const hex = z.string().regex(/^#[0-9a-f]{6}$/)
// FUN-01: as cores e os gradientes do protótipo, ou uma imagem já guardada, com os ajustes
// (FUN-03 a FUN-05) e a cor média calculada no envio (FUN-09).
export const setBackgroundInput = z.object({
  boardId: id,
  background: z.discriminatedUnion('kind', [
    z.object({
      kind: z.literal('color'),
      value: z.enum(BOARD_COLORS.map((color) => color.hex) as [string, ...string[]])
    }),
    z.object({
      kind: z.literal('gradient'),
      value: z.enum(BOARD_GRADIENTS.map((gradient) => gradient.id) as [string, ...string[]])
    }),
    z.object({
      kind: z.literal('image'),
      value: z.string().regex(FILE_ID),
      auto: z.boolean(),
      focus: z.int().min(0).max(8),
      zoom: z.int().min(ZOOM_RANGE.min).max(ZOOM_RANGE.max),
      dim: z.int().min(DIM_RANGE.min).max(DIM_RANGE.max),
      blur: z.int().min(BLUR_RANGE.min).max(BLUR_RANGE.max),
      avgColor: hex
    })
  ])
})

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
export type UploadBackgroundInput = z.infer<typeof uploadBackgroundInput>
export type SetBackgroundInput = z.infer<typeof setBackgroundInput>
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
  background: BoardBackground
}

// A imagem enviada no editor de fundo, já guardada (FUN-02). O nome só serve para o editor.
export interface BackgroundImage {
  fileId: string
  url: string
  width: number
  height: number
  name: string
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
