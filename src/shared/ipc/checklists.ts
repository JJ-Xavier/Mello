// Contratos de checklists e itens (CHK).
import { z } from 'zod'
import { CHECKLIST_TITLE_MAX, ITEM_TEXT_MAX } from '../limits'
import { isDay } from '../rules/dates'

const id = z.uuid()
const index = z.int().min(0)
const title = z.string().trim().min(1).max(CHECKLIST_TITLE_MAX)
const text = z.string().trim().min(1).max(ITEM_TEXT_MAX)

export const checklistIdInput = z.object({ checklistId: id })
export const createChecklistInput = z.object({ cardId: id, title })
export const updateChecklistInput = z.object({
  checklistId: id,
  title: title.optional(),
  hideChecked: z.boolean().optional()
})
export const moveChecklistInput = z.object({ checklistId: id, index })

export const itemIdInput = z.object({ itemId: id })
export const createItemInput = z.object({ checklistId: id, text })
// due: a data da tarefa (só o dia) e "Mostrar no calendário" (CHK-05); dueDate null remove a data.
export const updateItemInput = z.object({
  itemId: id,
  text: text.optional(),
  due: z
    .object({
      dueDate: z.string().refine(isDay, 'Data inválida.').nullable(),
      showInCalendar: z.boolean()
    })
    .optional()
})
export const toggleItemInput = z.object({ itemId: id, isDone: z.boolean() })
export const moveItemInput = z.object({ itemId: id, index })

export type ChecklistIdInput = z.infer<typeof checklistIdInput>
export type CreateChecklistInput = z.infer<typeof createChecklistInput>
export type UpdateChecklistInput = z.infer<typeof updateChecklistInput>
export type MoveChecklistInput = z.infer<typeof moveChecklistInput>
export type ItemIdInput = z.infer<typeof itemIdInput>
export type CreateItemInput = z.infer<typeof createItemInput>
export type UpdateItemInput = z.infer<typeof updateItemInput>
export type ToggleItemInput = z.infer<typeof toggleItemInput>
export type MoveItemInput = z.infer<typeof moveItemInput>

export interface ChecklistItem {
  id: string
  text: string
  isDone: boolean
  dueDate: string | null
  showInCalendar: boolean
}

export interface Checklist {
  id: string
  title: string
  hideChecked: boolean
  items: ChecklistItem[]
}
