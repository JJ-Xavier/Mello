// Contratos dos modelos (MOD): o que entra (schemas Zod, validados no main) e o que sai.
import { z } from 'zod'
import { createBoardInput, type BoardSummary } from './boards'

const id = z.uuid()

// MOD-01 e MOD-04: "Transformar em modelo" e "Deixar de ser modelo".
export const setTemplateCardInput = z.object({ cardId: id, isTemplate: z.boolean() })
export const setTemplateBoardInput = z.object({ boardId: id, isTemplate: z.boolean() })
// MOD-03: a cópia vai para o fim da lista, que precisa ser do quadro do modelo.
export const createCardFromTemplateInput = z.object({ templateId: id, listId: id })
// MOD-05: keepCards é o "Manter os cards do modelo".
export const createBoardFromTemplateInput = createBoardInput.extend({
  templateId: id,
  keepCards: z.boolean()
})

export type SetTemplateCardInput = z.infer<typeof setTemplateCardInput>
export type SetTemplateBoardInput = z.infer<typeof setTemplateBoardInput>
export type CreateCardFromTemplateInput = z.infer<typeof createCardFromTemplateInput>
export type CreateBoardFromTemplateInput = z.infer<typeof createBoardFromTemplateInput>

// Quadro-modelo da seção "Modelos" do Início, com o que o diálogo mostra (listas e cards ativos).
export interface BoardTemplate extends BoardSummary {
  listCount: number
  labelCount: number
  cardCount: number
}
