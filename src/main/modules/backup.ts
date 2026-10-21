// Backup do banco (DAD-01..04). Nesta etapa só existe o backup feito antes de migrar; o automático
// de hora em hora, a rotação dos 10 mais recentes e a restauração entram na etapa 10.
import fs from 'node:fs'
import path from 'node:path'
import type { Sqlite } from '../db/client'

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

// mello-AAAA-MM-DD_HHmm.db, no horário local (DAD-02).
export function backupFileName(now: number): string {
  const d = new Date(now)
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  return `mello-${date}_${pad(d.getHours())}${pad(d.getMinutes())}.db`
}

// Gera uma cópia consistente pela API de backup do SQLite, mesmo com o banco aberto (DAD-02).
// Dois backups no mesmo minuto não se sobrescrevem: o segundo ganha o sufixo -2, -3…
export async function createBackup(sqlite: Sqlite, folder: string, now: number): Promise<string> {
  fs.mkdirSync(folder, { recursive: true })
  const base = backupFileName(now).replace(/\.db$/, '')
  let target = path.join(folder, `${base}.db`)
  for (let n = 2; fs.existsSync(target); n++) {
    target = path.join(folder, `${base}-${n}.db`)
  }
  await sqlite.backup(target)
  return target
}
