// Contratos de etiquetas (ETQ). A cor vem da paleta do protótipo; o nome é opcional.
import { z } from 'zod'
import { LABEL_NAME_MAX } from '../limits'
import { LABEL_COLORS } from '../rules/color'

const id = z.uuid()
// Nome vazio = etiqueta sem nome (ETQ-01).
const name = z
  .string()
  .trim()
  .max(LABEL_NAME_MAX)
  .transform((value) => value || null)
const color = z.enum(LABEL_COLORS.map((c) => c.value) as [string, ...string[]])

export const labelIdInput = z.object({ labelId: id })
export const createLabelInput = z.object({ boardId: id, name, color })
export const updateLabelInput = z.object({
  labelId: id,
  name: name.optional(),
  color: color.optional()
})

export type LabelIdInput = z.infer<typeof labelIdInput>
export type CreateLabelInput = z.input<typeof createLabelInput>
export type UpdateLabelInput = z.input<typeof updateLabelInput>

export interface Label {
  id: string
  boardId: string
  name: string | null
  color: string
}
