// Dados e backup (DAD, etapa 10): a lista de backups, restaurar, exportar e apagar tudo. A tela só
// manda o nome de um backup da pasta atual, nunca um caminho; as pastas são escolhidas pela janela
// do Windows, no main.
import { z } from 'zod'

// mello-AAAA-MM-DD_HHmm.db (DAD-02); o segundo do mesmo minuto ganha -2, -3…
export const BACKUP_NAME = /^mello-(\d{4})-(\d{2})-(\d{2})_(\d{2})(\d{2})(?:-(\d{1,3}))?\.db$/

// DAD-01: ao abrir o app, de hora em hora com alterações, "Fazer backup agora", antes de migrar o
// banco e antes de restaurar.
export type BackupKind = 'open' | 'hourly' | 'manual' | 'migration' | 'restore'

export interface BackupItem {
  name: string
  // O horário do nome, no fuso local (epoch em ms).
  at: number
  kind: BackupKind
  size: number
}

export interface BackupOverview {
  // A pasta onde os backups estão indo, para mostrar (com %APPDATA% no lugar do começo).
  folder: string
  // Uma pasta escolhida nas Configurações (DAD-04), e não a padrão.
  custom: boolean
  // DAD-04: a pasta escolhida não está disponível (HD desligado, pasta apagada); os backups
  // estão indo para a pasta padrão, e a lista é a dela.
  unavailable: boolean
  // Os backups estão no mesmo disco dos dados, fora de uma pasta sincronizada com a nuvem.
  sameDisk: boolean
  // A pasta de dados do Mello (banco e arquivos), para mostrar.
  dataFolder: string
  // Os guardados, do mais recente para o mais antigo (DAD-03).
  backups: BackupItem[]
}

export interface ExportResult {
  // O nome da pasta criada: Mello-exportacao-AAAA-MM-DD (DAD-07).
  folder: string
}

// DAD-09: a palavra que confirma "Apagar tudo", sem diferenciar maiúsculas.
export const DELETE_ALL_WORD = 'APAGAR'
export const isDeleteConfirmed = (typed: string) => typed.trim().toUpperCase() === DELETE_ALL_WORD

export const restoreBackupInput = z.object({ name: z.string().regex(BACKUP_NAME) })
export const deleteAllInput = z.object({
  confirm: z.string().refine(isDeleteConfirmed, 'Digite APAGAR para confirmar.'),
  alsoBackups: z.boolean()
})

export type RestoreBackupInput = z.infer<typeof restoreBackupInput>
export type DeleteAllInput = z.infer<typeof deleteAllInput>
