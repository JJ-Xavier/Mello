// Contratos de arquivos e anexos (ANX) e da imagem da capa (CAP-01).
// Escolher (janela do Windows) ou soltar arquivos no modal não copia nada: o main guarda o caminho
// e a tela recebe só uma ficha (token), o nome e o tamanho. Com a ficha, a tela confirma os
// arquivos grandes (ANX-05) e então anexa. O caminho dos arquivos nunca chega à tela.
import { z } from 'zod'

const id = z.uuid()

export const pickFilesInput = z.object({ imagesOnly: z.boolean() })
// Só o preload chama: ele tira os caminhos dos arquivos soltos (webUtils), nunca a tela.
export const droppedFilesInput = z.object({
  paths: z.array(z.string().min(1).max(2048)).max(50)
})
export const addAttachmentsInput = z.object({ cardId: id, tokens: z.array(id).min(1).max(50) })
export const attachmentIdInput = z.object({ attachmentId: id })
export const uploadCoverInput = z.object({ cardId: id, token: id })

export type PickFilesInput = z.infer<typeof pickFilesInput>
export type AddAttachmentsInput = z.infer<typeof addAttachmentsInput>
export type AttachmentIdInput = z.infer<typeof attachmentIdInput>
export type UploadCoverInput = z.infer<typeof uploadCoverInput>

// Um arquivo escolhido ou solto, ainda não copiado.
export interface PickedFile {
  token: string
  name: string
  size: number
}

export interface Attachment {
  id: string
  name: string
  fileId: string
  ext: string
  size: number
  // Imagem (ANX-03): tem miniatura e pode ser capa. url só para imagens.
  isImage: boolean
  url: string | null
  width: number | null
  height: number | null
  // Programa (.exe, .bat, .msi…): "Abrir" mostra na pasta em vez de executar (decidido em
  // 23/10/2026).
  isProgram: boolean
  createdAt: number
}

export interface OpenResult {
  shownInFolder: boolean
}
