// Contratos de cards: o que entra (schemas Zod, validados no main) e o que sai (tipos).
import { z } from 'zod'
import { FILE_ID } from '../files'
import { CARD_TITLE_MAX, FILTER_KEYWORD_MAX } from '../limits'
import { LABEL_COLORS } from '../rules/color'
import { isDue } from '../rules/dates'
import type { Checklist } from './checklists'
import type { Attachment } from './files'
import type { CardRecurrence, SkipNotice } from './recurrence'

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
// - description e note: o documento do editor (NOT-07, NOT-03); o main limpa e gera o HTML.
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
  description: z.unknown().optional(),
  note: z.unknown().optional()
})

export const setLabelsInput = z.object({ cardId: id, labelIds: z.array(id).max(100) })

// Capa (CAP-01): uma cor da paleta das etiquetas, uma imagem anexada ao card ou nenhuma (null).
// A imagem enviada na hora tem canal próprio (cards:uploadCover, em files.ts).
export const setCoverInput = z.object({
  cardId: id,
  cover: z
    .discriminatedUnion('kind', [
      z.object({
        kind: z.literal('color'),
        color: z.enum(LABEL_COLORS.map((c) => c.value) as [string, ...string[]])
      }),
      z.object({ kind: z.literal('image'), fileId: z.string().regex(FILE_ID) })
    ])
    .nullable()
})

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
export type SetCoverInput = z.infer<typeof setCoverInput>
export type MatchingInput = z.infer<typeof matchingInput>

export interface CardLabel {
  id: string
  color: string
  name: string | null
}

// A capa como a tela mostra (CAP-02). A imagem traz o tamanho, para a face reservar a altura certa
// antes de a imagem carregar.
export type CardCover =
  | { kind: 'color'; color: string }
  | { kind: 'image'; fileId: string; url: string; width: number | null; height: number | null }

// Registros da atividade (ATV-02). O que vai em data está no Modelo-de-Dados.txt.
export type ActivityKind =
  | 'created'
  | 'moved'
  | 'done'
  | 'undone'
  | 'archived'
  | 'restored'
  | 'copied'
  | 'from_template'
  | 'from_recurrence'
  | 'recurrence_skipped'
  | 'recurrence_missed'

export interface ActivityEntry {
  id: string
  kind: ActivityKind
  data: Record<string, unknown>
  createdAt: number
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
  // Faz parte de uma repetição ativa, que não terminou (FLT-03, REP-13). Pausada também conta.
  recurring: boolean
  // A próxima ocorrência da repetição ("AAAA-MM-DDTHH:mm"), para o ↻ da face (REP-13). null: sem
  // repetição, ou pausada (REP-16).
  nextRepeat: string | null
  cover: CardCover | null
  labels: CardLabel[]
  hasDescription: boolean
  hasNote: boolean
  attachmentCount: number
  checkDone: number
  checkTotal: number
  // Base do envelhecimento (ENV-01); a tela calcula o nível.
  lastActivityAt: number
  isTemplate: boolean
}

// O card aberto no modal: os dados (etapa 4), a nota, a atividade (do mais recente para o mais
// antigo), os anexos (do mais recente para o mais antigo) e a capa (etapa 5).
export interface CardDetail {
  id: string
  boardId: string
  listId: string
  listTitle: string
  isDoneList: boolean
  // A lista tem "Não envelhece" (ENV-03), para o indicador do modal (ENV-08).
  listFreezesAging: boolean
  isTemplate: boolean
  title: string
  isDone: boolean
  priority: number | null
  dueAt: string | null
  reminder: Reminder
  labelIds: string[]
  descriptionHtml: string
  noteHtml: string
  cover: CardCover | null
  lastActivityAt: number
  archivedAt: number | null
  checklists: Checklist[]
  attachments: Attachment[]
  activity: ActivityEntry[]
  // A repetição da série do card (etapa 8) e o aviso de repetição pulada (REP-08).
  recurrence: CardRecurrence | null
  skipNotice: SkipNotice | null
}
