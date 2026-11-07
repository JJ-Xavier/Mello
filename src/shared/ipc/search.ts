// Contratos da busca do topo (BUS): o que entra (schema Zod, validado no main) e o que sai.
import { z } from 'zod'
import { SEARCH_TEXT_MAX } from '../limits'
import type { BoardSummary } from './boards'

// BUS-01: a partir de 2 caracteres. BUS-03: até 8 resultados por grupo.
export const SEARCH_MIN = 2
export const SEARCH_GROUP_MAX = 8

export const searchInput = z.object({
  text: z.string().trim().min(SEARCH_MIN).max(SEARCH_TEXT_MAX)
})

export type SearchInput = z.infer<typeof searchInput>

// Card: título e "Quadro · Lista", com a cor da primeira etiqueta (null: sem etiqueta).
export interface SearchCard {
  id: string
  boardId: string
  title: string
  boardTitle: string
  listTitle: string
  color: string | null
}

// Tarefa (item de checklist): texto e "Card · data". Abre o modal do card.
export interface SearchTask {
  id: string
  cardId: string
  boardId: string
  text: string
  cardTitle: string
  dueDate: string | null
  isDone: boolean
}

export interface SearchResults {
  cards: SearchCard[]
  tasks: SearchTask[]
  boards: BoardSummary[]
}
